import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(scriptDir, "..");
dotenv.config({ path: path.join(serverDir, ".env") });

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      opts[key] = next;
      i += 1;
    } else {
      opts[key] = true;
    }
  }
  return opts;
}

function parseList(input) {
  return String(input || "")
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

async function main() {
  const {
    crawlTradingYoutubeSources,
    discoverTradingYoutubeChannels,
    ensureTradingYoutubeSeeded
  } = await import("../src/trading/youtubeIngest.js");
  const opts = parseArgs();
  const doDiscover = Boolean(opts.discover || (!opts.discover && !opts.sync));
  const doSync = Boolean(opts.sync || (!opts.discover && !opts.sync));
  const force = Boolean(opts.force);
  const dryRun = Boolean(opts["dry-run"] || opts.dryRun);
  const maxVideos = opts.maxVideos != null ? Number(opts.maxVideos) : undefined;
  const maxNew = opts.maxNew != null ? Number(opts.maxNew) : undefined;
  const maxChannels = opts.maxChannels != null ? Number(opts.maxChannels) : undefined;
  const minSubscribers = opts.minSubscribers != null ? Number(opts.minSubscribers) : undefined;
  const minScore = opts.minScore != null ? Number(opts.minScore) : undefined;
  const collectionId = opts.collection || opts.collectionId || "trading";
  const queries = opts.queries ? parseList(opts.queries) : undefined;

  ensureTradingYoutubeSeeded();

  if (doDiscover) {
    console.log("[youtube] Discovering channels...");
    const result = await discoverTradingYoutubeChannels({
      queries,
      maxChannels,
      minSubscribers,
      minScore,
      autoAdd: !dryRun,
      collectionId
    });
    console.log(JSON.stringify(result, null, 2));
  }

  if (doSync) {
    console.log("[youtube] Syncing videos...");
    const result = await crawlTradingYoutubeSources({
      force,
      maxVideosPerChannel: maxVideos,
      maxNewVideosPerChannel: maxNew,
      collectionId
    });
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(err => {
  console.error(JSON.stringify({ error: err?.message || "youtube_sync_failed" }));
  process.exitCode = 1;
});
