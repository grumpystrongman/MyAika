import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractJsonLd,
  parseRestaurantJsonLd,
  extractNavLinks,
  extractImages,
  classifyPage,
  extractReadableText,
  extractMenuSectionsFromHtml,
  extractHoursFromHtml
} from "../src/durham/parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "fixtures", "durham");

function loadFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf-8");
}

test("parses JSON-LD restaurant metadata", () => {
  const html = loadFixture("pizzeria.html");
  const jsonLd = extractJsonLd(html);
  const parsed = parseRestaurantJsonLd(jsonLd);
  assert.ok(parsed.restaurant);
  assert.equal(parsed.restaurant.name, "Toro Pizzeria");
  assert.ok(parsed.restaurant.hours.length > 0);
  assert.ok(parsed.menuSections.length > 0);
  const images = extractImages(html, "https://toro.example");
  assert.ok(images.length > 0);
});

test("extracts menu + hours from HTML fallback", () => {
  const html = loadFixture("bbq.html");
  const menuSections = extractMenuSectionsFromHtml(html);
  assert.ok(menuSections.length > 0);
  assert.ok(menuSections[0].items.length >= 2);
  const hours = extractHoursFromHtml(html);
  assert.ok(hours.some(line => line.toLowerCase().includes("mon")));
});

test("classifies pages using nav + path cues", () => {
  const html = loadFixture("cafe.html");
  const navLinks = extractNavLinks(html, "https://elm.example");
  const docType = classifyPage({ url: "https://elm.example/eat", title: "Elm Street Cafe", navLinks });
  assert.equal(docType, "menu");
  const readable = extractReadableText(html);
  assert.ok(readable.includes("Neighborhood coffee"));
});
