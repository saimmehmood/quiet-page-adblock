import { getSettings, setSettings, hostFromUrl, isAllowlisted } from "../lib/common.js";

const $ = (id) => document.getElementById(id);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const host = hostFromUrl(tab?.url);

async function render() {
  const s = await getSettings();
  const allowlisted = isAllowlisted(host, s.allowlist);
  const active = !s.paused && !allowlisted;

  $("logo").src = `../icons/${active ? "on" : "off"}-32.png`;
  $("host").textContent = host || "This page";

  const toggle = $("siteToggle");
  toggle.disabled = !host || s.paused;
  toggle.checked = active;

  const state = $("siteState");
  state.classList.toggle("on", active);
  state.textContent = !host
    ? "Ads can't be blocked on this page"
    : s.paused
      ? "Paused on all sites"
      : allowlisted
        ? "Not blocking ads on this site"
        : "Blocking ads on this site";

  $("pick").disabled = !host || !active;

  const pause = $("pauseAll");
  pause.textContent = s.paused ? "Resume blocking" : "Pause on all sites";
  pause.classList.toggle("paused", s.paused);
}

async function renderStats() {
  if (tab?.id != null) {
    const badge = await chrome.action.getBadgeText({ tabId: tab.id }).catch(() => "");
    $("pageCount").textContent = parseInt(badge, 10) || 0;

    const res = await chrome.tabs
      .sendMessage(tab.id, { type: "getHiddenCount" }, { frameId: 0 })
      .catch(() => null);
    $("hiddenCount").textContent = res?.count ?? 0;
  }

  // The lifetime counter relies on onRuleMatchedDebug (unpacked installs only).
  const { totalBlocked = 0 } = await chrome.storage.local.get("totalBlocked");
  if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
    $("totalCount").textContent = totalBlocked.toLocaleString();
  } else {
    $("totalStat").hidden = true;
    document.querySelector(".stats").style.gridTemplateColumns = "repeat(2, 1fr)";
  }
}

$("siteToggle").addEventListener("change", async (e) => {
  const s = await getSettings();
  // Remove the exact host and any parent domain entry that covers it.
  const allowlist = e.target.checked
    ? s.allowlist.filter((d) => !(host === d || host.endsWith("." + d)))
    : [...new Set([...s.allowlist, host])];
  await setSettings({ allowlist });
  await render();
  showNote("Reloading the page to apply…");
  // Give the service worker a moment to swap the rules before reloading.
  setTimeout(() => chrome.tabs.reload(tab.id), 250);
});

$("pauseAll").addEventListener("click", async () => {
  const s = await getSettings();
  await setSettings({ paused: !s.paused });
  await render();
  showNote("Reload open pages for the change to take full effect.");
});

$("pick").addEventListener("click", async () => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/picker.js"] });
    window.close();
  } catch {
    showNote("The element picker can't run on this page.");
  }
});

$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

function showNote(text) {
  const note = $("note");
  note.textContent = text;
  note.hidden = false;
}

render();
renderStats();
