/**
 * Platform Module Registry — the 60 product modules from the TraderWorld specification.
 * The registry drives navigation, feature flags, permissions and the progress tracker.
 * Adding a feature = adding an entry here + a route; nothing else needs rebuilding.
 */
export type ModuleGroup =
  | "core" | "analysis" | "intelligence" | "markets" | "tools" | "testing"
  | "journal" | "education" | "community" | "productivity" | "account" | "admin";

export type ModulePhase = "MVP" | "P2" | "P3" | "P4";
export type ModuleStatus = "planned" | "scaffold" | "in_progress" | "done" | "approved";

export interface PlatformModule {
  id: string;
  order: number;
  nameAr: string;
  nameEn: string;
  icon: string;
  group: ModuleGroup;
  route: string;
  phase: ModulePhase;
  status: ModuleStatus;
  /** minimal role allowed to see the module */
  minRole: "user" | "student" | "coach" | "moderator" | "admin" | "developer";
}

export const PLATFORM_MODULES: PlatformModule[] = [
  { id: "dashboard", order: 1, nameAr: "الرئيسية", nameEn: "Dashboard", icon: "🏠", group: "core", route: "/", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "analysis", order: 2, nameAr: "التحليل", nameEn: "Analysis", icon: "📊", group: "analysis", route: "/chart", phase: "MVP", status: "in_progress", minRole: "user" },
  { id: "proprietary-intel", order: 3, nameAr: "المعلومات الخاصة", nameEn: "Proprietary Intelligence", icon: "🧠", group: "intelligence", route: "/intel", phase: "P2", status: "planned", minRole: "admin" },
  { id: "ai-assistant", order: 4, nameAr: "مساعد التحليل بالـAI", nameEn: "AI Analysis Assistant", icon: "🤖", group: "intelligence", route: "/chart#ai", phase: "MVP", status: "in_progress", minRole: "user" },
  { id: "strategies", order: 5, nameAr: "الاستراتيجيات", nameEn: "Strategies", icon: "🧩", group: "analysis", route: "/strategies", phase: "P2", status: "planned", minRole: "user" },
  { id: "setups", order: 6, nameAr: "الـSetups", nameEn: "Setups", icon: "🎯", group: "analysis", route: "/setups", phase: "P2", status: "planned", minRole: "user" },
  { id: "algorithms", order: 7, nameAr: "الخوارزميات والأكواد الخاصة", nameEn: "Proprietary Algorithms", icon: "💻", group: "intelligence", route: "/admin/algorithms", phase: "P2", status: "planned", minRole: "developer" },
  { id: "scanner", order: 8, nameAr: "فاحص الأسواق", nameEn: "Market Scanner", icon: "🔍", group: "markets", route: "/scanner", phase: "P2", status: "planned", minRole: "user" },
  { id: "market-map", order: 9, nameAr: "خريطة الأسواق", nameEn: "Market Map", icon: "🗺️", group: "markets", route: "/market-map", phase: "P3", status: "planned", minRole: "user" },
  { id: "market-overview", order: 10, nameAr: "نظرة عامة على الأسواق", nameEn: "Market Overview", icon: "📈", group: "markets", route: "/markets", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "alerts", order: 11, nameAr: "التنبيهات الذكية", nameEn: "Smart Alerts", icon: "🔔", group: "markets", route: "/alerts", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "trading-clock", order: 12, nameAr: "ساعة التداول", nameEn: "Trading Clock", icon: "⏱️", group: "tools", route: "/tools/clock", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "sessions", order: 13, nameAr: "توقيت الأسواق والجلسات", nameEn: "Market Sessions & Time Zones", icon: "🌍", group: "tools", route: "/tools/sessions", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "news", order: 14, nameAr: "الأخبار المباشرة", nameEn: "Live Market News", icon: "📰", group: "markets", route: "/news", phase: "P2", status: "planned", minRole: "user" },
  { id: "calendar", order: 15, nameAr: "التقويم الاقتصادي", nameEn: "Economic Calendar", icon: "📅", group: "markets", route: "/calendar", phase: "P2", status: "planned", minRole: "user" },
  { id: "risk-calculator", order: 16, nameAr: "حاسبة المخاطرة", nameEn: "Risk Calculator", icon: "🧮", group: "tools", route: "/tools/risk", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "position-calculator", order: 17, nameAr: "حاسبة الصفقات", nameEn: "Position Calculator", icon: "💰", group: "tools", route: "/tools/position", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "scenario-builder", order: 18, nameAr: "بناء السيناريوهات", nameEn: "Scenario Builder", icon: "📐", group: "analysis", route: "/scenarios", phase: "P2", status: "planned", minRole: "user" },
  { id: "backtesting", order: 19, nameAr: "مختبر الاختبار التاريخي", nameEn: "Backtesting Lab", icon: "🔬", group: "testing", route: "/lab/backtest", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "replay", order: 20, nameAr: "إعادة تشغيل السوق", nameEn: "Market Replay", icon: "⏪", group: "testing", route: "/lab/replay", phase: "P3", status: "planned", minRole: "user" },
  { id: "strategy-tester", order: 21, nameAr: "اختبار الاستراتيجيات", nameEn: "Strategy Tester", icon: "🧪", group: "testing", route: "/lab/strategy", phase: "P3", status: "planned", minRole: "user" },
  { id: "playbook", order: 22, nameAr: "دفتر التداول", nameEn: "Trading Playbook", icon: "📖", group: "journal", route: "/playbook", phase: "P2", status: "planned", minRole: "user" },
  { id: "trader-memory", order: 23, nameAr: "ذاكرة المتداول", nameEn: "Trader Memory", icon: "🧠", group: "journal", route: "/memory", phase: "P3", status: "planned", minRole: "user" },
  { id: "ai-trade-review", order: 24, nameAr: "مراجعة الصفقة بالـAI", nameEn: "AI Trade Review", icon: "🤖", group: "journal", route: "/journal/review", phase: "P3", status: "planned", minRole: "user" },
  { id: "pattern-search", order: 25, nameAr: "البحث عن الأنماط التاريخية", nameEn: "Historical Pattern Search", icon: "🔎", group: "testing", route: "/lab/patterns", phase: "P4", status: "planned", minRole: "user" },
  { id: "confluence", order: 26, nameAr: "محرك توافق التحليل", nameEn: "Confluence Engine", icon: "🧩", group: "intelligence", route: "/chart#confluence", phase: "MVP", status: "in_progress", minRole: "user" },
  { id: "journal", order: 27, nameAr: "سجل التداول", nameEn: "Trading Journal", icon: "📒", group: "journal", route: "/journal", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "trade-tracker", order: 28, nameAr: "تتبع الصفقات", nameEn: "Trade Tracker", icon: "📈", group: "journal", route: "/journal/tracker", phase: "P2", status: "planned", minRole: "user" },
  { id: "performance", order: 29, nameAr: "تحليل أداء المتداول", nameEn: "Performance Analytics", icon: "📊", group: "journal", route: "/journal/performance", phase: "P2", status: "planned", minRole: "user" },
  { id: "psychology", order: 30, nameAr: "تتبع الحالة النفسية", nameEn: "Psychology Tracker", icon: "🧠", group: "journal", route: "/journal/psychology", phase: "P3", status: "planned", minRole: "user" },
  { id: "routine", order: 31, nameAr: "روتين التداول اليومي", nameEn: "Daily Trading Routine", icon: "🔄", group: "productivity", route: "/routine", phase: "P2", status: "planned", minRole: "user" },
  { id: "notes", order: 32, nameAr: "الملاحظات", nameEn: "Notes", icon: "📝", group: "productivity", route: "/notes", phase: "P2", status: "planned", minRole: "user" },
  { id: "snapshots", order: 33, nameAr: "حفظ تحليلات الشارت", nameEn: "Chart Snapshots", icon: "🖼️", group: "analysis", route: "/snapshots", phase: "P2", status: "planned", minRole: "user" },
  { id: "trade-chart-link", order: 34, nameAr: "ربط الصفقة بالتحليل", nameEn: "Trade-to-Chart Linking", icon: "🔗", group: "journal", route: "/journal#links", phase: "P2", status: "planned", minRole: "user" },
  { id: "learn-from-trades", order: 35, nameAr: "التعلم من الصفقات", nameEn: "Learn From Your Trades", icon: "📚", group: "journal", route: "/journal/lessons", phase: "P3", status: "planned", minRole: "user" },
  { id: "goals", order: 36, nameAr: "الأهداف والإنجازات", nameEn: "Goals & Progress", icon: "🎯", group: "productivity", route: "/goals", phase: "P2", status: "planned", minRole: "user" },
  { id: "from-zero", order: 37, nameAr: "ابدأ من الصفر", nameEn: "Trading From Zero", icon: "🎓", group: "education", route: "/academy/from-zero", phase: "P2", status: "planned", minRole: "user" },
  { id: "academy", order: 38, nameAr: "أكاديمية التداول", nameEn: "Trading Academy", icon: "📚", group: "education", route: "/academy", phase: "P2", status: "scaffold", minRole: "user" },
  { id: "world-guide", order: 39, nameAr: "شرح مجال التداول بالكامل", nameEn: "Trading World Guide", icon: "🧭", group: "education", route: "/academy/guide", phase: "P2", status: "planned", minRole: "user" },
  { id: "fundamentals", order: 40, nameAr: "أساسيات الأسواق", nameEn: "Market Fundamentals", icon: "💡", group: "education", route: "/academy/fundamentals", phase: "P2", status: "planned", minRole: "user" },
  { id: "dictionary", order: 41, nameAr: "قاموس التداول", nameEn: "Trading Dictionary", icon: "📖", group: "education", route: "/academy/dictionary", phase: "P2", status: "planned", minRole: "user" },
  { id: "islamic-guide", order: 42, nameAr: "الحلال والحرام في التداول", nameEn: "Islamic Trading Guide", icon: "🕌", group: "education", route: "/academy/islamic", phase: "P2", status: "planned", minRole: "user" },
  { id: "shariah", order: 43, nameAr: "الأحكام والضوابط الشرعية", nameEn: "Shariah Guidelines", icon: "⚖️", group: "education", route: "/academy/shariah", phase: "P2", status: "planned", minRole: "user" },
  { id: "education", order: 44, nameAr: "المقالات والتعليم", nameEn: "Education", icon: "📚", group: "education", route: "/academy/articles", phase: "P2", status: "planned", minRole: "user" },
  { id: "community", order: 45, nameAr: "المجتمع", nameEn: "Community", icon: "💬", group: "community", route: "/community", phase: "P3", status: "scaffold", minRole: "user" },
  { id: "private-rooms", order: 46, nameAr: "الغرف والسيرفرات الخاصة", nameEn: "Private Rooms", icon: "🔐", group: "community", route: "/community/rooms", phase: "P3", status: "planned", minRole: "user" },
  { id: "teams", order: 47, nameAr: "مساحات الفرق", nameEn: "Team Workspaces", icon: "👥", group: "community", route: "/community/teams", phase: "P3", status: "planned", minRole: "user" },
  { id: "progress-system", order: 48, nameAr: "نظام الإنجازات والتقدم", nameEn: "Progress System", icon: "🏆", group: "productivity", route: "/progress", phase: "P3", status: "planned", minRole: "user" },
  { id: "cloud-sync", order: 49, nameAr: "المزامنة بين الأجهزة", nameEn: "Cloud Sync", icon: "☁️", group: "account", route: "/settings/sync", phase: "P2", status: "planned", minRole: "user" },
  { id: "global-search", order: 50, nameAr: "البحث الشامل", nameEn: "Global Search", icon: "🔎", group: "core", route: "/search", phase: "P2", status: "scaffold", minRole: "user" },
  { id: "alarms", order: 51, nameAr: "المنبهات والتذكيرات", nameEn: "Alarms & Reminders", icon: "⏰", group: "productivity", route: "/tools/alarms", phase: "P2", status: "planned", minRole: "user" },
  { id: "timer", order: 52, nameAr: "المؤقت", nameEn: "Timer", icon: "⏱️", group: "tools", route: "/tools/timer", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "stopwatch", order: 53, nameAr: "ساعة الإيقاف", nameEn: "Stopwatch", icon: "⏱️", group: "tools", route: "/tools/stopwatch", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "calculator", order: 54, nameAr: "الحاسبة العامة", nameEn: "Calculator", icon: "🧮", group: "tools", route: "/tools/calculator", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "timezone-converter", order: 55, nameAr: "محول المناطق الزمنية", nameEn: "Time Zone Converter", icon: "🌍", group: "tools", route: "/tools/timezones", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "profile", order: 56, nameAr: "الملف الشخصي", nameEn: "Profile", icon: "👤", group: "account", route: "/profile", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "settings", order: 57, nameAr: "الإعدادات", nameEn: "Settings", icon: "⚙️", group: "account", route: "/settings", phase: "MVP", status: "scaffold", minRole: "user" },
  { id: "admin", order: 58, nameAr: "لوحة الإدارة", nameEn: "Admin Panel", icon: "🛡️", group: "admin", route: "/admin", phase: "MVP", status: "scaffold", minRole: "admin" },
  { id: "security", order: 59, nameAr: "نظام الصلاحيات والحماية", nameEn: "Security & Permissions", icon: "🔒", group: "admin", route: "/admin/security", phase: "MVP", status: "in_progress", minRole: "admin" },
  { id: "subscriptions", order: 60, nameAr: "الاشتراكات والباقات", nameEn: "Subscriptions & Plans", icon: "💳", group: "account", route: "/plans", phase: "P3", status: "planned", minRole: "user" },
];

