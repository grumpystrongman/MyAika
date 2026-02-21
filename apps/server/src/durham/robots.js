const robotsCache = new Map();

function parseRobots(text) {
  const groups = [];
  let current = null;
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const raw = line.split("#")[0].trim();
    if (!raw) continue;
    const [keyRaw, ...rest] = raw.split(":");
    const key = keyRaw.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if (key === "disallow" || key === "allow") {
      current.rules.push({ type: key, value });
      continue;
    }
    if (key === "crawl-delay") {
      const delay = Number(value);
      if (Number.isFinite(delay)) current.crawlDelay = delay;
    }
  }
  return groups;
}

function selectGroup(groups, userAgent) {
  if (!groups.length) return null;
  const agent = String(userAgent || "*").toLowerCase();
  const exact = groups.find(group => group.agents.includes(agent));
  if (exact) return exact;
  return groups.find(group => group.agents.includes("*")) || null;
}

function longestMatchRule(pathname, rules) {
  let best = null;
  for (const rule of rules) {
    const value = rule.value || "";
    if (!value) continue;
    if (pathname.startsWith(value)) {
      if (!best || value.length > best.value.length) best = rule;
    }
  }
  return best;
}

export function isAllowedByRobots(url, robots, userAgent = "*") {
  if (!robots) return true;
  let pathname = "/";
  try {
    pathname = new URL(url).pathname || "/";
  } catch {
    return true;
  }
  const group = selectGroup(robots, userAgent);
  if (!group) return true;
  const allowRules = group.rules.filter(rule => rule.type === "allow");
  const disallowRules = group.rules.filter(rule => rule.type === "disallow");
  const allow = longestMatchRule(pathname, allowRules);
  const disallow = longestMatchRule(pathname, disallowRules);
  if (!allow && !disallow) return true;
  if (allow && disallow) {
    return allow.value.length >= disallow.value.length;
  }
  if (disallow) return false;
  return true;
}

export async function getRobotsRules(origin, { fetchFn = fetch, userAgent = "AikaDurham/1.0" } = {}) {
  if (!origin) return null;
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  try {
    const resp = await fetchFn(`${origin}/robots.txt`, {
      headers: { "User-Agent": userAgent }
    });
    if (!resp.ok) {
      robotsCache.set(origin, null);
      return null;
    }
    const text = await resp.text();
    const parsed = parseRobots(text);
    robotsCache.set(origin, parsed);
    return parsed;
  } catch {
    robotsCache.set(origin, null);
    return null;
  }
}

export function getRobotsCrawlDelay(robots, userAgent = "*") {
  if (!robots) return null;
  const group = selectGroup(robots, userAgent);
  if (!group) return null;
  return Number.isFinite(group.crawlDelay) ? group.crawlDelay : null;
}
