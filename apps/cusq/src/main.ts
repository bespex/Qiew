/*
 * Cusq – a CSV or TSV file as a tidy table: sortable and filterable columns and a full text
 * search over all cells. Only the rows in view exist in the DOM, so large files stay quick.
 * Toolbar, colour schemes and the About box come from the frame.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import "./styles.css";
import { setApp } from "@qiew/frame/app";
import { setExportContent } from "@qiew/frame/export";
import { plural } from "@qiew/frame/fragment";
import { onRevealRequest, revealLaunchLine } from "@qiew/frame/launch";
import { openInitial } from "@qiew/frame/reveal";
import { initToolbar, updateToolbar } from "@qiew/frame/toolbar";
import { DELIMITER_NAMES, type Delimiter, type Kind, compare, dateFormat, filterOf, kindOf, numberFormat, read, toCsv } from "./table";

setApp("cusq");
initToolbar();

interface Doc {
  path: string;
  content: string;
}

const ROW = 27; // px: the height of a row, and of every row unless cells wrap
const LINE = 18; // px: a line of text in a wrapping cell (styles.css: body.wrap)
const NUM = 56; // px: the column of row numbers
const MIN_WIDTH = 48; // px: no column gets narrower
const OVERSCAN = 12;
const DROP_HERE = "Drop CSV or TSV File Here";

const empty = document.getElementById("empty")!;
const grid = document.getElementById("grid")!;
const headerBtn = document.getElementById("header-btn")!;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const searchBox = document.getElementById("search")!;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const searchCount = document.getElementById("search-count")!;
const searchBtn = document.getElementById("search-btn")!;
const wrapBtn = document.getElementById("wrap-btn")!;
const fitBtn = document.getElementById("fit-btn")!;
const fullBtn = document.getElementById("full-btn")!;

let current: Doc | null = null;
let delimiter: Delimiter = ",";
let comments: string[] = []; // lines before the table that start with #
let hasHeader = true;
let names: string[] = [];
let body: string[][] = [];
let columns = 0;
let kinds: Kind[] = [];
let shown: (((v: string) => string) | null)[] = []; // how a column's values are displayed, if not as written
let widths: number[] = [];
/**
 * How the widths come about: estimated and capped (auto), shared out over the window (window),
 * each as wide as its content (content), or dragged by the user (manual).
 */
let widthMode: "auto" | "window" | "content" | "manual" = "auto";
let wrap = false; // long cells break into lines; rows then differ in height
let heights = new Float32Array(0); // by index into `body`, while wrapping: measured or estimated, 0 = not yet
let tops = new Float64Array(1); // while wrapping: tops[v] = top of view row v, tops[view.length] = all rows

let sort: { col: number; desc: boolean } | null = null;
let filterText: string[] = [];
let query = "";
let view: number[] = []; // indices into `body`, in display order
let selected = -1; // index into `body`
let marked = -1; // row to show as the --line target
let tbody: HTMLTableSectionElement | null = null;

// ---- data --------------------------------------------------------------------------------

