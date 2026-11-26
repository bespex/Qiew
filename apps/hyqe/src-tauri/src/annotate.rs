//! Comments on the elements of the page, kept as HTML comments in the file itself:
//!
//! ```html
//!     <!-- @ai: Make this button stand out more. -->
//!     <button class="buy">Buy</button>
//! ```
//!
//! A comment belongs to the element whose start tag follows it (only blanks and other comments in
//! between). Hyqe writes only with `--annotate` (the frame's [`may_annotate`]), and only comment
//! text: everything else in the file stays byte for byte (apps/hyqe/KOMMENTARE.md, "Zusicherungen").
//!
//! The page and the file meet through offsets: when the shown file is served, every start tag gets
//! `data-hyqe-at="<offset>"` ([`anchor`]), the byte offset of its `<` in the file's text (UTF-8,
//! without BOM). The page says which element was meant by that number; here it becomes a place in
//! the text again. If the file changed since the page was served, the start tag is found again by
//! its text, and only a single match counts (Z6).
//!
//! Before anything is written the page is parsed twice, before and after, the way a browser does
//! (html5ever via dom_query): without comments, and with runs of white space counted as one blank
//! outside `<pre>`, both trees must be the same (H1, [`checked`]). Otherwise nothing is written.

use std::fs;
use std::path::{Path, PathBuf};

use dom_query::{Document, NodeData, NodeRef};
use qiew_frame::launch::may_annotate;
use serde::Serialize;

/// The comment types, as in Marq (apps/marq/src/annotate.ts, `COMMENT_TYPE_INFO`).
pub const KINDS: &[&str] = &["ai", "me", "you"];
/// The states a comment can have besides open: `@ai#erledigt`.
pub const STATUSES: &[&str] = &["erledigt"];

/// Elements whose content is text to the parser: no tags, no comments inside.
const RAW: &[&str] = &["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext"];
/// Elements that take no comment: the document's frame and what is not shown.
const NOT_COMMENTABLE: &[&str] = &[
    "html", "head", "body", "title", "meta", "link", "base", "script", "style", "noscript", "template",
];
/// Where white space is kept as written: the H1 comparison takes it exactly there.
const PRE: &[&str] = &["pre", "textarea", "listing", "plaintext", "script", "style", "xmp"];

// ---- Reading the source -------------------------------------------------------------------------

/// A start tag in the source: `<` at `at`, the name ends at `name_end`, the tag at `end`.
#[derive(Debug, Clone, PartialEq)]
pub struct Tag {
    pub at: usize,
    pub name: String,
    pub name_end: usize,
    pub end: usize,
}

/// A comment in the source, from `<!--` at `at` to after `-->` at `end`.
#[derive(Debug, Clone, PartialEq)]
struct RawComment {
    at: usize,
    end: usize,
}

struct Scan {
    tags: Vec<Tag>,
    comments: Vec<RawComment>,
}

fn starts_with_ci(s: &[u8], at: usize, what: &str) -> bool {
    s.len() >= at + what.len() && s[at..at + what.len()].eq_ignore_ascii_case(what.as_bytes())
}

fn find(s: &[u8], from: usize, what: &[u8]) -> Option<usize> {
    if from > s.len() {
        return None;
    }
    s[from..].windows(what.len()).position(|w| w == what).map(|i| from + i)
}

/// The end of a raw text element's content: the next `</name` followed by a blank, `/` or `>`.
fn raw_end(s: &[u8], from: usize, name: &str) -> usize {
    let mut i = from;
    while let Some(lt) = find(s, i, b"</") {
        let after = lt + 2 + name.len();
        if starts_with_ci(s, lt + 2, name) && s.get(after).is_none_or(|c| c.is_ascii_whitespace() || *c == b'/' || *c == b'>') {
            return lt;
        }
        i = lt + 2;
    }
    s.len()
}

