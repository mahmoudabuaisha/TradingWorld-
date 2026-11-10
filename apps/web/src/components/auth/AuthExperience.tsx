"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DISCLAIMER, SESSION_WINDOWS, sessionsAt } from "@tradingworld/shared";
import { api } from "@/lib/api";
import { useApp } from "@/store/useApp";
import { BRAND, BrandMark } from "./BrandMark";
import { GlobeCanvas, type GlobeHandle } from "./GlobeCanvas";
import type { GlobePose, SessionId } from "./GlobeScene";

type View = "login" | "signup" | "forgot";
type Layout = "desktop" | "mobile";
type Phase = "idle" | "leaving";
type L = "ar" | "en";

const TEXT = {
  nav: { ar: ["حلّل", "خطّط", "تداول", "تطوّر"], en: ["Analyze", "Plan", "Trade", "Grow"] },
  headline: { ar: ["رحلتك في التداول،", "في مكان واحد"], en: ["Your Trading Journey,", "In One Place"] },
  sub: { ar: ["حلّل الأسواق", "أدر المخاطر", "تابع أداءك"], en: ["Analyze markets", "Manage risk", "Track performance"] },
  edge: { ar: "ابنِ أفضليتك.", en: "Build your edge." },
  features: {
    ar: [
      { title: "أسواق عالمية", items: ["فوركس", "كريبتو", "مؤشرات", "معادن", "طاقة"] },
      { title: "أدوات احترافية", items: ["تحليل", "سجل صفقات", "اختبار خلفي"] },
      { title: "تطوّرك", items: ["انضباط", "استمرارية", "مراجعة"] },
    ],
    en: [
      { title: "Global Markets", items: ["Forex", "Crypto", "Indices", "Metals", "Energy"] },
      { title: "Professional Tools", items: ["Analysis", "Journal", "Backtesting"] },
      { title: "Your Growth", items: ["Discipline", "Consistency", "Review"] },
    ],
  },
  tabLogin: { ar: "تسجيل الدخول", en: "Log In" },
  tabSignup: { ar: "حساب جديد", en: "Sign Up" },
  welcome: { ar: "مرحبًا بعودتك", en: "Welcome back" },
  welcomeSub: { ar: "سجّل الدخول إلى حسابك للمتابعة", en: "Sign in to your account to continue" },
  create: { ar: "أنشئ حسابك", en: "Create Your Account" },
  createSub: { ar: `انضم إلى ${BRAND} وابدأ رحلتك في التداول.`, en: `Join ${BRAND} and start your trading journey.` },
  name: { ar: "الاسم الكامل", en: "Full name" },
  email: { ar: "البريد الإلكتروني", en: "Email address" },
  password: { ar: "كلمة المرور", en: "Password" },
  show: { ar: "إظهار كلمة المرور", en: "Show password" },
  hide: { ar: "إخفاء كلمة المرور", en: "Hide password" },
  remember: { ar: "تذكّرني", en: "Remember me" },
  forgot: { ar: "نسيت كلمة المرور؟", en: "Forgot password?" },
  login: { ar: "دخول", en: "Log In" },
  signup: { ar: "إنشاء الحساب", en: "Create Account" },
  or: { ar: "أو تابع باستخدام", en: "or continue with" },
  google: { ar: "المتابعة بحساب Google", en: "Continue with Google" },
  soon: { ar: "قريبًا", en: "Soon" },
  noAccount: { ar: "ليس لديك حساب؟", en: "Don't have an account?" },
  haveAccount: { ar: "لديك حساب؟", en: "Already have an account?" },
  signupLink: { ar: "أنشئ حسابًا", en: "Sign Up" },
  loginLink: { ar: "سجّل الدخول", en: "Log In" },
  strength: { ar: ["قصيرة", "ضعيفة", "مقبولة", "جيدة", "قوية"], en: ["Too short", "Weak", "Fair", "Good", "Strong"] },
  strengthLabel: { ar: "قوة كلمة المرور", en: "Password strength" },
  forgotTitle: { ar: "نسيت كلمة المرور", en: "Forgot Password" },
  forgotBody: {
    ar: "استعادة كلمة المرور بالبريد لم تُفعَّل بعد. اطلب من مشرف المنصة إعادة تعيينها، ويستطيع إصدار كلمة جديدة لك خلال دقيقة.",
    en: "Password reset by email is not switched on yet. Ask the platform admin to reset it: they can issue you a new one in a minute.",
  },
  back: { ar: "العودة لتسجيل الدخول", en: "Back to login" },
  okLogin: { ar: ["تم تسجيل الدخول", `مرحبًا بعودتك إلى ${BRAND}`], en: ["Login successful", `Welcome back to ${BRAND}!`] },
  okSignup: { ar: ["تم إنشاء الحساب", `أهلًا بك في ${BRAND}`], en: ["Account created", `Welcome to ${BRAND}!`] },
  out: { ar: ["تم تسجيل الخروج", "نراك في الجلسة القادمة."], en: ["Signed out", "See you at the next session."] },
  close: { ar: "إغلاق", en: "Dismiss" },
  openNow: { ar: "مفتوح الآن", en: "Open now" },
  weekend: { ar: "عطلة نهاية الأسبوع · الفوركس مغلق والكريبتو يعمل", en: "Weekend · forex is closed, crypto trades" },
  between: { ar: "بين الجلسات", en: "Between sessions" },
  tagline: { ar: "أكثر من منصة. مركز قيادة تداولك.", en: "More than a platform. Your trading command center." },
  errors: {
    INVALID_CREDENTIALS: { ar: "البريد أو كلمة المرور غير صحيحة.", en: "Wrong email or password." },
    EMAIL_TAKEN: { ar: "هذا البريد مسجّل من قبل. سجّل الدخول به.", en: "This email already has an account. Log in instead." },
    VALIDATION: {
      ar: "تحقق من البريد، واستخدم كلمة مرور من 8 أحرف على الأقل.",
      en: "Check the email, and use a password of at least 8 characters.",
    },
    "429": { ar: "محاولات كثيرة. انتظر دقيقة ثم حاول من جديد.", en: "Too many attempts. Wait a minute and try again." },
    network: { ar: "تعذّر الاتصال بالخادم. تحقق من اتصالك.", en: "Can't reach the server. Check your connection." },
    other: { ar: "حدث خطأ. حاول من جديد.", en: "Something went wrong. Try again." },
  },
} as const;

