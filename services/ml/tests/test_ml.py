import numpy as np
from sklearn.linear_model import LogisticRegression

from app.backtest.walk_forward import walk_forward
from app.features import FACTOR_KEYS, feature_names, zone_features
from app.registry import propose_weights


def test_features_shape():
    zone = {"top": 10, "bottom": 9, "direction": "bullish", "factors": [{"key": k, "present": i % 2 == 0} for i, k in enumerate(FACTOR_KEYS)]}
    f = zone_features(zone, {"trend": "RANGING", "volatility": "NORMAL", "atr": 0.5}, "LONDON")
    assert len(f) == len(feature_names())
    assert f[0] == 1.0 and f[1] == 0.0


def test_walk_forward_is_time_ordered_and_runs():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(600, 4))
    y = (X[:, 0] + rng.normal(scale=0.5, size=600) > 0).astype(int)
    rep = walk_forward(X, y, lambda: LogisticRegression(), n_folds=4, min_train=200)
    assert len(rep.folds) == 4
    assert all(f.train_size < 600 for f in rep.folds)
    assert rep.mean_accuracy > 0.7


def test_propose_weights_sums_to_100():
    w = propose_weights({"A": 2.0, "B": 1.0, "C": -1.0, "D": 0.5})
    assert sum(w.values()) == 100
    assert w["A"] > w["B"] > w["D"]