/// The start tags and comments of `src`, the way the HTML tokenizer sees them (well enough for
/// finding places: names, attribute values in quotes, raw text elements, comments).
fn scan(src: &str) -> Scan {
    let s = src.as_bytes();
    let mut tags = Vec::new();
    let mut comments = Vec::new();
    let mut i = 0;
    while let Some(lt) = find(s, i, b"<") {
        if s[lt..].starts_with(b"<!--") {
            // `<!-->` and `<!--->` end at once (abrupt closing of an empty comment)
            let end = if s[lt + 4..].starts_with(b">") {
                lt + 5
            } else if s[lt + 4..].starts_with(b"->") {
                lt + 6
            } else {
                find(s, lt + 4, b"-->").map_or(s.len(), |e| e + 3)
            };
            comments.push(RawComment { at: lt, end });
            i = end;
        } else if s.get(lt + 1).is_some_and(|c| *c == b'!' || *c == b'?' || *c == b'/') {
            i = find(s, lt + 1, b">").map_or(s.len(), |e| e + 1);
        } else if s.get(lt + 1).is_some_and(u8::is_ascii_alphabetic) {
            let mut j = lt + 1;
            while j < s.len() && !s[j].is_ascii_whitespace() && s[j] != b'/' && s[j] != b'>' {
                j += 1;
            }
            let name = src[lt + 1..j].to_ascii_lowercase();
            let name_end = j;
            // attributes: a value in quotes may hold `>`
            let mut quote = None;
            while j < s.len() {
                match (quote, s[j]) {
                    (Some(q), c) if c == q => quote = None,
                    (Some(_), _) => {}
                    (None, b'"' | b'\'') if attr_value_follows(s, j) => quote = Some(s[j]),
                    (None, b'>') => break,
                    _ => {}
                }
                j += 1;
            }
            let end = (j + 1).min(s.len());
            i = if RAW.contains(&name.as_str()) {
                if name == "plaintext" { s.len() } else { raw_end(s, end, &name) }
            } else {
                end
            };
            tags.push(Tag { at: lt, name, name_end, end });
        } else {
            i = lt + 1;
        }
    }
    Scan { tags, comments }
}

/// Whether the quote at `j` opens an attribute value: `=` before it (maybe with blanks between).
fn attr_value_follows(s: &[u8], j: usize) -> bool {
    s[..j].iter().rev().find(|c| !c.is_ascii_whitespace()) == Some(&b'=')
}

/// The start tags of `src`.
pub fn start_tags(src: &str) -> Vec<Tag> {
    scan(src).tags
}

/// The page as served: every start tag gets `data-hyqe-at="<offset>"` right after its name.
pub fn anchor(src: &str) -> String {
    let tags = start_tags(src);
    let mut out = String::with_capacity(src.len() + tags.len() * 24);
    let mut last = 0;
    for t in &tags {
        out.push_str(&src[last..t.name_end]);
        out.push_str(&format!(" data-hyqe-at=\"{}\"", t.at));
        last = t.name_end;
    }
    out.push_str(&src[last..]);
    out
}

// ---- The comments of the page -------------------------------------------------------------------

/// A comment of a known type, as the frontend shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Comment {
    /// Where `<!--` stands; the comment's id.
    pub at: usize,
    pub kind: String,
    /// None: open. An unknown word after `#` is no status.
    pub status: Option<String>,
    pub text: String,
    /// The start tag of the element it belongs to; None if none follows it.
    pub target: Option<usize>,
    /// For a comment without element: the start tag before it, to show it there.
    pub near: Option<usize>,
}

struct Parsed {
    kind: String,
    /// The word after `#`, known or not.
    word: Option<String>,
    text: String,
    /// The head as written ends here (offset in the comment): `<!-- @ai#erledigt`.
    head_end: usize,
}

