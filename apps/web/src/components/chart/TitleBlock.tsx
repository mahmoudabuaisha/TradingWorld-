import type { AnalysisResult } from "@tradingworld/analysis-engine";
import type { FeedStatus, ProviderStatus } from "@tradingworld/shared";
import { FeedMark } from "../marks/FeedMark";

/** The drawing's title block: every analysis is stamped with what produced it — including where the prices came from. */
export function TitleBlock({
  analysis,
  provider,
  feed,
  symbol,
  timeframe,
}: {
  analysis?: AnalysisResult;
  provider?: ProviderStatus;
  feed?: FeedStatus;
  symbol: string;
  timeframe: string;
}) {
  const feedLike =
    feed ??
    (provider
      ? { provider: provider.id, state: provider.state, transport: provider.transport, delaySeconds: provider.pollSeconds }
      : undefined);
  const htf = analysis?.htf.map((h) => `${h.timeframe} ${h.bias === "bullish" ? "▲" : h.bias === "bearish" ? "▼" : "≈"}`).join(" · ");
  return (
    <div className="tblock">
      <div>
        <b>INSTRUMENT</b>
        <span>
          {symbol} · {timeframe}
        </span>
      </div>
      <div>
        <b>ENGINE</b>
        <span>{analysis?.engineVersion ?? "—"}</span>
      </div>
      <div>
        <b>SCORING</b>
        <span>{analysis?.scoringVersion ?? "—"}</span>
      </div>
      <div>
        <b>HTF</b>
        <span>{htf || "—"}</span>
      </div>
      <div>
        <b>REGIME</b>
        <span>{analysis ? `${analysis.base.regime.trend} · ${analysis.base.regime.volatility} VOL` : "—"}</span>
      </div>
      <div>
        <b>SESSION</b>
        <span>{analysis ? `${analysis.session.current}${analysis.session.overlap ? " / NY OVERLAP" : ""}` : "—"}</span>
      </div>
      <div>
        <b>FEED</b>
        <span title={feed?.message ?? provider?.message}>
          <FeedMark feed={feedLike} />
        </span>
      </div>
      <div>
        <b>ANALYSIS, NOT ADVICE</b>
        <span>{analysis ? `${analysis.zones.length} ZONES · ${analysis.hiddenLowQuality} HIDDEN` : "—"}</span>
      </div>
    </div>
  );
}
