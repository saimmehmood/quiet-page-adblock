// Cosmetic filtering: hides ad containers that slip past network blocking.
// Runs at document_start in every frame. Content scripts can't import ES
// modules, so the small bits of parsing needed here are duplicated.
(() => {
  if (window.__quietPageCosmetic) return;
  window.__quietPageCosmetic = true;

  const GENERIC_SELECTORS = [
    "ins.adsbygoogle",
    ".adsbygoogle",
    "[id^='google_ads_iframe']",
    "[id^='div-gpt-ad']",
    "[id^='gpt-ad-']",
    "div[data-google-query-id]",
    "[data-ad-slot]",
    "[data-ad-unit]",
    "[data-adunit]",
    "[data-ad-client]",
    "iframe[src*='doubleclick.net']",
    "iframe[src*='googlesyndication.com']",
    "iframe[src*='amazon-adsystem.com']",
    "iframe[id^='google_ads']",
    "a[href*='doubleclick.net/']",
    "amp-ad",
    "amp-embed[type='taboola']",
    "amp-embed[type='outbrain']",
    ".ad-banner",
    ".ad-container",
    ".ad-slot",
    ".ad-wrapper",
    ".ad-placement",
    ".ad-unit",
    ".adsbox",
    ".adbox",
    ".advertisement",
    ".sponsored-ad",
    "#ad-banner",
    "#ad-container",
    "[id^='taboola-']",
    ".trc_rbox_container",
    ".OUTBRAIN",
    "[aria-label='Advertisement']"
  ];

  const SITE_SELECTORS = {
    "youtube.com": [
      "ytd-ad-slot-renderer",
      "ytd-in-feed-ad-layout-renderer",
      "ytd-promoted-sparkles-web-renderer",
      "ytd-promoted-video-renderer",
      "ytd-display-ad-renderer",
      "ytd-banner-promo-renderer",
      "ytd-statement-banner-renderer",
      "ytd-companion-slot-renderer",
      "ytd-player-legacy-desktop-watch-ads-renderer",
      "#masthead-ad",
      "#player-ads",
      ".ytp-ad-overlay-container",
      "ytm-promoted-sparkles-web-renderer"
    ],
    "reddit.com": ["shreddit-ad-post", "shreddit-comments-page-ad", ".promotedlink"],
    "twitch.tv": ["[data-test-selector='sad-overlay']"]
  };

  const norm = (h) => String(h || "").trim().toLowerCase().replace(/^\*?\./, "").replace(/^www\./, "");
  const matchesHost = (host, d) => host === d || host.endsWith("." + d);

  // The top-level site decides whether blocking is on, even inside iframes.
  const pageHost = (() => {
    try {
      const ao = location.ancestorOrigins;
      return norm(new URL(ao && ao.length ? ao[ao.length - 1] : location.href).hostname);
    } catch {
      return norm(location.hostname);
    }
  })();
  const frameHost = norm(location.hostname);
  const isTop = window === window.top;

  const style = document.createElement("style");
  style.dataset.quietPage = "";
  let activeSelector = "";

  function isValidSelector(sel) {
    try {
      document.createDocumentFragment().querySelector(sel);
      return true;
    } catch {
      return false;
    }
  }

  function customSelectors(text) {
    const out = [];
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.trim();
      const sep = line.indexOf("##");
      if (line.startsWith("!") || sep === -1) continue;
      const hosts = line.slice(0, sep);
      const sel = line.slice(sep + 2).trim();
      if (!sel) continue;
      if (!hosts || hosts.split(",").map(norm).some((h) => matchesHost(pageHost, h) || matchesHost(frameHost, h))) {
        out.push(sel);
      }
    }
    return out;
  }

  function apply(settings) {
    const off = settings.paused || settings.allowlist.some((d) => matchesHost(pageHost, d));
    if (off) {
      activeSelector = "";
      style.remove();
      return;
    }

    const selectors = [...GENERIC_SELECTORS];
    for (const [site, list] of Object.entries(SITE_SELECTORS)) {
      if (matchesHost(pageHost, site)) selectors.push(...list);
    }
    selectors.push(...customSelectors(settings.customFilters));

    const valid = [...new Set(selectors)].filter(isValidSelector);
    activeSelector = valid.join(",");
    style.textContent = activeSelector ? `${activeSelector} { display: none !important; }` : "";
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
  }

  const DEFAULTS = { paused: false, allowlist: [], customFilters: "" };
  let current = DEFAULTS;

  chrome.storage.local.get(DEFAULTS).then((s) => {
    current = s;
    apply(s);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!["paused", "allowlist", "customFilters"].some((k) => k in changes)) return;
    for (const k of Object.keys(DEFAULTS)) if (k in changes) current = { ...current, [k]: changes[k].newValue };
    apply(current);
  });

  // Some pages wipe <head> during hydration; put the stylesheet back.
  document.addEventListener("DOMContentLoaded", () => {
    if (activeSelector && !style.isConnected) (document.head || document.documentElement).appendChild(style);
  });

  if (isTop) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "getHiddenCount") {
        sendResponse({ count: activeSelector ? document.querySelectorAll(activeSelector).length : 0 });
      }
    });
  }

  // YouTube video ads can't be blocked at the network level without breaking
  // playback, so skip them: mute, jump to the end, press "Skip".
  if (isTop && matchesHost(pageHost, "youtube.com")) {
    setInterval(() => {
      if (!activeSelector) return;
      const player = document.querySelector(".html5-video-player");
      if (!player?.classList.contains("ad-showing")) return;
      const video = player.querySelector("video");
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        video.muted = true;
        video.currentTime = video.duration;
      }
      document
        .querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern")
        ?.click();
    }, 300);
  }
})();
