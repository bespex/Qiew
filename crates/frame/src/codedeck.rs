//! The way back to the program that started a viewer (`docs/ANNOTATE.md`, section 4): a comment on
//! a line goes to it as one line of JSON on the Unix socket it named in `CODEDECK_SOCKET`. Only with
//! `--annotate` for that document; nothing is read from the socket, nothing is written to the file.
//! An app whose comments are only sent (Dirq) uses it; Marq writes its comments into the file.

use std::io::Write;
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::AppInfo;
use crate::launch::grants;

/// The longest comment that is sent, in characters.
pub const MAX_TEXT: usize = 10_000;
/// The longest line text that is sent along, in characters.
pub const MAX_CODE: usize = 200;

/// A comment as the frontend hands it over: `line_comment` (add, or replace one with the same id)
/// or `line_comment_remove`.
#[derive(Debug, Deserialize)]
pub struct Outgoing {
    pub action: String,
    pub id: String,
    pub file: Option<String>,
    pub line: Option<u32>,
    pub code: Option<String>,
    pub text: Option<String>,
    /// `X-CodeDeck-Session` of the patch header, if it has one.
    pub session: Option<String>,
    /// What the caller named the document (`--id`), so it knows which of its documents is meant.
    pub doc: Option<String>,
}

#[derive(Serialize)]
struct Message<'a> {
    v: u8,
    action: &'a str,
    source: &'a str,
    id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    session: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    doc: Option<&'a str>,
}