/** Forex sessions open at this moment (none at the weekend). */
function openSessions(now = new Date()): SessionId[] {
  const day = now.getUTCDay();
  if (day === 6 || day === 0) return [];
  return sessionsAt(now.getTime() / 1000).filter((s): s is SessionId => s !== "OFF");
}

/** Where the globe sits for each view. x is toward the card's side; `sx` flips it for right-to-left. */
function poseFor(view: View, layout: Layout, sx: 1 | -1): GlobePose {
  if (layout === "mobile") {
    if (view === "signup") return { x: 0, y: 0.34, r: 0.15, lon: -78 };
    if (view === "forgot") return { x: 0, y: 0.3, r: 0.16, lon: -30, glow: 0.75 };
    return { x: 0, y: 0.29, r: 0.19, lon: 35 };
  }
  // a new account: the globe turns to the New World
  if (view === "signup") return { x: 0.07 * sx, y: 0.01, r: 0.38, lon: -78 + 20 * sx };
  if (view === "forgot") return { x: 0.1 * sx, y: 0.05, r: 0.29, lon: -30, glow: 0.7 };
  // the card covers the globe's near side: turn the Gulf and Africa toward the open side
  return { x: 0.085 * sx, y: 0.03, r: 0.35, lon: 40 + 22 * sx };
}

/** 0 (too short) to 4 (strong): length, then variety. */
function strengthOf(pw: string): number {
  if (pw.length < 8) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  return Math.min(4, 1 + (pw.length >= 12 ? 1 : 0) + (kinds >= 3 ? 1 : 0) + (kinds === 4 && pw.length >= 14 ? 1 : 0));
}

