import { stripHtml, normalizeText } from "../signals/utils.js";

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, "> ");
}

function extractTagText(html, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results = [];
  let match;
  while ((match = regex.exec(html || ""))) {
    const text = normalizeText(stripHtml(match[1] || ""));
    if (text) results.push(text);
  }
  return results;
}

function normalizeUrl(raw, baseUrl) {
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

export function extractJsonLd(html) {
  const blocks = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html || ""))) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw.trim());
      if (Array.isArray(parsed)) {
        parsed.forEach(item => blocks.push(item));
      } else {
        blocks.push(parsed);
      }
    } catch {
      // ignore
    }
  }
  return blocks;
}

function normalizeCuisine(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => normalizeText(v)).filter(Boolean);
  return String(value)
    .split(/[,;|]/)
    .map(part => normalizeText(part))
    .filter(Boolean);
}

function normalizeAddress(address) {
  if (!address) return null;
  if (typeof address === "string") return { formatted: normalizeText(address) };
  if (typeof address !== "object") return null;
  const street = [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode]
    .filter(Boolean)
    .map(part => normalizeText(part))
    .join(", ");
  return {
    street: normalizeText(address.streetAddress || ""),
    city: normalizeText(address.addressLocality || ""),
    region: normalizeText(address.addressRegion || ""),
    postalCode: normalizeText(address.postalCode || ""),
    formatted: normalizeText(street || address.addressLocality || "")
  };
}

function normalizeHours(hours) {
  if (!hours) return [];
  if (Array.isArray(hours)) return hours.map(h => normalizeText(h)).filter(Boolean);
  return [normalizeText(hours)].filter(Boolean);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^0-9+]/g, "");
}

function parseMenuItems(items) {
  if (!items) return [];
  const list = Array.isArray(items) ? items : [items];
  return list
    .map(item => {
      if (!item) return null;
      const name = normalizeText(item.name || "");
      if (!name) return null;
      const description = normalizeText(item.description || "");
      const price = normalizeText(item.offers?.price || item.price || "");
      const dietTags = normalizeCuisine(item.suitableForDiet || item.diet || "");
      return { name, description, price, diet_tags: dietTags };
    })
    .filter(Boolean);
}

function parseMenuSections(menu) {
  if (!menu) return [];
  const sections = [];
  const menus = Array.isArray(menu) ? menu : [menu];
  menus.forEach(entry => {
    if (!entry) return;
    if (entry.hasMenuSection) {
      const list = Array.isArray(entry.hasMenuSection) ? entry.hasMenuSection : [entry.hasMenuSection];
      list.forEach(section => {
        if (!section) return;
        const name = normalizeText(section.name || "Menu");
        const items = parseMenuItems(section.hasMenuItem || section.itemListElement || []);
        if (items.length) sections.push({ name, items });
      });
    } else if (entry.hasMenuItem) {
      const items = parseMenuItems(entry.hasMenuItem);
      if (items.length) sections.push({ name: normalizeText(entry.name || "Menu"), items });
    }
  });
  return sections;
}

export function parseRestaurantJsonLd(nodes = []) {
  const restaurant = nodes.find(node => {
    const type = node["@type"] || node.type || "";
    const types = Array.isArray(type) ? type : [type];
    return types.some(t => String(t).toLowerCase().includes("restaurant") || String(t).toLowerCase().includes("foodestablishment"));
  });
  if (!restaurant) return { restaurant: null, menuSections: [] };

  const address = normalizeAddress(restaurant.address);
  const hours = restaurant.openingHoursSpecification
    ? restaurant.openingHoursSpecification.map(spec => {
        const day = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek.join(", ") : spec.dayOfWeek;
        const opens = spec.opens ? ` ${spec.opens}` : "";
        const closes = spec.closes ? `-${spec.closes}` : "";
        return normalizeText(`${day || ""}${opens}${closes}`.trim());
      }).filter(Boolean)
    : normalizeHours(restaurant.openingHours || restaurant.hours || "");

  const menuSections = parseMenuSections(restaurant.hasMenu || restaurant.menu || restaurant.hasMenuSection || []);
  const images = [];
  if (restaurant.image) {
    const list = Array.isArray(restaurant.image) ? restaurant.image : [restaurant.image];
    list.forEach(img => {
      if (!img) return;
      if (typeof img === "string") images.push({ image_url: img, caption: "" });
      else if (img.url) images.push({ image_url: img.url, caption: normalizeText(img.caption || "") });
    });
  }

  return {
    restaurant: {
      name: normalizeText(restaurant.name || ""),
      address,
      phone: normalizePhone(restaurant.telephone || ""),
      hours,
      cuisine_tags: normalizeCuisine(restaurant.servesCuisine || ""),
      price_hint: normalizeText(restaurant.priceRange || "")
    },
    menuSections,
    images
  };
}

