/*
 * Dirq – a diff or patch file the way a diff tool shows it: the old and the new text side by
 * side (or unified), changed words marked, the files on the left, and the patch's own data
 * – subject, author, message – in a header. Toolbar, search, colour schemes and the About box
 * come from the frame.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "./styles.css";
import { setApp } from "@qiew/frame/app";
import { setExportContent } from "@qiew/frame/export";
import { plural } from "@qiew/frame/fragment";
import { launchDocId, onRevealRequest, revealElement, revealLaunchLine, revealTextLine } from "@qiew/frame/launch";
import { openInitial } from "@qiew/frame/reveal";
import { closeSearch, initSearch, refreshSearch } from "@qiew/frame/search";
import { JumpHistory } from "@qiew/frame/jumps";
import { onKeys, setKeyHelp, toggleHelp, withKey } from "@qiew/frame/keys";
import { highlightLines, languageOf, markRanges } from "@qiew/frame/highlight";
import { initToolbar, updateToolbar } from "@qiew/frame/toolbar";
import { type DiffLine, type FileDiff, type Hunk, type Patch, type Span, describeInfo, inlineDiff, outline, parsePatch } from "./diff";
import { CHIPS, type Chip, type FileFilter, type Sort, visibleFiles } from "./filter";
import { docKey } from "./docid";
import { isGenerated } from "./generated";
import { type Anchor, anchorOf, findAnchor, freshKey, updateFresh } from "./live";

setApp("dirq");
initToolbar();

interface Doc {
  path: string;
  content: string;
}

const DROP_HERE = "Drop Diff or Patch File Here";
const HEAD = 41 + 36; // toolbar and the sticky file header
const BIG = 4000; // lines; a file this long starts collapsed

const empty = document.getElementById("empty")!;
const layout = document.getElementById("doc")!;
const filesEl = document.getElementById("files")!;
const content = document.getElementById("content")!;
const $btn = (id: string) => document.getElementById(id) as HTMLButtonElement;

// ---- settings (remembered) ---------------------------------------------------------------

const store = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(`dirq.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(`dirq.${key}`, value);
  } catch {
    /* applies for this session */
  }
};
let unified = store("mode", "split") === "unified";
let ignoreWs = store("ws", "0") === "1";
let sideOpen = store("side", "1") === "1";

const SORTS: Sort[] = ["folder", "size", "status"];
const filter: FileFilter & { chips: Set<Chip> } = {
  query: "",
  chips: new Set(),
  sort: SORTS.find((s) => s === store("sort", "folder")) ?? "folder",
};

let current: Doc | null = null;
let patch: Patch | null = null;
const collapsed = new Set<string>(); // by file key
let seen = ""; // the document (docKey) the collapsed set and the marks belong to
let docId: string | null = null; // what the call that opened it named it (--id)
/** What is new since an earlier version of the same document, until the reader clears it. */
let fresh = new Set<string>();
/** What became new in the reload being drawn: it flashes, once. */
let flashing = new Set<string>();
let firstShown = true;
/** Where the view was before each jump (file, change, outline entry), for Alt+← and Alt+→. */
const jumps = new JumpHistory<number>((a, b) => Math.abs(a - b) < 8);

/** Scrolls to `top` as a jump: the place it leaves is remembered. */
function jumpTo(top: number) {
  jumps.record(Math.round(window.scrollY));
  window.scrollTo({ top });
}

/** A short highlight on what a jump went to, for when it cannot reach the top of the window. */
function flash(el: Element) {
  el.classList.add("launch-line");
  setTimeout(() => el.classList.remove("launch-line"), 900);
}

initSearch(content);

// ---- building the markup -----------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const key = (f: FileDiff) => f.newPath || f.oldPath;

type Colours = Map<DiffLine, string> | null;

/**
 * The coloured HTML of each line of a file. The old and the new side are coloured apart (old:
 * context and removed lines, new: context and added ones), each over all hunks of the file in
 * a row, so a comment or string that runs across a hunk boundary keeps its colour. Null when
 * the language is unknown or the file too big.
 */
function coloursOf(f: FileDiff): Colours {
  const lang = languageOf(key(f));
  if (!lang) return null;
  const map = new Map<DiffLine, string>();
  for (const side of ["-", "+"] as const) {
    const lines = f.hunks.flatMap((h) => h.lines.filter((l) => l.type === " " || l.type === side));
    const html = highlightLines(
      lines.map((l) => l.text),
      lang,
    );
    if (!html) return null;
    lines.forEach((l, i) => map.set(l, html[i])); // context: the new side wins, it reads the same
  }
  return map;
}

