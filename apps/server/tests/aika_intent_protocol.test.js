import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionProtocolResponse, classifyAikaIntent } from "../src/aika/intentProtocol.js";

test("classifyAikaIntent detects EXECUTE and code lane", () => {
  const result = classifyAikaIntent("AIKA, execute patch the repo and run tests");
  assert.equal(result.intent, "EXECUTE");
  assert.equal(result.laneDecision.lane, "code");
  assert.equal(result.laneDecision.system, "Codex + MCP");
});

test("classifyAikaIntent supports space-delimited AIKA prefix", () => {
  const result = classifyAikaIntent("AIKA execute patch the repo");
  assert.equal(result.intent, "EXECUTE");
});

test("classifyAikaIntent marks approval-required actions", () => {
  const result = classifyAikaIntent("AIKA, stage deploy this release");
  assert.equal(result.intent, "STAGE");
  assert.equal(result.risk.approvalRequired, true);
});

test("buildExecutionProtocolResponse returns 8-section format", () => {
  const protocol = buildExecutionProtocolResponse({
    originalText: "AIKA, analyze integration risk for this workflow"
  });
  assert.ok(protocol.reply.includes("1. Goal"));
  assert.ok(protocol.reply.includes("8. Next Step"));
});
