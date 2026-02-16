function formatNumber(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(digits));
}

export function buildLongTermSignal(detail = {}, { horizonDays = 180 } = {}) {
  const reasons = [];
  let score = 0;

  const trendLabel = String(detail.trendLabel || "");
  if (/uptrend/i.test(trendLabel)) {
    score += 2;
    reasons.push("Uptrend over the review window.");
  } else if (/downtrend/i.test(trendLabel)) {
    score -= 2;
    reasons.push("Downtrend over the review window.");
  } else if (trendLabel) {
    reasons.push(`Trend: ${trendLabel}.`);
  }

  const maAlignment = String(detail.maAlignment || "");
  if (/bullish/i.test(maAlignment)) {
    score += 1;
    reasons.push("Bullish moving-average stack.");
  } else if (/bearish/i.test(maAlignment)) {
    score -= 1;
    reasons.push("Bearish moving-average stack.");
  }

  if (Number.isFinite(detail.trendStrengthPct)) {
    if (detail.trendStrengthPct >= 45) {
      score += 0.6;
      reasons.push("Trend strength is high.");
    } else if (detail.trendStrengthPct <= 20) {
      score -= 0.4;
      reasons.push("Trend strength is weak.");
    }
  }

  if (Number.isFinite(detail.momentum20)) {
    if (detail.momentum20 > 0) {
      score += 0.4;
      reasons.push("20-day momentum is positive.");
    } else if (detail.momentum20 < 0) {
      score -= 0.4;
      reasons.push("20-day momentum is negative.");
    }
  }

  if (Number.isFinite(detail.rsi14)) {
    if (detail.rsi14 >= 70) {
      score -= 0.4;
      reasons.push("RSI is stretched (overbought).");
    } else if (detail.rsi14 <= 30) {
      score += 0.4;
      reasons.push("RSI is washed out (oversold).");
    }
  }

  if (Number.isFinite(detail.maxDrawdownPct) && detail.maxDrawdownPct >= 25) {
    score -= 0.5;
    reasons.push("Large drawdown in the window.");
  }

  const volRegime = String(detail.volRegime || "");
  if (/elevated/i.test(volRegime) || /rising/i.test(volRegime)) {
    score -= 0.3;
    reasons.push("Volatility regime is elevated.");
  }

  const breakout = String(detail.breakoutLabel || "");
  if (breakout) {
    if (/breakout/i.test(breakout)) {
      score += 0.3;
      reasons.push(breakout);
    } else {
      reasons.push(breakout);
    }
  }

  const roundedScore = formatNumber(score, 2) ?? 0;
  const absScore = Math.abs(roundedScore);
  let action = "HOLD";
  if (roundedScore >= 2) action = "ACCUMULATE";
  else if (roundedScore >= 1) action = "BUY (WATCH)";
  else if (roundedScore <= -2) action = "AVOID / REDUCE";
  else if (roundedScore <= -1) action = "REDUCE";
  else if (roundedScore <= -0.25) action = "WATCH";

  const confidence = formatNumber(Math.min(0.95, Math.max(0.2, absScore / 3)), 2);

  return {
    action,
    score: roundedScore,
    confidence,
    horizonDays,
    reasons: reasons.slice(0, 6)
  };
}
