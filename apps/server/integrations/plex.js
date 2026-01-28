export async function fetchPlexIdentity() {
  const base = process.env.PLEX_URL || "";
  const token = process.env.PLEX_TOKEN || "";
  if (!base || !token) throw new Error("plex_not_configured");
  const url = `${base.replace(/\/$/, "")}/identity?X-Plex-Token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "plex_request_failed");
  }
  return await r.text();
}
