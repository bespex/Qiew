//! The promises of apps/hyqe/KOMMENTARE.md ("Zusicherungen"), tested on the pages in
//! `test/fixtures/` (each also with CRLF line endings): at every element that takes a comment,
//! a comment of one and of several lines is added, ticked, opened again, changed and removed.

use super::*;

const FIXTURES: &[(&str, &str)] = &[
    ("report.html", include_str!("../../../test/fixtures/report.html")),
    ("mockup.html", include_str!("../../../test/fixtures/mockup.html")),
    ("dense.html", include_str!("../../../test/fixtures/dense.html")),
    ("example.html", include_str!("../../../example.html")),
];

fn variants() -> Vec<(String, String)> {
    FIXTURES
        .iter()
        .flat_map(|(name, src)| {
            let crlf = src.replace("\r\n", "\n").replace('\n', "\r\n");
            [(name.to_string(), src.to_string()), (format!("{name} (CRLF)"), crlf)]
        })
        .collect()
}

fn commentable(src: &str) -> Vec<Tag> {
    start_tags(src).into_iter().filter(|t| !NOT_COMMENTABLE.contains(&t.name.as_str())).collect()
}

/// Z4: without the lines (or the bare comments) of known type, the text is the original.
fn without_comments(src: &str) -> String {
    let mut out = src.to_string();
    for c in comments(src).iter().rev() {
        out = delete(&out, c.at).expect("removable").0;
    }
    out
}

/// Whether `at` lies inside a `<pre>` (or `<textarea>`): where white space is kept as written.
fn in_pre(src: &str, at: usize) -> bool {
    let before = &src[..at];
    ["pre", "textarea"].iter().any(|n| before.rfind(&format!("<{n}")) > before.rfind(&format!("</{n}>")))
}

#[test]
fn anchors_name_the_start_of_each_tag() {
    for (name, src) in variants() {
        let served = anchor(&src);
        let mut rest = served.as_str();
        let mut n = 0;
        while let Some(i) = rest.find("data-hyqe-at=\"") {
            rest = &rest[i + 14..];
            let at: usize = rest[..rest.find('"').unwrap()].parse().unwrap();
            assert_eq!(&src[at..at + 1], "<", "{name}: offset {at}");
            assert!(src.as_bytes()[at + 1].is_ascii_alphabetic(), "{name}: offset {at}");
            n += 1;
        }
        assert_eq!(n, start_tags(&src).len(), "{name}");
        // The anchors change no rendering but their own attribute
        assert!(canonical(&served).contains("data-hyqe-at"));
    }
}

#[test]
fn the_tokenizer_skips_raw_text_comments_and_quoted_brackets() {
    let src = "<p title=\"a > b\" data-x='<i>'>x</p><script>if (a<b) document.write('<div>')</script>\
               <!-- <span> --><style>p>i{}</style><textarea><b></textarea><em>e</em>";
    let names: Vec<_> = start_tags(src).into_iter().map(|t| t.name).collect();
    assert_eq!(names, ["p", "script", "style", "textarea", "em"]);
    let t = &start_tags(src)[0];
    assert_eq!(&src[t.at..t.end], "<p title=\"a > b\" data-x='<i>'>");
}

