from __future__ import annotations

from dataclasses import dataclass

from .models import Signal, utc_now


@dataclass
class EnsembleEngine:
    min_weight: float = 0.0
    max_weight: float = 1.0

    def combine(
        self,
        signals: dict[str, Signal],
        weights: dict[str, float],
        symbol: str,
        threshold: float = 0.1,
    ) -> Signal:
        score = 0.0
        for name, signal in signals.items():
            weight = min(self.max_weight, max(self.min_weight, weights.get(name, 0.0)))
            direction = 1.0 if signal.side == "long" else -1.0 if signal.side == "short" else 0.0
            score += weight * direction
        if abs(score) < threshold:
            side = "flat"
        else:
            side = "long" if score > 0 else "short"
        return Signal(symbol=symbol, side=side, strength=abs(score), generated_at=utc_now(), meta={"score": score})

    def weight_by_performance(self, performance: dict[str, float], decay: float = 0.9) -> dict[str, float]:
        if not performance:
            return {}
        total = sum(max(0.0, perf) for perf in performance.values())
        if total <= 0:
            return {name: 1.0 / len(performance) for name in performance}
        return {name: max(0.0, perf) / total * decay for name, perf in performance.items()}
