// Element picker: hover to highlight, click to select, then save a
// site-specific "host##selector" rule to the custom filters.
(() => {
  if (window.__quietPagePicker) return;
  window.__quietPagePicker = true;

  const host = location.hostname.toLowerCase().replace(/^www\./, "");
  const Z = 2147483647;

  const box = document.createElement("div");
  box.style.cssText = `position:fixed;z-index:${Z - 1};pointer-events:none;display:none;
    background:rgba(217,58,63,.18);outline:2px solid #D93A3F;border-radius:2px;transition:all .06s`;

  const ui = document.createElement("div");
  ui.style.cssText = `all:initial;position:fixed;z-index:${Z};left:50%;bottom:20px;transform:translateX(-50%)`;
  const root = ui.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .bar { font: 13px/1.4 system-ui, -apple-system, sans-serif; color: #f4f4f5; background: #18181b;
             border: 1px solid #3f3f46; border-radius: 12px; padding: 12px 14px; width: min(560px, calc(100vw - 32px));
             box-shadow: 0 10px 30px rgba(0,0,0,.35); box-sizing: border-box; }
      .msg { font-weight: 600; margin-bottom: 6px; }
      code { display: block; font: 12px ui-monospace, Menlo, monospace; color: #a1a1aa; background: #27272a;
             padding: 6px 8px; border-radius: 6px; overflow-wrap: anywhere; margin-bottom: 10px; min-height: 16px; }
      .btns { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
      button { font: inherit; border-radius: 8px; padding: 6px 12px; cursor: pointer; border: 1px solid #3f3f46;
               background: #27272a; color: #f4f4f5; }
      button:hover:not(:disabled) { background: #3f3f46; }
      button:disabled { opacity: .45; cursor: default; }
      .primary { background: #D93A3F; border-color: #D93A3F; color: #fff; }
      .primary:hover:not(:disabled) { background: #c22f34; }
    </style>
    <div class="bar">
      <div class="msg">Click the ad you want to block</div>
      <code class="sel">Hover over the page to highlight elements · Esc to cancel</code>
      <div class="btns">
        <button data-a="parent" disabled>Select wider area</button>
        <button data-a="cancel">Cancel</button>
        <button data-a="block" class="primary" disabled>Block it</button>
      </div>
    </div>`;

  const msgEl = root.querySelector(".msg");
  const selEl = root.querySelector(".sel");
  const btn = (a) => root.querySelector(`[data-a="${a}"]`);

  let chosen = null;
  let selector = "";

  const isOurs = (e) => e.composedPath().includes(ui);

  function elementAt(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === ui || el === document.documentElement || el === document.body) return null;
    return el;
  }

  function highlight(el) {
    if (!el) {
      box.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, {
      display: "block",
      top: r.top + "px",
      left: r.left + "px",
      width: r.width + "px",
      height: r.height + "px"
    });
  }

  // Skip auto-generated class names / ids (CSS-in-JS hashes, long numbers).
  const isStable = (s) => s.length < 40 && !/\d{4,}/.test(s) && !/^(css|sc|jsx|emotion)-/.test(s);

  function segment(el) {
    if (el.id && isStable(el.id)) {
      const idSel = "#" + CSS.escape(el.id);
      if (document.querySelectorAll(idSel).length === 1) return { s: idSel, unique: true };
    }
    let s = el.tagName.toLowerCase();
    const classes = [...el.classList].filter(isStable).slice(0, 3);
    s += classes.map((c) => "." + CSS.escape(c)).join("");
    const parent = el.parentElement;
    if (parent && [...parent.children].filter((c) => c.matches(s)).length > 1) {
      const sameTag = [...parent.children].filter((c) => c.tagName === el.tagName);
      s += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
    }
    return { s, unique: false };
  }

  function selectorFor(el) {
    const parts = [];
    for (let cur = el; cur && cur !== document.documentElement; cur = cur.parentElement) {
      const { s, unique } = segment(cur);
      parts.unshift(s);
      const sel = parts.join(" > ");
      if (unique || document.querySelectorAll(sel).length === 1 || cur === document.body) return sel;
    }
    return parts.join(" > ");
  }

  function choose(el) {
    chosen = el;
    selector = selectorFor(el);
    highlight(el);
    const n = document.querySelectorAll(selector).length;
    msgEl.textContent = `Selected ${n} element${n === 1 ? "" : "s"} — block it, or click somewhere else`;
    selEl.textContent = `${host}##${selector}`;
    btn("block").disabled = false;
    btn("parent").disabled = !el.parentElement || el.parentElement === document.body;
  }

  async function block() {
    const line = `${host}##${selector}`;
    const { customFilters = "" } = await chrome.storage.local.get("customFilters");
    const lines = customFilters.split(/\r?\n/).filter(Boolean);
    if (!lines.includes(line)) lines.push(line);
    await chrome.storage.local.set({ customFilters: lines.join("\n") + "\n" });
    document.querySelectorAll(selector).forEach((el) => el.style.setProperty("display", "none", "important"));
    cleanup();
  }

  const onMove = (e) => {
    if (chosen || isOurs(e)) return;
    highlight(elementAt(e));
  };

  const swallow = (e) => {
    if (isOurs(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  const onClick = (e) => {
    if (isOurs(e)) return;
    swallow(e);
    const el = elementAt(e);
    if (el) choose(el);
  };

  const onKey = (e) => {
    if (e.key === "Escape") {
      swallow(e);
      cleanup();
    }
  };

  const onScroll = () => chosen && highlight(chosen);

  root.addEventListener("click", (e) => {
    const action = e.target.closest?.("button")?.dataset.a;
    if (action === "cancel") cleanup();
    if (action === "block") block();
    if (action === "parent" && chosen?.parentElement) choose(chosen.parentElement);
  });

  const listeners = [
    ["mousemove", onMove],
    ["click", onClick],
    ["mousedown", swallow],
    ["mouseup", swallow],
    ["pointerdown", swallow],
    ["pointerup", swallow],
    ["auxclick", swallow],
    ["keydown", onKey],
    ["scroll", onScroll]
  ];

  function cleanup() {
    for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    box.remove();
    ui.remove();
    window.__quietPagePicker = false;
  }

  for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
  document.documentElement.append(box, ui);
})();