/** A line's text, coloured where the language is known, with the changed words marked. */
function code(line: DiffLine, spans: Span[] | undefined, colours: Colours): string {
  const html = colours?.get(line);
  if (html !== undefined) return (spans?.length ? markRanges(html, spans, "w") : html) || "​";
  const text = line.text;
  if (!spans?.length) return esc(text) || "​";
  let out = "";
  let at = 0;
  for (const s of spans) {
    out += esc(text.slice(at, s.from)) + `<span class="w">${esc(text.slice(s.from, s.to))}</span>`;
    at = s.to;
  }
  return out + esc(text.slice(at));
}

const eol = (l: DiffLine) => (l.noEol ? `<span class="eol">no newline at end of file</span>` : "");

interface Row {
  old?: DiffLine;
  new?: DiffLine;
  oldSpans?: Span[];
  newSpans?: Span[];
  changed: boolean;
}

const squash = (s: string) => s.replace(/\s+/g, "");

/** The lines of a hunk as rows: removed and added lines of one change next to each other. */
function rowsOf(hunk: Hunk): Row[] {
  const rows: Row[] = [];
  const ls = hunk.lines;
  for (let i = 0; i < ls.length; ) {
    if (ls[i].type === " ") {
      rows.push({ old: ls[i], new: ls[i], changed: false });
      i++;
      continue;
    }
    const del: DiffLine[] = [];
    const add: DiffLine[] = [];
    while (i < ls.length && ls[i].type === "-") del.push(ls[i++]);
    while (i < ls.length && ls[i].type === "+") add.push(ls[i++]);
    for (let k = 0; k < Math.max(del.length, add.length); k++) {
      const o = del[k];
      const n = add[k];
      if (o && n) {
        if (ignoreWs && squash(o.text) === squash(n.text)) {
          rows.push({ old: o, new: n, changed: false });
          continue;
        }
        const d = inlineDiff(o.text, n.text);
        rows.push({ old: o, new: n, oldSpans: d?.a, newSpans: d?.b, changed: true });
      } else rows.push({ old: o, new: n, changed: true });
    }
  }
  return rows;
}

function hunkRow(h: Hunk, index: number, gap: number, cols: number): string {
  const note = gap > 0 ? `<span class="gap">⋯ ${plural(gap, "unchanged line")}</span>` : "";
  return `<tr class="hunk" data-src="${h.src}" data-h="${index}"><td colspan="${cols}">${note}${esc(h.header.replace(/ @@.*$/, " @@"))}${h.section ? ` <span class="sec">${esc(h.section)}</span>` : ""}</td></tr>`;
}

function tableOf(f: FileDiff): string {
  const cols = unified ? 3 : 4;
  let html = unified
    ? `<table class="diff unified"><colgroup><col style="width:52px"><col style="width:52px"><col></colgroup><tbody>`
    : `<table class="diff split"><colgroup><col style="width:52px"><col><col style="width:52px"><col></colgroup><tbody>`;
  let prevEnd = 1;
  const colours = coloursOf(f);
  // Unified: a change shows all removed lines, then all added ones.
  let adds = "";
  for (const [index, h] of f.hunks.entries()) {
    html += adds + hunkRow(h, index, h.oldStart - prevEnd, cols);
    adds = "";
    const last = [...h.lines].reverse().find((l) => l.oldNo !== undefined);
    prevEnd = (last?.oldNo ?? h.oldStart - 1) + 1;
    let inRun = false;
    for (const r of rowsOf(h)) {
      const start = r.changed && !inRun;
      inRun = r.changed;
      const cls = start ? ' class="cs"' : "";
      if (unified) {
        if (!r.changed) {
          html += adds;
          adds = "";
          html += `<tr data-src="${r.new!.src}"><td class="no">${r.old!.oldNo}</td><td class="no">${r.new!.newNo}</td><td class="code sign" data-sign=" ">${code(r.new!, undefined, colours)}${eol(r.new!)}</td></tr>`;
          continue;
        }
        if (r.old)
          html += `<tr data-src="${r.old.src}"${cls}><td class="no del">${r.old.oldNo}</td><td class="no del"></td><td class="code sign del" data-sign="−">${code(r.old, r.oldSpans, colours)}${eol(r.old)}</td></tr>`;
        if (r.new)
          adds += `<tr data-src="${r.new.src}"${r.old ? "" : cls}><td class="no add"></td><td class="no add">${r.new.newNo}</td><td class="code sign add" data-sign="+">${code(r.new, r.newSpans, colours)}${eol(r.new)}</td></tr>`;
        // Unified order is all removed, then all added; the pairing above interleaves them, which
        // reads the same for one-line changes and keeps words marked for longer blocks.
      } else {
        const src = Math.min(r.old?.src ?? Infinity, r.new?.src ?? Infinity);
        const o = r.old;
        const n = r.new;
        html +=
          `<tr data-src="${src}"${cls}>` +
          `<td class="no${r.changed && o ? " del" : ""}">${o?.oldNo ?? ""}</td>` +
          `<td class="code${r.changed ? (o ? " del" : " void") : ""}">${o ? code(o, r.oldSpans, colours) + eol(o) : ""}</td>` +
          `<td class="no${r.changed && n ? " add" : ""}">${n?.newNo ?? ""}</td>` +
          `<td class="code${r.changed ? (n ? " add" : " void") : ""}">${n ? code(n, r.newSpans, colours) + eol(n) : ""}</td></tr>`;
      }
    }
  }
  return html + adds + "</tbody></table>";
}

