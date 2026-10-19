import type { Locale } from "@tradingworld/shared";

const dict = {
  appName: { ar: "TradingWorld", en: "TradingWorld" },
  tagline: { ar: "ذكاء الأسواق القابل للتفسير", en: "Explainable Market Intelligence" },
  nav: {
    dashboard: { ar: "الرئيسية", en: "Dashboard" },
    chart: { ar: "التحليل والشارت", en: "Chart & Analysis" },
    markets: { ar: "نظرة على الأسواق", en: "Market Overview" },
    alerts: { ar: "التنبيهات", en: "Alerts" },
    tools: { ar: "الأدوات", en: "Tools" },
    journal: { ar: "سجل التداول", en: "Journal" },
    academy: { ar: "الأكاديمية", en: "Academy" },
    community: { ar: "المجتمع", en: "Community" },
    modules: { ar: "كل الوحدات", en: "All Modules" },
    settings: { ar: "الإعدادات", en: "Settings" },
    admin: { ar: "الإدارة", en: "Admin" },
    login: { ar: "تسجيل الدخول", en: "Sign in" },
    logout: { ar: "خروج", en: "Sign out" },
  },
  chart: {
    aiZones: { ar: "مناطق AI", en: "AI Zones" },
    marketRegime: { ar: "حالة السوق", en: "Market Regime" },
    htfBias: { ar: "اتجاه الفريمات الأعلى", en: "HTF Bias" },
    liquidity: { ar: "السيولة", en: "Liquidity" },
    structure: { ar: "البنية", en: "Structure" },
    volatility: { ar: "التقلب", en: "Volatility" },
    keyLevels: { ar: "المستويات المهمة", en: "Key Levels" },
    currentPrice: { ar: "السعر الحالي", en: "Current Price" },
    why: { ar: "لماذا هذه المنطقة؟", en: "Why this zone?" },
    weakens: { ar: "ما الذي يضعفها؟", en: "What weakens it?" },
    invalidation: { ar: "الإبطال", en: "Invalidation" },
    status: { ar: "الحالة", en: "Status" },
    strength: { ar: "القوة", en: "Strength" },
    showLow: { ar: "إظهار المناطق منخفضة الجودة", en: "Show low-quality zones" },
    hidden: { ar: "مناطق مخفية", en: "hidden zones" },
    askAi: { ar: "اسأل مساعد التحليل…", en: "Ask the analysis assistant…" },
    aiTitle: { ar: "مساعد التحليل", en: "Analysis Assistant" },
    session: { ar: "الجلسة", en: "Session" },
    manual: { ar: "تحليل يدوي", en: "Manual" },
    ai: { ar: "تحليل AI", en: "AI Analysis" },
    setAlert: { ar: "تنبيه عند الدخول", en: "Alert on entry" },
    provider: { ar: "مصدر البيانات", en: "Data source" },
  },
  common: {
    loading: { ar: "جارٍ التحميل…", en: "Loading…" },
    save: { ar: "حفظ", en: "Save" },
    delete: { ar: "حذف", en: "Delete" },
    add: { ar: "إضافة", en: "Add" },
    email: { ar: "البريد الإلكتروني", en: "Email" },
    password: { ar: "كلمة المرور", en: "Password" },
    name: { ar: "الاسم", en: "Name" },
    register: { ar: "إنشاء حساب", en: "Create account" },
    search: { ar: "ابحث… (Ctrl+K)", en: "Search… (Ctrl+K)" },
    comingSoon: { ar: "قيد التطوير — مخطط في مرحلة", en: "In development — planned for phase" },
  },
} as const;

type Leaf = { ar: string; en: string };
export type Dict = typeof dict;

export function t<K1 extends keyof Dict>(locale: Locale, k1: K1, k2?: keyof Dict[K1]): string {
  const node = (k2 ? (dict[k1] as Record<string, Leaf>)[k2 as string] : dict[k1]) as Leaf | undefined;
  return node?.[locale] ?? String(k2 ?? k1);
}
