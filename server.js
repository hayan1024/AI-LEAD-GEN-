/**
 * Clinic AI Readiness Funnel - Single-file Node app
 *
 * Features:
 *  - Landing Page (GET /)
 *  - Data Capture + Quiz (GET /quiz -> shows form; POST /quiz -> processes)
 *  - Scoring logic (Q1-Q10 yes=1)
 *  - Dynamic Results Page (score, insights, video, CTA)
 *  - PDF generation (PDFKit) + Emailing (nodemailer)
 *  - Optional OpenAI enrichment (if OPENAI_API_KEY set)
 *  - Optional follow-up scheduler (node-cron) -- disabled by default
 *
 * Usage:
 *  1) npm init -y
 *  2) npm i express body-parser nodemailer pdfkit uuid node-fetch dotenv
 *  3) create .env with required variables (see below)
 *  4) node server.js
 *
 * .env example:
 *  PORT=3000
 *  SMTP_HOST=smtp.example.com
 *  SMTP_PORT=587
 *  SMTP_USER=you@example.com
 *  SMTP_PASS=yourpassword
 *  FROM_EMAIL="Clinic AI" <no-reply@yourdomain.com>
 *  OPENAI_API_KEY=sk-...   # optional
 *  CALENDLY_EMBED_URL=https://calendly.com/yourlink  # optional
 */

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // for optional OpenAI enrichment

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static assets (if you place any) from /public
app.use('/public', express.static(path.join(__dirname, 'public')));

/* -------------------------
   Quiz configuration
   ------------------------- */
const QUIZ_QUESTIONS = [
  // Q1-Q10 best practices (yes/no)
  { id: 'q1', q: 'Do you use automated appointment reminders?' },
  { id: 'q2', q: 'Do you have a waitlist or overflow booking system?' },
  { id: 'q3', q: 'Do you use two-way patient messaging (SMS/WhatsApp)?' },
  { id: 'q4', q: 'Do you have an online self-booking option?' },
  { id: 'q5', q: 'Do you collect key patient data during intake (allergies, history)?' },
  { id: 'q6', q: 'Do you measure patient satisfaction / feedback after visits?' },
  { id: 'q7', q: 'Do you use automated follow-ups for missed appointments?' },
  { id: 'q8', q: 'Do you have a central scheduling system (no double-booking)?' },
  { id: 'q9', q: 'Do staff have a clear SOP for cancellations & rescheduling?' },
  { id: 'q10', q: 'Do you have basic reporting on appointment KPIs?' },
  // Q11-Q15: scales / multi / free text
  { id: 'q11', q: 'On a scale 1-10: How would you rate your current scheduling reliability?' },
  { id: 'q12', q: 'On a scale 1-10: Where would you like your scheduling reliability to be?' },
  { id: 'q13', q: 'What are the main obstacles? (budget, time, trust, tech, staff)' },
  { id: 'q14', q: 'What type of solution would you prefer? (done-for-you, SaaS, internal project)' },
  { id: 'q15', q: 'Any extra notes we should know?' }
];

/* -------------------------
   Helper functions
   ------------------------- */

// Simple scoring: Q1-Q10 yes -> +1 each; max 10
function scoreAnswers(answers) {
  let score = 0;
  for (let i = 1; i <= 10; i++) {
    const v = answers[`q${i}`];
    if (!v) continue;
    const s = String(v).toLowerCase();
    if (s === 'yes' || s === 'true' || s === '1' || s === 'y') score += 1;
  }
  const band = score < 4 ? 'Red' : score < 8 ? 'Amber' : 'Green';
  return { score, band };
}