const STATUS = { modified: "M", added: "A", deleted: "D", renamed: "R", copied: "C" } as const;

/** Directory part dimmed, file name emphasised. */
function pathHtml(path: string, strip = ""): string {
  const shownPath = strip && path.startsWith(strip) ? path.slice(strip.length) : path;
  const at = shownPath.lastIndexOf("/");
  return at < 0 ? `<b>${esc(shownPath)}</b>` : `<i>${esc(shownPath.slice(0, at + 1))}</i><b>${esc(shownPath.slice(at + 1))}</b>`;
}

function fileBody(f: FileDiff): string {
  if (f.binary) return `<div class="note">Binary file – there is no text to compare.</div>`;
  if (f.hunks.length === 0) {
    return `<div class="note">${f.status === "renamed" ? "Renamed without changes." : f.status === "added" ? "Empty file added." : f.status === "deleted" ? "Empty file removed." : "No changes to the content."}</div>`;
  }
  return tableOf(f);
}

const lineCount = (f: FileDiff) => f.hunks.reduce((n, h) => n + h.lines.length, 0);

/** A folded generated or very long file says why, and opens on a click. */
function foldedBody(f: FileDiff): string {
  const kind = isGenerated(key(f)) ? "generated" : lineCount(f) > BIG ? "long" : "";
  return kind && !f.binary && f.hunks.length ? `<div class="note hint">${kind} · ${plural(lineCount(f), "line")} · <u>Show</u></div>` : "";
}

function fileHtml(f: FileDiff, index: number, forceOpen = false): string {
  const isCollapsed = !forceOpen && collapsed.has(key(f));
  const where =
    f.status === "renamed" || f.status === "copied"
      ? `${pathHtml(f.oldPath)} <span class="info">→</span> ${pathHtml(f.newPath)}`
      : pathHtml(f.status === "deleted" ? f.oldPath : f.newPath);
  const oldInfo = describeInfo(f.oldInfo);
  const newInfo = describeInfo(f.newInfo);
  const infos = [
    f.status === "renamed" && f.similarity !== undefined ? `${f.similarity}% similar` : "",
    f.modeChange ?? "",
    oldInfo && newInfo && f.status === "modified" ? `${oldInfo} → ${newInfo}` : "",
  ].filter(Boolean);
  return (
    `<section class="file${isCollapsed ? " collapsed" : ""}" data-i="${index}" data-src="${f.src}">` +
    `<header class="file-head"><span class="tw">▼</span><span class="st st-${f.status}">${STATUS[f.status]}</span>` +
    `<span class="path">${where}</span><span class="info">${esc(infos.join(" · "))}</span><span class="grow"></span>` +
    `<span class="cnt"><span class="a">+${f.added}</span> <span class="d">−${f.deleted}</span></span></header>` +
    `<div class="file-body">${isCollapsed ? foldedBody(f) : fileBody(f)}</div></section>`
  );
}

