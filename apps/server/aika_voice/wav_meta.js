import fs from "node:fs";

export function readWavMeta(filePath) {
  const fd = fs.openSync(filePath, "r");
  const header = Buffer.alloc(44);
  fs.readSync(fd, header, 0, 44, 0);
  fs.closeSync(fd);

  const riff = header.toString("ascii", 0, 4);
  const wave = header.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Invalid WAV header");
  }

  const sampleRate = header.readUInt32LE(24);
  const byteRate = header.readUInt32LE(28);
  const dataSize = header.readUInt32LE(40);
  const duration = byteRate ? dataSize / byteRate : 0;

  return { sampleRate, duration };
}

export function writeSineWav(filePath, { duration = 0.25, sampleRate = 22050, freq = 440 } = {}) {
  const numSamples = Math.floor(duration * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, 4, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, 4, "ascii");
  buffer.write("fmt ", 12, 4, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, 4, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.2;
    const s = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.floor(s * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}