const letters = (i: number) => {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

/** Reads the document; true if sorting, filters and the selection could stay. */
function load(doc: Doc, keepState: boolean): boolean {
  const before = { columns, hasHeader };
  const name = doc.path.split("/").pop() ?? "";
  const sheet = read(doc.content, name);
  delimiter = sheet.delimiter;
  comments = sheet.comments;
  const rows = sheet.rows;
  columns = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const padded = rows.map((r) => (r.length < columns ? [...r, ...Array<string>(columns - r.length).fill("")] : r));
  names = hasHeader && padded.length > 0 ? padded[0] : Array.from({ length: columns }, (_, i) => letters(i));
  body = hasHeader ? padded.slice(1) : padded;

  kinds = Array.from({ length: columns }, (_, c) => kindOf(body.map((r) => r[c])));
  shown = kinds.map((k, c) => {
    const values = body.map((r) => r[c]);
    return k === "number" ? numberFormat(values, names[c]) : k === "date" ? dateFormat(values) : null;
  });
  const kept = keepState && before.columns === columns && before.hasHeader === hasHeader;
  if (!kept) {
    sort = null;
    filterText = Array<string>(columns).fill("");
    selected = -1;
  }
  return kept;
}

// ---- column widths -----------------------------------------------------------------------

const display = (c: number, v: string) => (shown[c] && v !== "" ? shown[c]!(v) : v);

/** The first guess: from the first rows' lengths, between 72 and 380 px. */
function autoWidths(): number[] {
  return Array.from({ length: columns }, (_, c) => {
    let chars = names[c].length + 3;
    for (const r of body.slice(0, 300)) chars = Math.max(chars, display(c, r[c]).length);
    return Math.min(380, Math.max(72, Math.round(chars * 7.3 + 26)));
  });
}

const measure = document.createElement("canvas").getContext("2d")!;

/**
 * The width each column needs to show its longest value on one line (while wrapping: its
 * longest line). Measured in the table's font on the longest values by characters, so it
 * stays quick for large files.
 */
let needed: number[] | null = null; // contentWidths() of all columns, until data or wrapping change

function contentWidths(only?: number): number[] {
  if (only === undefined && needed) return [...needed];
  const style = getComputedStyle(grid);
  const font = `${style.fontSize} ${style.fontFamily}`;
  const lines = (s: string) => (wrap ? s.split(/\r?\n/) : [s.replace(/\r?\n/g, " ")]);
  const out = Array.from({ length: columns }, (_, c) => {
    if (only !== undefined && c !== only) return widths[c];
    const longest: string[] = [];
    for (const r of body) {
      const v = r[c];
      if (longest.length < 30) longest.push(v);
      else if (v.length > longest[29].length) longest[29] = v;
      else continue;
      longest.sort((a, b) => b.length - a.length);
    }
    measure.font = `600 ${font}`;
    let w = measure.measureText(names[c]).width + 14; // and the sort arrow
    measure.font = font;
    for (const v of longest) for (const l of lines(display(c, v))) w = Math.max(w, measure.measureText(l).width);
    return Math.max(MIN_WIDTH, Math.ceil(w + 24));
  });
  if (only === undefined) needed = [...out];
  return out;
}

let fittedFor = 0; // the width the columns were last shared out over
let fittedBefore = 0; // and the one before, so a scroll bar that comes and goes does not loop

/**
 * Shares the window's width out among the columns: one that needs less than an equal share
 * gets what it needs, the others split what is left. Room to spare goes to all in proportion.
 */
function windowWidths(): number[] {
  const need = contentWidths();
  const room = Math.max(grid.clientWidth - NUM, columns * MIN_WIDTH);
  fittedBefore = fittedFor;
  fittedFor = grid.clientWidth;
  const out = Array<number>(columns).fill(0);
  let left = room;
  let count = columns;
  for (const c of need.map((_, c) => c).sort((a, b) => need[a] - need[b])) {
    out[c] = Math.max(MIN_WIDTH, Math.floor(Math.min(need[c], left / count)));
    left -= out[c];
    count--;
  }
  if (left > 0) {
    const sum = out.reduce((a, b) => a + b, 0);
    for (let c = 0; c < columns; c++) out[c] += Math.floor((left * out[c]) / sum);
  }
  out[columns - 1] += Math.max(0, room - out.reduce((a, b) => a + b, 0));
  return out;
}

function computeWidths(kept: boolean) {
  if (widthMode === "manual" && kept && widths.length === columns) return;
  if (widthMode === "manual") widthMode = "auto";
  widths = widthMode === "window" ? windowWidths() : widthMode === "content" ? contentWidths() : autoWidths();
  showWidthMode();
}

function showWidthMode() {
  fitBtn.setAttribute("aria-pressed", String(widthMode === "window"));
  fullBtn.setAttribute("aria-pressed", String(widthMode === "content"));
}

/** Puts the widths into the table that is there, without building it again. */
function applyWidths() {
  const table = grid.querySelector<HTMLElement>("table");
  if (!table) return;
  const cols = table.querySelectorAll<HTMLElement>("col");
  widths.forEach((w, c) => (cols[c + 1].style.width = `${w}px`));
  table.style.width = `${NUM + widths.reduce((a, b) => a + b, 0)}px`;
  resetHeights();
  redraw();
}

function setWidthMode(mode: typeof widthMode) {
  widthMode = widthMode === mode ? "auto" : mode;
  computeWidths(true);
  applyWidths();
}

// ---- row heights (while wrapping) --------------------------------------------------------

function resetHeights() {
  heights = new Float32Array(wrap ? body.length : 0);
  layoutRows();
}

/** A row's height before it was drawn: lines from length and column width, at most a screen. */
function estimate(row: string[]): number {
  let lines = 1;
  for (let c = 0; c < columns; c++) {
    const v = row[c];
    if (v.length * 7.3 < widths[c] - 20 && !v.includes("\n")) continue;
    const perLine = Math.max(1, Math.floor((widths[c] - 20) / 7.3));
    let n = 0;
    for (const l of display(c, v).split("\n")) n += Math.max(1, Math.ceil(l.length / perLine));
    lines = Math.max(lines, n);
  }
  return Math.min(Math.max(ROW, lines * LINE + 9), 4000);
}

function layoutRows() {
  if (!wrap) return;
  tops = new Float64Array(view.length + 1);
  for (let v = 0; v < view.length; v++) {
    const i = view[v];
    if (!heights[i]) heights[i] = estimate(body[i]);
    tops[v + 1] = tops[v] + heights[i];
  }
}

const rowTop = (v: number) => (wrap ? tops[v] : v * ROW);

/** The view row at a height in the table body. */
function rowAt(y: number): number {
  if (!wrap) return Math.floor(y / ROW);
  let lo = 0;
  let hi = view.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid + 1] <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function applyView() {
  const tests = filterText.map((t, c) => filterOf(t, kinds[c]));
  const active = tests
    .map((t, c) => [t, c] as const)
    .filter((x): x is readonly [(v: string) => boolean, number] => typeof x[0] === "function");
  const needle = query.toLowerCase();
  let indices: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const row = body[i];
    if (active.some(([test, c]) => !test(row[c]))) continue;
    if (needle && !row.some((v) => v.toLowerCase().includes(needle))) continue;
    indices.push(i);
  }
  if (sort) {
    const { col, desc } = sort;
    indices = indices.map((i) => [i, body[i][col]] as const).sort((a, b) => compare(a[1], b[1], desc, kinds[col]) || a[0] - b[0]).map((x) => x[0]);
  }
  view = indices;
  layoutRows();
  // Invalid filters are marked, not applied.
  grid.querySelectorAll<HTMLInputElement>("tr.filters input").forEach((input, c) => {
    input.classList.toggle("bad", tests[c] === null);
  });
  clearBtn.disabled = !(sort || query || filterText.some((t) => t.trim() !== ""));
  searchCount.textContent = query ? `${plural(view.length, "row")}` : "";
  searchBox.classList.toggle("no-results", query !== "" && view.length === 0);
  stats();
}