// Create personalized insights (simple rule-based + optional OpenAI)
async function createInsights(answers) {
  const { score, band } = scoreAnswers(answers);
  // baseline insights
  const insights = [];
  if (band === 'Green') {
    insights.push('Your clinic is well positioned to scale automation. Focus on polishing patient experience and advanced analytics.');
    insights.push('Consider automating more personalized confirmations and post-visit follow ups.');
  } else if (band === 'Amber') {
    insights.push('You have some automation in place but gaps remain. Prioritize no-show prevention & consolidated scheduling.');
    insights.push('Start with automated reminders + simple online booking to see an immediate uplift.');
  } else {
    insights.push('You appear to be at an early stage. Quick wins: automated reminders, two-way messaging, and a clear rescheduling SOP.');
    insights.push('Consider a phased approach: intake -> booking -> reminders -> follow-ups.');
  }

  // add a note based on Q11 (current) vs Q12 (desired)
  const cur = parseInt(answers.q11 || '0', 10) || 0;
  const des = parseInt(answers.q12 || '0', 10) || 0;
  if (des && cur) {
    if (des - cur >= 4) {
      insights.push(`You want a big jump (from ${cur} to ${des}). A dedicated implementation partner + quick pilot can close that gap faster.`);
    } else {
      insights.push(`A modest plan (from ${cur} to ${des}) can often be achieved with 4–8 weeks of focused changes.`);
    }
  }

  // optional: if OPENAI_API_KEY set, ask OpenAI to expand insights (this is optional and will not run if key not provided)
  if (process.env.OPENAI_API_KEY) {
    try {
      const prompt = [
        "You are an expert consultant for small clinics implementing AI-based patient booking and engagement.",
        `Given these short answers: ${JSON.stringify(answers)} provide 3 concise, prioritized recommendations (one sentence each).`
      ].join('\n\n');
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // replace if you prefer another model; remains optional
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 220,
          temperature: 0.7
        })
      });
      const j = await resp.json();
      if (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) {
        insights.push('OpenAI recommendations: ' + j.choices[0].message.content.trim());
      }
    } catch (err) {
      console.error('OpenAI call failed:', err.message || err);
    }
  }

  return insights;
}

// Generate PDF buffer with results and insights
function generatePdfBuffer({ id, name, email, location, answers, score, band, insights }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    // PDF content
    doc.fontSize(18).text('Clinic AI Readiness Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Report ID: ${id}`);
    doc.text(`Name: ${name}`);
    doc.text(`Email: ${email}`);
    if (location) doc.text(`Location: ${location}`);
    doc.moveDown();

    doc.fontSize(14).text(`Score: ${score} / 10`, { continued: true }).fillColor(
      band === 'Green' ? 'green' : band === 'Amber' ? 'orange' : 'red'
    ).text(`  (${band})`);
    doc.fillColor('black');
    doc.moveDown();

    doc.fontSize(12).text('Top Insights:', { underline: true });
    insights.forEach((ins, i) => {
      doc.text(`${i + 1}. ${ins}`);
    });
    doc.moveDown();

    doc.text('Answers Summary:', { underline: true });
    for (const k in answers) {
      const label = QUIZ_QUESTIONS.find(q => q.id === k)?.q || k;
      doc.text(`${label}: ${answers[k]}`);
    }
    doc.moveDown();

    doc.text('Recommended Next Steps:', { underline: true });
    if (band === 'Green') {
      doc.text('- Book a product demo to review advanced automations and analytics.');
    } else if (band === 'Amber') {
      doc.text('- Start a 4-week pilot focusing on reminders + online booking.');
    } else {
      doc.text('- Start with automated reminders and a simple online booking page (fastest ROI).');
    }

    doc.end();
  });
}

// Send email with PDF attachment using nodemailer
async function sendResultEmail({ toEmail, toName, pdfBuffer, score, band }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.FROM_EMAIL) {
    console.warn('SMTP not configured in .env; skipping emailing.');
    return { sent: false, reason: 'SMTP not configured' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: toEmail,
    subject: `Your Clinic AI Readiness Report — Score ${score}/10 (${band})`,
    text: `Hi ${toName || ''},

Attached is your Clinic AI Readiness Report.

Score: ${score}/10 (${band})

Next step: ${band === 'Green' ? 'Book a demo' : 'Download the guide and consider a quick pilot.'}

Thanks,
Clinic AI Team`,
    attachments: [
      {
        filename: `clinic-ai-readiness-${Date.now()}.pdf`,
        content: pdfBuffer
      }
    ]
  };

  const info = await transporter.sendMail(mailOptions);
  return { sent: true, info };
}

/* -------------------------
   Routes
   ------------------------- */

// Landing page
app.get('/', (req, res) => {
  res.send(landingHtml());
});

// Quiz page (data capture + quiz)
app.get('/quiz', (req, res) => {
  res.send(quizHtml());
});

