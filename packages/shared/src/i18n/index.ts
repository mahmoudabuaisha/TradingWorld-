export type Locale = "ar" | "en";

export const LOCALES: Locale[] = ["ar", "en"];
export const DEFAULT_LOCALE: Locale = "ar";

export const DISCLAIMER: Record<Locale, string> = {
  ar: "هذه المنصة أداة تحليل تعليمية وليست ضمانًا للربح أو توصية استثمارية. الأسواق المالية تنطوي على مخاطر، وأي قرار تداول مسؤولية المستخدم وحده.",
  en: "This platform is an educational analysis tool, not a guarantee of profit or investment advice. Financial markets involve risk; every trading decision is the user's sole responsibility.",
};
