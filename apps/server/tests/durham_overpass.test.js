import assert from "node:assert/strict";
import test from "node:test";
import { buildDurhamOverpassQuery, buildOverpassQuery, normalizeOverpassElements, dedupeRestaurants } from "../src/durham/overpassClient.js";

test("buildDurhamOverpassQuery includes amenity filter", () => {
  const query = buildDurhamOverpassQuery({ amenities: ["restaurant", "cafe"] });
  assert.ok(query.includes("restaurant|cafe"));
  assert.ok(query.includes("area[\"name\"=\"Durham\"]"));
});

test("buildOverpassQuery supports bounding boxes", () => {
  const query = buildOverpassQuery({ amenities: ["restaurant"], bbox: [35.9, -79.1, 36.1, -78.7] });
  assert.ok(query.includes("35.9,-79.1,36.1,-78.7"));
});

test("normalizeOverpassElements and dedupeRestaurants prefer richer records", () => {
  const elements = [
    {
      type: "node",
      id: 101,
      lat: 35.99,
      lon: -78.90,
      tags: {
        name: "Test Diner",
        website: "testdiner.com",
        phone: "(919) 555-0001",
        cuisine: "bbq"
      }
    },
    {
      type: "node",
      id: 102,
      lat: 35.99,
      lon: -78.90,
      tags: {
        name: "Test Diner",
        "addr:full": "1 Main St, Durham, NC",
        website: "https://testdiner.com",
        phone: ""
      }
    }
  ];
  const normalized = normalizeOverpassElements(elements);
  assert.equal(normalized.length, 2);
  assert.ok(normalized[0].website.startsWith("https://"));

  const deduped = dedupeRestaurants(normalized);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].name, "Test Diner");
  assert.ok(deduped[0].website.includes("testdiner.com"));
});