// Handling quiz POST
app.post('/quiz', async (req, res) => {
  try {
    // Expect payload: { name, email, location, q1..q15 }
    const payload = req.body || {};
    const name = payload.name || 'Clinic Friend';
    const email = payload.email || '';
    const location = payload.location || '';
    const answers = {};
    for (const q of QUIZ_QUESTIONS) {
      answers[q.id] = payload[q.id] || '';
    }

    const id = uuidv4();
    const { score, band } = scoreAnswers(answers);
    const insights = await createInsights(answers);

    // generate PDF
    const pdfBuffer = await generatePdfBuffer({ id, name, email, location, answers, score, band, insights });

    // email PDF (if SMTP configured)
    const emailResult = await sendResultEmail({
      toEmail: email,
      toName: name,
      pdfBuffer,
      score,
      band
    });

    // Save lead to disk (simple storage; for production use DB)
    const leadsDir = path.join(__dirname, 'leads');
    if (!fs.existsSync(leadsDir)) fs.mkdirSync(leadsDir);
    const leadRecord = {
      id,
      name,
      email,
      location,
      answers,
      score,
      band,
      insights,
      emailResult,
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(leadsDir, `${id}.json`), JSON.stringify(leadRecord, null, 2));

    // Return results page
    res.send(resultsHtml({ id, name, email, location, answers, score, band, insights, calendly: process.env.CALENDLY_EMBED_URL }));
  } catch (err) {
    console.error('quiz submit error', err);
    res.status(500).send('Server error processing quiz. Check server logs.');
  }
});