fn cut(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// The message as one line of JSON, ending in a line break; an error for what is not a comment.
/// `source` is the app that sends it (its program name).
pub fn message_line(o: &Outgoing, source: &str) -> Result<String, String> {
    if o.id.chars().count() < 8 || o.id.len() > 64 {
        return Err("a comment needs an id of 8 to 64 characters".into());
    }
    let message = match o.action.as_str() {
        "line_comment" => {
            let (Some(file), Some(line), Some(text)) = (o.file.as_deref(), o.line, o.text.as_deref()) else {
                return Err("a comment needs a file, a line and a text".into());
            };
            if file.is_empty() || line == 0 || text.trim().is_empty() {
                return Err("a comment needs a file, a line and a text".into());
            }
            Message {
                v: 1,
                action: "line_comment",
                source,
                id: &o.id,
                file: Some(file),
                line: Some(line),
                // The line's text: one line, as the patch has it
                code: Some(cut(o.code.as_deref().unwrap_or("").lines().next().unwrap_or(""), MAX_CODE)),
                text: Some(cut(text.trim(), MAX_TEXT)),
                session: o.session.as_deref().filter(|s| !s.is_empty()),
                doc: o.doc.as_deref().filter(|s| !s.is_empty()),
            }
        }
        "line_comment_remove" => Message {
            v: 1,
            action: "line_comment_remove",
            source,
            id: &o.id,
            file: None,
            line: None,
            code: None,
            text: None,
            session: o.session.as_deref().filter(|s| !s.is_empty()),
            doc: o.doc.as_deref().filter(|s| !s.is_empty()),
        },
        other => return Err(format!("unknown action: {other}")),
    };
    // serde_json escapes line breaks inside strings: the message stays one line
    serde_json::to_string(&message).map(|m| m + "\n").map_err(|e| e.to_string())
}

/// Sends a comment on a line of `path` to the program that started the viewer. Only with
/// `--annotate` for that file, and only to the socket that same call named.
#[tauri::command]
pub async fn send_comment(path: String, message: Outgoing, info: State<'_, &'static AppInfo>) -> Result<(), String> {
    let given = grants(Path::new(&path));
    if !given.annotate {
        return Err("this document may not be commented (no --annotate)".into());
    }
    let socket = given.codedeck_socket.ok_or("not connected: no program to send to (CODEDECK_SOCKET)")?;
    send(Path::new(&socket), &message_line(&message, info.bin)?)
}

/// Sends one message to the socket and closes the connection; nothing is read back.
pub fn send(socket: &Path, line: &str) -> Result<(), String> {
    let mut stream = UnixStream::connect(socket).map_err(|e| format!("not connected ({e})"))?;
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    stream.write_all(line.as_bytes()).map_err(|e| format!("not sent ({e})"))?;
    // The receiver reads up to the end of the stream
    let _ = stream.shutdown(std::net::Shutdown::Write);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::os::unix::net::UnixListener;

    fn message_line_d(o: &Outgoing) -> Result<String, String> {
        message_line(o, "dirq")
    }

    fn comment(file: &str, line: u32, code: &str, text: &str) -> Outgoing {
        Outgoing {
            action: "line_comment".into(),
            id: "d4f1a2b3".into(),
            file: Some(file.into()),
            line: Some(line),
            code: Some(code.into()),
            text: Some(text.into()),
            session: None,
            doc: None,
        }
    }

    fn parse(line: &str) -> serde_json::Value {
        assert!(line.ends_with('\n'));
        assert_eq!(line.matches('\n').count(), 1, "one line: {line}");
        serde_json::from_str(line).unwrap()
    }

    #[test]
    fn a_comment_is_one_line_of_json() {
        let text = "Was, wenn 0?\nUnd \"leer\" – Umlaute: äöü";
        let m = parse(&message_line_d(&comment("src/limit.rs", 42, "let burst = cfg.burst;", text)).unwrap());
        assert_eq!(m["v"], 1);
        assert_eq!(m["action"], "line_comment");
        assert_eq!(m["source"], "dirq");
        assert_eq!(m["id"], "d4f1a2b3");
        assert_eq!(m["file"], "src/limit.rs");
        assert_eq!(m["line"], 42);
        assert_eq!(m["code"], "let burst = cfg.burst;");
        assert_eq!(m["text"], text);
        assert!(m.get("session").is_none(), "no session without one");
    }

    #[test]
    fn long_texts_are_cut_and_the_session_goes_along() {
        let mut c = comment("a.rs", 1, &"x".repeat(500), &"ä".repeat(MAX_TEXT + 50));
        c.session = Some("s-7".into());
        c.doc = Some("Turn 3 · repo".into());
        let m = parse(&message_line_d(&c).unwrap());
        assert_eq!(m["code"].as_str().unwrap().chars().count(), MAX_CODE);
        assert_eq!(m["text"].as_str().unwrap().chars().count(), MAX_TEXT);
        assert_eq!(m["session"], "s-7");
        assert_eq!(m["doc"], "Turn 3 · repo");
    }

    #[test]
    fn removing_names_only_the_id() {
        let o = Outgoing { action: "line_comment_remove".into(), id: "d4f1a2b3".into(), file: None, line: None, code: None, text: None, session: None, doc: None };
        let m = parse(&message_line_d(&o).unwrap());
        assert_eq!(m, serde_json::json!({"v": 1, "action": "line_comment_remove", "source": "dirq", "id": "d4f1a2b3"}));
    }

    #[test]
    fn what_is_not_a_comment_is_refused() {
        assert!(message_line_d(&comment("a.rs", 0, "", "x")).is_err(), "line 0");
        assert!(message_line_d(&comment("", 3, "", "x")).is_err(), "no file");
        assert!(message_line_d(&comment("a.rs", 3, "", "  ")).is_err(), "no text");
        let mut short = comment("a.rs", 3, "", "x");
        short.id = "abc".into();
        assert!(message_line_d(&short).is_err(), "short id");
        let mut other = comment("a.rs", 3, "", "x");
        other.action = "revert_hunk".into();
        assert!(message_line_d(&other).is_err(), "unknown action");
    }

    #[test]
    fn sends_to_the_socket_and_says_when_nobody_listens() {
        let dir = std::env::temp_dir().join(format!("dirq-codedeck-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let socket = dir.join("test.sock");
        let _ = std::fs::remove_file(&socket);
        let listener = UnixListener::bind(&socket).unwrap();
        let line = message_line_d(&comment("a.rs", 3, "x", "y")).unwrap();
        let reader = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut got = String::new();
            stream.read_to_string(&mut got).unwrap();
            got
        });
        send(&socket, &line).unwrap();
        assert_eq!(reader.join().unwrap(), line);
        let _ = std::fs::remove_file(&socket);
        assert!(send(&socket, &line).unwrap_err().starts_with("not connected"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
