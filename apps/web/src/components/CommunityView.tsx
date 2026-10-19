"use client";
import { useApp } from "@/store/useApp";

export function CommunityView() {
  const { locale } = useApp();
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const items = [
    ["💬", L("منشورات وتعليقات ومشاركة تحليلات", "Posts, comments, shared analyses"), "P3"],
    ["🔐", L("غرف خاصة برمز دعوة", "Private invite-only rooms"), "P3"],
    ["👥", L("مساحات الفرق والمدربين", "Team & coach workspaces"), "P3"],
    ["🛡️", L("Moderation وصلاحيات وإبلاغ", "Moderation, roles, reporting"), "P3"],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold text-gold-light">💬 {L("المجتمع", "Community")}</h1>
      <p className="text-sm text-ink-muted">{L("المجتمع مخطط للمرحلة الثالثة بعد اعتماد المحرك والشارت والسجل. البنية (WebSocket، الأدوار، Audit Log) جاهزة في الـ API.", "Community is planned for phase 3 after the engine, chart and journal are approved. The groundwork (WebSocket, roles, audit log) already exists in the API.")}</p>
      <div className="grid gap-2 sm:grid-cols-2">{items.map(([i, t, p]) => <div key={t} className="card flex items-center gap-3 p-3"><span className="text-xl">{i}</span><span className="flex-1 text-sm">{t}</span><span className="chip">{p}</span></div>)}</div>
    </div>
  );
}