export const MODULE_GROUP_LABELS: Record<ModuleGroup, { ar: string; en: string }> = {
  core: { ar: "الأساس", en: "Core" },
  analysis: { ar: "التحليل", en: "Analysis" },
  intelligence: { ar: "الذكاء", en: "Intelligence" },
  markets: { ar: "الأسواق", en: "Markets" },
  tools: { ar: "الأدوات", en: "Tools" },
  testing: { ar: "الاختبار", en: "Testing" },
  journal: { ar: "السجل والأداء", en: "Journal & Performance" },
  education: { ar: "التعليم", en: "Education" },
  community: { ar: "المجتمع", en: "Community" },
  productivity: { ar: "الإنتاجية", en: "Productivity" },
  account: { ar: "الحساب", en: "Account" },
  admin: { ar: "الإدارة", en: "Admin" },
};

export function modulesByGroup(): Record<ModuleGroup, PlatformModule[]> {
  const out = {} as Record<ModuleGroup, PlatformModule[]>;
  for (const m of PLATFORM_MODULES) (out[m.group] ??= []).push(m);
  return out;
}

/**
 * Atlases — the navigation rail of the Kharita design language.
 * Each atlas is a bound collection of "sheets" (modules). Groups map onto atlases
 * so a new module only needs a `group`; the rail never changes.
 */