/** The squares next to the totals: how the change splits into added and removed. */
function bar(added: number, deleted: number): string {
  const total = added + deleted;
  if (total === 0) return "";
  const a = Math.round((added / total) * 5);
  return `<span class="bar" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i class="${i < a ? "a" : "d"}"></i>`).join("")}</span>`;
}

function authorHtml(author: string): string {
  const m = author.match(/^(.*?)\s*<([^>]*)>$/);
  return m && m[1] ? `<b>${esc(m[1].replace(/^"|"$/g, ""))}</b> <span>&lt;${esc(m[2])}&gt;</span>` : `<b>${esc(author)}</b>`;
}

function dateHtml(date: string): string {
  const t = Date.parse(date);
  return Number.isNaN(t) ? esc(date) : esc(new Date(t).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }));
}

const GENERATOR = { git: "Git", idea: "IntelliJ IDEA", svn: "Subversion", plain: "diff" } as const;

function metaHtml(p: Patch, name: string): string {
  const m = p.meta;
  const by = [m.author ? authorHtml(m.author) : "", m.date ? dateHtml(m.date) : "", m.commit ? `<code>${esc(m.commit.slice(0, 8))}</code>` : ""].filter(Boolean);
  const paragraphs = m.message === "" ? "" : m.message.split(/\n{2,}/).map((t) => `<p>${esc(t)}</p>`).join("");
  const long = m.message.split("\n").length > 7;
  return (
    `<section class="meta"><div class="meta-top">${m.tag ? `<span class="chip tag">${esc(m.tag)}</span>` : ""}` +
    `<span class="chip">${GENERATOR[m.generator]}</span></div>` +
    `<h1>${esc(m.subject ?? name)}</h1>` +
    (by.length ? `<div class="byline">${by.join('<span class="sep">·</span>')}</div>` : "") +
    (paragraphs ? `<div class="message${long ? " clamped" : ""}">${paragraphs}</div>${long ? `<button class="more">Show more</button>` : ""}` : "") +
    (m.trailers.length ? `<dl class="trailers">${m.trailers.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "") +
    `<div class="summary"><span>${plural(p.files.length, "file")} changed</span><span><span class="a">+${p.added}</span> <span class="d">−${p.deleted}</span></span>${bar(p.added, p.deleted)}</div></section>`
  );
}

function commonDir(paths: string[]): string {
  if (paths.length < 2) return "";
  const parts = paths[0].split("/").slice(0, -1);
  let n = parts.length;
  for (const p of paths) {
    const q = p.split("/");
    let i = 0;
    while (i < n && i < q.length - 1 && q[i] === parts[i]) i++;
    n = i;
  }
  return n > 0 ? parts.slice(0, n).join("/") + "/" : "";
}

/** How many marks a file has (a file without hunks counts once). */
function freshIn(f: FileDiff): number {
  const own = f.hunks.filter((h) => fresh.has(freshKey(key(f), h))).length;
  return own + (fresh.has(freshKey(key(f), null)) ? 1 : 0);
}

function listHtml(p: Patch): string {
  const strip = commonDir(p.files.map(key));
  const shown = visibleFiles(p.files, filter);
  const rows = shown
    .map((i) => {
      const f = p.files[i];
      const isFresh = freshIn(f) > 0;
      const sections = outline(f)
        .map((o) => `<a class="sec" data-i="${i}" data-src="${o.hunk.src}" title="${esc(o.section)}"><span class="nm"><bdi>${esc(o.section)}</bdi></span></a>`)
        .join("");
      return (
        `<a class="f" data-i="${i}"><span class="st st-${f.status}">${STATUS[f.status]}</span>` +
        `<span class="nm"><bdi>${pathHtml(key(f), strip)}</bdi></span>` +
        `<span class="cnt">${isFresh ? `<span class="dot" title="New since the last reload – click to clear"></span>` : ""}<span class="a">+${f.added}</span> <span class="d">−${f.deleted}</span></span></a>${sections}`
      );
    })
    .join("");
  return rows || `<div class="none">No file matches.</div>`;
}

/** The filter above the list is built once, so typing survives a reload of the patch. */
const listEl = document.createElement("div");
listEl.className = "fl-list";
const barEl = document.createElement("div");
barEl.className = "fl-bar";
barEl.innerHTML =
  `<input type="search" class="fl-q" placeholder="Filter files" aria-label="Filter files" spellcheck="false" autocomplete="off">` +
  `<div class="fl-chips">${CHIPS.map((c) => `<button type="button" class="chip" data-chip="${c.id}" aria-pressed="false">${c.label}</button>`).join("")}</div>` +
  `<label class="fl-sort">Sort <select aria-label="Sort files"><option value="folder">patch order</option><option value="size">size of change</option><option value="status">status</option></select></label>` +
  `<div class="fl-count"></div><button type="button" class="fl-fresh" hidden></button>`;
