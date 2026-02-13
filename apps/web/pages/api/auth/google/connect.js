function getRequestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  if (!host) return "";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  const primaryBase =
    process.env.AIKA_SERVER_URL
    || process.env.NEXT_PUBLIC_SERVER_URL
    || "http://127.0.0.1:8790";
  const fallbackBase = "http://127.0.0.1:8790";
  const bases = Array.from(new Set([primaryBase, fallbackBase]));
  const requestOrigin = getRequestOrigin(req);

  const buildUrl = (base) => {
    const url = new URL("/api/auth/google/connect", base);
    for (const [key, value] of Object.entries(req.query || {})) {
      if (Array.isArray(value)) {
        value.forEach(v => url.searchParams.append(key, String(v)));
      } else if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  };

  const followRedirect = async (base) => {
    let nextUrl = buildUrl(base);
    for (let i = 0; i < 3; i += 1) {
      const resp = await fetch(nextUrl.toString(), { redirect: "manual" });
      const location = resp.headers.get("location");
      if (!location) return null;
      if (location.startsWith("/")) {
        const origin = requestOrigin || base;
        nextUrl = new URL(location, origin);
        continue;
      }
      return location;
    }
    return null;
  };

  for (const base of bases) {
    try {
      const location = await followRedirect(base);
      if (location) {
        res.redirect(location);
        return;
      }
    } catch {}
  }

  res.status(502).send("google_connect_proxy_failed");
}
