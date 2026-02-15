from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from ..data import load_bars
from ..config import CoreSettings
from .models import OptionContract, OptionChain
from .analytics import bs_price, bs_greeks


class OptionsDataProvider(ABC):
    name: str

    @abstractmethod
    def get_chain(self, symbol: str, limit: int = 50) -> OptionChain:
        raise NotImplementedError


class SyntheticOptionsProvider(OptionsDataProvider):
    name = "synthetic"

    def __init__(self, settings: CoreSettings) -> None:
        self._settings = settings

    def get_chain(self, symbol: str, limit: int = 50) -> OptionChain:
        bars = load_bars(self._settings, symbol, self._settings.data.timeframe, limit=120)
        spot = bars[-1].close if bars else 100.0
        expiries = [date.today() + timedelta(days=7), date.today() + timedelta(days=30)]
        strikes = [round(spot * (1 + pct), 2) for pct in [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2]]
        contracts: list[OptionContract] = []
        for expiry in expiries:
            t = max(1, (expiry - date.today()).days) / 365.0
            for strike in strikes:
                for opt_type in ("call", "put"):
                    iv = 0.3
                    price = bs_price(spot, strike, t, 0.02, iv, opt_type)
                    greeks = bs_greeks(spot, strike, t, 0.02, iv, opt_type)
                    contracts.append(
                        OptionContract(
                            symbol=f"{symbol}_{expiry.strftime('%Y%m%d')}_{opt_type.upper()}_{strike}",
                            underlying=symbol,
                            expiration=expiry,
                            strike=strike,
                            option_type=opt_type,
                            bid=max(price - 0.05, 0.01),
                            ask=price + 0.05,
                            last=price,
                            iv=iv,
                            volume=0,
                            open_interest=0,
                            greeks=greeks,
                        )
                    )
        return OptionChain(symbol=symbol, underlying_price=spot, contracts=contracts[:limit], provider=self.name)


class PolygonOptionsProvider(OptionsDataProvider):
    name = "polygon"

    def __init__(self, api_key: str, base_url: str = "https://api.polygon.io", snapshot_path: str | None = None) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._snapshot_path = snapshot_path or "/v3/snapshot/options/{symbol}"

    def _snapshot_chain(self, symbol: str, limit: int = 50) -> OptionChain | None:
        url = f"{self._base_url}{self._snapshot_path.format(symbol=symbol)}"
        params = {
            "limit": str(limit),
            "apiKey": self._api_key,
        }
        try:
            resp = httpx.get(url, params=params, timeout=20.0)
            resp.raise_for_status()
        except Exception:
            return None
        payload = resp.json()
        results = payload.get("results") or payload.get("options") or payload.get("data") or []
        if not results:
            return None
        underlying_price = (
            (payload.get("underlying_asset") or {}).get("price")
            or (payload.get("underlying") or {}).get("price")
            or payload.get("underlying_price")
            or 0.0
        )
        contracts: list[OptionContract] = []
        for row in results:
            details = row.get("details") or row.get("contract") or {}
            expiry_raw = details.get("expiration_date") or row.get("expiration_date")
            strike_raw = details.get("strike_price") or row.get("strike_price")
            opt_type = details.get("contract_type") or row.get("contract_type") or row.get("type")
            ticker = details.get("ticker") or row.get("ticker") or row.get("symbol") or ""
            if not expiry_raw or strike_raw is None or not opt_type:
                continue
            try:
                expiry = date.fromisoformat(str(expiry_raw))
            except Exception:
                continue
            opt_type = "call" if str(opt_type).lower().startswith("c") else "put"
            last_quote = row.get("last_quote") or row.get("quote") or {}
            last_trade = row.get("last_trade") or row.get("trade") or {}
            bid = last_quote.get("bid") or last_quote.get("b")
            ask = last_quote.get("ask") or last_quote.get("a")
            last = last_trade.get("price") or last_trade.get("p") or row.get("last_price")
            greeks = row.get("greeks") or {}
            iv = row.get("implied_volatility") or row.get("iv") or greeks.get("iv")
            contracts.append(
                OptionContract(
                    symbol=ticker,
                    underlying=symbol,
                    expiration=expiry,
                    strike=float(strike_raw),
                    option_type=opt_type,
                    bid=float(bid) if bid is not None else None,
                    ask=float(ask) if ask is not None else None,
                    last=float(last) if last is not None else None,
                    iv=float(iv) if iv is not None else None,
                    greeks={k: float(v) for k, v in greeks.items() if isinstance(v, (int, float))},
                )
            )
        return OptionChain(symbol=symbol, underlying_price=float(underlying_price or 0.0), contracts=contracts, provider=self.name)

    def get_chain(self, symbol: str, limit: int = 50) -> OptionChain:
        if not self._api_key:
            raise RuntimeError("polygon_api_key_missing")
        snapshot = self._snapshot_chain(symbol, limit=limit)
        if snapshot and snapshot.contracts:
            return snapshot
        params = {
            "underlying_ticker": symbol,
            "limit": str(limit),
            "apiKey": self._api_key,
        }
        resp = httpx.get(f"{self._base_url}/v3/reference/options/contracts", params=params, timeout=20.0)
        resp.raise_for_status()
        payload = resp.json()
        contracts: list[OptionContract] = []
        for row in payload.get("results", []):
            expiry = date.fromisoformat(row.get("expiration_date"))
            strike = float(row.get("strike_price"))
            opt_type = "call" if row.get("contract_type") == "call" else "put"
            contracts.append(
                OptionContract(
                    symbol=row.get("ticker") or row.get("symbol") or "",
                    underlying=symbol,
                    expiration=expiry,
                    strike=strike,
                    option_type=opt_type,
                    multiplier=int(row.get("shares_per_contract") or 100),
                )
            )
        return OptionChain(symbol=symbol, underlying_price=0.0, contracts=contracts, provider=self.name)


def resolve_options_provider(settings: CoreSettings, provider: str | None = None) -> OptionsDataProvider:
    choice = provider or "synthetic"
    if choice == "polygon":
        api_key = settings.data.polygon_api_key
        base_url = settings.data.polygon_api_base
        snapshot_path = settings.data.polygon_snapshot_path
        return PolygonOptionsProvider(api_key=api_key, base_url=base_url, snapshot_path=snapshot_path)
    return SyntheticOptionsProvider(settings)