filesEl.append(barEl, listEl);
const queryEl = barEl.querySelector<HTMLInputElement>(".fl-q")!;
const sortEl = barEl.querySelector<HTMLSelectElement>("select")!;
sortEl.value = filter.sort;

function showList() {
  if (!patch) {
    listEl.innerHTML = "";
    return;
  }
  listEl.innerHTML = listHtml(patch);
  barEl.querySelectorAll<HTMLElement>(".chip").forEach((b) => b.setAttribute("aria-pressed", String(filter.chips.has(b.dataset.chip as Chip))));
  const n = visibleFiles(patch.files, filter).length;
  barEl.querySelector(".fl-count")!.textContent = n < patch.files.length ? `${n} of ${plural(patch.files.length, "file")}` : "";
  const marks = patch.files.reduce((sum, f) => sum + freshIn(f), 0);
  const clear = barEl.querySelector<HTMLButtonElement>(".fl-fresh")!;
  clear.hidden = marks === 0;
  clear.textContent = `${marks} new since the last reload · Clear`;
  spy();
}

queryEl.addEventListener("input", () => {
  filter.query = queryEl.value;
  showList();
});
sortEl.addEventListener("change", () => {
  filter.sort = sortEl.value as Sort;
  save("sort", filter.sort);
  showList();
});
barEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-chip]");
  if (!b) return;
  const id = b.dataset.chip as Chip;
  if (!filter.chips.delete(id)) filter.chips.add(id);
  showList();
});

// ---- showing -----------------------------------------------------------------------------

const fileName = (path: string) => path.split("/").pop() ?? path;

/** The place the view is at, as a hunk: the last hunk header above the top edge of the content. */
function anchorNow(): Anchor | null {
  if (!patch) return null;
  const edge = HEAD + 6;
  let best: { section: HTMLElement; row: HTMLElement } | null = null;
  content.querySelectorAll<HTMLElement>(".file:not(.collapsed)").forEach((section) => {
    section.querySelectorAll<HTMLElement>("tr.hunk").forEach((row) => {
      if (row.getBoundingClientRect().top <= edge) best = { section, row };
    });
  });
  if (!best) return null;
  const { section, row } = best as { section: HTMLElement; row: HTMLElement };
  const f = patch.files[Number(section.dataset.i)];
  return anchorOf(f, Number(row.dataset.h), row.getBoundingClientRect().top - edge);
}

/** Scrolls so that the anchor's hunk sits where it sat; false if it cannot be found. */
function restore(anchor: Anchor): boolean {
  const at = patch && findAnchor(patch, anchor);
  if (!at) return false;
  const row = content.querySelector<HTMLElement>(`.file[data-i="${at.file}"]:not(.collapsed) tr.hunk[data-h="${at.hunk}"]`);
  if (!row) return false;
  window.scrollTo(0, window.scrollY + row.getBoundingClientRect().top - (HEAD + 6) - anchor.offset);
  return true;
}

/** Marks the rows of the hunks that are new: the bar at the left, and (once) the flash. */
function applyFresh(section: HTMLElement) {
  if (!patch || fresh.size === 0) return;
  const f = patch.files[Number(section.dataset.i)];
  section.querySelectorAll<HTMLElement>("tr.hunk").forEach((head) => {
    const k = freshKey(key(f), f.hunks[Number(head.dataset.h)]);
    if (!fresh.has(k)) return;
    const now = flashing.has(k);
    for (let tr: Element | null = head; tr && (tr === head || !tr.matches(".hunk")); tr = tr.nextElementSibling) {
      tr.classList.add("fresh");
      if (now) tr.classList.add("now");
    }
  });
}

function clearFresh(file?: string) {
  for (const k of [...fresh]) if (!file || k.startsWith(`${file}\0`)) fresh.delete(k);
  content.querySelectorAll(".fresh").forEach((el) => el.classList.remove("fresh", "now"));
  showList();
  drawRuler();
}

