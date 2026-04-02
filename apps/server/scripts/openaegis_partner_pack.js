import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function resolveRepoRoot(cwd = process.cwd()) {
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  return path.resolve(cwd, "..", "..");
}

function normalizeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw ? JSON.parse(raw) : {};
}

function parseHosts(argv = []) {
  const values = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--host" && argv[i] !== "--plugin") continue;
    const next = argv[i + 1] || "";
    next.split(",").map(item => item.trim()).filter(Boolean).forEach(item => values.push(normalizeId(item)));
  }
  return [...new Set(values)];
}

function parseDryRun(argv = []) {
  return argv.includes("--dry-run");
}

function listManifestFiles(pluginsDir) {
  if (!fs.existsSync(pluginsDir)) return [];
  return fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(pluginsDir, entry.name, "manifest.json"))
    .filter(filePath => fs.existsSync(filePath));
}

function printUsage() {
  console.log("Usage: node apps/server/scripts/openaegis_partner_pack.js [--host <id[,id...]>] [--plugin <id[,id...]>] [--dry-run]");
}

function run() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const repoRoot = resolveRepoRoot();
  const dryRun = parseDryRun(argv);
  const requested = parseHosts(argv);
  const pluginsDir = path.join(repoRoot, "data", "plugins");
  const manifests = listManifestFiles(pluginsDir).map(readJson);
  const filtered = requested.length
    ? manifests.filter(manifest => requested.includes(normalizeId(manifest.id)) || requested.includes(normalizeId(manifest.partnerHost?.id)))
    : manifests;

  if (!filtered.length) {
    console.error("No matching partner plugin manifests found to pack.");
    process.exit(1);
  }

  const targets = filtered
    .map(manifest => ({
      id: manifest.id,
      hostId: manifest.partnerHost?.id || "",
      packagePath: manifest.distribution?.packagePath || ""
    }))
    .filter(item => item.packagePath)
    .map(item => ({ ...item, packageDir: path.resolve(repoRoot, item.packagePath) }))
    .filter(item => fs.existsSync(item.packageDir));

  if (!targets.length) {
    console.error("No package directories found. Run the seed command first.");
    process.exit(1);
  }

  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  targets.forEach(target => {
    console.log(`Packing ${target.id} (${target.hostId}) from ${path.relative(repoRoot, target.packageDir)}`);
    if (dryRun) return;
    let result = spawnSync(npmCmd, ["pack"], {
      cwd: target.packageDir,
      stdio: "inherit"
    });
    if (result.error && process.platform === "win32") {
      const comspec = process.env.ComSpec || "cmd.exe";
      result = spawnSync(comspec, ["/d", "/s", "/c", "npm", "pack"], {
        cwd: target.packageDir,
        stdio: "inherit"
      });
    }
    if (result.error) {
      console.error(`npm pack execution error for ${target.id}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(`npm pack failed for ${target.id}`);
      process.exit(result.status || 1);
    }
  });
}

run();
