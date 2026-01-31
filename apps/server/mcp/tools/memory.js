import { writeMemory, listMemory, rotateEncryptionKey } from "../memory_vault.js";

export function writeMemoryTool({ tier, content, metadata }) {
  return writeMemory({ tier, content, metadata });
}

export function searchMemoryTool({ tier, query }) {
  return listMemory({ tier, query });
}

export function rotateKeyTool() {
  return rotateEncryptionKey();
}

