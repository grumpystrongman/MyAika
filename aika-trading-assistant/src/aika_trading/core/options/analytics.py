from __future__ import annotations

import math


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return (1.0 / math.sqrt(2 * math.pi)) * math.exp(-0.5 * x * x)


def bs_price(spot: float, strike: float, time_to_expiry: float, rate: float, vol: float, option_type: str) -> float:
    if time_to_expiry <= 0 or vol <= 0:
        if option_type == "call":
            return max(0.0, spot - strike)
        return max(0.0, strike - spot)
    d1 = (math.log(spot / strike) + (rate + 0.5 * vol * vol) * time_to_expiry) / (vol * math.sqrt(time_to_expiry))
    d2 = d1 - vol * math.sqrt(time_to_expiry)
    if option_type == "call":
        return spot * _norm_cdf(d1) - strike * math.exp(-rate * time_to_expiry) * _norm_cdf(d2)
    return strike * math.exp(-rate * time_to_expiry) * _norm_cdf(-d2) - spot * _norm_cdf(-d1)


def bs_greeks(spot: float, strike: float, time_to_expiry: float, rate: float, vol: float, option_type: str) -> dict[str, float]:
    if time_to_expiry <= 0 or vol <= 0:
        return {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
    d1 = (math.log(spot / strike) + (rate + 0.5 * vol * vol) * time_to_expiry) / (vol * math.sqrt(time_to_expiry))
    d2 = d1 - vol * math.sqrt(time_to_expiry)
    pdf = _norm_pdf(d1)
    if option_type == "call":
        delta = _norm_cdf(d1)
        rho = strike * time_to_expiry * math.exp(-rate * time_to_expiry) * _norm_cdf(d2)
        theta = (
            -(spot * pdf * vol) / (2 * math.sqrt(time_to_expiry))
            - rate * strike * math.exp(-rate * time_to_expiry) * _norm_cdf(d2)
        )
    else:
        delta = _norm_cdf(d1) - 1
        rho = -strike * time_to_expiry * math.exp(-rate * time_to_expiry) * _norm_cdf(-d2)
        theta = (
            -(spot * pdf * vol) / (2 * math.sqrt(time_to_expiry))
            + rate * strike * math.exp(-rate * time_to_expiry) * _norm_cdf(-d2)
        )
    gamma = pdf / (spot * vol * math.sqrt(time_to_expiry))
    vega = spot * pdf * math.sqrt(time_to_expiry)
    return {
        "delta": delta,
        "gamma": gamma,
        "theta": theta,
        "vega": vega,
        "rho": rho,
    }


def bs_stats(spot: float, strike: float, time_to_expiry: float, rate: float, vol: float, option_type: str) -> dict[str, float]:
    if time_to_expiry <= 0 or vol <= 0:
        return {"prob_itm": 0.0, "d1": 0.0, "d2": 0.0}
    d1 = (math.log(spot / strike) + (rate + 0.5 * vol * vol) * time_to_expiry) / (vol * math.sqrt(time_to_expiry))
    d2 = d1 - vol * math.sqrt(time_to_expiry)
    if option_type == "call":
        prob = _norm_cdf(d2)
    else:
        prob = _norm_cdf(-d2)
    return {"prob_itm": prob, "d1": d1, "d2": d2}


def implied_vol(
    price: float,
    spot: float,
    strike: float,
    time_to_expiry: float,
    rate: float,
    option_type: str,
    initial: float = 0.3,
    max_iter: int = 50,
) -> float:
    vol = max(1e-4, initial)
    for _ in range(max_iter):
        price_est = bs_price(spot, strike, time_to_expiry, rate, vol, option_type)
        vega = bs_greeks(spot, strike, time_to_expiry, rate, vol, option_type)["vega"]
        if vega == 0:
            break
        diff = price_est - price
        if abs(diff) < 1e-6:
            break
        vol -= diff / vega
        vol = max(1e-4, min(vol, 5.0))
    return vol
