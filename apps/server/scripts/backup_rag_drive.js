import { backupRagToDrive } from "../src/rag/backup.js";

async function run() {
  const userId = process.env.RAG_BACKUP_OWNER || "local";
  const result = await backupRagToDrive({ userId });
  const info = {
    ok: true,
    createdAt: result.createdAt,
    backupFile: result.fileName,
    driveFileId: result.drive?.fileId || "",
    driveFolder: result.drive?.folderPath || ""
  };
  console.log(JSON.stringify(info, null, 2));
}

run().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
  process.exit(1);
});
