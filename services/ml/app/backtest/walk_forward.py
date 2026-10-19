"""Walk-forward (anchored, time-ordered) validation to prevent look-ahead and overfitting.

Data MUST be sorted by detection time. Each fold trains on [0, split) and tests on [split, split+test_size).
No shuffling, no random K-fold: that would leak future market regimes into training.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class FoldResult:
    train_size: int
    test_size: int
    accuracy: float
    base_rate: float
    lift: float


@dataclass
class WalkForwardReport:
    folds: list[FoldResult] = field(default_factory=list)

    @property
    def mean_accuracy(self) -> float:
        return float(np.mean([f.accuracy for f in self.folds])) if self.folds else 0.0

    @property
    def mean_lift(self) -> float:
        return float(np.mean([f.lift for f in self.folds])) if self.folds else 0.0


def walk_forward(X: np.ndarray, y: np.ndarray, make_model, n_folds: int = 5, min_train: int = 200) -> WalkForwardReport:
    n = len(y)
    report = WalkForwardReport()
    if n < min_train + n_folds:
        return report
    test_size = (n - min_train) // n_folds
    for k in range(n_folds):
        split = min_train + k * test_size
        end = split + test_size if k < n_folds - 1 else n
        Xtr, ytr, Xte, yte = X[:split], y[:split], X[split:end], y[split:end]
        if len(np.unique(ytr)) < 2 or len(yte) == 0:
            continue
        model = make_model()
        model.fit(Xtr, ytr)
        pred = model.predict(Xte)
        acc = float((pred == yte).mean())
        base = float(max(yte.mean(), 1 - yte.mean()))
        report.folds.append(FoldResult(len(ytr), len(yte), acc, base, acc - base))
    return report