function render() {
  if (!current) return;
  closeSearch();
  const before = patch;
  const anchor = anchorNow();
  const scroll = window.scrollY;
  patch = parsePatch(current.content);
  if (!patch) {
    showRaw();
    return;
  }
  const id = docKey(current.path, patch, docId);
  const reload = id === seen;
  if (!reload) {
    seen = id;
    fresh = new Set();
    collapsed.clear();
    jumps.clear();
    patch.files.forEach((f) => (isGenerated(key(f)) || lineCount(f) > BIG) && collapsed.add(key(f)));
    filter.query = "";
    filter.chips.clear();
    queryEl.value = "";
  }
  // A new version of the same document: what differs from the last one is marked, the rest of the
  // state (folded files, filter, place) stays.
  const marked = updateFresh(reload ? fresh : new Set(), reload ? before : null, patch);
  fresh = marked.keys;
  flashing = marked.now;
  content.innerHTML = metaHtml(patch, fileName(current.path)) + patch.files.map((f, i) => fileHtml(f, i)).join("");
  content.querySelectorAll<HTMLElement>(".file").forEach(applyFresh);
  flashing = new Set();
  showList();
  empty.hidden = true;
  layout.hidden = false;
  layout.classList.toggle("no-side", !sideOpen || patch.files.length < 2);
  $btn("side-btn").hidden = patch.files.length < 2;
  $btn("side-btn").setAttribute("aria-pressed", String(sideOpen));
  $btn("mode-btn").title = unified ? "Side by side view" : "Unified view";
  $btn("ws-btn").setAttribute("aria-pressed", String(ignoreWs));
  updateToolbar(current.content, `${plural(patch.files.length, "File")} · +${patch.added} −${patch.deleted}`);
  setExportContent(exportHtml);
  if (!reload) window.scrollTo(0, 0);
  else if (!anchor || !restore(anchor)) window.scrollTo(0, scroll);
  refreshSearch();
  spy();
  drawRuler();
}

/** Not a patch we understand: the text as it is, so nothing is hidden. */
function showRaw() {
  patch = null;
  content.innerHTML = `<section class="meta"><h1>${esc(fileName(current!.path))}</h1><div class="byline">This does not look like a unified diff, so it is shown as written.</div></section><pre class="plain" id="raw"></pre>`;
  document.getElementById("raw")!.textContent = current!.content;
  listEl.innerHTML = "";
  empty.hidden = true;
  layout.hidden = false;
  layout.classList.add("no-side");
  $btn("side-btn").hidden = true;
  updateToolbar(current!.content, plural(current!.content.split("\n").length, "Line"));
  setExportContent(exportHtml);
}

function showMessage(text: string, isError = false) {
  layout.hidden = true;
  $btn("side-btn").hidden = true;
  updateToolbar(null, "");
  closeSearch();
  empty.hidden = false;
  empty.textContent = text;
  empty.classList.toggle("error", isError);
}

/** `fromCaller`: handed over by the program that started Dirq, so its `--id` names this document. */
async function open(path: string, fromCaller = true) {
  try {
    current = await invoke<Doc>("open_file", { path });
    docId = fromCaller ? await launchDocId() : null;
    render();
    if (firstShown) {
      firstShown = false;
      // Room for two columns and the file list (--geometry wins; the backend knows).
      await invoke("fit_width", { width: unified ? 1080 : 1500 }).catch(() => {});
    }
    revealLaunchLine(reveal);
  } catch (err) {
    current = null;
    showMessage(`Datei konnte nicht gelesen werden:\n${err}`, true);
  }
}

// ---- interaction -------------------------------------------------------------------------

function toggleFile(section: HTMLElement) {
  if (!patch) return;
  const f = patch.files[Number(section.dataset.i)];
  const body = section.querySelector(".file-body")!;
  const open = section.classList.contains("collapsed");
  section.classList.toggle("collapsed", !open);
  if (open) {
    collapsed.delete(key(f));
    body.innerHTML = fileBody(f);
    applyFresh(section);
  } else {
    collapsed.add(key(f));
    body.innerHTML = foldedBody(f);
  }
  drawRuler();
}

content.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.matches(".more")) {
    const message = content.querySelector(".message")!;
    const open = message.classList.toggle("clamped");
    target.textContent = open ? "Show more" : "Show less";
    return;
  }
  const head = target.closest<HTMLElement>(".file-head");
  if (head && !getSelection()?.toString()) toggleFile(head.parentElement!);
  else if (target.closest(".hint")) toggleFile(target.closest<HTMLElement>(".file")!);
});

