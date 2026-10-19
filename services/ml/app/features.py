"""Feature extraction from logged zones (the engine's structured output).

The ML layer never sees raw price alone: it sees the SAME explainable factors the user sees,
plus market context (regime, session, volatility). This keeps every model auditable.
"""
from __future__ import annotations

from typing import Any

FACTOR_KEYS = [
    "HTF_LEVEL", "LIQUIDITY_SWEEP", "STRUCTURE_SHIFT", "DISPLACEMENT", "FVG",
    "ORDER_BLOCK", "HTF_BIAS_ALIGN", "SESSION_RELEVANCE", "VOLATILITY_CONDITION", "FRESH",
]
REGIME_TREND = ["TRENDING_UP", "TRENDING_DOWN", "RANGING"]
REGIME_VOL = ["HIGH", "NORMAL", "LOW"]
SESSIONS = ["ASIA", "LONDON", "NEW_YORK", "OFF"]


def zone_features(zone: dict[str, Any], regime: dict[str, Any], session: str) -> list[float]:
    """Binary factor presence + one-hot regime/session + continuous size features."""
    present = {f["key"]: bool(f["present"]) for f in zone.get("factors", [])}
    feats: list[float] = [1.0 if present.get(k) else 0.0 for k in FACTOR_KEYS]
    feats += [1.0 if regime.get("trend") == t else 0.0 for t in REGIME_TREND]
    feats += [1.0 if regime.get("volatility") == v else 0.0 for v in REGIME_VOL]
    feats += [1.0 if session == s else 0.0 for s in SESSIONS]
    atr = float(regime.get("atr") or 1.0)
    feats.append((float(zone["top"]) - float(zone["bottom"])) / atr)  # zone height in ATR
    feats.append(1.0 if zone.get("direction") == "bullish" else 0.0)
    return feats


def feature_names() -> list[str]:
    return (
        [f"factor_{k}" for k in FACTOR_KEYS]
        + [f"trend_{t}" for t in REGIME_TREND]
        + [f"vol_{v}" for v in REGIME_VOL]
        + [f"session_{s}" for s in SESSIONS]
        + ["height_atr", "is_bullish"]
    )


def label(outcome: dict[str, Any]) -> int:
    """1 = zone produced a reaction (REACTED), 0 otherwise. Never 'profit' — reaction quality only."""
    return 1 if outcome.get("finalStatus") == "REACTED" else 0
