npx create-react-app 
import React, { useMemo, useState, useEffect } from "react";
import { MotionConfig, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Send, Mail, Globe, User, Loader2, BarChart3, ShieldCheck, Clock, Sparkles, ArrowRight, Download } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

/**
 * AI Patient Intake System – Quiz Funnel (Single-file React Component)
 *
 * Design goals
 * - Modern, clean UI with Tailwind + shadcn/ui
 * - Landing -> Lead Capture -> 15 Q Quiz -> Dynamic Results (score + insights)
 * - Lightweight scoring engine with clear traffic-light status + speedometer
 * - Webhook-ready lead + response submission (n8n or any backend). See CONFIG.
 * - All in one file for easy drop-in. Exported as default component.
 */

// ============================
// CONFIG – adjust for your brand
// ============================
const CONFIG = {
  brand: {
    name: "AI Intake",
    primary: "from-purple-600 via-indigo-600 to-blue-600",
    accent: "bg-purple-600",
  },
  webhookUrl: "https://example.com/webhooks/lead-intake", // <-- replace with your n8n webhook
  enableDownloadPdf: true,
  legal: {
    consentText:
      "By continuing, you agree to receive your results and occasional updates. You can unsubscribe anytime.",
  },
};

// ============================
// DATA – quiz inventory
// ============================
const bestPracticeQs = [
  {
    id: "q1",
    text: "Do you currently send automated reminders for patient appointments?",
    best: "yes",
  },
  {
    id: "q2",
    text: "Does your intake process allow patients to book online without staff assistance?",
    best: "yes",
  },
  { id: "q3", text: "Do you track no-show rates and cancellations each month?", best: "yes" },
  { id: "q4", text: "Do your patients fill intake forms digitally?", best: "yes" },
  { id: "q5", text: "Do you follow up with no-show patients to rebook?", best: "yes" },
  { id: "q6", text: "Do you collect patient feedback automatically after visits?", best: "yes" },
  { id: "q7", text: "Do you personalize communication (SMS/email) for each patient?", best: "yes" },
  { id: "q8", text: "Do you measure staff time spent on manual intake tasks?", best: "yes" },
  { id: "q9", text: "Do you offer one‑click flexible rescheduling?", best: "yes" },
  { id: "q10", text: "Do you analyze intake data to improve patient flow and revenue?", best: "yes" },
];

const realityQ = {
  id: "q11",
  text: "Which best describes your clinic right now?",
  options: [
    "Just starting out (0–1 staff)",
    "Growing clinic (2–10 staff)",
    "Established practice (10+ staff)",
    "Multi-location clinic",
  ],
};

const desiredQ = {
  id: "q12",
  text: "What is your #1 desired outcome?",
  options: [
    "Reduce no-shows",
    "Increase new patient bookings",
    "Save staff time",
    "Outperform competition",
  ],
};

const obstacleQ = {
  id: "q13",
  text: "What have you tried that hasn’t worked?",
  options: [
    "Manual reminders",
    "Hiring more staff",
    "Using outdated booking software",
    "Doing nothing",
  ],
};

const solutionQ = {
  id: "q14",
  text: "What kind of solution would best suit you?",
  options: [
    "AI appointment booking system",
    "Automated follow-ups & rebooking",
    "Smart intake + patient communication hub",
  ],
};

// Q15 free text

// ============================
// Helpers
// ============================
function classNames(...arr) {
  return arr.filter(Boolean).join(" ");
}

function emailValid(email) {
  return /\S+@\S+\.\S+/.test(email);
}

