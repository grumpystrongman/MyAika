import assert from "node:assert/strict";
import test from "node:test";
import { transformRecordingEvents } from "../src/desktopRunner/recorder.js";

test("transformRecordingEvents merges char bursts and inserts waits", () => {
  const events = [
    { type: "char", value: "h", delayMs: 0 },
    { type: "char", value: "i", delayMs: 40 },
    { type: "char", value: "!", delayMs: 600 },
    { type: "key", combo: "ENTER", delayMs: 50 },
    { type: "mouseClick", x: 10, y: 20, button: "left", count: 1, delayMs: 200 }
  ];
  const { actions } = transformRecordingEvents(events, { mergeWindowMs: 300, maxWaitMs: 10000 });
  const types = actions.map(action => action.type);
  assert.deepEqual(types, ["type", "wait", "type", "wait", "key", "wait", "mouseClick"]);
  assert.equal(actions[0].text, "hi");
  assert.equal(actions[2].text, "!");
  assert.equal(actions[3].ms, 50);
  assert.equal(actions[6].button, "left");
});

test("transformRecordingEvents caps waits when configured", () => {
  const events = [{ type: "char", value: "a", delayMs: 50000 }];
  const { actions, stats } = transformRecordingEvents(events, { maxWaitMs: 1000 });
  assert.equal(actions[0].type, "wait");
  assert.equal(actions[0].ms, 1000);
  assert.equal(stats.waitsCapped, 1);
});
