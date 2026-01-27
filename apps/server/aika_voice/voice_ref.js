import fs from "node:fs";
import path from "node:path";
import { cacheDir } from "./paths.js";
import { ensureDir, sha256 } from "./cache.js";

function parseWavHeader(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("invalid_wav_header");
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        numChannels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14)
      };
    } else if (id === "data") {
      data = { offset: chunkStart, size };
    }
    offset = chunkStart + size + (size % 2);
    if (fmt && data) break;
  }
  if (!fmt || !data) {
    throw new Error("invalid_wav_chunks");
  }
  return { fmt, data };
}

function writeTrimmedWav(inputBuffer, header, bytesNeeded, outPath) {
  const { fmt, data } = header;
  const trimmedData = inputBuffer.slice(data.offset, data.offset + bytesNeeded);
  const dataSize = trimmedData.length;
  const out = Buffer.alloc(44 + dataSize);

  out.write("RIFF", 0, 4, "ascii");
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8, 4, "ascii");
  out.write("fmt ", 12, 4, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(fmt.audioFormat, 20);
  out.writeUInt16LE(fmt.numChannels, 22);
  out.writeUInt32LE(fmt.sampleRate, 24);
  out.writeUInt32LE(fmt.byteRate, 28);
  out.writeUInt16LE(fmt.blockAlign, 32);
  out.writeUInt16LE(fmt.bitsPerSample, 34);
  out.write("data", 36, 4, "ascii");
  out.writeUInt32LE(dataSize, 40);
  trimmedData.copy(out, 44);
  fs.writeFileSync(outPath, out);
}

export function normalizeReferenceWav(inputPath, { minSec = 3, maxSec = 10, targetSec = 6 } = {}) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext !== ".wav") {
    throw new Error("reference_wav_not_wav");
  }
  const buffer = fs.readFileSync(inputPath);
  const header = parseWavHeader(buffer);
  const duration = header.data.size / header.fmt.byteRate;
  if (!duration || duration <= 0) {
    throw new Error("reference_wav_invalid_duration");
  }
  if (duration < minSec) {
    const err = new Error("reference_wav_too_short");
    err.detail = `duration=${duration.toFixed(2)}s`;
    throw err;
  }
  if (duration <= maxSec) {
    return { path: inputPath, duration, trimmed: false };
  }

  const bytesPerSecond = header.fmt.byteRate;
  const bytesNeededRaw = Math.floor(targetSec * bytesPerSecond);
  const bytesNeeded = Math.max(header.fmt.blockAlign, bytesNeededRaw - (bytesNeededRaw % header.fmt.blockAlign));

  ensureDir(cacheDir);
  const id = sha256(`${inputPath}|trim|${targetSec}`);
  const outPath = path.join(cacheDir, `ref_${id}.wav`);
  if (!fs.existsSync(outPath)) {
    writeTrimmedWav(buffer, header, bytesNeeded, outPath);
  }
  return { path: outPath, duration: targetSec, trimmed: true };
}

export function trimReferenceWavToFile(inputPath, outputPath, { minSec = 3, maxSec = 10, targetSec = 6 } = {}) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext !== ".wav") {
    throw new Error("reference_wav_not_wav");
  }
  const buffer = fs.readFileSync(inputPath);
  const header = parseWavHeader(buffer);
  const duration = header.data.size / header.fmt.byteRate;
  if (!duration || duration <= 0) {
    throw new Error("reference_wav_invalid_duration");
  }
  if (duration < minSec) {
    const err = new Error("reference_wav_too_short");
    err.detail = `duration=${duration.toFixed(2)}s`;
    throw err;
  }
  if (duration <= maxSec) {
    if (inputPath !== outputPath) {
      fs.copyFileSync(inputPath, outputPath);
    }
    return { path: outputPath, duration, trimmed: false };
  }
  const bytesPerSecond = header.fmt.byteRate;
  const bytesNeededRaw = Math.floor(targetSec * bytesPerSecond);
  const bytesNeeded = Math.max(header.fmt.blockAlign, bytesNeededRaw - (bytesNeededRaw % header.fmt.blockAlign));
  writeTrimmedWav(buffer, header, bytesNeeded, outputPath);
  return { path: outputPath, duration: targetSec, trimmed: true };
}