function computeScore(answers) {
  // score 1 for each best-practice “yes”, else 0; neutral for unanswered
  const yesScore = bestPracticeQs.reduce((acc, q) => {
    const a = answers[q.id];
    if (!a) return acc;
    return acc + (a === q.best ? 1 : 0);
  }, 0);

  // weight adjustments (light) based on clinic size and desired outcome readiness
  const size = answers[realityQ.id];
  const desired = answers[desiredQ.id];

  let bonus = 0;
  if (size === "Multi-location clinic") bonus += 1; // complexity requires maturity
  if (desired === "Reduce no-shows") bonus += 0.5; // alignment with quiz focus

  const raw = yesScore + bonus;
  const max = bestPracticeQs.length + 1; // 10 + potential 1 bonus
  const pct = Math.round((raw / max) * 100);

  let color = "red";
  if (pct >= 75) color = "green";
  else if (pct >= 45) color = "amber";

  return { raw, pct, color, yesScore, bonus };
}

function insightsFrom(answers, score) {
  const notes = [];

  // Low score
  if (score.color === "red") {
    if (answers.q1 !== "yes")
      notes.push(
        "You're losing revenue to no-shows because reminders aren't automated. Patients will pick clinics that nudge them to show up."
      );
    if (answers.q2 !== "yes")
      notes.push("Patients find it harder to book with you than competitors. Enable online self-booking 24/7.");
    if (answers.q4 !== "yes")
      notes.push("Switch to digital intake forms to cut waiting room time and data entry.");
  }

  // Mid score
  if (score.color === "amber") {
    notes.push(
      "Your clinic is doing well in bookings, but follow-ups are weak. Automated follow-ups can reduce cancellations by ~30%."
    );
    if (answers.q7 !== "yes") notes.push("Personalize SMS/email to lift confirmations and feedback.");
    if (answers.q9 !== "yes") notes.push("Offer one-click rescheduling to keep bookings instead of losing them.");
  }

  // High score
  if (score.color === "green") {
    notes.push(
      "You're already ahead. With AI intake, you can scale faster without hiring more staff—focus on optimization and analytics."
    );
    if (answers.q10 !== "yes") notes.push("Start a monthly intake analytics review to spot bottlenecks early.");
  }

  // Tailor by desired outcome
  switch (answers[desiredQ.id]) {
    case "Reduce no-shows":
      notes.push("Double down on reminders + rebooking flows. Add SMS day-before + morning-of nudges.");
      break;
    case "Increase new patient bookings":
      notes.push("Simplify your booking funnel and add Google Business Profile booking links.");
      break;
    case "Save staff time":
      notes.push("Automate data entry from forms to EHR/Sheets and remove phone-tag scheduling.");
      break;
    case "Outperform competition":
      notes.push("Offer instant scheduling, waitlist auto-fill, and post-visit feedback loops.");
      break;
    default:
      break;
  }

  return notes.slice(0, 5);
}

// ============================
// Components
// ============================
function Speedometer({ percent = 0, label = "" }) {
  const angle = (percent / 100) * 180 - 90; // -90 to +90
  return (
    <div className="w-full max-w-md mx-auto">
      <svg viewBox="0 0 200 120" className="w-full">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <path d="M20,110 A90,90 0 0,1 180,110" fill="none" stroke="url(#grad)" strokeWidth="16" />
        <line
          x1="100"
          y1="110"
          x2={100 + 80 * Math.cos((Math.PI / 180) * angle)}
          y2={110 + 80 * Math.sin((Math.PI / 180) * angle)}
          stroke="#111827"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="100" cy="110" r="6" fill="#111827" />
        <text x="100" y="35" textAnchor="middle" className="fill-gray-700" style={{ fontSize: 18, fontWeight: 700 }}>{percent}%</text>
        <text x="100" y="55" textAnchor="middle" className="fill-gray-500" style={{ fontSize: 12 }}>{label}</text>
      </svg>
    </div>
  );
}

function TrafficLight({ color }) {
  const map = { red: "bg-red-500", amber: "bg-amber-400", green: "bg-green-500" };
  return (
    <div className="flex items-center gap-2">
      <div className={classNames("w-3 h-3 rounded-full shadow", map[color])} />
      <span className="text-sm text-gray-600">{color === "green" ? "Ready now" : color === "amber" ? "Needs improvements" : "Major gaps"}</span>
    </div>
  );
}

