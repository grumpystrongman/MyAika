import path from "node:path";
import { parsePartnerPluginArgs, scaffoldPartnerPlugins } from "../src/plugins/openaegisPartnerPack.js";

function printUsage() {
  console.log("Usage: node apps/server/scripts/openaegis_partner_plugins.js [--host <id[,id...]>] [--config <path>] [--package-root <path>] [--no-package] [--dry-run]");
}

function rel(p) {
  return path.relative(process.cwd(), p) || p;
}

function run() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const args = parsePartnerPluginArgs(argv);
  const result = scaffoldPartnerPlugins(args);

  if (result.missingHosts.length) {
    console.warn(`Skipped unknown hosts: ${result.missingHosts.join(", ")}`);
  }
  if (!result.generated.length) {
    console.warn("No partner plugins were generated.");
    process.exit(1);
  }

  console.log(`Config: ${rel(result.configPath)}`);
  console.log(`Package root: ${rel(result.packageRoot)}`);
  console.log(`Dry run: ${result.dryRun ? "yes" : "no"}`);
  console.log(`Package scaffolds: ${result.includePackage ? "yes" : "no"}`);
  console.log("Generated partner plugin manifests:");
  result.generated.forEach(item => {
    console.log(`- ${item.pluginId} (${item.manifest.partnerHost.name}) -> ${rel(item.manifestFile)}`);
    if (item.package) {
      console.log(`  package: ${rel(item.package.packageDir)}`);
    }
  });
}

run();