export function AuthExperience() {
  const { locale: storedLocale, setLocale, setAuth } = useApp();
  const router = useRouter();
  const uid = useId();
  const globe = useRef<GlobeHandle>(null);

  // the stored language is known only in the browser: the first paint follows the server (Arabic), hidden until mounted
  const [mounted, setMounted] = useState(false);
  const locale: L = mounted ? storedLocale : "ar";
  const sx: 1 | -1 = locale === "ar" ? -1 : 1;
  const tx = <A, B>(e: { ar: A; en: B }): A | B => e[locale];

  const [view, setView] = useState<View>("login");
  const [layout, setLayout] = useState<Layout>("desktop");
  const [phase, setPhase] = useState<Phase>("idle");
  const [f, setF] = useState({ displayName: "", email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof TEXT.errors>();
  const [errorN, setErrorN] = useState(0);
  const [toast, setToast] = useState<{ title: string; body: string }>();
  const [open, setOpen] = useState<SessionId[]>([]);
  const [weekend, setWeekend] = useState(false);

  // first paint in the browser: language, layout, the globe's entrance
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setLayout(mq.matches ? "desktop" : "mobile");
    apply();
    mq.addEventListener("change", apply);
    const clock = () => {
      const now = new Date();
      setOpen(openSessions(now));
      setWeekend(now.getUTCDay() === 6 || now.getUTCDay() === 0);
    };
    clock();
    const timer = setInterval(clock, 30_000);
    setMounted(true);
    return () => {
      mq.removeEventListener("change", apply);
      clearInterval(timer);
    };
  }, []);

  const entered = useRef(false);
  useEffect(() => {
    if (!mounted) return;
    const target = poseFor(view, layout, sx);
    if (entered.current) {
      globe.current?.go(target, 1100);
      return;
    }
    entered.current = true;
    let signedOut = false;
    try {
      signedOut = sessionStorage.getItem("tw-auth-flash") === "signed-out";
      sessionStorage.removeItem("tw-auth-flash");
    } catch {
      /* storage blocked */
    }
    if (signedOut) {
      // back from the app: the globe returns the way it left
      setToast({ title: TEXT.out[locale][0], body: TEXT.out[locale][1] });
      globe.current?.jump(layout === "mobile" ? { ...target, y: 0.75, lon: target.lon - 200, glow: 0.3 } : exitPose(target, sx));
      globe.current?.go(target, 1700);
    } else {
      globe.current?.jump({ x: target.x + 0.1 * sx, y: target.y - 0.07, r: target.r * 0.7, lon: target.lon - 130, glow: 0 });
      globe.current?.go(target, 1900);
    }
    // `locale` only chooses the words of the greeting at that first moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, view, layout, sx]);

  useEffect(() => {
    if (!toast || phase === "leaving") return;
    const timer = setTimeout(() => setToast(undefined), 4200);
    return () => clearTimeout(timer);
  }, [toast, phase]);

  const sessions = useCallback(() => openSessions(), []);

  const change = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((prev) => ({ ...prev, [key]: e.target.value }));
    if (error) setError(undefined);
    globe.current?.react("key");
  };

  const go = (next: View) => {
    if (busy || phase === "leaving") return;
    setError(undefined);
    setReveal(false);
    setView(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || phase === "leaving" || view === "forgot") return;
    setBusy(true);
    setError(undefined);
    try {
      const r =
        view === "login"
          ? await api.login({ email: f.email.trim(), password: f.password })
          : await api.register({ email: f.email.trim(), password: f.password, displayName: f.displayName.trim() });
      setAuth(r.token, r.user, view === "login" ? remember : true);
      const words = view === "login" ? TEXT.okLogin[locale] : TEXT.okSignup[locale];
      setToast({ title: words[0], body: words[1] });
      setPhase("leaving");
      globe.current?.react("success");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const here = poseFor(view, layout, sx);
      globe.current?.go(layout === "mobile" ? { ...here, y: 0.05, r: 0.62, lon: here.lon + 220, glow: 0.2 } : exitPose(here, sx), 1350);
      setTimeout(() => router.replace("/"), reduced ? 300 : 1450);
    } catch (x) {
      const code = (x as Error).message;
      setError(code in TEXT.errors ? (code as keyof typeof TEXT.errors) : x instanceof TypeError ? "network" : "other");
      setErrorN((n) => n + 1);
      globe.current?.react("error");
      setBusy(false);
    }
  };

  const strength = strengthOf(f.password);
  const names = open.map((s) => SESSION_WINDOWS.find((w) => w.name === s)!).map((w) => (locale === "ar" ? w.labelAr : w.label));
  const ids = { name: `${uid}-name`, email: `${uid}-email`, pw: `${uid}-pw`, err: `${uid}-err`, panel: `${uid}-panel` };

  return (
    <div className="au" data-ready={mounted} data-view={view} data-phase={phase} data-layout={layout}>
      {mounted && <GlobeCanvas ref={globe} initial={poseFor("login", layout, sx)} mirrored={sx === -1} sessions={sessions} />}
      <div className="au-veil" aria-hidden="true" />

      <header className="au-top">
        <div className="au-brand">
          <BrandMark size={38} />
          <span className="au-brand-word">{BRAND}</span>
        </div>
        <div className="au-top-end">
          <ul className="au-steps" aria-hidden="true">
            {tx(TEXT.nav).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <button
            type="button"
            className="au-lang"
            onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
            aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}
          >
            {locale === "ar" ? "EN" : "ع"}
          </button>
        </div>
      </header>

      <main className="au-main">
        <section className="au-hero" aria-label={BRAND}>
          <p className="au-word" lang="en">
            {BRAND}
          </p>
          <h1 className="au-headline">
            <span>{tx(TEXT.headline)[0]}</span>
            <span>{tx(TEXT.headline)[1]}</span>
          </h1>
          <p className="au-sub">
            {tx(TEXT.sub).map((s) => (
              <span key={s}>{s}</span>
            ))}
          </p>
          <p className="au-edge">{tx(TEXT.edge)}</p>
          <p className="au-sessions" data-open={names.length > 0}>
            <i aria-hidden="true" />
            {names.length > 0 ? (
              <>
                <b>{tx(TEXT.openNow)}</b>
                {names.join(" · ")}
              </>
            ) : (
              tx(weekend ? TEXT.weekend : TEXT.between)
            )}
          </p>
          <ul className="au-features">
            {tx(TEXT.features).map((feat, i) => (
              <li key={feat.title}>
                <FeatureIcon i={i} />
                <div>
                  <b>{feat.title}</b>
                  <span>{feat.items.join(" · ")}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="au-card" data-shake={errorN % 2 === 1 ? "a" : errorN ? "b" : undefined}>
          <div className="au-card-brand">
            <BrandMark size={46} />
            <span className="au-brand-word">{BRAND}</span>
          </div>

          {view !== "forgot" && (
            <div className="au-tabs" role="tablist" aria-label={`${tx(TEXT.tabLogin)} / ${tx(TEXT.tabSignup)}`} data-active={view}>
              <button type="button" role="tab" aria-selected={view === "login"} aria-controls={ids.panel} onClick={() => go("login")}>
                {tx(TEXT.tabLogin)}
              </button>
              <button type="button" role="tab" aria-selected={view === "signup"} aria-controls={ids.panel} onClick={() => go("signup")}>
                {tx(TEXT.tabSignup)}
              </button>
            </div>
          )}

          <div className="au-panel" id={ids.panel} role="tabpanel" key={view}>
            {view === "forgot" ? (
              <>
                <h2>{tx(TEXT.forgotTitle)}</h2>
                <p className="au-note">{tx(TEXT.forgotBody)}</p>
                <button type="button" className="au-back" onClick={() => go("login")}>
                  <Arrow back />
                  {tx(TEXT.back)}
                </button>
              </>
            ) : (
              <form onSubmit={submit}>
                <h2>{tx(view === "login" ? TEXT.welcome : TEXT.create)}</h2>
                <p className="au-lead">{tx(view === "login" ? TEXT.welcomeSub : TEXT.createSub)}</p>

                {view === "signup" && (
                  <div className="au-field">
                    <label htmlFor={ids.name}>{tx(TEXT.name)}</label>
                    <IconUser />
                    <input
                      id={ids.name}
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={60}
                      placeholder={tx(TEXT.name)}
                      value={f.displayName}
                      onChange={change("displayName")}
                    />
                  </div>
                )}
                <div className="au-field">
                  <label htmlFor={ids.email}>{tx(TEXT.email)}</label>
                  <IconMail />
                  <input
                    id={ids.email}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    dir="ltr"
                    required
                    placeholder={tx(TEXT.email)}
                    value={f.email}
                    onChange={change("email")}
                    aria-describedby={error ? ids.err : undefined}
                  />
                </div>
                <div className="au-field">
                  <label htmlFor={ids.pw}>{tx(TEXT.password)}</label>
                  <IconLock />
                  <input
                    id={ids.pw}
                    type={reveal ? "text" : "password"}
                    autoComplete={view === "login" ? "current-password" : "new-password"}
                    dir="ltr"
                    required
                    minLength={view === "signup" ? 8 : 1}
                    maxLength={128}
                    placeholder={tx(TEXT.password)}
                    value={f.password}
                    onChange={change("password")}
                    aria-describedby={error ? ids.err : undefined}
                  />
                  <button
                    type="button"
                    className="au-eye"
                    onClick={() => setReveal((r) => !r)}
                    aria-label={tx(reveal ? TEXT.hide : TEXT.show)}
                    aria-pressed={reveal}
                  >
                    <IconEye off={reveal} />
                  </button>
                </div>

                {view === "signup" && f.password.length > 0 && (
                  <p className="au-strength" data-score={strength}>
                    <span className="au-strength-candles" aria-hidden="true">
                      {[1, 2, 3, 4].map((n) => (
                        <i key={n} data-on={strength >= n} />
                      ))}
                    </span>
                    <span>
                      {tx(TEXT.strengthLabel)}: <b>{tx(TEXT.strength)[strength]}</b>
                    </span>
                  </p>
                )}

                {view === "login" && (
                  <div className="au-row">
                    <label className="au-check">
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                      <span aria-hidden="true" />
                      {tx(TEXT.remember)}
                    </label>
                    <button type="button" className="au-link" onClick={() => go("forgot")}>
                      {tx(TEXT.forgot)}
                    </button>
                  </div>
                )}

                <p className="au-error" id={ids.err} role="alert">
                  {error ? tx(TEXT.errors[error]) : ""}
                </p>

                <button type="submit" className="au-submit" disabled={busy} data-busy={busy}>
                  <span>{tx(view === "login" ? TEXT.login : TEXT.signup)}</span>
                  <Arrow />
                  <i aria-hidden="true" />
                </button>

                <p className="au-or">
                  <span>{tx(TEXT.or)}</span>
                </p>
                <button type="button" className="au-google" disabled title={tx(TEXT.soon)}>
                  <GoogleG />
                  <span>{tx(TEXT.google)}</span>
                  <em>{tx(TEXT.soon)}</em>
                </button>

                <p className="au-switch">
                  {tx(view === "login" ? TEXT.noAccount : TEXT.haveAccount)}{" "}
                  <button type="button" className="au-link" onClick={() => go(view === "login" ? "signup" : "login")}>
                    {tx(view === "login" ? TEXT.signupLink : TEXT.loginLink)}
                  </button>
                </p>
                {process.env.NODE_ENV === "development" && view === "signup" && (
                  <p className="au-dev">
                    {locale === "ar"
                      ? "بيئة التطوير: أول حساب يُسجَّل يصبح مشرفًا."
                      : "Development: the first account registered becomes the admin."}
                  </p>
                )}
              </form>
            )}
          </div>
        </section>
      </main>

      <footer className="au-foot">
        <span>{tx(TEXT.tagline)}</span>
        <span>{DISCLAIMER[locale]}</span>
      </footer>

      <div className="au-toast" role="status" aria-live="polite" data-show={!!toast}>
        {toast && (
          <>
            <span className="au-toast-icon" aria-hidden="true">
              <IconCheck />
            </span>
            <div>
              <b>{toast.title}</b>
              <span>{toast.body}</span>
            </div>
            {phase === "leaving" ? (
              <i className="au-toast-bar" aria-hidden="true" />
            ) : (
              <button type="button" onClick={() => setToast(undefined)} aria-label={tx(TEXT.close)}>
                <IconX />
              </button>
            )}
          </>
        )}
      </div>
      <div className="au-curtain" aria-hidden="true" />
    </div>
  );
}

/** Leaving for the app (and coming back from it): the globe sweeps across to the far side, growing, half turned. */
function exitPose(from: GlobePose, sx: 1 | -1): GlobePose {
  return { x: -0.72 * sx, y: 0.04, r: 0.95, lon: from.lon + 230, glow: 0.22 };
}

// ── icons (20px, currentColor) ──

const svg = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  "aria-hidden": true,
} as const;
const round = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

function IconMail() {
  return (
    <svg {...svg} {...round}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7.5 8 6 8-6" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg {...svg} {...round}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7M12 14.6v2" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg {...svg} {...round}>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.8 20c.9-3.6 3.7-5.4 7.2-5.4s6.300 1.800 7.200 5.400" />
    </svg>
  );
}
function IconEye({ off }: { off: boolean }) {
  return (
    <svg {...svg} {...round}>
      <path d="M2.5 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12Z" />
      <circle cx="12" cy="12" r="2.800" />
      {off && <path d="m4 4 16 16" />}
    </svg>
  );
}
function IconCheck() {
  return (
    <svg {...svg} {...round} strokeWidth={2.4}>
      <path d="m5.500 12.500 4.200 4.200 8.800-9.400" />
    </svg>
  );
}
function IconX() {
  return (
    <svg {...svg} {...round}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
function Arrow({ back }: { back?: boolean }) {
  return (
    <svg {...svg} {...round} className="au-arrow" data-back={back}>
      <path d="M5 12h14m-5.500-5.500L19 12l-5.500 5.500" />
    </svg>
  );
}
function FeatureIcon({ i }: { i: number }) {
  return (
    <span className="au-feature-icon" aria-hidden="true">
      <svg {...svg} {...round} width={18} height={18}>
        {i === 0 && (
          <>
            <circle cx="12" cy="12" r="8.500" />
            <path d="M3.500 12h17M12 3.500c2.600 2.600 3.800 5.400 3.800 8.500s-1.200 5.900-3.800 8.500c-2.600-2.600-3.800-5.400-3.800-8.500s1.200-5.900 3.800-8.500Z" />
          </>
        )}
        {i === 1 && <path d="M7 3.500v3m0 8.500v3.500M4.500 6.500h5V15h-5zM17 5.500V9m0 7v3.500M14.500 9h5v7h-5z" />}
        {i === 2 && <path d="M4 18.500 9.500 13l3.500 3.500L20 9.500m0 0h-4.500m4.500 0V14" />}
      </svg>
    </span>
  );
}
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.500c3.500 0 6.600 1.200 9.100 3.600l6.800-6.800C35.800 2.500 30.300 0 24 0 14.600 0 6.500 5.400 2.600 13.200l7.900 6.100C12.400 13.600 17.700 9.500 24 9.500z"
      />
      <path
        fill="#4285F4"
        d="M46.500 24.500c0-1.600-.1-3.100-.4-4.500H24v9h12.700c-.600 3-2.300 5.500-4.800 7.200l7.700 6c4.500-4.200 6.900-10.300 6.900-17.700z"
      />
      <path
        fill="#FBBC05"
        d="M10.500 28.700A14.500 14.500 0 0 1 9.700 24c0-1.600.3-3.200.8-4.700l-7.900-6.100A24 24 0 0 0 0 24c0 3.900.9 7.500 2.600 10.800l7.900-6.100z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.200 1.500-4.900 2.300-8.200 2.300-6.300 0-11.600-4.200-13.500-9.900l-7.900 6.100C6.500 42.600 14.600 48 24 48z"
      />
    </svg>
  );
}
