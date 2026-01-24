import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("aika voice generates a wav header (stub)", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aika-voice-"));
  process.env.TTS_ENGINE = "stub";
  process.env.TTS_CACHE_DIR = tmpDir;

  const { generateAikaVoice } = await import("../aika_voice/index.js");
  const result = await generateAikaVoice({
    text: "Hello from Aika Voice.",
    settings: { format: "wav" }
  });

  const fd = fs.openSync(result.filePath, "r");
  const header = Buffer.alloc(12);
  fs.readSync(fd, header, 0, 12, 0);
  fs.closeSync(fd);

  assert.equal(header.toString("ascii", 0, 4), "RIFF");
  assert.equal(header.toString("ascii", 8, 12), "WAVE");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
