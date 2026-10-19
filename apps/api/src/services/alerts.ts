import type { Repositories, Alert } from "../repositories/memory.js";
import type { AnalysisResult } from "@tradingworld/analysis-engine";

export interface AlertEvent { alert: Alert; price: number; message: { ar: string; en: string }; at: number }

/**
 * Evaluates user alerts against live prices and current zones.
 * Notifications never say BUY/SELL — only that a pre-defined analytical condition was met.
 */
export class AlertService {
  private listeners = new Set<(e: AlertEvent) => void>();
  constructor(private repos: Repositories) {}

  onTrigger(fn: (e: AlertEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  async evaluate(symbol: string, price: number, analysis?: AnalysisResult): Promise<AlertEvent[]> {
    const fired: AlertEvent[] = [];
    for (const a of await this.repos.alerts.listActive()) {
      if (a.symbol !== symbol) continue;
      let hit = false;
      let what = { ar: "", en: "" };
      if (a.kind === "price_above" && a.price !== undefined && price >= a.price) { hit = true; what = { ar: `السعر تجاوز ${a.price}`, en: `Price crossed above ${a.price}` }; }
      if (a.kind === "price_below" && a.price !== undefined && price <= a.price) { hit = true; what = { ar: `السعر كسر ${a.price}`, en: `Price crossed below ${a.price}` }; }
      if (a.kind === "zone_enter" && a.zoneId && analysis) {
        const z = analysis.zones.find((z) => z.id === a.zoneId);
        if (z && price <= z.top && price >= z.bottom) { hit = true; what = { ar: `السعر دخل منطقة تحليلية محددة مسبقًا: ${z.nameAr}`, en: `Price entered a pre-defined analysis zone: ${z.name}` }; }
      }
      if (!hit) continue;
      await this.repos.alerts.update(a.id, { active: false, triggeredAt: Date.now() });
      const ev: AlertEvent = { alert: a, price, at: Date.now(), message: { ar: `${symbol}: ${what.ar}. افتح تفاصيل التحليل قبل أي قرار.`, en: `${symbol}: ${what.en}. Open the analysis details before any decision.` } };
      fired.push(ev);
      this.listeners.forEach((l) => l(ev));
    }
    return fired;
  }
}
