import { createMemoryEntry, searchMemory } from "../../storage/memory.js";
import { rotateKey, encryptString } from "../../storage/memory_crypto.js";
import { createGoogleDocInFolder, ensureDriveFolderPath } from "../../integrations/google.js";

function tierFolderPath(tier) {
  if (tier === 1) return ["Aika", "MemoryVault", "Tier1"];
  if (tier === 2) return ["Aika", "MemoryVault", "Tier2"];
  return ["Aika", "MemoryVault", "Tier3"];
}

export async function writeMemoryTool({ tier = 1, title, content, tags = [], containsPHI = false }, context = {}) {
  if (!title || !content) {
    const err = new Error("title_and_content_required");
    err.status = 400;
    throw err;
  }
  const userId = context.userId || "local";
  let folderId = null;
  try {
    folderId = await ensureDriveFolderPath(tierFolderPath(Number(tier)), userId);
  } catch {
    folderId = null;
  }
  const docTitle = `Memory: ${title}`;
  const isTier3 = Number(tier) === 3;
  const ciphertext = isTier3 ? encryptString(content) : null;
  const docContent = isTier3
    ? `# ${title}\n\nTier: 3\nTags: ${tags.join(", ")}\n\nCiphertext:\n${ciphertext}\n\nDecrypt locally in Aika.\n`
    : `# ${title}\n\n${content}\n`;
  let doc = null;
  if (folderId) {
    try {
      doc = await createGoogleDocInFolder(docTitle, docContent, folderId, userId);
    } catch {
      doc = null;
    }
  }
  const record = createMemoryEntry({
    tier: Number(tier),
    title,
    content,
    tags,
    containsPHI,
    contentCiphertext: ciphertext,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null,
    userId
  });
  return {
    id: record.id,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null
  };
}

export function searchMemoryTool({ tier = 1, query, tags = [], limit = 20 }, context = {}) {
  return searchMemory({ tier: Number(tier), query, tags, limit, userId: context.userId || "local" });
}

export function rotateKeyTool({ confirm }) {
  if (!confirm) {
    const err = new Error("confirm_required");
    err.status = 400;
    throw err;
  }
  return rotateKey();
}
