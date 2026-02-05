export default function handler(req, res) {
  const base =
    process.env.AIKA_SERVER_URL
    || process.env.NEXT_PUBLIC_SERVER_URL
    || "http://127.0.0.1:8790";
  const url = new URL("/api/auth/google/connect", base);
  for (const [key, value] of Object.entries(req.query || {})) {
    if (Array.isArray(value)) {
      value.forEach(v => url.searchParams.append(key, String(v)));
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  res.redirect(url.toString());
}