#[test]
fn inserting_changes_nothing_but_comments_and_comes_back_byte_for_byte() {
    for (name, src) in variants() {
        let tags = commentable(&src);
        assert!(tags.len() > 5, "{name}: too few elements");
        for t in &tags {
            for text in ["Kürzer, bitte – und ohne --> Pfeil", "Zwei Zeilen:\nerste\n\n  zweite"] {
                for ws in [false, true] {
                    let what = format!("{name}: <{}> at {}, ws {ws}", t.name, t.at);
                    let (with, moved) = match insert(&src, t.at, "ai", text, ws) {
                        Ok(r) => r,
                        // A line of its own may be refused where white space is kept (H1);
                        // straight before the tag never
                        Err(e) if !ws && e.contains("verändern") && in_pre(&src, t.at) => continue,
                        Err(e) => panic!("{what}: {e}"),
                    };
                    assert_eq!(with.len(), src.len() + moved.inserted, "{what}");
                    // Z1/H1 is checked inside; Z4: only comment text was added
                    assert_eq!(without_comments(&with), without_comments(&src), "{what}");
                    let c = comments(&with).into_iter().find(|c| c.target == Some(t.at + moved.inserted)).expect(&what);
                    assert_eq!(c.kind, "ai");
                    assert!(!c.text.contains("-->"), "{what}");
                    // Z3: ticking and opening again
                    let (done, _) = set_done(&with, c.at, true).unwrap();
                    assert!(done.contains("@ai#erledigt: "), "{what}");
                    assert_eq!(comments(&done).iter().find(|d| d.at == c.at).unwrap().status.as_deref(), Some("erledigt"));
                    assert_eq!(set_done(&done, c.at, false).unwrap().0, with, "{what}");
                    // changing keeps the head
                    let (changed, _) = edit(&done, c.at, "neu").unwrap();
                    assert!(changed.contains("<!-- @ai#erledigt: neu -->"), "{what}");
                    // Z2: removing gives back the original
                    assert_eq!(delete(&with, c.at).unwrap().0, src, "{what}");
                }
            }
        }
    }
}

#[test]
fn a_tag_that_begins_its_line_gets_a_line_of_its_own() {
    let src = "<ul>\r\n    <li>a</li>\r\n</ul>\r\n";
    let at = src.find("<li>").unwrap();
    let (out, edit) = insert(src, at, "me", "x", false).unwrap();
    assert_eq!(out, "<ul>\r\n    <!-- @me: x -->\r\n    <li>a</li>\r\n</ul>\r\n");
    assert_eq!(edit, Edit { at: 6, removed: 0, inserted: 21 });
    // several lines: the next ones indented under the text
    let (out, _) = insert(src, at, "ai", "eins\nzwei", false).unwrap();
    assert!(out.contains("    <!-- @ai: eins\r\n         zwei -->\r\n    <li>"), "{out}");
}

#[test]
fn inside_a_line_or_where_white_space_shows_the_comment_goes_straight_before_the_tag() {
    let src = "<p>Price <b>9 €</b> a month</p>\n<ul><li>a</li><li>b</li></ul>\n";
    let b = src.find("<b>").unwrap();
    let (out, _) = insert(src, b, "ai", "bigger", true).unwrap();
    assert_eq!(out, "<p>Price <!-- @ai: bigger --><b>9 €</b> a month</p>\n<ul><li>a</li><li>b</li></ul>\n");
    let li = src.rfind("<li>").unwrap();
    let (out, _) = insert(src, li, "ai", "x", false).unwrap();
    assert!(out.contains("<li>a</li><!-- @ai: x --><li>b</li>"), "{out}");
    // inline at the start of a line keeps the line as it is
    let src = "<p>\n  <span>a</span>\n  <span>b</span>\n</p>";
    let at = src.rfind("<span>").unwrap();
    let (out, _) = insert(src, at, "ai", "x", true).unwrap();
    assert!(out.contains("\n  <!-- @ai: x --><span>b</span>"), "{out}");
}

#[test]
fn white_space_inside_pre_is_never_touched() {
    let src = "<pre>\n<code>let a = 1;</code>\n<span>b</span>\n</pre>\n";
    let at = src.find("<span>").unwrap();
    // a line of its own would add a line to the pre: refused (H1)
    assert!(insert(src, at, "ai", "x", false).unwrap_err().contains("verändern"));
    // straight before the tag it is fine
    let (out, _) = insert(src, at, "ai", "x", true).unwrap();
    assert!(out.contains("\n<!-- @ai: x --><span>b</span>"));
}

