import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { initRagStore, getRagCounts } from "./vectorStore.js";
import { ensureDriveFolderPath, uploadDriveFileBytes } from "../../integrations/google.js";

function resolveRepoRoot() {
  const cwd = process.cwd();
  const candidate = path.join(cwd, "apps", "server");
  if (fs.existsSync(candidate)) return cwd;
  return path.resolve(cwd, "..", "..");
}

function getRagPaths() {
  const repoRoot = resolveRepoRoot();
  const defaultDbPath = path.join(repoRoot, "apps", "server", "data", "aika_rag.sqlite");
  const envPath = process.env.RAG_SQLITE_PATH || "";
  const dbPath = envPath
    ? (path.isAbsolute(envPath) ? envPath : path.join(repoRoot, envPath))
    : defaultDbPath;
  const dataDir = path.dirname(dbPath);
  return {
    repoRoot,
    dbPath,
    walPath: `${dbPath}-wal`,
    shmPath: `${dbPath}-shm`,
    hnswDir: path.join(dataDir, "rag_hnsw"),
    backupDir: path.join(dataDir, "_rag_backups")
  };
}

function safeName(value) {
  return String(value || "").replace(/[^a-z0-9._-]+/gi, "_");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildManifest({ files, counts, createdAt }) {
  return {
    createdAt,
    ragCounts: counts,
    files: files.map(file => ({
      name: file.name,
      sourcePath: file.sourcePath,
      sizeBytes: file.sizeBytes
    }))
  };
}

function addFileIfExists(zip, files, sourcePath, zipPath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return;
  const stats = fs.statSync(sourcePath);
  zip.addLocalFile(sourcePath, path.dirname(zipPath) === "." ? "" : path.dirname(zipPath), path.basename(zipPath));
  files.push({
    name: zipPath,
    sourcePath,
    sizeBytes: stats.size
  });
}

function addFolderIfExists(zip, folderPath, zipFolderName) {
  if (!folderPath || !fs.existsSync(folderPath)) return;
  zip.addLocalFolder(folderPath, zipFolderName);
}

function walkDirFiles(rootDir, prefix = "") {
  if (!fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    const relPath = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      items.push(...walkDirFiles(fullPath, relPath));
    } else if (entry.isFile()) {
      const stats = fs.statSync(fullPath);
      items.push({ name: relPath.replace(/\\/g, "/"), sourcePath: fullPath, sizeBytes: stats.size });
    }
  }
  return items;
}

export function createRagBackupZip({ includeWal = true, includeHnsw = true } = {}) {
  initRagStore();
  const createdAt = new Date().toISOString();
  const counts = getRagCounts();
  const paths = getRagPaths();
  if (!fs.existsSync(paths.dbPath)) {
    throw new Error(`rag_db_missing:${paths.dbPath}`);
  }
  ensureDir(paths.backupDir);
  const zip = new AdmZip();
  const files = [];

  addFileIfExists(zip, files, paths.dbPath, path.basename(paths.dbPath));
  if (includeWal) {
    addFileIfExists(zip, files, paths.walPath, path.basename(paths.walPath));
    addFileIfExists(zip, files, paths.shmPath, path.basename(paths.shmPath));
  }
  if (includeHnsw) {
    addFolderIfExists(zip, paths.hnswDir, "rag_hnsw");
    const hnswFiles = walkDirFiles(paths.hnswDir, "rag_hnsw");
    hnswFiles.forEach(file => files.push(file));
  }

  const manifest = buildManifest({ files, counts, createdAt });
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));

  const ts = safeName(createdAt.replace(/[:.]/g, "-"));
  const fileName = `rag-backup-${ts}.zip`;
  const filePath = path.join(paths.backupDir, fileName);
  zip.writeZip(filePath);

  return {
    fileName,
    filePath,
    createdAt,
    counts,
    files
  };
}

export async function backupRagToDrive({ userId = "local", includeWal, includeHnsw, folderPath } = {}) {
  const backup = createRagBackupZip({
    includeWal: includeWal !== undefined ? includeWal : String(process.env.RAG_BACKUP_INCLUDE_WAL || "1") === "1",
    includeHnsw: includeHnsw !== undefined ? includeHnsw : String(process.env.RAG_BACKUP_INCLUDE_HNSW || "1") === "1"
  });
  const basePath = String(folderPath || process.env.RAG_BACKUP_DRIVE_PATH || "Aika/RAG Backups")
    .split(/[\\/]/)
    .map(part => part.trim())
    .filter(Boolean);
  const folderId = await ensureDriveFolderPath(basePath, userId);
  const bytes = fs.readFileSync(backup.filePath);
  const uploaded = await uploadDriveFileBytes({
    name: backup.fileName,
    bytes,
    mimeType: "application/zip",
    folderId,
    userId
  });
  return {
    ...backup,
    drive: {
      folderPath: basePath.join("/"),
      folderId,
      fileId: uploaded?.id || "",
      fileName: uploaded?.name || backup.fileName
    }
  };
}
