from langflow.custom import Component
from langflow.io import DropdownInput, MessageTextInput, Output
from langflow.schema import Data
import os
import requests


class OpenAegisComponent(Component):
    display_name = "OpenAegis"
    description = "OpenAegis runtime adapter component."
    icon = "zap"
    name = "OpenAegisComponent"

    inputs = [
        DropdownInput(name="operation", display_name="Operation", options=["chat", "module", "runbook"], value="chat"),
        MessageTextInput(name="prompt", display_name="Prompt", value=""),
        MessageTextInput(name="module_name", display_name="Module Name", value=""),
        MessageTextInput(name="runbook_name", display_name="Runbook Name", value="")
    ]

    outputs = [Output(display_name="Response", name="response", method="run_model")]

    def run_model(self) -> Data:
        base_url = os.getenv("OPENAEGIS_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
        api_key = os.getenv("OPENAEGIS_API_KEY", "")
        headers = {"x-api-key": api_key, "Content-Type": "application/json"}
        operation = str(self.operation or "chat").lower()

        if operation == "module":
            endpoint = "/api/aika/modules/run"
            payload = {"moduleName": self.module_name or "", "inputPayload": {}}
        elif operation == "runbook":
            endpoint = "/api/aika/runbooks/run"
            payload = {"name": self.runbook_name or "", "inputPayload": {}}
        else:
            endpoint = "/chat"
            payload = {"userText": self.prompt or ""}

        resp = requests.post(f"{base_url}{endpoint}", json=payload, headers=headers, timeout=20)
        resp.raise_for_status()
        return Data(data=resp.json())
