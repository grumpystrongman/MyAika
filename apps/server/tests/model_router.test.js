import test from "node:test";
import assert from "node:assert/strict";
import { routeModel, resetModelRouter } from "../src/agent/modelRouter.js";

function withEnv(vars, fn) {
  const original = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined || vars[key] === null) delete process.env[key];
    else process.env[key] = vars[key];
  }
  resetModelRouter();
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    resetModelRouter();
  }
}

test("model router prefers local when configured", () => {
  withEnv({
    MODEL_ROUTER_MODE: "local",
    LOCAL_LLM_BASE_URL: "http://localhost:1234",
    LOCAL_LLM_MODEL: "local-model",
    OPENAI_API_KEY: ""
  }, () => {
    const route = routeModel({ purpose: "planner" });
    assert.equal(route.provider, "local");
    assert.equal(route.model, "local-model");
  });
});

test("model router auto prefers local when requested", () => {
  withEnv({
    MODEL_ROUTER_MODE: "auto",
    LOCAL_LLM_BASE_URL: "http://localhost:1234",
    LOCAL_LLM_MODEL: "local-model",
    OPENAI_API_KEY: "test-key"
  }, () => {
    const route = routeModel({ purpose: "planner", preferLocal: true });
    assert.equal(route.provider, "local");
  });
});
