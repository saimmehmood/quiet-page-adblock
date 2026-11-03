import {
  SETTINGS_KEYS,
  getSettings,
  hostFromUrl,
  isAllowlisted,
  parseCustomFilters
} from "./lib/common.js";

const STATIC_RULESETS = ["ads", "trackers"];

// Dynamic rule ID ranges, so we can tell allow rules from block rules.
const ALLOW_ID_START = 1;
const BLOCK_ID_START = 100000;

const ICONS = (state) => ({
  16: `icons/${state}-16.png`,
  32: `icons/${state}-32.png`,
  48: `icons/${state}-48.png`,
  128: `icons/${state}-128.png`
});

// ---------------------------------------------------------------------------
// Rule syncing: static rulesets + dynamic allowlist / custom block rules
// ---------------------------------------------------------------------------

let syncChain = Promise.resolve();

function syncRules() {
  syncChain = syncChain.then(doSyncRules).catch((err) => console.error("syncRules failed", err));
  return syncChain;
}

async function doSyncRules() {
  const s = await getSettings();

  const enabled = s.paused ? [] : s.blockTrackers ? STATIC_RULESETS : ["ads"];
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled,
    disableRulesetIds: STATIC_RULESETS.filter((id) => !enabled.includes(id))
  });

  const rules = [];
  if (!s.paused) {
    let allowId = ALLOW_ID_START;
    for (const domain of s.allowlist) {
      rules.push({
        id: allowId++,
        priority: 100,
        action: { type: "allowAllRequests" },
        condition: { requestDomains: [domain], resourceTypes: ["main_frame", "sub_frame"] }
      });
    }

    const custom = parseCustomFilters(s.customFilters);
    let blockId = BLOCK_ID_START;
    for (const domain of custom.blockDomains) {
      rules.push({
        id: blockId++,
        priority: 10,
        action: { type: "block" },
        condition: { requestDomains: [domain], excludedResourceTypes: ["main_frame"] }
      });
    }
    for (const urlFilter of custom.blockUrlFilters) {
      rules.push({
        id: blockId++,
        priority: 10,
        action: { type: "block" },
        condition: { urlFilter, excludedResourceTypes: ["main_frame"] }
      });
    }
  }

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id)
  });

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
  } catch {
    // One bad rule rejects the whole batch, so fall back to adding them one by one.
    for (const rule of rules) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
      } catch (err) {
        console.warn("Skipping invalid rule", rule, err.message);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Toolbar icon: grey when paused or the site is allowlisted
// ---------------------------------------------------------------------------

async function refreshIcon(tabId, url) {
  const s = await getSettings();
  const host = hostFromUrl(url);
  const off = s.paused || isAllowlisted(host, s.allowlist);
  try {
    await chrome.action.setIcon({ tabId, path: ICONS(off ? "off" : "on") });
  } catch {
    // Tab closed before we got here.
  }
}

async function refreshAllIcons() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => refreshIcon(t.id, t.url)));
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === "loading") refreshIcon(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) refreshIcon(tabId, tab.url);
});

// ---------------------------------------------------------------------------
// Lifetime counter. onRuleMatchedDebug only fires for unpacked extensions,
// so the total is only tracked in developer mode.
// ---------------------------------------------------------------------------

let pendingCount = 0;
let flushTimer = null;

function flushCount() {
  flushTimer = null;
  const n = pendingCount;
  pendingCount = 0;
  chrome.storage.local.get({ totalBlocked: 0 }).then(({ totalBlocked }) =>
    chrome.storage.local.set({ totalBlocked: totalBlocked + n })
  );
}

chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(({ rule }) => {
  const isAllowRule = rule.rulesetId === "_dynamic" && rule.ruleId < BLOCK_ID_START;
  if (isAllowRule) return;
  pendingCount++;
  flushTimer ??= setTimeout(flushCount, 1500);
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function init() {
  await chrome.declarativeNetRequest.setExtensionActionOptions({
    displayActionCountAsBadgeText: true
  });
  await chrome.action.setBadgeBackgroundColor({ color: "#D93A3F" });
  await chrome.action.setBadgeTextColor?.({ color: "#FFFFFF" });
  await syncRules();
  await refreshAllIcons();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (SETTINGS_KEYS.some((k) => k in changes)) {
    syncRules();
    refreshAllIcons();
  }
});