function stats() {
  if (!current) return;
  const rows = view.length === body.length ? plural(body.length, "Row") : `${new Intl.NumberFormat().format(view.length)} of ${plural(body.length, "Row")}`;
  const note = comments.length > 0 ? ` · ${plural(comments.length, "comment line")}` : "";
  updateToolbar(current.content, `${rows} · ${plural(columns, "Column")} · ${DELIMITER_NAMES[delimiter]}${note}`);
}

// ---- drawing -----------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function mark(value: string): string {
  if (!query) return esc(value);
  const lower = value.toLowerCase();
  const needle = query.toLowerCase();
  let out = "";
  let from = 0;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    out += `${esc(value.slice(from, at))}<mark>${esc(value.slice(at, at + needle.length))}</mark>`;
    from = at + needle.length;
  }
  return out + esc(value.slice(from));
}

/** Builds the table's head (names and filters); the rows come from `draw`. */
function build() {
  const arrow = (c: number) => (sort?.col === c ? (sort.desc ? "▼" : "▲") : "");
  const cols = `<colgroup><col style="width:${NUM}px">${widths.map((w) => `<col style="width:${w}px">`).join("")}</colgroup>`;
  const grip = '<span class="grip" title="Drag to change the width, double-click to fit the content"></span>';
  const head =
    `<thead><tr class="names"><th class="n">#</th>${names
      .map((n, c) => `<th data-col="${c}" class="${kinds[c] === "number" ? "num" : ""}"><span class="arrow">${arrow(c)}</span>${esc(n)}${grip}</th>`)
      .join("")}</tr>` +
    `<tr class="filters"><th class="n"></th>${names
      .map((_, c) => `<th><input data-col="${c}" value="${esc(filterText[c])}" placeholder="Filter" spellcheck="false" autocomplete="off" aria-label="Filter column ${c + 1}"></input></th>`)
      .join("")}</tr></thead>`;
  const total = NUM + widths.reduce((a, b) => a + b, 0);
  grid.innerHTML = `<table style="width:${total}px">${cols}${head}<tbody></tbody></table>`;
  tbody = grid.querySelector("tbody");
}

