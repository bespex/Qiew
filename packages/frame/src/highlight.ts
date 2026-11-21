/**
 * Syntax colours for source text that is shown line by line (a diff, a listing): highlight.js
 * colours the whole text, then the result is cut at the line ends so that every line is
 * balanced HTML of its own. Colours come from highlight.css, which maps the token classes onto
 * the colours of the four views. No DOM in here.
 */
import hljs from "highlight.js/lib/common";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import groovy from "highlight.js/lib/languages/groovy";
import nginx from "highlight.js/lib/languages/nginx";
import properties from "highlight.js/lib/languages/properties";
import protobuf from "highlight.js/lib/languages/protobuf";

hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("groovy", groovy);
hljs.registerLanguage("nginx", nginx);
hljs.registerLanguage("properties", properties);
hljs.registerLanguage("protobuf", protobuf);

/** Extensions highlight.js does not know as aliases. */
const EXTENSIONS: Record<string, string> = {
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  jsx: "javascript",
  toml: "ini",
  gradle: "groovy",
  jenkinsfile: "groovy",
  proto: "protobuf",
  csproj: "xml",
  pom: "xml",
  xsd: "xml",
  xsl: "xml",
  xslt: "xml",
  fxml: "xml",
  svg: "xml",
  vue: "xml",
  kts: "kotlin",
  sql: "sql",
};
const NAMES: Record<string, string> = {
  dockerfile: "dockerfile",
  containerfile: "dockerfile",
  makefile: "makefile",
  gnumakefile: "makefile",
  jenkinsfile: "groovy",
  "nginx.conf": "nginx",
  "cmakelists.txt": "cmake",
  ".bashrc": "bash",
  ".profile": "bash",
};
/** Known to highlight.js, but colouring them helps nobody (or confuses: a patch in a patch). */
const SKIP = new Set(["plaintext", "diff"]);

/** Alias (an extension, mostly) → the language's own name. */
const CANONICAL = new Map<string, string>();
for (const lang of hljs.listLanguages()) {
  CANONICAL.set(lang, lang);
  for (const alias of hljs.getLanguage(lang)?.aliases ?? []) if (!CANONICAL.has(alias)) CANONICAL.set(alias, lang);
}

/** The highlight.js language for a file path; undefined when it is unknown. */
export function languageOf(path: string): string | undefined {
  const name = path.toLowerCase().split("/").pop() ?? "";
  let lang = NAMES[name];
  if (!lang && /\.(docker|container)file$/.test(name)) lang = "dockerfile";
  if (!lang && name.startsWith("dockerfile.")) lang = "dockerfile";
  const dot = name.lastIndexOf(".");
  if (!lang && dot >= 0) {
    const ext = name.slice(dot + 1);
    lang = EXTENSIONS[ext] ?? ext;
  }
  const known = lang && CANONICAL.get(lang);
  return known && !SKIP.has(known) ? known : undefined;
}

/** Beyond this the text is shown without colours: highlight.js gets slow, and nobody reads it. */
const MAX_CHARS = 1_000_000;
const MAX_LINE = 5_000;

/**
 * The lines, coloured: one balanced HTML string per input line (escaped, spans closed at the
 * end of the line and opened again on the next). Null if the language is unknown or the text
 * too big; the caller then shows it plain.
 */
export function highlightLines(lines: readonly string[], language: string | undefined): string[] | null {
  if (!language || lines.length === 0) return null;
  let size = 0;
  for (const l of lines) {
    if (l.length > MAX_LINE) return null;
    size += l.length + 1;
  }
  if (size > MAX_CHARS) return null;
  try {
    const html = hljs.highlight(lines.join("\n"), { language, ignoreIllegals: true }).value;
    const out = splitLines(html);
    return out.length === lines.length ? out : null;
  } catch {
    return null;
  }
}

const TAG = /<(\/?)span([^>]*)>/g;

/** highlight.js output cut at the line ends; every line closes what it opened and reopens it on the next. */
export function splitLines(html: string): string[] {
  const out: string[] = [];
  const open: string[] = []; // opening tags in effect
  let line = "";
  let at = 0;
  const text = (s: string) => {
    const parts = s.split("\n");
    line += parts[0];
    for (let i = 1; i < parts.length; i++) {
      out.push(line + "</span>".repeat(open.length));
      line = open.join("") + parts[i];
    }
  };
  for (const m of html.matchAll(TAG)) {
    text(html.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[1]) open.pop();
    else open.push(m[0]);
    line += m[0];
  }
  text(html.slice(at));
  out.push(line + "</span>".repeat(open.length));
  return out;
}

/**
 * Coloured line HTML with character ranges of the plain text wrapped in `<span class="cls">`
 * (the changed words of a diff). The mark is closed before every tag and opened again after
 * it, so the nesting stays valid; an entity counts as one character.
 */
export function markRanges(html: string, ranges: readonly { from: number; to: number }[], cls: string): string {
  if (ranges.length === 0) return html;
  let out = "";
  let pos = 0; // in the plain text
  let r = 0; // current range
  let inMark = false;
  const close = () => {
    if (inMark) out += "</span>";
    inMark = false;
  };
  for (let i = 0; i < html.length; ) {
    const c = html[i];
    if (c === "<") {
      const end = html.indexOf(">", i) + 1;
      close();
      out += html.slice(i, end);
      i = end;
      continue;
    }
    const unit = c === "&" ? html.slice(i, html.indexOf(";", i) + 1) : c;
    while (r < ranges.length && ranges[r].to <= pos) r++;
    const want = r < ranges.length && ranges[r].from <= pos;
    if (want && !inMark) {
      out += `<span class="${cls}">`;
      inMark = true;
    } else if (!want) close();
    out += unit;
    i += unit.length;
    pos++;
  }
  close();
  return out;
}
