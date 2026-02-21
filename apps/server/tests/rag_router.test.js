import assert from "node:assert/strict";
import test from "node:test";
import { buildRagRoutePlan } from "../src/rag/router.js";

process.env.META_RAG_ENABLED = "0";
process.env.RAG_MAX_ROUTES = "4";

function routeIds(plan) {
  return (plan?.routes || []).map(route => route.id);
}

function expectRoutesEqual(actual, expected) {
  assert.deepEqual(new Set(actual), new Set(expected));
}

test("routes meeting queries to fireflies + recordings", async () => {
  const plan = await buildRagRoutePlan("What were the action items from last week's meeting?");
  expectRoutesEqual(routeIds(plan), ["fireflies", "recordings"]);
});

test("explicit Fireflies stays scoped", async () => {
  const plan = await buildRagRoutePlan("Search Fireflies for action items");
  assert.deepEqual(routeIds(plan), ["fireflies"]);
});

test("recording queries target recordings", async () => {
  const plan = await buildRagRoutePlan("Find the recording about Q3 planning");
  assert.deepEqual(routeIds(plan), ["recordings"]);
});

test("email queries hit Gmail + Outlook", async () => {
  const plan = await buildRagRoutePlan("Find the latest email from Alex");
  expectRoutesEqual(routeIds(plan), ["gmail", "outlook"]);
});

test("explicit Gmail stays scoped", async () => {
  const plan = await buildRagRoutePlan("Search Gmail for the invoice");
  assert.deepEqual(routeIds(plan), ["gmail"]);
});

test("docs queries hit docs collections", async () => {
  const plan = await buildRagRoutePlan("Check the wiki for the vacation policy");
  expectRoutesEqual(routeIds(plan), ["confluence", "notion", "notes"]);
});

test("web + telegram route plans are identical", async () => {
  const question = "Find the latest email from Alex";
  const webPlan = await buildRagRoutePlan(question, { channel: "web" });
  const telegramPlan = await buildRagRoutePlan(question, { channel: "telegram" });
  assert.deepEqual(routeIds(webPlan), routeIds(telegramPlan));
});
