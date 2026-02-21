import assert from "node:assert/strict";
import test from "node:test";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { initRagStore, listMeetingsRaw } from "../src/rag/vectorStore.js";
import { listRestaurants, listRestaurantMenus } from "../storage/restaurants.js";
import { runDurhamPipeline } from "../src/durham/pipeline.js";

function buildOverpassPayload(count = 5, suffix = "") {
  const elements = [];
  for (let i = 1; i <= count; i += 1) {
    elements.push({
      type: "node",
      id: 1000 + i,
      lat: 35.99 + i * 0.001,
      lon: -78.90 - i * 0.001,
      tags: {
        name: `Test Restaurant ${i}`,
        website: `https://rest${i}-${suffix || "local"}.example`,
        phone: `(919) 555-00${i}`,
        cuisine: "american"
      }
    });
  }
  return { elements };
}

function buildBaseHtml(index) {
  return [
    "<!doctype html>",
    "<html><head>",
    `<title>Test Restaurant ${index}</title>`,
    `<script type=\"application/ld+json\">{`,
    `"@context":"https://schema.org",`,
    `"@type":"Restaurant",`,
    `"name":"Test Restaurant ${index}",`,
    `"telephone":"(919) 555-00${index}",`,
    `"openingHoursSpecification":[{"dayOfWeek":"Mon","opens":"11:00","closes":"21:00"}],`,
    `"servesCuisine":["American"]`,
    "}</script>",
    "</head><body>",
    "<nav>",
    "<a href=\"/menu\">Menu</a>",
    "<a href=\"/hours\">Hours</a>",
    "</nav>",
    `<h1>Test Restaurant ${index}</h1>`,
    "<p>Neighborhood spot with seasonal specials.</p>",
    "</body></html>"
  ].join("");
}

function buildMenuHtml(index) {
  return [
    "<!doctype html>",
    "<html><head><title>Menu</title></head><body>",
    "<h2>Menu</h2>",
    "<ul>",
    `<li>Signature Bowl ${index} - $12</li>`,
    `<li>Garden Salad ${index} - $10</li>`,
    "</ul>",
    "</body></html>"
  ].join("");
}

function buildHoursHtml() {
  return [
    "<!doctype html>",
    "<html><head><title>Hours</title></head><body>",
    "<h2>Hours</h2>",
    "<p>Mon-Fri 11am-9pm</p>",
    "<p>Sat 12pm-10pm</p>",
    "<p>Sun 12pm-8pm</p>",
    "</body></html>"
  ].join("");
}

function createResponse({ status = 200, body = "", headers = {} } = {}) {
  const headerMap = new Map();
  Object.entries(headers).forEach(([key, value]) => headerMap.set(key.toLowerCase(), String(value)));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headerMap.get(String(name || "").toLowerCase()) || null;
      }
    },
    async text() {
      return body;
    },
    async arrayBuffer() {
      return new TextEncoder().encode(body).buffer;
    }
  };
}

function createFetchStub({ overpassUrl, payload }) {
  const pages = new Map();
  payload.elements.forEach((element, idx) => {
    const website = element?.tags?.website || "";
    const base = website.endsWith("/") ? website : `${website}/`;
    const i = idx + 1;
    pages.set(base, buildBaseHtml(i));
    pages.set(`${base}menu`, buildMenuHtml(i));
    pages.set(`${base}hours`, buildHoursHtml());
    pages.set(`${base}robots.txt`, "User-agent: *\nAllow: /\n");
  });

  return async (url) => {
    const normalized = url.endsWith("/") && url.length > 8 ? url : `${url}`;
    if (url === overpassUrl) {
      return createResponse({
        status: 200,
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" }
      });
    }
    if (url.endsWith("/robots.txt")) {
      return createResponse({ status: 200, body: pages.get(url) || "User-agent: *\nAllow: /\n" });
    }
    const html = pages.get(url) || pages.get(`${url}/`);
    if (html) {
      return createResponse({ status: 200, body: html, headers: { "content-type": "text/html" } });
    }
    return createResponse({ status: 404, body: "not found" });
  };
}

initDb();
runMigrations();
initRagStore();

test("durham pipeline dry run ingests restaurant pages", async () => {
  const overpassUrl = "https://overpass.test/api";
  const stamp = Date.now();
  const payload = buildOverpassPayload(5, stamp);
  const fetchFn = createFetchStub({ overpassUrl, payload });
  const collectionId = `durham-test-${Date.now()}`;

  const result = await runDurhamPipeline({
    overpassUrl,
    fetchFn,
    limitRestaurants: 5,
    maxPages: 3,
    collectionId,
    bbox: [35.9, -79.1, 36.1, -78.7],
    schedulerOptions: { minDelayMs: 0, maxConcurrent: 8, maxPerDomain: 4 }
  });

  assert.equal(result.restaurants_total, 5);
  assert.ok(result.pages_fetched > 0);
  assert.ok(result.chunks_upserted > 0);

  const restaurants = listRestaurants(10, 0);
  assert.ok(restaurants.length >= 5);
  const menus = listRestaurantMenus(10, 0);
  assert.ok(menus.length >= 1);

  const meetings = listMeetingsRaw({ meetingIdPrefix: `rag:${collectionId}:restaurant:`, limit: 50 });
  assert.ok(meetings.length > 0);
});
