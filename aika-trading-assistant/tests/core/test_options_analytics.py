from aika_trading.core.options.analytics import bs_price, implied_vol


def test_bs_price_roundtrip():
    spot = 100.0
    strike = 100.0
    t = 30 / 365
    rate = 0.02
    vol = 0.3
    price = bs_price(spot, strike, t, rate, vol, "call")
    iv = implied_vol(price, spot, strike, t, rate, "call")
    assert abs(iv - vol) < 1e-2
