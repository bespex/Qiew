/**
 * The keys of all viewers, in one place (docs/BEDIENKONZEPT.md, section 3): the same gesture
 * has the same key in every app. An app says which of them it uses and what they do there;
 * `?` and the menu entry "Keyboard Shortcuts" show the card with exactly those.
 *
 * To change a key, change it here: tooltips, the help card and the handlers follow. A gesture may
 * have more than one key (the first is the one named first).
 *
 * The arrows with Alt: up and down move within (the changes of a patch, the headings of a page),
 * left and right move across (the files of a patch). Where left and right are taken by moving
 * across, going back along the jumps made is Alt+Shift+←/→ (jumpBack); a viewer that browses
 * (Marq) keeps Alt+←/→ for back and forward like a browser.
 */

export const KEYS = {
  nextChange: ["Alt+ArrowDown", "F7"],
  prevChange: ["Alt+ArrowUp", "Shift+F7"],
  nextFile: "Alt+ArrowRight",
  prevFile: "Alt+ArrowLeft",
  nextSection: "Alt+ArrowDown",
  prevSection: "Alt+ArrowUp",
  back: "Alt+ArrowLeft",
  forward: "Alt+ArrowRight",
  jumpBack: "Alt+Shift+ArrowLeft",
  jumpForward: "Alt+Shift+ArrowRight",
  toggleNav: "Ctrl+Shift+O",
  comment: "Ctrl+Alt+M",
  close: "Escape",
  submit: "Ctrl+Enter",
  search: "Ctrl+F",
  help: "?",
} as const;
export type KeyId = keyof typeof KEYS;

/** The keys of a gesture. */
export const combos = (id: KeyId): readonly string[] => {
  const k: string | readonly string[] = KEYS[id];
  return typeof k === "string" ? [k] : k;
};

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Whether the event is the combination ("Ctrl+Shift+O", "Alt+ArrowDown", "?"). Letters ignore
 * case; Ctrl also accepts Cmd. A printable symbol such as "?" ignores Shift, because the
 * keyboard layout decides whether it needs one.
 */
export function matches(e: KeyLike, combo: string): boolean {
  const parts = combo.split("+");
  const key = parts.pop()!;
  const mods = new Set(parts);
  const symbol = key.length === 1 && !/[a-z0-9]/i.test(key);
  if ((e.ctrlKey || e.metaKey) !== mods.has("Ctrl")) return false;
  if (e.altKey !== mods.has("Alt")) return false;
  if (!symbol && e.shiftKey !== mods.has("Shift")) return false;
  return key.length === 1 ? e.key.toLowerCase() === key.toLowerCase() : e.key === key;
}

const NAMES: Record<string, string> = { ArrowDown: "↓", ArrowUp: "↑", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc" };

/** "Alt+ArrowDown" → "Alt+↓". */
const label = (combo: string) =>
  combo
    .split("+")
    .map((p) => NAMES[p] ?? p)
    .join("+");

/** The keys of a gesture as people read them: "Alt+↓, F7". */
export function keyLabel(id: KeyId): string {
  return combos(id).map(label).join(", ");
}

/** A tooltip that names its key: "Next file (Alt+↓)". */
export const withKey = (title: string, id: KeyId) => `${title} (${keyLabel(id)})`;

/** Typing in a field: keys that print must reach the field. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Function keys and Ctrl combinations print nothing, so they also work while a field has the focus. */
export const worksInFields = (combo: string) => /(^|\+)F\d+$/.test(combo) || combo.split("+").includes("Ctrl");

export type KeyHandlers = Partial<Record<KeyId, (e: KeyboardEvent) => void>>;

/** Calls the handler of the key pressed. `?` and the Alt arrows are left to a field being typed in. */
export function onKeys(handlers: KeyHandlers) {
  document.addEventListener("keydown", (e) => {
    for (const [id, run] of Object.entries(handlers) as [KeyId, (e: KeyboardEvent) => void][]) {
      const combo = combos(id).find((c) => matches(e, c));
      if (!combo) continue;
      if (typing(e.target) && !worksInFields(combo)) return;
      e.preventDefault();
      run(e);
      return;
    }
  });
}

// ---- help card ---------------------------------------------------------------------------

let entries: [KeyId, string][] = [];
let card: HTMLElement | null = null;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function closeHelp() {
  card?.remove();
  card = null;
}

export function toggleHelp() {
  if (card) return closeHelp();
  card = document.createElement("div");
  card.className = "keys-help";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Keyboard shortcuts");
  card.innerHTML =
    `<div class="keys-card"><h2>Keyboard Shortcuts</h2><table>` +
    entries
      .map(([id, what]) => `<tr><td>${combos(id).map((c) => label(c).split("+").map((k) => `<kbd>${esc(k)}</kbd>`).join("+")).join(" or ")}</td><td>${esc(what)}</td></tr>`)
      .join("") +
    `</table><p>Press <kbd>?</kbd> or <kbd>Esc</kbd> to close.</p></div>`;
  card.addEventListener("click", (e) => {
    if (e.target === card) closeHelp();
  });
  document.body.append(card);
}

/**
 * The keys this app uses, with what they do in it, for the help card; also puts
 * "Keyboard Shortcuts" into the toolbar menu (call after initToolbar), so the card can be
 * reached without knowing `?`.
 */
export function setKeyHelp(list: [KeyId, string][]) {
  entries = [...list, ["close", "Close the window (when nothing else is open)"], ["help", "Show or hide this list"]];
  document.addEventListener("keydown", (e) => {
    if (card && e.key === "Escape") {
      e.preventDefault();
      closeHelp();
    }
  });
  const menu = document.getElementById("menu");
  if (!menu || menu.querySelector(".keys-item")) return;
  const item = document.createElement("button");
  item.className = "tb-item keys-item";
  item.setAttribute("role", "menuitem");
  item.textContent = "Keyboard Shortcuts";
  item.addEventListener("click", () => {
    menu.hidden = true;
    document.getElementById("menu-btn")?.setAttribute("aria-expanded", "false");
    toggleHelp();
  });
  const about = [...menu.querySelectorAll(".tb-item")].pop();
  menu.insertBefore(item, about ?? null);
}
