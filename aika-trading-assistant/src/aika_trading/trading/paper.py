from typing import Any


def run_paper_trade(order: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "paper_executed",
        "order": order,
        "note": "Paper trading stub; replace with broker paper APIs or simulator."
    }
