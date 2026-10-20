"use client";
import Link from "next/link";
import { useApp } from "@/store/useApp";

const TRACKS = [
  {
    id: "from-zero",
    n: "37",
    ar: "ابدأ من الصفر",
    en: "Trading From Zero",
    route: "/academy/from-zero",
    lessons: [
      "ما هو السوق؟ / What is a market?",
      "أنواع الأصول / Asset classes",
      "Bid / Ask / Spread",
      "Leverage · Lot · Margin",
      "أنواع الأوامر / Order types",
      "الشموع والفريمات / Candles & timeframes",
      "المخاطرة / Risk",
      "النفسية / Psychology",
    ],
  },
  {
    id: "world-guide",
    n: "39",
    ar: "شرح مجال التداول بالكامل",
    en: "Trading World Guide",
    route: "/academy/guide",
    lessons: ["الأسواق والوسطاء", "التحليل: فني · سعري · بنية · سيولة", "الجلسات والأخبار", "الاختبار والتنفيذ", "أخلاقيات التداول"],
  },
  {
    id: "fundamentals",
    n: "40",
    ar: "أساسيات الأسواق",
    en: "Market Fundamentals",
    route: "/academy/fundamentals",
    lessons: ["التضخم والفائدة", "البطالة والناتج المحلي", "البنوك المركزية", "العملات والسلع والمؤشرات"],
  },
  {
    id: "dictionary",
    n: "41",
    ar: "قاموس التداول",
    en: "Trading Dictionary",
    route: "/academy/dictionary",
    lessons: ["BOS · CHoCH · FVG · OB", "Liquidity · Sweep · Displacement", "ATR · VWAP · Session"],
  },
  {
    id: "islamic",
    n: "42",
    ar: "الحلال والحرام في التداول",
    en: "Islamic Trading Guide",
    route: "/academy/islamic",
    lessons: ["الربا والفائدة / Swap", "الرافعة والعقود", "الغرر والمشتقات", "الملكية والقبض"],
  },
  {
    id: "shariah",
    n: "43",
    ar: "الأحكام والضوابط الشرعية",
    en: "Shariah Guidelines",
    route: "/academy/shariah",
    lessons: ["المصادر الموثقة", "المسائل المتفق عليها والمختلف فيها", "التفريق بين التعليم والفتوى"],
  },
];

export function AcademyView() {
  const { locale } = useApp();
  const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
  return (
    <div className="space-y-4">
      <div>
        <span className="eyebrow">ATLAS 06 · 38</span>
        <h1 className="text-2xl font-semibold">{L("أكاديمية التداول", "Trading Academy")}</h1>
        <p className="text-sm text-ink-2">
          {L(
            "مسارات تعليمية منظمة بمستويات ودروس واختبارات. المحتوى الشرعي يوضح مصادره ولا يُقدَّم كفتوى فردية.",
            "Structured tracks with levels, lessons and quizzes. Shariah content cites its sources and is never presented as an individual fatwa.",
          )}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {TRACKS.map((t) => (
          <div key={t.id} className="sheet p-4">
            <div className="flex items-center gap-2 text-base">
              <span className="mono text-xs text-ink-3">{t.n}</span>
              <Link href={t.route} className="font-semibold hover:text-ink">
                {locale === "ar" ? t.ar : t.en}
              </Link>
            </div>
            <ol className="mt-2 list-decimal space-y-0.5 ps-5 text-xs text-ink-2">
              {t.lessons.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ol>
            <div className="mt-3 h-px w-full bg-hair" />
            <div className="mt-1 text-[10px] text-ink-3">{L("المحتوى: مرحلة P2 — الهيكل جاهز", "Content: phase P2 — structure ready")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
