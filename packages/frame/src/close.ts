/**
 * Esc closes the window, like a viewer opened for a look (CodeDeck opens them that way). Only
 * when Esc is not taken already: whatever uses Esc (search, menu, help card, an input card, an
 * open panel) calls `preventDefault()`, and a field with the focus or an open dialog keeps it.
 * An app that would lose something by closing says so with `keepOpenOnEscape` (Dirq: comments
 * that were not sent).
 */
import { getCurrentWindow } from "@tauri-apps/api/window";

let keep: (() => boolean) | null = null;

/** `guard` returns true to keep the window open this time (it should tell the user why). */
export function keepOpenOnEscape(guard: () => boolean) {
  keep = guard;
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function initEscapeClose() {
  // On the window, bubbling: every handler on the page and the document has had its turn
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || e.repeat || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
    if (typing(e.target) || document.querySelector("dialog[open]")) return;
    if (keep?.()) return;
    e.preventDefault();
    void getCurrentWindow().close();
  });
}
