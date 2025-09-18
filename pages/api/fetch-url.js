// pages/api/fetch-url.js
// Safe fetch of external JD/CV text with SSRF/IP blacklist.

export const config = {
  api: { bodyParser: { sizeLimit: "128kb" } },
};

import { lookup } from "dns/promises";
import net from "net";

const PRIVATE_CIDRS = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
];

function ipInCidr(ip, [base, mask]) {
  // IPv4 only here; v6 blocked separately unless public DNS resolves
  const toInt = (x) => x.split(".").reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
  if (ip.includes(":")) return true; // block IPv6 to be safe
  const ipInt = toInt(ip);
  const baseInt = toInt(base);
  const maskBits = mask === 0 ? 0 : ~((1 << (32 - mask)) - 1) >>> 0;
  return (ipInt & maskBits) === (baseInt & maskBits);
}

function isBlockedIp(ip) {
  if (!ip) return true;
  if (ip.includes(":")) return true; // block IPv6 for simplicity
  return PRIVATE_CIDRS.some(c => ipInCidr(ip, c));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Missing url" });

    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) {
      return res.status(400).json({ error: "Unsupported protocol" });
    }

    const dns = await lookup(u.hostname);
    const ip = dns?.address;
    if (isBlockedIp(ip)) {
      return res.status(403).json({ error: "Blocked host" });
    }

    const r = await fetch(url, { method: "GET", redirect: "follow" });
    if (!r.ok) {
      return res.status(r.status).json({ error: "Upstream error", statusText: r.statusText });
    }
    const text = await r.text();
    // crude size guard
    const slice = text.slice(0, 200_000);
    return res.status(200).json({ ok: true, length: slice.length, text: slice });
  } catch (e) {
    console.error("fetch-url error", e);
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