// Optional: download PDF by id (reads saved lead and re-generates PDF)
app.get('/download/:id', (req, res) => {
  try {
    const id = req.params.id;
    const leadFile = path.join(__dirname, 'leads', `${id}.json`);
    if (!fs.existsSync(leadFile)) return res.status(404).send('Not found');
    const lead = JSON.parse(fs.readFileSync(leadFile, 'utf8'));
    generatePdfBuffer({ id: lead.id, name: lead.name, email: lead.email, location: lead.location, answers: lead.answers, score: lead.score, band: lead.band, insights: lead.insights })
      .then(buffer => {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=clinic-ai-readiness-${id}.pdf`);
        res.send(buffer);
      })
      .catch(err => {
        console.error('pdf regen fail', err);
        res.status(500).send('Failed to generate PDF');
      });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

/* -------------------------
   Simple front-end HTML builders
   ------------------------- */

function landingHtml() {
  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Clinic AI Readiness — Landing</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body { font-family: Inter, Arial, sans-serif; background:#f7fbff; color:#0b2545; margin:0; padding:0; }
      .container { max-width:960px; margin:40px auto; padding:24px; background:white; border-radius:12px; box-shadow:0 6px 24px rgba(12,38,80,0.08); }
      .hero { text-align:center; padding:36px 12px; }
      h1 { font-size:28px; margin:0 0 12px; color:#073b6b; }
      p.lead { color:#27425a; margin:0 0 18px; font-size:16px; }
      ul.benefits { display:inline-block; text-align:left; padding-left:18px; margin:8px 0 18px; }
      .btn { background:#0b66ff; color:white; padding:12px 20px; border-radius:10px; border:0; cursor:pointer; font-weight:600; }
      .small { font-size:13px; color:#415a77; margin-top:10px; }
      footer { text-align:center; color:#8aa3c4; margin-top:18px; font-size:13px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="hero">
        <h1>Still drowning in no-shows and wasted admin time?</h1>
        <p class="lead">Discover how ready your clinic is for AI-powered efficiency — take the 2-minute readiness quiz and get a tailored PDF report.</p>
        <ul class="benefits">
          <li>✔ Cut patient no-shows by up to 40%</li>
          <li>✔ Save staff 10+ hours per week</li>
          <li>✔ Improve patient satisfaction & retention</li>
        </ul>
        <div style="margin-top:18px;">
          <a href="/quiz"><button class="btn">Take the 2-Minute Readiness Quiz</button></a>
        </div>
        <p class="small">Trusted by clinics (mock logos) • GDPR-friendly • No credit card required</p>
      </div>
      <hr />
      <section style="display:flex; gap:18px; padding:12px;">
        <div style="flex:1;">
          <h3 style="margin-top:0">How it works</h3>
          <ol>
            <li>Answer 15 quick questions</li>
            <li>Get an instant score + insights</li>
            <li>Receive a PDF report by email</li>
            <li>Book a demo if you want help implementing</li>
          </ol>
        </div>
        <div style="width:280px;">
          <h4 style="margin-top:0">Want a demo?</h4>
          <p>High scorers get an embedded calendar. Otherwise we’ll send resources and nurture sequence.</p>
          <a href="/quiz"><button class="btn" style="width:100%;">Start Quiz</button></a>
        </div>
      </section>
      <footer>© ${new Date().getFullYear()} Clinic AI Readiness</footer>
    </div>
  </body>
  </html>
  `;
}

function quizHtml() {
  // Build form with capture fields and 15 questions
  const qHtml = QUIZ_QUESTIONS.map(q => {
    if (q.id.startsWith('q') && parseInt(q.id.replace('q', ''), 10) <= 10) {
      // yes/no
      return `<div style="margin-bottom:12px;">
        <label style="font-weight:600;">${q.q}</label><br/>
        <label><input type="radio" name="${q.id}" value="yes" required> Yes</label>
        <label style="margin-left:10px;"><input type="radio" name="${q.id}" value="no"> No</label>
      </div>`;
    } else if (q.id === 'q11' || q.id === 'q12') {
      return `<div style="margin-bottom:12px;">
        <label style="font-weight:600;">${q.q}</label><br/>
        <input type="range" name="${q.id}" min="0" max="10" value="5" oninput="this.nextElementSibling.value = this.value"/>
        <output>5</output>
      </div>`;
    } else if (q.id === 'q13' || q.id === 'q14') {
      return `<div style="margin-bottom:12px;">
        <label style="font-weight:600;">${q.q}</label><br/>
        <input type="text" name="${q.id}" style="width:100%; padding:8px;" placeholder="e.g. budget, time, trust">
      </div>`;
    } else {
      return `<div style="margin-bottom:12px;">
        <label style="font-weight:600;">${q.q}</label><br/>
        <textarea name="${q.id}" style="width:100%; padding:8px;" rows="3"></textarea>
      </div>`;
    }
  }).join('\n');

  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Clinic AI Readiness — Quiz</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body { font-family: Inter, Arial, sans-serif; background:#f0f6ff; color:#073b6b; margin:0; padding:0; }
      .wrap { max-width:900px; margin:28px auto; padding:22px; background:white; border-radius:12px; box-shadow:0 8px 30px rgba(11,50,102,0.06);}
      input[type="text"], textarea { border:1px solid #dfe8f5; border-radius:8px; }
      label { color:#0b2545; }
      .header { text-align:center; margin-bottom:12px;}
      .btn { background:#0b66ff; color:white; padding:10px 16px; border-radius:10px; border:0; cursor:pointer; font-weight:600; }
      .row { display:flex; gap:12px; }
      @media (max-width:720px) { .row { flex-direction:column; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <h2>Clinic AI Readiness — Quick Quiz</h2>
        <p>Start by telling us who you are. This quiz takes about 2 minutes.</p>
      </div>

      <form method="POST" action="/quiz" id="quizForm">
        <div class="row" style="margin-bottom:12px;">
          <div style="flex:1;">
            <label>Name</label><br/>
            <input name="name" type="text" placeholder="Dr. Sara" required style="width:100%; padding:10px; border-radius:8px;"/>
          </div>
          <div style="flex:1;">
            <label>Email</label><br/>
            <input name="email" type="email" placeholder="you@clinic.com" required style="width:100%; padding:10px; border-radius:8px;"/>
          </div>
          <div style="width:180px">
            <label>Location</label><br/>
            <input name="location" type="text" placeholder="Riyadh, Saudi Arabia" style="width:100%; padding:10px; border-radius:8px;"/>
          </div>
        </div>

        <hr style="margin:16px 0; border:none; height:1px; background:#eef6ff;">

        ${qHtml}

        <div style="text-align:center; margin-top:18px;">
          <button class="btn" type="submit">See My Results & Get PDF</button>
        </div>
      </form>
    </div>

    <script>
      // Small UX: allow range outputs to update
      document.querySelectorAll('input[type="range"]').forEach(r => {
        r.addEventListener('input', () => { r.nextElementSibling.value = r.value; });
      });
      // Prevent double submit
      document.getElementById('quizForm').addEventListener('submit', () => {
        document.querySelector('.btn').disabled = true;
        document.querySelector('.btn').innerText = 'Processing...';
      });
    </script>
  </body>
  </html>
  `;
}

function resultsHtml({ id, name, email, location, answers, score, band, insights, calendly }) {
  // choose color
  const color = band === 'Green' ? '#0b8a3e' : band === 'Amber' ? '#d97706' : '#d32f2f';
  const topInsights = insights.slice(0, 3);
  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Your Clinic AI Readiness — Results</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body { font-family: Inter, Arial, sans-serif; background:#f7fbff; color:#073b6b; margin:0; padding:20px; }
      .card { max-width:980px; margin:24px auto; padding:22px; background:white; border-radius:12px; box-shadow:0 8px 28px rgba(11,50,102,0.06); }
      .score { font-size:36px; font-weight:800; color:${color}; }
      .btn { background:#0b66ff; color:white; padding:10px 16px; border-radius:10px; border:0; cursor:pointer; font-weight:600; }
      .muted { color:#465d78; }
      .insight { background:#f1f8ff; padding:10px; border-radius:10px; margin-bottom:8px; }
      .grid { display:flex; gap:18px; }
      @media (max-width:760px) { .grid { flex-direction:column; } }
    </style>
  </head>
  <body>
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h2 style="margin:0">Thanks, ${escapeHtml(name || '')} — here are your results</h2>
          <p class="muted" style="margin:4px 0 0">We emailed a PDF to <strong>${escapeHtml(email || '')}</strong>. Download again: <a href="/download/${id}">PDF</a></p>
        </div>
        <div style="text-align:right">
          <div class="score">${score}/10</div>
          <div style="font-weight:700; color:${color}">${band} — ${band === 'Green' ? 'Ready' : band === 'Amber' ? 'Partial' : 'Needs work'}</div>
        </div>
      </div>

      <hr style="margin:14px 0; border:none; height:1px; background:#eef6ff;">

      <div class="grid" style="margin-top:12px;">
        <div style="flex:2;">
          <h3 style="margin-top:0">Top Recommendations</h3>
          ${topInsights.map(i => `<div class="insight">${escapeHtml(i)}</div>`).join('')}
          <h4 style="margin-bottom:4px">Summary of your answers</h4>
          <ul>
            ${Object.keys(answers).map(k => {
              const label = QUIZ_QUESTIONS.find(q => q.id === k)?.q || k;
              return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(answers[k] || ''))}</li>`;
            }).join('')}
          </ul>
        </div>

        <div style="flex:1;">
          <h4 style="margin-top:0">Next Step</h4>
          ${band === 'Green' ? `<p>You're in a great position. Book a 20-min strategy demo with one of our clinic specialists.</p>
            ${calendly ? `<iframe src="${calendly}" style="width:100%;height:500px;border:none;border-radius:8px;"></iframe>` : `<a href="${calendly || '#'}"><button class="btn">Book Demo</button></a>`}
          ` : `
            <p>We recommend starting with quick wins: automatic reminders + online booking. Get the free 1-page implementation cheat sheet.</p>
            <a href="/download/${id}"><button class="btn">Download Your Report</button></a>
            <div style="margin-top:10px;"><a href="${calendly || '#'}">Or book a free consult</a></div>
          `}
          <hr style="margin:12px 0; border:none; height:1px; background:#eef6ff;">
          <h4 style="margin-bottom:4px">Need help implementing?</h4>
          <p class="muted">We provide done-for-you implementation for clinics. Reply to the emailed PDF to request pricing.</p>
        </div>
      </div>

      <div style="margin-top:18px; color:#6f8aa2; font-size:13px;">
        <strong>Privacy:</strong> We only use your email to send the report and follow-up resources. You can opt out at any time.
      </div>
    </div>
  </body>
  </html>
  `;
}

/* -------------------------
   Utilities
   ------------------------- */

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* -------------------------
   Optional: follow-up scheduler (node-cron)
   - Disabled by default. If you want it, set ENABLE_FOLLOWUPS=true in .env
   - For production use, replace lead storage with DB and a proper job worker
   ------------------------- */
/*
if (process.env.ENABLE_FOLLOWUPS === 'true') {
  const cron = require('node-cron');
  // runs daily at 02:00 server time
  cron.schedule('0 2 * * *', async () => {
    console.log('Running follow-up scheduler...');
    const leadFiles = fs.readdirSync(path.join(__dirname, 'leads')).filter(f => f.endsWith('.json'));
    for (const f of leadFiles) {
      const lead = JSON.parse(fs.readFileSync(path.join(__dirname, 'leads', f)));
      // Check when created and maybe send day0/day1/day3 mails
      // For brevity, this example does not implement the full sequence.
      // Implement logic here: check lead.createdAt, and send emails on appropriate days.
    }
  });
}
*/

/* -------------------------
   Start server
   ------------------------- */
app.listen(PORT, () => {
  console.log(`Clinic AI funnel app running on http://localhost:${PORT}`);
  console.log('Ensure you created .env with SMTP settings if you want email delivery.');
});
