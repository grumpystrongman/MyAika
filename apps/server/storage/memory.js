import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db.js";
import { repoRoot, ensureDir, nowIso } from "./utils.js";
import { encryptString, decryptString } from "./memory_crypto.js";

const cacheDir = path.join(repoRoot, "data", "cache", "memory");

function tierFolder(tier) {
  if (tier === 1) return "Tier1";
  if (tier === 2) return "Tier2";
  return "Tier3";
}

export function createMemoryEntry({ tier, title, content, tags = [], containsPHI = false, googleDocId = null, googleDocUrl = null, contentCiphertext: providedCiphertext = null, userId = "local" }) {
  const db = getDb();
  ensureDir(cacheDir);
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  const cachePath = path.join(cacheDir, `${id}.md`);
  let contentPlaintext = null;
  let contentCiphertext = null;
  if (tier === 3) {
    contentCiphertext = providedCiphertext || encryptString(content);
    const md = `# ${title}\n\nTier: ${tier}\nTags: ${tags.join(", ")}\n\nCiphertext:\n${contentCiphertext}\n`;
    fs.writeFileSync(cachePath, md);
  } else {
    contentPlaintext = String(content);
    const md = `# ${title}\n\n${contentPlaintext}\n`;
    fs.writeFileSync(cachePath, md);
  }
  db.prepare(
    `INSERT INTO memory_entries (id, tier, title, tags_json, contains_phi, content_ciphertext, content_plaintext, google_doc_id, google_doc_url, cache_path, created_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tier,
    title,
    JSON.stringify(tags),
    containsPHI ? 1 : 0,
    contentCiphertext,
    contentPlaintext,
    googleDocId,
    googleDocUrl,
    cachePath,
    createdAt,
    userId
  );
  if (tier !== 3) {
    db.prepare(`INSERT INTO memory_fts (id, title, content, tags, tier) VALUES (?, ?, ?, ?, ?)`)
      .run(id, title, contentPlaintext, tags.join(","), tier);
  } else {
    db.prepare(`INSERT INTO memory_fts (id, title, content, tags, tier) VALUES (?, ?, ?, ?, ?)`)
      .run(id, title, "[ENCRYPTED]", tags.join(","), tier);
  }
  return { id, cachePath, tierFolder: tierFolder(tier), contentCiphertext };
}

export function searchMemory({ tier, query, tags = [], limit = 20, userId = "local" }) {
  const db = getDb();
  if (query) {
    const rows = db.prepare(
      `SELECT f.id, f.title, f.content, f.tags, f.tier
       FROM memory_fts f
       JOIN memory_entries m ON m.id = f.id
       WHERE m.user_id = ? AND f.tier = ? AND memory_fts MATCH ?
       LIMIT ?`
    ).all(userId, tier, query, limit);
    let results = rows.map(r => ({
      id: r.id,
      title: r.title,
      snippet: (r.content || "").slice(0, 240),
      tags: r.tags ? r.tags.split(",") : [],
      tier: r.tier
    }));
    if (tags?.length) {
      results = results.filter(r => tags.some(t => r.tags.includes(t)));
    }
    return results;
  }
  const rows = db.prepare(
    `SELECT id, title, tags_json, content_plaintext, content_ciphertext, google_doc_url, created_at FROM memory_entries WHERE tier = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(tier, userId, limit);
  let list = rows.map(r => {
    let snippet = r.content_plaintext || "";
    if (tier === 3 && r.content_ciphertext) {
      try {
        snippet = decryptString(r.content_ciphertext);
      } catch {
        snippet = "[ENCRYPTED]";
      }
    }
    return {
      id: r.id,
      title: r.title,
      tags: r.tags_json ? JSON.parse(r.tags_json) : [],
      snippet: snippet.slice(0, 240),
      googleDocUrl: r.google_doc_url,
      createdAt: r.created_at
    };
  });
  if (tags?.length) list = list.filter(r => tags.some(t => r.tags.includes(t)));
  return list;
}

export function pruneMemoryEntries({ retentionDaysByTier = {}, userId = "local", dryRun = false } = {}) {
  const db = getDb();
  const results = {
    checked: 0,
    deleted: 0,
    tiers: {}
  };
  const tiers = Object.entries(retentionDaysByTier || {});
  if (!tiers.length) return results;

  const now = Date.now();
  for (const [tierKey, daysValue] of tiers) {
    const tier = Number(tierKey);
    const days = Number(daysValue);
    if (!Number.isFinite(tier) || !Number.isFinite(days) || days <= 0) continue;
    const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = db.prepare(
      `SELECT id, cache_path FROM memory_entries WHERE tier = ? AND user_id = ? AND created_at < ?`
    ).all(tier, userId, cutoff);
    results.checked += rows.length;
    results.tiers[tier] = { candidates: rows.length, deleted: 0 };
    if (dryRun) continue;

    for (const row of rows) {
      db.prepare(`DELETE FROM memory_entries WHERE id = ?`).run(row.id);
      db.prepare(`DELETE FROM memory_fts WHERE id = ?`).run(row.id);
      if (row.cache_path && fs.existsSync(row.cache_path)) {
        try {
          fs.unlinkSync(row.cache_path);
        } catch {
          // ignore cache deletion errors
        }
      }
      results.deleted += 1;
      results.tiers[tier].deleted += 1;
    }
  }
  return results;
}
