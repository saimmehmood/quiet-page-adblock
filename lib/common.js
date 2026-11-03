// Shared helpers for the service worker, popup and options page.

export const DEFAULTS = {
  paused: false,
  blockTrackers: true,
  allowlist: [],
  customFilters: ""
};

export const SETTINGS_KEYS = Object.keys(DEFAULTS);

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export function getSettings() {
  return chrome.storage.local.get(DEFAULTS);
}

export function setSettings(patch) {
  return chrome.storage.local.set(patch);
}

export function normalizeHost(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^\*?\./, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

// Returns the normalized hostname for http(s) URLs, otherwise null.
export function hostFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return normalizeHost(u.hostname);
  } catch {
    return null;
  }
}

// Accepts "example.com", "https://www.example.com/page", etc.
export function parseDomainInput(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z]+:\/\//.test(s)) s = "http://" + s;
  try {
    const host = normalizeHost(new URL(s).hostname);
    return DOMAIN_RE.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function isAllowlisted(host, allowlist) {
  return !!host && allowlist.some((d) => host === d || host.endsWith("." + d));
}

/*
 * Custom filter syntax (one per line):
 *   ! comment
 *   example.com            block all requests to a domain (and subdomains)
 *   ||example.com^         same, Adblock-style
 *   ||example.com/ads/*    block matching URLs
 *   ##.banner-ad           hide elements on every site
 *   example.com##.promo    hide elements on one site (comma-separate hosts)
 */
export function parseCustomFilters(text) {
  const out = {
    blockDomains: [],
    blockUrlFilters: [],
    cosmeticGlobal: [],
    cosmeticByHost: {},
    errors: []
  };

  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("!")) return;

    const sep = line.indexOf("##");
    if (sep !== -1) {
      const hosts = line.slice(0, sep);
      const selector = line.slice(sep + 2).trim();
      if (!selector) {
        out.errors.push({ line: i + 1, text: line, reason: "missing selector" });
      } else if (!hosts) {
        out.cosmeticGlobal.push(selector);
      } else {
        for (const h of hosts.split(",")) {
          const host = normalizeHost(h);
          if (host) (out.cosmeticByHost[host] ||= []).push(selector);
        }
      }
      return;
    }

    const bare = line.replace(/^\|\|/, "").replace(/\^$/, "").toLowerCase();
    if (DOMAIN_RE.test(bare)) {
      out.blockDomains.push(bare);
      return;
    }

    const isAscii = /^[\x21-\x7e]+$/.test(line);
    if (isAscii && !line.startsWith("||*") && (line.startsWith("|") || line.includes("/"))) {
      out.blockUrlFilters.push(line);
      return;
    }

    out.errors.push({ line: i + 1, text: line, reason: "not a recognized filter" });
  });

  return out;
}