/// Reads `<!-- @kind[#status][:] text -->`; None for any other comment.
fn parse_comment(c: &str) -> Option<Parsed> {
    let inner = c.strip_prefix("<!--")?.strip_suffix("-->")?;
    let lead = inner.len() - inner.trim_start_matches([' ', '\t']).len();
    let rest = inner[lead..].strip_prefix('@')?;
    let kind_len = rest.find(|ch: char| !ch.is_ascii_alphanumeric() && ch != '_').unwrap_or(rest.len());
    let kind = &rest[..kind_len];
    if !KINDS.contains(&kind) {
        return None;
    }
    let mut after = &rest[kind_len..];
    let mut word = None;
    if let Some(w) = after.strip_prefix('#') {
        let n = w.find(|ch: char| !ch.is_alphanumeric() && ch != '_').unwrap_or(w.len());
        if n > 0 {
            word = Some(w[..n].to_string());
            after = &w[n..];
        }
    }
    if !(after.is_empty() || after.starts_with([' ', '\t', '\n', '\r', ':'])) {
        return None; // `@aim`, `@ai.x`: another word
    }
    let head_end = c.len() - 3 - after.len();
    let body = after.trim_start_matches([' ', '\t']);
    let body = body.strip_prefix(':').unwrap_or(body);
    let text = body.trim().lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join("\n");
    Some(Parsed { kind: kind.to_string(), word, text, head_end })
}

/// The known comments of `src`, in the order of the file.
pub fn comments(src: &str) -> Vec<Comment> {
    let Scan { tags, comments: raw } = scan(src);
    let s = src.as_bytes();
    raw.iter()
        .filter_map(|c| {
            let p = parse_comment(&src[c.at..c.end])?;
            // What follows: blanks and further comments, then a start tag, or not
            let mut j = c.end;
            loop {
                while j < s.len() && s[j].is_ascii_whitespace() {
                    j += 1;
                }
                match raw.iter().find(|r| r.at == j) {
                    Some(r) => j = r.end,
                    None => break,
                }
            }
            let target = tags.iter().find(|t| t.at == j).filter(|t| !NOT_COMMENTABLE.contains(&t.name.as_str())).map(|t| t.at);
            let near = if target.is_none() { tags.iter().rev().find(|t| t.at < c.at).map(|t| t.at) } else { None };
            let status = p.word.filter(|w| STATUSES.contains(&w.as_str()));
            Some(Comment { at: c.at, kind: p.kind, status, text: p.text, target, near })
        })
        .collect()
}

// ---- Changing ------------------------------------------------------------------------------------

/// What a change did to the text, so the page can move its offsets along: `removed` bytes at `at`
/// became `inserted` bytes. Offsets from `at + removed` on move by `inserted - removed`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Edit {
    pub at: usize,
    pub removed: usize,
    pub inserted: usize,
}

fn apply(src: &str, at: usize, removed: usize, insert: &str) -> (String, Edit) {
    let mut out = String::with_capacity(src.len() + insert.len());
    out.push_str(&src[..at]);
    out.push_str(insert);
    out.push_str(&src[at + removed..]);
    (out, Edit { at, removed, inserted: insert.len() })
}

/// The line ending new lines get: the first one in the file.
fn eol_of(src: &str) -> &'static str {
    match src.find('\n') {
        Some(i) if i > 0 && src.as_bytes()[i - 1] == b'\r' => "\r\n",
        Some(_) => "\n",
        None if src.contains('\r') => "\r",
        None => "\n",
    }
}

fn line_start(src: &str, at: usize) -> usize {
    src[..at].rfind(['\n', '\r']).map_or(0, |i| i + 1)
}

/// The end of the line `at` is on, and the length of its line ending.
fn line_end(src: &str, at: usize) -> (usize, usize) {
    match src[at..].find(['\n', '\r']) {
        Some(i) => {
            let e = at + i;
            (e, if src[e..].starts_with("\r\n") { 2 } else { 1 })
        }
        None => (src.len(), 0),
    }
}

fn blank(s: &str) -> bool {
    s.bytes().all(|c| c == b' ' || c == b'\t')
}

/// The text of a comment: `-->` and `--!>` in it would end it early; empty lines go.
fn comment_text(head: &str, text: &str, indent: &str, eol: &str) -> Result<String, String> {
    let lines: Vec<String> = text
        .lines()
        .map(|l| l.trim().replace("--!>", "--! >").replace("-->", "-- >"))
        .filter(|l| !l.is_empty())
        .collect();
    if lines.is_empty() {
        return Err("Der Kommentar ist leer".into());
    }
    let mut out = format!("<!-- {head}: ");
    for (i, l) in lines.iter().enumerate() {
        if i > 0 {
            out.push_str(eol);
            out.push_str(indent);
            out.push_str("     ");
        }
        out.push_str(l);
    }
    out.push_str(" -->");
    Ok(out)
}

