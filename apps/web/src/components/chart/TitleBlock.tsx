import type { AnalysisResult } from "@tradingworld/analysis-engine";

/** The drawing's title block: every analysis is stamped with what produced it. */
export function TitleBlock({ analysis, provider, symbol, timeframe }: { analysis?: AnalysisResult; provider?: { id: string; live: boolean; message?: string }; symbol: string; timeframe: string }) {
  const htf = analysis?.htf.map((h) => `${h.timeframe} ${h.bias === "bullish" ? "▲" : h.bias === "bearish" ? "▼" : "≈"}`).join(" · ");
  return (
    <div className="tblock">
      <div><b>INSTRUMENT</b><span>{symbol} · {timeframe}</span></div>
      <div><b>ENGINE</b><span>{analysis?.engineVersion ?? "—"}</span></div>
      <div><b>SCORING</b><span>{analysis?.scoringVersion ?? "—"}</span></div>
      <div><b>HTF</b><span>{htf || "—"}</span></div>
      <div><b>REGIME</b><span>{analysis ? `${analysis.base.regime.trend} · ${analysis.base.regime.volatility} VOL` : "—"}</span></div>
      <div><b>SESSION</b><span>{analysis ? `${analysis.session.current}${analysis.session.overlap ? " / NY OVERLAP" : ""}` : "—"}</span></div>
      <div><b>FEED</b><span className={provider?.live ? "text-up-ink" : "text-down-ink"}>{provider ? `${provider.id.toUpperCase()} · ${provider.live ? "LIVE" : "STALE"}` : "—"}</span></div>
      <div><b>ANALYSIS, NOT ADVICE</b><span>{analysis ? `${analysis.zones.length} ZONES · ${analysis.hiddenLowQuality} HIDDEN` : "—"}</span></div>
    </div>
  );
}