export type AtlasId = "home" | "analysis" | "markets" | "tools" | "lab" | "journal" | "learn" | "community";

export interface Atlas {
  id: AtlasId;
  nameAr: string;
  nameEn: string;
  /** mono eyebrow printed on the sheet bar */
  code: string;
  route: string;
  groups: ModuleGroup[];
}

export const ATLASES: Atlas[] = [
  { id: "home", nameAr: "الورقة اليومية", nameEn: "Daily Sheet", code: "SHEET 00", route: "/", groups: ["core"] },
  { id: "analysis", nameAr: "التحليل", nameEn: "Analysis", code: "ATLAS 01", route: "/chart", groups: ["analysis", "intelligence"] },
  { id: "markets", nameAr: "الأسواق", nameEn: "Markets", code: "ATLAS 02", route: "/markets", groups: ["markets"] },
  { id: "tools", nameAr: "الأدوات", nameEn: "Tools", code: "ATLAS 03", route: "/tools/risk", groups: ["tools", "productivity"] },
  { id: "lab", nameAr: "المختبر", nameEn: "Lab", code: "ATLAS 04", route: "/lab/backtest", groups: ["testing"] },
  { id: "journal", nameAr: "السجل", nameEn: "Journal", code: "ATLAS 05", route: "/journal", groups: ["journal"] },
  { id: "learn", nameAr: "التعلم", nameEn: "Learn", code: "ATLAS 06", route: "/academy", groups: ["education"] },
  { id: "community", nameAr: "المجتمع", nameEn: "Community", code: "ATLAS 07", route: "/community", groups: ["community"] },
];

export function atlasOf(group: ModuleGroup): Atlas | undefined {
  return ATLASES.find((a) => a.groups.includes(group));
}

export function modulesOfAtlas(id: AtlasId): PlatformModule[] {
  const atlas = ATLASES.find((a) => a.id === id);
  if (!atlas) return [];
  return PLATFORM_MODULES.filter((m) => atlas.groups.includes(m.group)).sort((a, b) => a.order - b.order);
}

/** Which atlas a route belongs to (longest matching module route wins). */
export function atlasForRoute(pathname: string): Atlas | undefined {
  if (pathname === "/") return ATLASES[0];
  const clean = pathname.split("#")[0] ?? pathname;
  const match = PLATFORM_MODULES
    .filter((m) => m.route !== "/" && clean.startsWith(m.route.split("#")[0] ?? m.route))
    .sort((a, b) => b.route.length - a.route.length)[0];
  if (match) return atlasOf(match.group);
  return ATLASES.find((a) => a.id !== "home" && clean.startsWith("/" + (a.route.split("/")[1] ?? "")));
}
