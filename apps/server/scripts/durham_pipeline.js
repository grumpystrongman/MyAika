import "dotenv/config";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { runDurhamPipeline } from "../src/durham/pipeline.js";

function parseArgs(argv = []) {
  const result = {
    limitRestaurants: undefined,
    maxPages: undefined,
    collectionId: undefined,
    overpassUrl: undefined,
    amenities: [],
    location: undefined,
    zip: undefined,
    city: undefined,
    state: undefined,
    bbox: undefined,
    lat: undefined,
    lon: undefined,
    radiusKm: undefined
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") {
      result.limitRestaurants = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--max-pages") {
      result.maxPages = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--collection") {
      result.collectionId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--overpass") {
      result.overpassUrl = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--amenity") {
      const value = argv[i + 1];
      if (value) result.amenities.push(value);
      i += 1;
      continue;
    }
    if (arg === "--location") {
      result.location = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--zip") {
      result.zip = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--city") {
      result.city = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--state") {
      result.state = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--lat") {
      result.lat = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--lon") {
      result.lon = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--radius-km") {
      result.radiusKm = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--bbox") {
      const raw = argv[i + 1];
      if (raw) {
        const parts = raw.split(",").map(value => Number(value));
        if (parts.length === 4) result.bbox = parts;
      }
      i += 1;
      continue;
    }
  }
  if (!result.amenities.length) result.amenities = undefined;
  return result;
}

async function main() {
  initDb();
  runMigrations();
  const options = parseArgs(process.argv.slice(2));
  const result = await runDurhamPipeline(options);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