#[test]
fn the_frame_of_the_document_takes_no_comment() {
    let src = "<!DOCTYPE html>\n<html>\n<head>\n<title>t</title>\n</head>\n<body>\n<p>x</p>\n</body>\n</html>\n";
    for name in ["<html>", "<head>", "<title>", "<body>"] {
        assert!(insert(src, src.find(name).unwrap(), "ai", "x", false).is_err(), "{name}");
    }
    assert!(insert(src, src.find("<p>").unwrap(), "ai", "x", false).is_ok());
    assert!(insert(src, src.find("<p>").unwrap(), "foo", "x", false).is_err());
    assert!(insert(src, src.find("<p>").unwrap(), "ai", "  \n ", false).is_err());
}

#[test]
fn comments_belong_to_the_element_that_follows() {
    let src = "<body>\n<!-- a plain comment -->\n<!-- @ai: one -->\n<!-- @foo: not ours -->\n<!-- @me#erledigt done -->\n\
               <p>text</p>\n<div>\n  <p>x</p>\n  <!-- @you#später: at the end -->\n</div>\n\
               <script>// <!-- @ai: in a script --></script>\n<!-- @aim: other word -->\n</body>";
    let p = src.find("<p>").unwrap();
    let div = src.find("<div>").unwrap();
    let inner = src[div..].find("<p>").unwrap() + div;
    let found = comments(src);
    let kinds: Vec<_> = found.iter().map(|c| (c.kind.as_str(), c.status.as_deref(), c.text.as_str())).collect();
    assert_eq!(kinds, [("ai", None, "one"), ("me", Some("erledigt"), "done"), ("you", None, "at the end")]);
    assert_eq!(found[0].target, Some(p));
    assert_eq!(found[1].target, Some(p));
    assert_eq!((found[2].target, found[2].near), (None, Some(inner)));
    // Z5: foreign comments stay as they are through every change
    let (out, _) = insert(src, p, "ai", "two", false).unwrap();
    for foreign in ["<!-- a plain comment -->", "<!-- @foo: not ours -->", "// <!-- @ai: in a script -->", "<!-- @aim: other word -->"] {
        assert!(out.contains(foreign), "{foreign}");
    }
    assert!(out.contains("<!-- @me#erledigt done -->\n<!-- @ai: two -->\n<p>"), "after the others: {out}");
    // an unknown word is no status: ticking replaces it, opening leaves it
    let you = found[2].at;
    assert_eq!(set_done(src, you, false).unwrap().0, src);
    assert!(set_done(src, you, true).unwrap().0.contains("<!-- @you#erledigt: at the end -->"));
}

#[test]
fn a_changed_file_is_written_only_where_the_place_is_found_for_sure() {
    let seen = "<p>a</p>\n<p class=\"x\">b</p>\n";
    let now = "<h1>new</h1>\n<p>a</p>\n<p class=\"x\">b</p>\n";
    let at = seen.find("<p class").unwrap();
    assert_eq!(relocate_tag(seen, now, at).unwrap(), now.find("<p class").unwrap());
    let twice = "<p>a</p>\n<p>a</p>\n<p class=\"x\">b</p>\n";
    assert!(relocate_tag(seen, twice, 0).is_err());
    let seen = "<!-- @ai: x -->\n<p>a</p>\n";
    let now = "<h1>new</h1>\n<!-- @ai: x -->\n<p>a</p>\n";
    assert_eq!(relocate_comment(seen, now, 0).unwrap(), 13);
}

#[test]
fn never_writes_without_annotate() {
    let dir = std::env::temp_dir().join(format!("hyqe-annotate-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let file = dir.join("a.html");
    fs::write(&file, "<p>a</p>\n").unwrap();
    // This test process was not started with --annotate.
    let path = file.to_string_lossy().into_owned();
    assert!(comment_add(path.clone(), "<p>a</p>\n".into(), 0, "ai".into(), "x".into(), false).is_err());
    assert_eq!(fs::read_to_string(&file).unwrap(), "<p>a</p>\n");
    assert!(writable(&file));
    fs::write(&file, b"<p>\xe4</p>").unwrap();
    assert!(!writable(&file), "not UTF-8");
    let _ = fs::remove_dir_all(&dir);
}