function draw() {
  if (!tbody) return;
  if (widthMode === "window" && grid.clientWidth !== fittedFor && grid.clientWidth !== fittedBefore) {
    widths = windowWidths(); // the window or its scroll bar changed: share out again
    applyWidths();
  }
  const top = grid.scrollTop;
  const first = Math.max(0, rowAt(top) - OVERSCAN);
  const last = Math.min(view.length, rowAt(top + grid.clientHeight) + 1 + OVERSCAN);
  let html = `<tr class="spacer"><td colspan="${columns + 1}" style="height:${rowTop(first)}px"></td></tr>`;
  for (let v = first; v < last; v++) {
    const i = view[v];
    const row = body[i];
    const cls = [i === selected ? "sel" : "", i === marked ? "launch-line" : ""].filter(Boolean).join(" ");
    html += `<tr data-i="${i}"${cls ? ` class="${cls}"` : ""}><td class="n">${i + 1}</td>`;
    for (let c = 0; c < columns; c++) {
      const text = shown[c] && row[c] !== "" ? shown[c]!(row[c]) : null;
      html += `<td${kinds[c] === "number" ? ' class="num"' : ""}>${text !== null && text !== row[c] ? esc(text) : mark(row[c])}</td>`;
    }
    html += "</tr>";
  }
  html += `<tr class="spacer"><td colspan="${columns + 1}" style="height:${rowTop(view.length) - rowTop(last)}px"></td></tr>`;
  tbody.innerHTML = html;
  if (wrap) settle(first, last, top);
}

/**
 * While wrapping: takes the real heights of the rows just drawn. If guesses were off, the rows
 * are laid out again and the row at the top of the window stays where it was on screen.
 */
function settle(first: number, last: number, top: number) {
  const rows = tbody!.rows;
  let changed = false;
  for (let v = first; v < last; v++) {
    const h = rows[v - first + 1].offsetHeight;
    if (h > 0 && h !== heights[view[v]]) {
      heights[view[v]] = h;
      changed = true;
    }
  }
  if (!changed) return;
  const anchor = rowAt(top);
  const offset = top - tops[anchor];
  layoutRows();
  (rows[0].cells[0] as HTMLElement).style.height = `${tops[first]}px`;
  (rows[rows.length - 1].cells[0] as HTMLElement).style.height = `${tops[view.length] - tops[last]}px`;
  if (Math.abs(grid.scrollTop - (tops[anchor] + offset)) >= 1) grid.scrollTop = tops[anchor] + offset;
}