fn head(kind: &str, status: Option<&str>) -> Result<String, String> {
    if !KINDS.contains(&kind) {
        return Err(format!("Unbekannter Kommentartyp: {kind}"));
    }
    Ok(match status {
        Some(s) => format!("@{kind}#{s}"),
        None => format!("@{kind}"),
    })
}

/// Adds a comment to the element whose start tag is at `tag_at`, after the comments it has.
///
/// If the tag begins its line, the comment gets a line of its own before it, indented the same.
/// Otherwise, or if `ws_matters` (the page says white space before the element shows: inline,
/// `white-space: pre`), it goes straight before the tag, without a blank: then not even a text
/// node changes.
pub fn insert(src: &str, tag_at: usize, kind: &str, text: &str, ws_matters: bool) -> Result<(String, Edit), String> {
    let tag = start_tags(src)
        .into_iter()
        .find(|t| t.at == tag_at)
        .ok_or_else(|| "An dieser Stelle steht kein Element mehr; nichts geschrieben".to_string())?;
    if NOT_COMMENTABLE.contains(&tag.name.as_str()) {
        return Err(format!("<{}> nimmt keinen Kommentar", tag.name));
    }
    let eol = eol_of(src);
    let ls = line_start(src, tag_at);
    let indent = &src[ls..tag_at];
    let (at, insert) = if blank(indent) && !ws_matters {
        (ls, format!("{indent}{}{eol}", comment_text(&head(kind, None)?, text, indent, eol)?))
    } else {
        let lead: String = indent.chars().map(|c| if c == '\t' { '\t' } else { ' ' }).collect();
        let lead = if blank(indent) { indent.to_string() } else { lead };
        (tag_at, comment_text(&head(kind, None)?, text, &lead, eol)?)
    };
    let (out, edit) = apply(src, at, 0, &insert);
    checked(src, &out)?;
    Ok((out, edit))
}

/// The comment of a known type that starts at `at`.
fn comment_at(src: &str, at: usize) -> Result<(RawComment, Parsed), String> {
    let lost = || "An dieser Stelle steht kein Kommentar mehr; nichts geschrieben".to_string();
    let c = scan(src).comments.into_iter().find(|c| c.at == at).ok_or_else(lost)?;
    let p = parse_comment(&src[c.at..c.end]).ok_or_else(lost)?;
    Ok((c, p))
}

/// Removes the comment at `at`; if it had its lines to itself, the lines go too.
pub fn delete(src: &str, at: usize) -> Result<(String, Edit), String> {
    let (c, _) = comment_at(src, at)?;
    let ls = line_start(src, c.at);
    let (le, eol_len) = line_end(src, c.end);
    let (out, edit) = if blank(&src[ls..c.at]) && blank(&src[c.end..le]) {
        apply(src, ls, le + eol_len - ls, "")
    } else {
        apply(src, c.at, c.end - c.at, "")
    };
    checked(src, &out)?;
    Ok((out, edit))
}

/// Changes the text of the comment at `at`; type and status stay as written.
pub fn edit(src: &str, at: usize, text: &str) -> Result<(String, Edit), String> {
    let (c, p) = comment_at(src, at)?;
    let ls = line_start(src, c.at);
    let lead = &src[ls..c.at];
    let indent = if blank(lead) { lead.to_string() } else { " ".repeat(lead.chars().count()) };
    let comment = &src[c.at..c.end];
    let head = &comment[comment.find('@').ok_or("Kommentar ohne Kopf")?..p.head_end];
    let new = comment_text(head, text, &indent, eol_of(src))?;
    let (out, e) = apply(src, c.at, c.end - c.at, &new);
    checked(src, &out)?;
    Ok((out, e))
}