// Simple localStorage hook
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}

// ============================
// MAIN APP
// ============================
export default function IntakeQuizFunnel() {
  const [stage, setStage] = useLocalStorage("ai-intake-stage", "landing");

  const [lead, setLead] = useLocalStorage("ai-intake-lead", {
    name: "",
    email: "",
    location: "",
    consent: false,
  });

  const [answers, setAnswers] = useLocalStorage("ai-intake-answers", {});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submittedOnce, setSubmittedOnce] = useState(false);

  const score = useMemo(() => computeScore(answers), [answers]);
  const insights = useMemo(() => insightsFrom(answers, score), [answers, score]);

  // progress 0..100
  const totalSteps = 1 /* lead */ + bestPracticeQs.length + 4 /* q11..q14 */ + 1 /* q15 */;
  const answeredCount = useMemo(() => {
    const bCount = bestPracticeQs.filter((q) => answers[q.id]).length;
    let extra = 0;
    [realityQ, desiredQ, obstacleQ, solutionQ].forEach((q) => {
      if (answers[q.id]) extra++;
    });
    if (answers.q15) extra++;
    return (stage === "quiz" || stage === "results") ? bCount + extra + 1 : 0; // +1 for lead
  }, [answers, stage]);
  const progressPct = Math.min(100, Math.round((answeredCount / totalSteps) * 100));

  function updateLead(field, value) {
    setLead((l) => ({ ...l, [field]: value }));
  }

  function updateAnswer(id, value) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function submitToWebhook(payload) {
    if (!CONFIG.webhookUrl) return;
    try {
      const res = await fetch(CONFIG.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  async function handleStartQuiz() {
    // simple validation
    setSubmitError("");
    if (!lead.name || !emailValid(lead.email) || !lead.location || !lead.consent) {
      setSubmitError("Please complete your name, a valid email, location and consent.");
      return;
    }
    setSubmitting(true);
    try {
      if (!submittedOnce) {
        await submitToWebhook({ type: "lead", lead });
        setSubmittedOnce(true);
      }
      setStage("quiz");
    } catch (e) {
      setSubmitError("We couldn't send your info. You can still proceed.");
      setStage("quiz");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinish() {
    setSubmitting(true);
    setSubmitError("");
    const payload = { type: "quizResults", lead, answers, score };
    try {
      await submitToWebhook(payload);
      setStage("results");
    } catch (e) {
      setSubmitError("We couldn't send results to the server, but here's your personalized report.");
      setStage("results");
    } finally {
      setSubmitting(false);
    }
  }

  // Optional: simple PDF/JSON download of results
  function downloadJson() {
    const blob = new Blob([JSON.stringify({ lead, answers, score, insights }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AI-Intake-Assessment-${lead.name || "results"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
        <header className="sticky top-0 z-30 border-b bg-white/70 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={classNames("w-8 h-8 rounded-2xl", CONFIG.brand.accent)} />
              <span className="font-semibold">{CONFIG.brand.name}</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="hidden md:flex items-center gap-2"><ShieldCheck className="w-4 h-4"/> HIPAA-conscious patterns</div>
              <div className="hidden md:flex items-center gap-2"><Clock className="w-4 h-4"/> ~3 minutes</div>
              <div className="hidden md:flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Instant results</div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8 md:py-12">
          {stage === "landing" && <Landing onStart={() => setStage("lead")}/>} 
          {stage === "lead" && (
            <LeadCapture
              lead={lead}
              onChange={updateLead}
              onStart={handleStartQuiz}
              submitting={submitting}
              error={submitError}
            />
          )}

          {stage === "quiz" && (
            <Quiz
              answers={answers}
              onChange={updateAnswer}
              onFinish={handleFinish}
              progress={progressPct}
              submitting={submitting}
            />
          )}

          {stage === "results" && (
            <Results
              lead={lead}
              answers={answers}
              score={score}
              insights={insights}
              onRestart={() => setStage("landing")}
              onDownload={CONFIG.enableDownloadPdf ? downloadJson : null}
            />
          )}
        </main>

        <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-gray-500">
          <p>
            © {new Date().getFullYear()} {CONFIG.brand.name}. {CONFIG.legal.consentText}
          </p>
        </footer>
      </div>
    </MotionConfig>
  );
}

function Landing({ onStart }) {
  return (
    <section>
      <div className="grid md:grid-cols-2 gap-6 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5"/> AI Patient Intake System
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
            Still losing patients to no-shows and messy scheduling?
          </h1>
          <div className="space-y-2 text-gray-700 mb-4">
            <p>Feeling frustrated that your clinic has stopped growing despite your hard work?</p>
            <p>Tired of competing clinics getting ahead because their systems are faster and smarter?</p>
          </div>

          <div className="mt-4">
            <h2 className="text-xl font-semibold mb-2">Ready to fix it—fast?</h2>
            <ul className="list-disc pl-5 text-gray-700 space-y-1">
              <li>Are you ready to cut no-shows in half with AI?</li>
              <li>Are you ready to become the most advanced, efficient clinic in your city?</li>
              <li>Are you ready to book more patients and free up your staff instantly?</li>
            </ul>
            <p className="mt-4 text-gray-700">
              <span className="font-semibold">Answer 15 quick questions</span> to find out. It only takes ~3 minutes, and you’ll get your results immediately.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={onStart} className="rounded-2xl px-5 py-6 text-base">
              Start the 15‑Question Quiz
              <ArrowRight className="ml-2 w-4 h-4"/>
            </Button>
            <div className="text-sm text-gray-600">It’s free. Instant results.</div>
          </div>

          <div className="mt-10 grid sm:grid-cols-3 gap-3">
            {[{
              title: "Measure & reduce lost revenue",
              desc: "Spot where no-shows and drop-offs cost you the most.",
            },{
              title: "Improve your booking system",
              desc: "Boost efficiency and patient satisfaction with best practices.",
            },{
              title: "Find high-ROI AI opportunities",
              desc: "Identify where automation saves time, money, and staff stress.",
            }].map((b, i) => (
              <Card key={i} className="rounded-2xl">
                <CardHeader className="pb-1"><CardTitle className="text-base">{b.title}</CardTitle></CardHeader>
                <CardContent className="text-sm text-gray-600">{b.desc}</CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <Card className="rounded-3xl shadow-lg border-0 bg-gradient-to-br from-white to-slate-50">
            <CardHeader>
              <CardTitle>Why this assessment?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-gray-700">
              <div>
                <h3 className="font-semibold mb-1">About the creator</h3>
                <p>
                  I’ve spent years building automation systems for clinics and healthcare providers. Outdated intake drains revenue, frustrates staff, and creates unhappy patients. This AI-driven intake system gives clinics a competitive edge.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Research-backed</h3>
                <p>
                  Studies from leading consultancies suggest 20–30% of healthcare revenue is wasted due to admin inefficiencies like no-shows and slow intake. Clinics adopting AI workflows report 30–50% improvements in scheduling efficiency and higher patient satisfaction.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">What others say</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>“I took the assessment and instantly discovered how to cut down my no-shows.”</li>
                  <li>“The quiz showed me exactly where my clinic was leaking revenue.”</li>
                  <li>“In just 3 minutes, I saw how AI could help me grow without hiring more staff.”</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function LeadCapture({ lead, onChange, onStart, submitting, error }) {
  return (
    <section className="max-w-2xl mx-auto">
      <Card className="rounded-3xl shadow-lg border-0">
        <CardHeader>
          <CardTitle>Tell us where to send your results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <Label htmlFor="name">Name</Label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-gray-400"/>
                  <Input id="name" placeholder="Dr. Jane Doe" className="pl-9" value={lead.name} onChange={(e)=>onChange("name", e.target.value)} />
                </div>
              </div>
              <div className="sm:col-span-1">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-gray-400"/>
                  <Input id="email" placeholder="you@clinic.com" className="pl-9" value={lead.email} onChange={(e)=>onChange("email", e.target.value)} />
                </div>
              </div>
              <div className="sm:col-span-1">
                <Label htmlFor="location">Location</Label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute left-3 top-3 text-gray-400"/>
                  <Input id="location" placeholder="City, Country" className="pl-9" value={lead.location} onChange={(e)=>onChange("location", e.target.value)} />
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 text-sm text-gray-700">
              <input type="checkbox" className="mt-1" checked={lead.consent} onChange={(e)=>onChange("consent", e.target.checked)} />
              <span>
                {CONFIG.legal.consentText}
              </span>
            </label>

            {error && (
              <div className="text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> {error}</div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={onStart} disabled={submitting} className="rounded-2xl px-5 py-6 text-base">
                {submitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Preparing...</>) : (<>Start Quiz <ArrowRight className="ml-2 w-4 h-4"/></>)}
              </Button>
              <div className="text-sm text-gray-600">Takes ~3 minutes. Instant results.</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function Quiz({ answers, onChange, onFinish, progress, submitting }) {
  return (
    <section className="max-w-3xl mx-auto">
      <div className="mb-3 text-sm text-gray-600">Progress</div>
      <Progress value={progress} className="h-2 rounded-full" />

      <div className="space-y-6 mt-6">
        <Card className="rounded-2xl">
          <CardHeader className="pb-1"><CardTitle className="text-lg">Best Practices (Yes/No)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {bestPracticeQs.map((q) => (
              <YesNo key={q.id} id={q.id} text={q.text} value={answers[q.id]} onChange={onChange} />
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-1"><CardTitle className="text-lg">About your clinic</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <SingleSelect q={realityQ} value={answers[realityQ.id]} onChange={onChange} />
            <SingleSelect q={desiredQ} value={answers[desiredQ.id]} onChange={onChange} />
            <SingleSelect q={obstacleQ} value={answers[obstacleQ.id]} onChange={onChange} />
            <SingleSelect q={solutionQ} value={answers[solutionQ.id]} onChange={onChange} />
            <div>
              <Label htmlFor="q15">Anything else you want me to know?</Label>
              <Textarea id="q15" placeholder="Optional" value={answers.q15 || ""} onChange={(e)=>onChange("q15", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={onFinish} disabled={submitting} className="rounded-2xl px-5 py-6 text-base">
            {submitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Scoring...</>) : (<>See My Results <ArrowRight className="ml-2 w-4 h-4"/></>)}
          </Button>
          <div className="text-sm text-gray-600">You can adjust answers later.</div>
        </div>
      </div>
    </section>
  );
}

function YesNo({ id, text, value, onChange }) {
  return (
    <div className="grid md:grid-cols-2 gap-3 items-center">
      <div className="text-gray-800">{text}</div>
      <div className="flex gap-4">
        <label className={classNames("px-4 py-2 rounded-xl border cursor-pointer", value === "yes" ? "bg-green-50 border-green-300" : "hover:bg-slate-50")}
          onClick={() => onChange(id, "yes")}
        >Yes</label>
        <label className={classNames("px-4 py-2 rounded-xl border cursor-pointer", value === "no" ? "bg-red-50 border-red-300" : "hover:bg-slate-50")}
          onClick={() => onChange(id, "no")}
        >No</label>
      </div>
    </div>
  );
}

function SingleSelect({ q, value, onChange }) {
  return (
    <div>
      <Label className="mb-2 block">{q.text}</Label>
      <RadioGroup value={value || ""} onValueChange={(v)=>onChange(q.id, v)} className="grid gap-2">
        {q.options.map((opt) => (
          <div key={opt} className="flex items-center space-x-2">
            <RadioGroupItem value={opt} id={`${q.id}-${opt}`} />
            <Label htmlFor={`${q.id}-${opt}`}>{opt}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

function Results({ lead, answers, score, insights, onRestart, onDownload }) {
  const statusIcon = score.color === "green" ? (
    <CheckCircle2 className="w-6 h-6 text-green-600"/>
  ) : score.color === "amber" ? (
    <AlertTriangle className="w-6 h-6 text-amber-500"/>
  ) : (
    <XCircle className="w-6 h-6 text-red-600"/>
  );

  return (
    <section className="max-w-4xl mx-auto">
      <div className="grid md:grid-cols-2 gap-6 items-start">
        <Card className="rounded-3xl border-0 shadow-lg">
          <CardHeader className="pb-1 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Your Assessment Score</CardTitle>
            {statusIcon}
          </CardHeader>
          <CardContent>
            <Speedometer percent={score.pct} label={score.color === "green" ? "Ready now" : score.color === "amber" ? "Needs improvements" : "Major gaps"} />
            <div className="mt-3"><TrafficLight color={score.color} /></div>
            <div className="mt-4 grid grid-cols-3 text-center">
              <div>
                <div className="text-2xl font-bold">{score.yesScore}</div>
                <div className="text-xs text-gray-500">Best practices</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{score.bonus}</div>
                <div className="text-xs text-gray-500">Context bonus</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{score.pct}%</div>
                <div className="text-xs text-gray-500">Overall score</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-0 shadow-lg">
          <CardHeader className="pb-1"><CardTitle className="text-lg">Top Opportunities</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3 list-disc pl-5 text-gray-700">
              {insights.map((i, idx) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl border-0 shadow-lg mt-6">
        <CardHeader className="pb-1"><CardTitle className="text-lg">Recommended Next Step</CardTitle></CardHeader>
        <CardContent className="text-gray-700 space-y-3">
          {score.color === "red" && (
            <p>
              Start with <b>automated reminders + rebooking flows</b>. We’ll implement SMS/email reminders, a no-show recovery sequence, and digital intake forms to cut admin time.
            </p>
          )}
          {score.color === "amber" && (
            <p>
              You’re close. Add <b>AI follow-ups</b>, one-click rescheduling, and monthly intake analytics to reduce cancellations and lift patient satisfaction.
            </p>
          )}
          {score.color === "green" && (
            <p>
              You’re ready to scale. Layer on <b>AI intake + communication hub</b>, integrate analytics, and expand without adding staff.
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button className="rounded-2xl">Book a 20‑min Demo</Button>
            {onDownload && (
              <Button variant="outline" className="rounded-2xl" onClick={onDownload}>
                <Download className="w-4 h-4 mr-2"/> Download my results
              </Button>
            )}
            <Button variant="ghost" className="rounded-2xl" onClick={onRestart}>Restart</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-0 shadow-lg mt-6">
        <CardHeader className="pb-1"><CardTitle className="text-lg">Your Inputs (for reference)</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div><span className="text-gray-500">Name:</span> {lead.name || "—"}</div>
          <div><span className="text-gray-500">Email:</span> {lead.email || "—"}</div>
          <div><span className="text-gray-500">Location:</span> {lead.location || "—"}</div>
          <div><span className="text-gray-500">Clinic size:</span> {answers[realityQ.id] || "—"}</div>
          <div><span className="text-gray-500">Desired outcome:</span> {answers[desiredQ.id] || "—"}</div>
          <div><span className="text-gray-500">Obstacle:</span> {answers[obstacleQ.id] || "—"}</div>
          <div><span className="text-gray-500">Preferred solution:</span> {answers[solutionQ.id] || "—"}</div>
          <div className="md:col-span-2"><span className="text-gray-500">Notes:</span> {answers.q15 || "—"}</div>
        </CardContent>
      </Card>
    </section>
  );
}
