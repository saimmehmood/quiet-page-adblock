import { getSettings, setSettings, parseDomainInput, parseCustomFilters } from "../lib/common.js";

const $ = (id) => document.getElementById(id);

async function render() {
  const s = await getSettings();
  $("enabled").checked = !s.paused;
  $("blockTrackers").checked = s.blockTrackers;
  $("blockTrackers").disabled = s.paused;
  renderAllowlist(s.allowlist);

  const { totalBlocked = 0 } = await chrome.storage.local.get("totalBlocked");
  $("total").textContent = totalBlocked.toLocaleString();
  $("totalRow").hidden = !chrome.declarativeNetRequest.onRuleMatchedDebug;
}

function renderAllowlist(list) {
  const ul = $("allowList");
  ul.replaceChildren(
    ...[...list].sort().map((domain) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = domain;
      const remove = document.createElement("button");
      remove.className = "link";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        const s = await getSettings();
        await setSettings({ allowlist: s.allowlist.filter((d) => d !== domain) });
      });
      li.append(name, remove);
      return li;
    })
  );
  $("allowEmpty").hidden = list.length > 0;
}

$("enabled").addEventListener("change", (e) => setSettings({ paused: !e.target.checked }));
$("blockTrackers").addEventListener("change", (e) => setSettings({ blockTrackers: e.target.checked }));

$("resetTotal").addEventListener("click", () => chrome.storage.local.set({ totalBlocked: 0 }));

$("allowForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const domain = parseDomainInput($("allowInput").value);
  const error = $("allowError");
  if (!domain) {
    error.textContent = "Enter a valid domain, like example.com.";
    error.hidden = false;
    return;
  }
  error.hidden = true;
  const s = await getSettings();
  if (!s.allowlist.includes(domain)) await setSettings({ allowlist: [...s.allowlist, domain] });
  $("allowInput").value = "";
});

// ---------------------------------------------------------------------------
// Custom filters
// ---------------------------------------------------------------------------

function validate(text) {
  const parsed = parseCustomFilters(text);
  const errors = [...parsed.errors];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const sep = line.indexOf("##");
    if (sep === -1 || line.startsWith("!")) return;
    const selector = line.slice(sep + 2).trim();
    if (!selector) return;
    try {
      document.createDocumentFragment().querySelector(selector);
    } catch {
      errors.push({ line: i + 1, text: line, reason: "invalid CSS selector" });
    }
  });
  return { parsed, errors: errors.sort((a, b) => a.line - b.line) };
}

function showFilterErrors(errors) {
  const ul = $("filterErrors");
  ul.hidden = errors.length === 0;
  ul.replaceChildren(
    ...errors.map((err) => {
      const li = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = err.text;
      li.append(`Line ${err.line}: `, code, ` — ${err.reason}`);
      return li;
    })
  );
}

$("saveFilters").addEventListener("click", async () => {
  const text = $("filters").value;
  const { parsed, errors } = validate(text);
  await setSettings({ customFilters: text });
  showFilterErrors(errors);

  const network = parsed.blockDomains.length + parsed.blockUrlFilters.length;
  const cosmetic = parsed.cosmeticGlobal.length + Object.values(parsed.cosmeticByHost).flat().length;
  const status = $("filterStatus");
  status.className = "status ok";
  status.textContent =
    `Saved · ${network} blocking rule${network === 1 ? "" : "s"}, ${cosmetic} hiding rule${cosmetic === 1 ? "" : "s"}` +
    (errors.length ? ` · ${errors.length} skipped` : "");
});

$("filters").addEventListener("input", () => {
  $("filterStatus").className = "status";
  $("filterStatus").textContent = "Unsaved changes";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  render();
  // Pick up rules added by the element picker, unless the user is mid-edit.
  if (changes.customFilters && $("filterStatus").textContent !== "Unsaved changes") {
    $("filters").value = changes.customFilters.newValue || "";
  }
});

const initial = await getSettings();
$("filters").value = initial.customFilters;
showFilterErrors(validate(initial.customFilters).errors);
render();