/// Ticks off (`@ai#erledigt`) or opens again (`@ai`) the comment at `at`: only its head changes.
pub fn set_done(src: &str, at: usize, done: bool) -> Result<(String, Edit), String> {
    let (c, p) = comment_at(src, at)?;
    let comment = &src[c.at..c.end];
    let kind_end = comment.find('@').map(|i| i + 1 + p.kind.len()).ok_or("Kommentar ohne Kopf")?;
    let known = p.word.as_deref().is_some_and(|w| STATUSES.contains(&w));
    let (from, to, new) = match (done, &p.word) {
        // `@ai#foo`: an unknown word is no status; ticking replaces it, opening leaves it
        (true, Some(_)) if known => return Ok((src.to_string(), Edit { at: c.at, removed: 0, inserted: 0 })),
        (true, Some(_)) => (kind_end, p.head_end, format!("#{}", STATUSES[0])),
        (true, None) => (kind_end, kind_end, format!("#{}", STATUSES[0])),
        (false, Some(_)) if known => (kind_end, p.head_end, String::new()),
        (false, _) => return Ok((src.to_string(), Edit { at: c.at, removed: 0, inserted: 0 })),
    };
    let (out, e) = apply(src, c.at + from, to - from, &new);
    checked(src, &out)?;
    Ok((out, e))
}

// ---- H1: the page stays the same ----------------------------------------------------------------

/// The page as a tree, written out: without comments, and outside `<pre>` (and the like) with
/// every run of white space as one blank, the way it is shown.
pub fn canonical(src: &str) -> String {
    let doc = Document::from(src);
    let mut out = String::new();
    let mut text = String::new();
    walk(&doc, &doc.root(), false, &mut out, &mut text);
    flush(&mut out, &mut text, false);
    out
}

fn flush(out: &mut String, text: &mut String, pre: bool) {
    if text.is_empty() {
        return;
    }
    out.push('"');
    if pre {
        out.push_str(text);
    } else {
        let mut space = false;
        for ch in text.chars() {
            if matches!(ch, ' ' | '\t' | '\n' | '\r' | '\x0c') {
                if !space {
                    out.push(' ');
                }
                space = true;
            } else {
                out.push(ch);
                space = false;
            }
        }
    }
    out.push('"');
    text.clear();
}

fn walk(doc: &Document, node: &NodeRef, pre: bool, out: &mut String, text: &mut String) {
    for child in node.children_it(false) {
        if child.is_comment() {
            continue; // text on both sides of a comment is one text, as shown
        }
        if child.is_text() {
            text.push_str(&child.text());
            continue;
        }
        flush(out, text, pre);
        if child.is_element() {
            let name = child.node_name().map(|n| n.to_string()).unwrap_or_default();
            let mut attrs: Vec<String> = child.attrs().iter().map(|a| format!("{}={:?}", a.name.local, &*a.value)).collect();
            attrs.sort();
            out.push_str(&format!("<{name} {}>", attrs.join(" ")));
            let inner = pre || PRE.contains(&name.as_str());
            walk(doc, &child, inner, out, text);
            let template = child.query(|n| match &n.data {
                NodeData::Element(e) => e.template_contents,
                _ => None,
            });
            if let Some(Some(id)) = template
                && let Some(contents) = doc.tree.get(&id)
            {
                out.push_str("<#content>");
                walk(doc, &contents, inner, out, text);
            }
            flush(out, text, inner);
            out.push_str(&format!("</{name}>"));
        } else if child.is_doctype() {
            out.push_str("<!doctype>");
        }
    }
}

/// H1: refuses a change that would show the page differently.
fn checked(before: &str, after: &str) -> Result<(), String> {
    if canonical(before) == canonical(after) {
        Ok(())
    } else {
        Err("Der Kommentar würde die Seite verändern; nichts geschrieben".into())
    }
}

// ---- Finding the place again (Z6) --------------------------------------------------------------

/// The start tag at `at` in `seen`, in `now`: the same place if the text is the same, else the one
/// start tag with the same text.
fn relocate_tag(seen: &str, now: &str, at: usize) -> Result<usize, String> {
    let lost = || "Das Element ist in der Datei nicht mehr eindeutig zu finden; nichts geschrieben".to_string();
    if seen == now {
        return Ok(at);
    }
    let tag = start_tags(seen).into_iter().find(|t| t.at == at).ok_or_else(lost)?;
    let text = &seen[tag.at..tag.end];
    let mut found = start_tags(now).into_iter().filter(|t| &now[t.at..t.end] == text);
    match (found.next(), found.next()) {
        (Some(t), None) => Ok(t.at),
        _ => Err(lost()),
    }
}

