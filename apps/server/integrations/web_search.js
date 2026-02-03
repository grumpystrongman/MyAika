function flattenRelatedTopics(topics, out = []) {
  if (!Array.isArray(topics)) return out;
  for (const item of topics) {
    if (!item) continue;
    if (Array.isArray(item.Topics)) {
      flattenRelatedTopics(item.Topics, out);
      continue;
    }
    if (item.Text || item.FirstURL) out.push(item);
  }
  return out;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseDuckHtmlResults(html, limit) {
  const out = [];
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) && out.length < limit) {
    let rawUrl = decodeHtml(match[1]);
    const title = decodeHtml(match[2].replace(/<[^>]+>/g, "").trim());
    const uddg = rawUrl.match(/[?&]uddg=([^&]+)/i);
    if (uddg?.[1]) {
      try {
        rawUrl = decodeURIComponent(uddg[1]);
      } catch {
        // keep raw
      }
    }
    const local = html.slice(match.index, match.index + 1600);
    const snip =
      local.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ||
      local.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/span>/i);
    const snippet = snip ? decodeHtml(snip[1].replace(/<[^>]+>/g, "").trim()) : "";
    out.push({
      title: title || "Result",
      snippet,
      url: rawUrl
    });
  }
  return out;
}

export async function searchWeb(query, limit = 5) {
  const q = String(query || "").trim();
  if (!q) throw new Error("query_required");
  const max = Math.max(1, Math.min(10, Number(limit) || 5));

  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");
  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json" }
  });
  if (!resp.ok) throw new Error(`web_search_failed_${resp.status}`);
  const data = await resp.json();

  const results = [];
  if (data?.AbstractText || data?.AbstractURL) {
    results.push({
      title: data.Heading || q,
      snippet: data.AbstractText || "",
      url: data.AbstractURL || ""
    });
  }
  const related = flattenRelatedTopics(data?.RelatedTopics || []);
  for (const item of related) {
    if (results.length >= max) break;
    results.push({
      title: item.Text?.split(" - ")[0] || "Related",
      snippet: item.Text || "",
      url: item.FirstURL || ""
    });
  }

  if (results.length < max) {
    try {
      const htmlUrl = new URL("https://duckduckgo.com/html/");
      htmlUrl.searchParams.set("q", q);
      const htmlResp = await fetch(htmlUrl.toString(), {
        headers: {
          Accept: "text/html",
          "User-Agent": "Mozilla/5.0 (AikaBot/1.0)"
        }
      });
      if (htmlResp.ok) {
        const html = await htmlResp.text();
        const parsed = parseDuckHtmlResults(html, max);
        for (const item of parsed) {
          if (results.length >= max) break;
          if (results.some(r => r.url && item.url && r.url === item.url)) continue;
          results.push(item);
        }
      }
    } catch {
      // ignore html fallback issues
    }
  }

  if (results.length < max) {
    try {
      const wikiUrl = new URL("https://en.wikipedia.org/w/api.php");
      wikiUrl.searchParams.set("action", "query");
      wikiUrl.searchParams.set("list", "search");
      wikiUrl.searchParams.set("srsearch", q);
      wikiUrl.searchParams.set("srlimit", String(max));
      wikiUrl.searchParams.set("format", "json");
      wikiUrl.searchParams.set("utf8", "1");
      const wikiResp = await fetch(wikiUrl.toString(), {
        headers: { Accept: "application/json" }
      });
      if (wikiResp.ok) {
        const wikiData = await wikiResp.json();
        const wikiHits = Array.isArray(wikiData?.query?.search) ? wikiData.query.search : [];
        for (const hit of wikiHits) {
          if (results.length >= max) break;
          const title = decodeHtml(String(hit.title || "").trim());
          const snippet = decodeHtml(String(hit.snippet || "").replace(/<[^>]+>/g, "").trim());
          const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
          if (results.some(r => r.url === url)) continue;
          results.push({ title, snippet, url });
        }
      }
    } catch {
      // ignore wikipedia fallback issues
    }
  }

  if (!results.length) {
    results.push({
      title: `Search the web for: ${q}`,
      snippet: "Direct search link generated because no parsed snippets were returned.",
      url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
    });
  }

  return {
    query: q,
    source: "duckduckgo_instant_answer",
    results: results.slice(0, max)
  };
}