export function extractNavLinks(html, baseUrl) {
  const links = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html || ""))) {
    const href = match[1];
    const text = normalizeText(stripHtml(match[2] || ""));
    const url = normalizeUrl(href, baseUrl);
    if (!url) continue;
    links.push({ url, text });
  }
  return links;
}

export function extractImages(html, baseUrl) {
  const images = [];
  const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html || ""))) {
    const src = match[1];
    const url = normalizeUrl(src, baseUrl);
    if (!url) continue;
    const altMatch = match[0].match(/alt=["']([^"']+)["']/i);
    images.push({ image_url: url, caption: normalizeText(decodeEntities(altMatch?.[1] || "")) });
  }
  return images;
}

export function classifyPage({ url, title, navLinks = [] } = {}) {
  const path = String(url || "").toLowerCase();
  const text = String(title || "").toLowerCase();
  const navText = navLinks.map(link => `${link.text} ${link.url}`.toLowerCase()).join(" ");

  const menuSignal = /\b(menu|eat|food|dining|brunch|lunch|dinner|drinks)\b/;
  const hoursSignal = /\b(hours|locations|contact|visit|find us|directions)\b/;
  const aboutSignal = /\b(about|story|our team|chef)\b/;
  const newsSignal = /\b(news|press|blog|events)\b/;

  if (menuSignal.test(path) || menuSignal.test(text) || menuSignal.test(navText)) return "menu";
  if (hoursSignal.test(path) || hoursSignal.test(text) || hoursSignal.test(navText)) return "hours";
  if (aboutSignal.test(path) || aboutSignal.test(text) || aboutSignal.test(navText)) return "about";
  if (newsSignal.test(path) || newsSignal.test(text) || newsSignal.test(navText)) return "news";
  return "general";
}

export function extractReadableText(html) {
  const headings = [...extractTagText(html, "h1"), ...extractTagText(html, "h2"), ...extractTagText(html, "h3")];
  const paragraphs = extractTagText(html, "p");
  const listItems = extractTagText(html, "li");
  const tableCells = extractTagText(html, "td");
  const parts = [...headings, ...paragraphs, ...listItems, ...tableCells].filter(Boolean);
  const joined = parts.join("\n");
  return normalizeText(joined || stripHtml(html));
}

export function extractHoursFromHtml(html) {
  const text = stripHtml(html);
  const lines = text.split(/\n|\r/).map(line => normalizeText(line)).filter(Boolean);
  const hours = [];
  const dayPattern = /\b(mon|tue|wed|thu|fri|sat|sun)\b/i;
  lines.forEach(line => {
    if (dayPattern.test(line) && line.match(/\d/)) {
      hours.push(line);
    }
  });
  return Array.from(new Set(hours)).slice(0, 14);
}

export function extractMenuSectionsFromHtml(html) {
  const sections = [];
  const sectionRegex = /<h[12][^>]*>([^<]*menu[^<]*)<\/h[12]>([\s\S]{0,4000})/gi;
  let match;
  while ((match = sectionRegex.exec(html || ""))) {
    const sectionName = normalizeText(stripHtml(match[1] || "Menu")) || "Menu";
    const body = match[2] || "";
    const items = extractTagText(body, "li").map(text => ({ name: text, description: "", price: "", diet_tags: [] }));
    if (items.length) sections.push({ name: sectionName, items });
  }
  return sections;
}