/// The comment at `at` in `seen`, in `now` (as [`relocate_tag`]).
fn relocate_comment(seen: &str, now: &str, at: usize) -> Result<usize, String> {
    let lost = || "Der Kommentar ist in der Datei nicht mehr eindeutig zu finden; nichts geschrieben".to_string();
    if seen == now {
        return Ok(at);
    }
    let c = scan(seen).comments.into_iter().find(|c| c.at == at).ok_or_else(lost)?;
    let text = &seen[c.at..c.end];
    let mut found = scan(now).comments.into_iter().filter(|r| &now[r.at..r.end] == text);
    match (found.next(), found.next()) {
        (Some(r), None) => Ok(r.at),
        _ => Err(lost()),
    }
}

// ---- The file ------------------------------------------------------------------------------------

const BOM: &str = "\u{feff}";

/// The file's text, if Hyqe can write it back unchanged around a comment: UTF-8, maybe with a BOM
/// (kept, not part of the text, as in the frame's `text::decode`).
fn read(path: &Path) -> Result<(bool, String), String> {
    let bytes = fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let text = String::from_utf8(bytes).map_err(|_| format!("{}: Hyqe schreibt nur in UTF-8-Dateien", path.display()))?;
    Ok(match text.strip_prefix(BOM) {
        Some(rest) => (true, rest.to_string()),
        None => (false, text),
    })
}

/// Whether comments can be written into `path`: writable, and UTF-8.
pub fn writable(path: &Path) -> bool {
    qiew_frame::write::writable(path) && read(path).is_ok()
}

/// What the page needs after a change: the new text, its comments and how offsets moved.
#[derive(Serialize)]
pub struct Written {
    content: String,
    comments: Vec<Comment>,
    edit: Edit,
}

/// Reads the file, lets `f` find the place again and change it (checked, H1), and saves.
fn change(path: &str, f: impl FnOnce(&str) -> Result<(String, Edit), String>) -> Result<Written, String> {
    let path = PathBuf::from(path);
    let allowed = may_annotate(&path);
    if !allowed {
        return Err(format!("{}: Hyqe schreibt nur in Dateien, die mit --annotate geöffnet wurden", path.display()));
    }
    let (bom, now) = read(&path)?;
    let (content, edit) = f(&now)?;
    if content != now {
        let prefix = if bom { BOM } else { "" };
        let (base, next) = (format!("{prefix}{now}"), format!("{prefix}{content}"));
        qiew_frame::write::save(&path, base.as_bytes(), next.as_bytes(), allowed, "Hyqe")?;
    }
    Ok(Written { comments: comments(&content), content, edit })
}

#[tauri::command]
pub fn page_comments(content: String) -> Vec<Comment> {
    comments(&content)
}

// The commands. `seen`: the text the page was served from; `at` refers to it.

#[tauri::command]
pub fn comment_add(path: String, seen: String, at: usize, kind: String, text: String, ws: bool) -> Result<Written, String> {
    change(&path, |now| insert(now, relocate_tag(&seen, now, at)?, &kind, &text, ws))
}

#[tauri::command]
pub fn comment_edit(path: String, seen: String, at: usize, text: String) -> Result<Written, String> {
    change(&path, |now| edit(now, relocate_comment(&seen, now, at)?, &text))
}

#[tauri::command]
pub fn comment_tick(path: String, seen: String, at: usize, done: bool) -> Result<Written, String> {
    change(&path, |now| set_done(now, relocate_comment(&seen, now, at)?, done))
}

#[tauri::command]
pub fn comment_remove(path: String, seen: String, at: usize) -> Result<Written, String> {
    change(&path, |now| delete(now, relocate_comment(&seen, now, at)?))
}

#[cfg(test)]
mod tests;