filesEl.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest(".fl-fresh")) return clearFresh();
  const a = t.closest<HTMLElement>("a[data-i]");
  if (!a) return;
  if (t.closest(".dot")) return clearFresh(patch ? key(patch.files[Number(a.dataset.i)]) : undefined);
  const section = content.querySelector<HTMLElement>(`.file[data-i="${a.dataset.i}"]`)!;
  if (section.classList.contains("collapsed")) toggleFile(section);
  // An entry of the outline points at a hunk, a file at its header. Near the end of the patch the
  // target cannot reach the top of the window: the flash shows which one it is.
  const hunk = a.dataset.src ? section.querySelector<HTMLElement>(`tr.hunk[data-src="${a.dataset.src}"]`) : null;
  const target = hunk ?? section.querySelector<HTMLElement>(".file-head")!;
  jumpTo(window.scrollY + target.getBoundingClientRect().top - (hunk ? HEAD + 4 : 41 + 4));
  flash(target);
});

function setUnified(yes: boolean) {
  unified = yes;
  save("mode", yes ? "unified" : "split");
  render();
}
$btn("mode-btn").addEventListener("click", () => setUnified(!unified));
$btn("ws-btn").addEventListener("click", () => {
  ignoreWs = !ignoreWs;
  save("ws", ignoreWs ? "1" : "0");
  render();
});
$btn("side-btn").addEventListener("click", () => {
  sideOpen = !sideOpen;
  save("side", sideOpen ? "1" : "0");
  render();
});

// ---- navigating the changes --------------------------------------------------------------

const changes = () => [...content.querySelectorAll<HTMLElement>("tr.cs")];

function jump(dir: 1 | -1) {
  const list = changes();
  if (!list.length) return;
  const edge = HEAD + 6;
  let target: HTMLElement | undefined;
  if (dir === 1) target = list.find((el) => el.getBoundingClientRect().top > edge + 8);
  else target = [...list].reverse().find((el) => el.getBoundingClientRect().top < edge - 8);
  target ??= dir === 1 ? list[0] : list[list.length - 1]; // round the corner
  const box = target.getBoundingClientRect();
  jumpTo(window.scrollY + box.top - edge - (window.innerHeight - edge) / 4);
  flash(target);
}

/** Alt+↓ / Alt+↑: the header of the next or previous file reaches the top. */
function jumpFile(dir: 1 | -1) {
  const edge = 41 + 4;
  const list = [...content.querySelectorAll<HTMLElement>(".file")];
  const target =
    dir === 1 ? list.find((s) => s.getBoundingClientRect().top > edge + 2) : [...list].reverse().find((s) => s.getBoundingClientRect().top < edge - 2);
  if (!target) return;
  jumpTo(window.scrollY + target.getBoundingClientRect().top - edge);
  flash(target.querySelector(".file-head")!);
}

function goBack(forward: boolean) {
  const at = Math.round(window.scrollY);
  const to = forward ? jumps.forward(at) : jumps.back(at);
  if (to !== undefined) window.scrollTo({ top: to });
}
$btn("next-btn").addEventListener("click", () => jump(1));
$btn("prev-btn").addEventListener("click", () => jump(-1));
onKeys({
  nextChange: () => jump(1),
  prevChange: () => jump(-1),
  nextSection: () => jumpFile(1),
  prevSection: () => jumpFile(-1),
  back: () => goBack(false),
  forward: () => goBack(true),
  toggleNav: () => {
    if (!$btn("side-btn").hidden) $btn("side-btn").click();
  },
  help: toggleHelp,
});
setKeyHelp([
  ["nextChange", "Next change"],
  ["prevChange", "Previous change"],
  ["nextSection", "Next file"],
  ["prevSection", "Previous file"],
  ["back", "Back to where the last jump started"],
  ["forward", "Forward again"],
  ["toggleNav", "Show or hide the file list"],
  ["search", "Search"],
]);
$btn("next-btn").title = withKey("Next change", "nextChange");
$btn("prev-btn").title = withKey("Previous change", "prevChange");
$btn("side-btn").title = withKey("Files", "toggleNav");

// ---- the ruler at the right edge ---------------------------------------------------------

/** What the marks on the ruler jump to; indexed by their `data-n`. */
let rulerTargets: HTMLElement[] = [];
const ruler = document.createElement("div");
ruler.id = "ruler";
ruler.setAttribute("aria-hidden", "true");
document.body.append(ruler);

/**
 * Like the overview strip of an IDE, beside the scroll bar: a thin tick for every change, a
 * stronger mark for what is new since the last reload. A click on a mark goes there.
 */
