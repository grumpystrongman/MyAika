import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { createTodoFromEmail, scheduleEmailFollowUp, replyWithContext } from "../src/email/emailActions.js";

initDb();
runMigrations();

test("convert email to todo adds tags and details", async () => {
  const result = await createTodoFromEmail({
    email: {
      subject: "Q1 Planning",
      from: "ceo@example.com",
      snippet: "Need the roadmap by Friday",
      provider: "gmail",
      webLink: "https://mail.google.com/mail/u/0/#inbox/abc123",
      receivedAt: "2026-02-18T10:00:00Z"
    },
    priority: "high",
    tags: ["leadership"]
  }, { userId: "local" });

  assert.ok(result.todo.id);
  assert.ok(result.todo.title.includes("Q1 Planning"));
  assert.ok(result.todo.details.includes("From: ceo@example.com"));
  assert.ok(result.todo.details.includes("Snippet: Need the roadmap by Friday"));
  assert.ok(result.todo.tags.includes("email"));
  assert.ok(result.todo.tags.includes("gmail"));
  assert.ok(result.todo.tags.includes("leadership"));
});

test("schedule follow-up creates todo and hold", async () => {
  const followUpAt = "2026-02-21T15:00:00Z";
  const result = await scheduleEmailFollowUp({
    email: {
      subject: "Vendor follow-up",
      from: "ops@example.com",
      snippet: "Please confirm timeline",
      provider: "outlook"
    },
    followUpAt,
    reminderAt: "2026-02-21T13:00:00Z",
    hold: {
      title: "Vendor follow-up call",
      start: "2026-02-21T15:00:00Z",
      end: "2026-02-21T15:30:00Z",
      timezone: "UTC",
      attendees: ["ops@example.com"],
      location: "Teams"
    }
  }, { userId: "local" });

  assert.ok(result.todo.id);
  assert.equal(new Date(result.todo.due).toISOString(), new Date(followUpAt).toISOString());
  assert.ok(result.hold?.id);
  assert.equal(result.hold?.title, "Vendor follow-up call");
});

test("reply with context uses rag answer", async () => {
  const stubAnswer = async () => ({
    answer: "Remember the renewal is in Q2.",
    citations: [{ id: "rag:notes:note:demo" }]
  });

  const result = await replyWithContext({
    email: {
      subject: "Renewal question",
      body: "When is the renewal?",
      from: "client@example.com",
      to: ["team@example.com"]
    },
    tone: "direct",
    signOffName: "Aika"
  }, { userId: "local" }, stubAnswer);

  assert.equal(result.context, "Remember the renewal is in Q2.");
  assert.ok(result.draft.body.includes("Context: Remember the renewal is in Q2."));
  assert.ok(result.draft.subject.startsWith("Re:"));
  assert.ok(result.citations.length === 1);
});
