from __future__ import annotations

from statistics import mean, pstdev

from ..models import Bar, Signal, utc_now
from .base import Strategy
from .registry import registry


def _closes(history: list[Bar]) -> list[float]:
    return [bar.close for bar in history]


def _returns(values: list[float]) -> list[float]:
    if len(values) < 2:
        return []
    return [(values[idx] / values[idx - 1] - 1.0) for idx in range(1, len(values))]


def _atr(history: list[Bar], lookback: int) -> float:
    if len(history) < lookback + 1:
        return 0.0
    trs: list[float] = []
    for idx in range(-lookback, 0):
        bar = history[idx]
        prev = history[idx - 1]
        tr = max(bar.high - bar.low, abs(bar.high - prev.close), abs(bar.low - prev.close))
        trs.append(tr)
    return mean(trs) if trs else 0.0


@registry.register
class VolatilityMomentum(Strategy):
    name = "volatility_momentum"
    version = "0.1"

    def generate_signals(self, history: list[Bar]) -> list[Signal]:
        lookback = int(self.params.get("lookback", 50))
        if len(history) <= lookback:
            return []
        closes = _closes(history)
        ret = closes[-1] / closes[-1 - lookback] - 1.0
        returns = _returns(closes[-lookback:])
        vol = pstdev(returns) if len(returns) > 1 else 0.0
        strength = ret / (vol + 1e-6)
        if ret > 0:
            side = "long"
        elif ret < 0:
            side = "short"
        else:
            side = "flat"
        return [
            Signal(
                symbol=history[-1].symbol,
                side=side,
                strength=strength,
                generated_at=utc_now(),
                meta={"return": ret, "vol": vol},
            )
        ]


@registry.register
class MeanReversionZScore(Strategy):
    name = "mean_reversion"
    version = "0.1"

    def generate_signals(self, history: list[Bar]) -> list[Signal]:
        lookback = int(self.params.get("lookback", 20))
        threshold = float(self.params.get("z_threshold", 1.5))
        if len(history) <= lookback:
            return []
        closes = _closes(history[-lookback:])
        avg = mean(closes)
        std = pstdev(closes) if len(closes) > 1 else 0.0
        z = (closes[-1] - avg) / (std + 1e-6)
        if z > threshold:
            side = "short"
        elif z < -threshold:
            side = "long"
        else:
            side = "flat"
        return [
            Signal(
                symbol=history[-1].symbol,
                side=side,
                strength=abs(z),
                generated_at=utc_now(),
                meta={"z": z},
            )
        ]


@registry.register
class BreakoutAtrStops(Strategy):
    name = "breakout_atr"
    version = "0.1"

    def generate_signals(self, history: list[Bar]) -> list[Signal]:
        lookback = int(self.params.get("lookback", 20))
        atr_mult = float(self.params.get("atr_mult", 2.0))
        if len(history) <= lookback:
            return []
        window = history[-lookback:]
        highs = [bar.high for bar in window]
        lows = [bar.low for bar in window]
        latest = history[-1]
        high_break = max(highs)
        low_break = min(lows)
        atr = _atr(history, lookback)
        stop = None
        if latest.close > high_break:
            side = "long"
            stop = latest.close - atr * atr_mult
        elif latest.close < low_break:
            side = "short"
            stop = latest.close + atr * atr_mult
        else:
            side = "flat"
        return [
            Signal(
                symbol=latest.symbol,
                side=side,
                strength=atr,
                generated_at=utc_now(),
                meta={"atr": atr, "stop": stop, "high_break": high_break, "low_break": low_break},
            )
        ]