let rulerFrame = 0;
function drawRuler() {
  cancelAnimationFrame(rulerFrame);
  rulerFrame = requestAnimationFrame(() => {
    rulerTargets = [];
    if (!patch || layout.hidden) {
      ruler.innerHTML = "";
      return;
    }
    const total = document.documentElement.scrollHeight;
    const mark = (el: HTMLElement, cls: string) => {
      const at = ((el.getBoundingClientRect().top + window.scrollY) / total) * 100;
      rulerTargets.push(el);
      return `<i class="${cls}" data-n="${rulerTargets.length - 1}" style="top:${at.toFixed(3)}%"></i>`;
    };
    let html = "";
    content.querySelectorAll<HTMLElement>("tr.cs").forEach((tr) => (html += mark(tr, "tick")));
    // On top of the ticks, so a click on a new change finds the new mark.
    content.querySelectorAll<HTMLElement>("tr.hunk.fresh").forEach((tr) => (html += mark(tr, "new")));
    content.querySelectorAll<HTMLElement>(".file.collapsed").forEach((section) => {
      const f = patch!.files[Number(section.dataset.i)];
      if (freshIn(f) > 0) html += mark(section.querySelector<HTMLElement>(".file-head")!, "new");
    });
    ruler.innerHTML = html;
  });
}
ruler.addEventListener("click", (e) => {
  const n = (e.target as HTMLElement).closest<HTMLElement>("[data-n]")?.dataset.n;
  const target = n === undefined ? undefined : rulerTargets[Number(n)];
  if (!target) return;
  const edge = HEAD + 6;
  jumpTo(window.scrollY + target.getBoundingClientRect().top - edge - (window.innerHeight - edge) / 4);
  flash(target);
});
addEventListener("resize", drawRuler);

/** Which change and which file the view is at. */
let spyFrame = 0;
function spy() {
  cancelAnimationFrame(spyFrame);
  spyFrame = requestAnimationFrame(() => {
    const edge = HEAD + 6;
    const list = changes();
    const at = list.findIndex((el) => el.getBoundingClientRect().top >= edge - 8);
    document.getElementById("chg-count")!.textContent = list.length ? `${at < 0 ? list.length : at + 1} / ${list.length}` : "";
    let active = -1;
    content.querySelectorAll<HTMLElement>(".file").forEach((s, i) => {
      if (s.getBoundingClientRect().top <= edge) active = i;
    });
    listEl.querySelectorAll<HTMLElement>("a.f").forEach((a) => a.classList.toggle("active", Number(a.dataset.i) === Math.max(active, 0)));
  });
}
addEventListener("scroll", spy, { passive: true });

// ---- --line and export -------------------------------------------------------------------

/** Line n of the patch file: the row that shows it. */
function reveal(line: number) {
  if (!patch) {
    revealTextLine(content, line);
    return;
  }
  const at = patch.files.findIndex((f) => line >= f.src && line <= f.srcEnd);
  if (at < 0) return; // in the header: nothing to point at
  const section = content.querySelector<HTMLElement>(`.file[data-i="${at}"]`)!;
  if (section.classList.contains("collapsed")) toggleFile(section);
  let best: HTMLElement | null = null;
  section.querySelectorAll<HTMLElement>("tr[data-src]").forEach((tr) => {
    if (Number(tr.dataset.src) <= line) best = tr;
  });
  revealElement(best ?? section.querySelector(".file-head")!);
}
onRevealRequest(reveal);

/** One HTML file with the header and all files open, in the view as chosen. */
function exportHtml(): string {
  if (!patch || !current) return "";
  const css = [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((r) => r.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");
  const view = document.documentElement.dataset.view;
  const title = esc(patch.meta.subject ?? fileName(current.path));
  return (
    `<!doctype html>\n<html lang="en"${view ? ` data-view="${view}"` : ""}><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${css}</style></head>` +
    `<body class="export"><div class="layout no-side"><main id="content">${metaHtml(patch, fileName(current.path))}` +
    patch.files.map((f, i) => fileHtml(f, i, true)).join("") +
    `</main></div></body></html>\n`
  );
}

// ---- files -------------------------------------------------------------------------------

getCurrentWebview().onDragDropEvent((event) => {
  const p = event.payload;
  if (p.type === "enter" || p.type === "over") {
    document.body.classList.add("dragging");
    empty.textContent = DROP_HERE;
    empty.classList.remove("error");
    empty.hidden = false;
  } else {
    document.body.classList.remove("dragging");
    empty.hidden = current !== null;
    if (p.type === "drop" && p.paths[0]) open(p.paths[0], false);
  }
});

listen<Doc>("file-changed", ({ payload }) => {
  if (current && payload.path === current.path) {
    current = payload;
    render();
  }
});
listen<string>("open-file", ({ payload }) => open(payload));

openInitial(empty, open);
