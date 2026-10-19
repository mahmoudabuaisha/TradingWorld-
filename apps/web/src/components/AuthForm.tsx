"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApp } from "@/store/useApp";
import { t } from "@/i18n/dictionary";

export function AuthForm() {
  const { locale, setAuth } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ email: "", password: "", displayName: "" });
  const [err, setErr] = useState<string>();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(undefined);
    try {
      const r = mode === "login" ? await api.login({ email: f.email, password: f.password }) : await api.register(f);
      setAuth(r.token, r.user); router.push("/");
    } catch (x) { setErr((x as Error).message); }
  };
  return (
    <form onSubmit={submit} className="card mx-auto mt-10 w-full max-w-sm space-y-3 p-6 shadow-glow">
      <div className="text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-gold text-lg font-bold text-gold">TW</div><h1 className="mt-2 font-bold">{mode === "login" ? t(locale, "nav", "login") : t(locale, "common", "register")}</h1></div>
      {mode === "register" && <div><label className="label">{t(locale, "common", "name")}</label><input className="input" required minLength={2} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></div>}
      <div><label className="label">{t(locale, "common", "email")}</label><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div><label className="label">{t(locale, "common", "password")}</label><input className="input" type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
      {err && <div className="text-xs text-down">{err}</div>}
      <button className="btn w-full justify-center">{mode === "login" ? t(locale, "nav", "login") : t(locale, "common", "register")}</button>
      <button type="button" className="w-full text-center text-xs text-ink-muted hover:text-ink" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? t(locale, "common", "register") : t(locale, "nav", "login")}</button>
      <p className="text-[11px] text-ink-faint">{locale === "ar" ? "أول حساب يُسجَّل يصبح Admin تلقائيًا (بيئة التطوير)." : "The first registered account becomes admin automatically (dev environment)."}</p>
    </form>
  );
}
