"""TradingWorld ML service — research API (FastAPI).

Endpoints:
  POST /train       → walk-forward validation on logged zones + outcomes, returns a weight PROPOSAL
  GET  /registry    → list model records
  GET  /health
Detection stays deterministic in the TypeScript engine; this service only studies outcomes
and proposes new (versioned) scoring weights.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from sklearn.linear_model import LogisticRegression

from app import registry
from app.backtest.walk_forward import walk_forward
from app.features import FACTOR_KEYS, feature_names, label, zone_features

app = FastAPI(title="TradingWorld ML", version="0.1.0")


class ZoneSample(BaseModel):
    zone: dict[str, Any]
    regime: dict[str, Any]
    session: str
    outcome: dict[str, Any]


class TrainRequest(BaseModel):
    engine_version: str
    scoring_version: str
    samples: list[ZoneSample]
    n_folds: int = 5


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "features": feature_names(), "registry": len(registry.load_all())}


@app.post("/train")
def train(req: TrainRequest) -> dict[str, Any]:
    if len(req.samples) < 50:
        return {"error": "need at least 50 labelled samples", "sample_size": len(req.samples)}
    X = np.array([zone_features(s.zone, s.regime, s.session) for s in req.samples], dtype=float)
    y = np.array([label(s.outcome) for s in req.samples], dtype=int)
    make = lambda: LogisticRegression(max_iter=500, C=0.5)  # noqa: E731
    report = walk_forward(X, y, make, n_folds=req.n_folds)
    model = make().fit(X, y)
    coefs = dict(zip(feature_names(), model.coef_[0].tolist()))
    factor_coefs = {k: coefs[f"factor_{k}"] for k in FACTOR_KEYS}
    proposal = registry.propose_weights(factor_coefs)
    record = registry.ModelRecord(
        version=registry.next_version(),
        created_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        engine_version=req.engine_version,
        scoring_version=req.scoring_version,
        sample_size=len(req.samples),
        walk_forward_accuracy=report.mean_accuracy,
        walk_forward_lift=report.mean_lift,
        proposed_weights=proposal,
        notes="logistic regression on explainable factors; proposal only",
        extra={"coefficients": coefs, "folds": [f.__dict__ for f in report.folds]},
    )
    registry.save(record)
    return {"record": record.__dict__, "deploy": False, "message": "Proposal saved. Deployment requires human approval + new SCORING_VERSION."}


@app.get("/registry")
def list_registry() -> dict[str, Any]:
    return {"records": [r.__dict__ for r in registry.load_all()]}
