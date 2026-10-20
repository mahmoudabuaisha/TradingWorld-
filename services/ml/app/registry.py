"""Model registry: every trained model is versioned, never deployed silently.

A proposal contains new factor weights derived from a validated model. Deployment is a
human decision recorded in PROGRESS.md and in the EngineVersion table (packages/db).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

REGISTRY_DIR = Path(__file__).resolve().parent.parent / "registry"


@dataclass
class ModelRecord:
    version: str
    created_at: str
    engine_version: str
    scoring_version: str
    sample_size: int
    walk_forward_accuracy: float
    walk_forward_lift: float
    proposed_weights: dict[str, int]
    notes: str = ""
    status: str = "proposed"  # proposed | validated | rejected | deployed
    extra: dict = field(default_factory=dict)


def save(record: ModelRecord) -> Path:
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    path = REGISTRY_DIR / f"{record.version}.json"
    path.write_text(json.dumps(asdict(record), indent=2, ensure_ascii=False))
    return path


def load_all() -> list[ModelRecord]:
    if not REGISTRY_DIR.exists():
        return []
    out = []
    for p in sorted(REGISTRY_DIR.glob("*.json")):
        out.append(ModelRecord(**json.loads(p.read_text())))
    return out


def next_version(prefix: str = "ml") -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"{prefix}-{stamp}"


def propose_weights(coefficients: dict[str, float], total: int = 100, floor: int = 2) -> dict[str, int]:
    """Convert positive model coefficients into integer weights summing to `total` (explainable scoring)."""
    pos = {k: max(v, 0.0) for k, v in coefficients.items()}
    s = sum(pos.values())
    if s == 0:
        return {k: total // len(pos) for k in pos}
    raw = {k: max(floor, round(v / s * total)) for k, v in pos.items()}
    diff = total - sum(raw.values())
    top = max(raw, key=raw.get)
    raw[top] += diff
    return raw
