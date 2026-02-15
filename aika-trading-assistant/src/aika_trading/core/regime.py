from __future__ import annotations

from statistics import pstdev, mean

from .models import Bar


def compute_regime_labels(
    bars: list[Bar],
    lookback: int = 50,
    trend_threshold: float = 0.02,
    vol_threshold: float = 0.02,
) -> list[str]:
    labels: list[str] = []
    closes = [bar.close for bar in bars]
    for idx in range(len(bars)):
        if idx < lookback:
            labels.append("unknown")
            continue
        window = closes[idx - lookback : idx]
        if len(window) < 2:
            labels.append("unknown")
            continue
        trend = window[-1] / window[0] - 1.0
        returns = [window[i] / window[i - 1] - 1.0 for i in range(1, len(window))]
        vol = pstdev(returns) if len(returns) > 1 else 0.0
        if abs(trend) < trend_threshold:
            labels.append("sideways")
        elif trend >= 0:
            labels.append("bull_high_vol" if vol > vol_threshold else "bull_low_vol")
        else:
            labels.append("bear_high_vol" if vol > vol_threshold else "bear_low_vol")
    return labels


def regime_summary(labels: list[str]) -> dict[str, float]:
    if not labels:
        return {}
    unique = {label: labels.count(label) for label in set(labels)}
    total = len(labels)
    return {label: count / total for label, count in unique.items()}
