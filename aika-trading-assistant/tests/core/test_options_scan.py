from datetime import date

from aika_trading.core.options.models import OptionContract
from aika_trading.core.options.scanner import scan_contracts


def test_scan_contracts_filters():
    contracts = [
        OptionContract(
            symbol="TEST_C1",
            underlying="TEST",
            expiration=date.today(),
            strike=100.0,
            option_type="call",
            iv=0.5,
            greeks={"delta": 0.3, "prob_itm": 0.4},
        ),
        OptionContract(
            symbol="TEST_P1",
            underlying="TEST",
            expiration=date.today(),
            strike=90.0,
            option_type="put",
            iv=0.2,
            greeks={"delta": -0.1, "prob_itm": 0.2},
        ),
    ]
    results = scan_contracts(contracts, {"min_delta": 0.2, "max_delta": 0.4, "abs_delta": True})
    assert len(results) == 1
    assert results[0]["symbol"] == "TEST_C1"
