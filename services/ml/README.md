# TradingWorld ML service

Research-only service. It **never** detects zones — the TypeScript engine does that deterministically.
It studies logged zones + their market outcomes and proposes new scoring weights, which are
deployed only after human approval as a new `SCORING_VERSION`.

```bash
cd services/ml
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest -q
uvicorn app.main:app --reload --port 8000
```

Guard-rails (see docs/04-ai-architecture.md): time-ordered walk-forward validation, no shuffling,
labels are "reaction vs no reaction" (never profit), versioned registry, out-of-sample lift reported.
