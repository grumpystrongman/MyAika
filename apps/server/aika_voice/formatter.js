const STYLE_PRESETS = {
  brat_baddy: {
    prefix: "Okay, ",
    taglines: ["Cute.", "Yeah?", "Go on."],
    closers: ["Good.", "Next.", "Mm-hmm."]
  },
  brat_soft: {
    prefix: "Alright, ",
    taglines: ["Hey.", "Got it.", "Tell me more."],
    closers: ["We got this.", "Okay.", "You're fine."]
  },
  brat_firm: {
    prefix: "Listen, ",
    taglines: ["Focus.", "Nope.", "Not quite."],
    closers: ["Do it right.", "Try again.", "Better."]
  }
};

function pick(list, seed) {
  if (!list.length) return "";
  return list[seed % list.length];
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function insertPauses(sentences, pause) {
  const pauseToken = pause >= 1.2 ? " ... " : " ";
  return sentences.join(pauseToken);
}

function breakLong(text, maxLen = 220) {
  if (text.length <= maxLen) return text;
  const parts = [];
  let start = 0;
  while (start < text.length) {
    parts.push(text.slice(start, start + maxLen));
    start += maxLen;
  }
  return parts.join("\n");
}

export function formatAikaVoice(rawText, { style = "brat_baddy", pause = 1.1 } = {}) {
  const input = String(rawText || "").trim();
  if (!input) return "";

  const preset = STYLE_PRESETS[style] || STYLE_PRESETS.brat_baddy;
  const seed = input.length;
  const prefix = preset.prefix || "";
  const tag = pick(preset.taglines || [], seed);
  const closer = pick(preset.closers || [], seed + 1);

  const sentences = splitSentences(input);
  const withCadence = insertPauses(sentences, pause);
  const broken = breakLong(withCadence);

  const lead = prefix && !broken.toLowerCase().startsWith(prefix.trim().toLowerCase())
    ? prefix
    : "";
  const tagLine = tag ? `${tag} ` : "";
  const ender = closer && !broken.endsWith(closer) ? ` ${closer}` : "";

  return `${lead}${tagLine}${broken}${ender}`.replace(/\s+/g, " ").trim();
}
