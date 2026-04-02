import {
  recordAdoptionEvent,
  buildWeeklyAdoptionSummary,
  formatWeeklyAdoptionSummary
} from "../src/plugins/openaegisAdoption.js";

function parseArg(argv = [], key = "", fallback = "") {
  const idx = argv.indexOf(key);
  if (idx < 0) return fallback;
  return argv[idx + 1] || fallback;
}

function hasFlag(argv = [], flag = "") {
  return argv.includes(flag);
}

function printUsage() {
  console.log("Usage:");
  console.log("  node apps/server/scripts/openaegis_partner_adoption.js record --plugin <pluginId> --event <install|activate|retained|churn> [--host <hostId>] [--workspace <workspaceId>] [--source <source>] [--at <ISO>]");
  console.log("  node apps/server/scripts/openaegis_partner_adoption.js weekly-summary [--plugin <pluginId>] [--host <hostId>] [--start <ISO>] [--end <ISO>] [--json]");
}

function runRecord(argv = []) {
  const pluginId = parseArg(argv, "--plugin", "");
  const eventType = parseArg(argv, "--event", "");
  const hostId = parseArg(argv, "--host", "");
  const workspaceId = parseArg(argv, "--workspace", "");
  const source = parseArg(argv, "--source", "manual");
  const at = parseArg(argv, "--at", "");
  const result = recordAdoptionEvent({ pluginId, eventType, hostId, workspaceId, source, at });
  console.log(`Recorded ${result.event.eventType} for ${result.event.pluginId} at ${result.event.at}`);
  console.log(`Metrics: installs=${result.metrics.installsTotal} activations=${result.metrics.activationsTotal} retained=${result.metrics.retainedTotal} churn=${result.metrics.churnTotal} active=${result.metrics.activeWorkspacesEstimate}`);
}

function runWeeklySummary(argv = []) {
  const pluginId = parseArg(argv, "--plugin", "");
  const hostId = parseArg(argv, "--host", "");
  const startAt = parseArg(argv, "--start", "");
  const endAt = parseArg(argv, "--end", "");
  const summary = buildWeeklyAdoptionSummary({ pluginId, hostId, startAt, endAt });
  if (hasFlag(argv, "--json")) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  process.stdout.write(formatWeeklyAdoptionSummary(summary));
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || "";
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(command ? 0 : 1);
  }
  if (command === "record") {
    runRecord(argv.slice(1));
    return;
  }
  if (command === "weekly-summary") {
    runWeeklySummary(argv.slice(1));
    return;
  }
  printUsage();
  process.exit(1);
}

main();