let frame = 0;
const redraw = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
};
grid.addEventListener("scroll", redraw, { passive: true });
addEventListener("resize", redraw);

function refresh(resetScroll = false) {
  applyView();
  if (resetScroll) grid.scrollTop = 0;
  draw();
}

function render(keepState: boolean) {
  if (!current) return;
  const scroll = keepState ? grid.scrollTop : 0;
  const kept = load(current, keepState);
  empty.hidden = true;
  grid.hidden = false;
  needed = null;
  computeWidths(kept);
  heights = new Float32Array(wrap ? body.length : 0);
  build();
  applyView();
  grid.scrollTop = scroll;
  draw();
  setExportContent(() => toCsv([...(hasHeader ? [names] : []), ...view.map((i) => body[i])], delimiter === ";" ? ";" : ","));
}

function showMessage(text: string, isError = false) {
  grid.hidden = true;
  updateToolbar(null, "");
  empty.hidden = false;
  empty.textContent = text;
  empty.classList.toggle("error", isError);
}

// ---- interaction -------------------------------------------------------------------------

// Dragging a column's right edge changes its width; a double-click there fits it to its content.
grid.addEventListener("pointerdown", (e) => {
  const grip = (e.target as HTMLElement).closest<HTMLElement>(".grip");
  if (!grip || e.button !== 0) return;
  e.preventDefault();
  const col = Number(grip.parentElement!.dataset.col);
  const startX = e.clientX;
  const startW = widths[col];
  grip.setPointerCapture(e.pointerId);
  document.body.classList.add("resizing");
  const move = (m: PointerEvent) => {
    const w = Math.max(MIN_WIDTH, Math.round(startW + m.clientX - startX));
    if (w === widths[col]) return;
    widths[col] = w;
    if (widthMode !== "manual") {
      widthMode = "manual";
      showWidthMode();
    }
    applyWidths();
  };
  const up = () => {
    grip.removeEventListener("pointermove", move);
    grip.removeEventListener("pointerup", up);
    grip.removeEventListener("pointercancel", up);
    document.body.classList.remove("resizing");
  };
  grip.addEventListener("pointermove", move);
  grip.addEventListener("pointerup", up);
  grip.addEventListener("pointercancel", up);
});

grid.addEventListener("dblclick", (e) => {
  const grip = (e.target as HTMLElement).closest<HTMLElement>(".grip");
  if (!grip) return;
  const col = Number(grip.parentElement!.dataset.col);
  widths[col] = contentWidths(col)[col];
  widthMode = "manual";
  showWidthMode();
  applyWidths();
});

fitBtn.addEventListener("click", () => setWidthMode("window"));
fullBtn.addEventListener("click", () => setWidthMode("content"));

wrapBtn.addEventListener("click", () => {
  // Which row is at the top stays at the top.
  const at = view.length ? view[Math.min(rowAt(grid.scrollTop), view.length - 1)] : -1;
  wrap = !wrap;
  wrapBtn.setAttribute("aria-pressed", String(wrap));
  document.body.classList.toggle("wrap", wrap);
  needed = null;
  if (widthMode === "window" || widthMode === "content") computeWidths(true);
  applyWidths();
  const v = view.indexOf(at);
  if (v >= 0) grid.scrollTop = rowTop(v);
  draw();
});

grid.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest(".grip")) return; // a width was changed, not the sort order
  const th = target.closest<HTMLElement>("tr.names th[data-col]");
  if (th) {
    const col = Number(th.dataset.col);
    // ascending, descending, back to file order
    sort = sort?.col !== col ? { col, desc: false } : sort.desc ? null : { col, desc: true };
    build();
    refresh(true);
    return;
  }
  const tr = target.closest<HTMLElement>("tbody tr[data-i]");
  if (tr) {
    const i = Number(tr.dataset.i);
    selected = selected === i ? -1 : i;
    draw();
  }
});

