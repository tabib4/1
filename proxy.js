export default async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).send("Missing 'url' query parameter");
  }

  try {
    const targetUrl = new URL(url);
    const response = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": targetUrl.origin + "/"
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Upstream error: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    res.setHeader("Content-Type", contentType || "application/octet-stream");

    // If the response is an M3U8 playlist, rewrite relative/HTTP segment & sub-playlist URLs to go through this proxy
    if (
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegurl") ||
      targetUrl.pathname.endsWith(".m3u8")
    ) {
      const text = await response.text();
      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.startsWith("#")) {
            // Rewrite URI="..." attributes inside tags like #EXT-X-KEY or #EXT-X-MEDIA
            return line.replace(/URI="([^"]+)"/g, (match, uri) => {
              const resolved = new URL(uri, targetUrl).toString();
              return `URI="/api/proxy?url=${encodeURIComponent(resolved)}"`;
            });
          }
          const resolved = new URL(trimmed, targetUrl).toString();
          return `/api/proxy?url=${encodeURIComponent(resolved)}`;
        })
        .join("\n");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.status(200).send(rewritten);
    }

    // Stream binary video segments (.ts, .m4s, .aac, etc.)
    const arrayBuffer = await response.arrayBuffer();
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).send(`Proxy error: ${err.message}`);
  }
}