// A cell that does not fit shows its whole content as a tooltip – only then, since a tooltip
// lies over the rows below it.
grid.addEventListener("mouseover", (e) => {
  const cell = (e.target as HTMLElement).closest<HTMLElement>("tbody td:not(.n), tr.names th[data-col]");
  if (!cell) return;
  if (cell.scrollWidth > cell.clientWidth) cell.title = cell.textContent ?? "";
  else cell.removeAttribute("title");
});

grid.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  if (!input.matches("tr.filters input")) return;
  filterText[Number(input.dataset.col)] = input.value;
  clearTimeout(filterTimer);
  filterTimer = window.setTimeout(() => refresh(true), 120);
});
let filterTimer: number | undefined;

clearBtn.addEventListener("click", () => {
  sort = null;
  filterText = Array<string>(columns).fill("");
  query = "";
  searchInput.value = "";
  build();
  refresh(true);
});

headerBtn.addEventListener("click", () => {
  hasHeader = !hasHeader;
  headerBtn.setAttribute("aria-pressed", String(hasHeader));
  render(false);
});

function openSearch() {
  if (!current) return;
  searchBox.hidden = false;
  document.body.classList.add("searching");
  searchInput.focus();
  searchInput.select();
}

function closeSearch() {
  if (searchBox.hidden) return;
  searchBox.hidden = true;
  document.body.classList.remove("searching");
  if (query) {
    query = "";
    searchInput.value = "";
    refresh(true);
  }
}

let searchTimer: number | undefined;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    query = searchInput.value;
    refresh(true);
  }, 120);
});
searchBtn.addEventListener("click", () => (searchBox.hidden ? openSearch() : closeSearch()));
document.getElementById("search-close")!.addEventListener("click", closeSearch);
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    openSearch();
  } else if (e.key === "Escape" && !searchBox.hidden) {
    e.preventDefault();
    closeSearch();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selected >= 0 && !getSelection()?.toString()) {
    const inField = document.activeElement instanceof HTMLInputElement;
    if (!inField) {
      e.preventDefault();
      writeText(body[selected].join("\t")).catch(() => {});
    }
  }
});

// ---- opening -----------------------------------------------------------------------------

function reveal(line: number) {
  const record = line - 1 - comments.length - (hasHeader ? 1 : 0);
  const at = view.indexOf(record);
  if (at < 0) return;
  marked = record;
  grid.scrollTop = Math.max(0, rowTop(at) - grid.clientHeight / 4);
  draw();
  setTimeout(() => {
    marked = -1;
    draw();
  }, 2200);
}
onRevealRequest(reveal);

/** Widens the window to the table (unless --geometry says otherwise; the backend knows). */
async function fitWindowToTable() {
  const width = NUM + widths.reduce((a, b) => a + b, 0) + 18;
  await invoke("fit_width", { width: Math.max(width, 480) }).catch(() => {});
}

async function open(path: string) {
  try {
    current = await invoke<Doc>("open_file", { path });
    if (current.content.trim() === "") {
      showMessage("Die Datei ist leer.");
      return;
    }
    render(false);
    if (widthMode !== "window") await fitWindowToTable();
    revealLaunchLine(reveal);
  } catch (err) {
    current = null;
    showMessage(`Datei konnte nicht gelesen werden:\n${err}`, true);
  }
}

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
    if (p.type === "drop" && p.paths[0]) open(p.paths[0]);
  }
});

listen<Doc>("file-changed", ({ payload }) => {
  if (current && payload.path === current.path) {
    current = payload;
    render(true);
  }
});
listen<string>("open-file", ({ payload }) => open(payload));

openInitial(empty, open);
