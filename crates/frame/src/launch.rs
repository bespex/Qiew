//! How a viewer is started: the command line every app understands, made so
//! that another program (CodeDeck, a script) can drive a viewer without the
//! viewer knowing about it.
//!
//! ```text
//! <app> [<file> | -] [--line <n>] [--geometry <W>x<H>+<X>+<Y>] [--reuse] [--annotate] [--id <text>] [--repo <path>] [--file <part>]
//! ```
//!
//! - `-` reads the document from standard input (`git diff | dirq -`). It is
//!   kept as a file of the app's own in the runtime directory, removed when
//!   the window is closed.
//! - `--line` shows that line of the file once it is open.
//! - `--geometry` places the window: content size and position in physical
//!   pixels, either part may be left out (`900x700`, `+40+60`).
//! - `--reuse` hands the file to a window started with `--reuse` before, if
//!   one is open, instead of opening another. Windows started without it are
//!   left alone.
//! - `--annotate` allows an app that can comment a document to do so, for the
//!   file of this call only: Marq may then write comments into it. It holds
//!   per call and per file, not per window: a file handed over with `--reuse`
//!   but without `--annotate` is shown read-only again, a file opened by a
//!   link or a drop never is annotated. Standard input is not either, unless
//!   the app says its comments never go into the file ([`annotate_stdin`]:
//!   Dirq sends them to the program that started it).
//! - `--repo <path>` lets an app look into this Git repository, read-only
//!   (Dirq: more context around a change). Per call and file, like `--annotate`.
//! - `--file <part>` names the part of the document to show (Dirq: one file of a patch, shown
//!   alone). Per call, like `--id`; a call without it shows the whole document.
//! - `CODEDECK_SOCKET` in the environment of the call names where comments are
//!   sent. It allows nothing by itself; it travels with `--reuse` like the
//!   options, since the running window may have been started by another program.
//! - `--id <text>` names the document for the app: the same text means "a new
//!   version of the document shown before", another one "a different document".
//!   Standard input has no path to tell this by (each call keeps it under a new
//!   name), so the caller says. Like every option, a viewer that does not know
//!   it ignores it; put it after the file (`dirq - --id x`), or an older viewer
//!   would take the text for the file. Each call replaces the id of the one before.
//!
//! The frontend part is `@qiew/frame/launch`.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::{env, fs, io, thread};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

use crate::AppInfo;

/// Options that are followed by a value (which is therefore not the file).
const WITH_VALUE: &[&str] = &["--line", "--geometry", "--export-html", "--id", "--repo", "--file"];

/// Where a window is to be: content size and position in physical pixels.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Placement {
    pub size: Option<PhysicalSize<u32>>,
    pub position: Option<PhysicalPosition<i32>>,
}

impl Placement {
    /// `900x700+40+60`, `900x700` or `+40+60` (also `-40`: negative positions).
    pub fn parse(text: &str) -> Option<Self> {
        let at = text.find(['+', '-']).unwrap_or(text.len());
        let (size, position) = text.split_at(at);
        let size = match size {
            "" => None,
            size => {
                let (w, h) = size.split_once(['x', 'X'])?;
                Some(PhysicalSize::new(w.parse().ok().filter(|w| *w > 0)?, h.parse().ok().filter(|h| *h > 0)?))
            }
        };
        let position = match position {
            "" => None,
            position => {
                // Split before the sign of the second number.
                let second = position[1..].find(['+', '-'])? + 1;
                let number = |s: &str| s.strip_prefix('+').unwrap_or(s).parse::<i32>().ok();
                Some(PhysicalPosition::new(number(&position[..second])?, number(&position[second..])?))
            }
        };
        (size.is_some() || position.is_some()).then_some(Self { size, position })
    }
}

/// What the command line asks for.
#[derive(Debug, Default, PartialEq)]
pub struct Launch {
    /// The file to show; `-` has been replaced by the file standard input went to.
    pub file: Option<String>,
    pub line: Option<u32>,
    pub placement: Option<Placement>,
    pub reuse: bool,
    pub annotate: bool,
    /// What the caller calls this document (see the module's `--id`).
    pub id: Option<String>,
    /// The repository the app may read from (`--repo`).
    pub repo: Option<String>,
    /// The part of the document to show (`--file`).
    pub focus: Option<String>,
}

impl Launch {
    pub fn parse(args: impl IntoIterator<Item = String>) -> Self {
        let mut launch = Self::default();
        let mut args = args.into_iter();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--line" => launch.line = args.next().and_then(|v| v.parse().ok()).filter(|n| *n > 0),
                "--geometry" => launch.placement = args.next().and_then(|v| Placement::parse(&v)),
                "--reuse" => launch.reuse = true,
                "--annotate" => launch.annotate = true,
                "--id" => launch.id = args.next().filter(|v| !v.is_empty()),
                "--repo" => launch.repo = args.next().filter(|v| !v.is_empty()),
                "--file" => launch.focus = args.next().filter(|v| !v.is_empty()),
                "-" if launch.file.is_none() => launch.file = Some(arg),
                flag if WITH_VALUE.contains(&flag) => drop(args.next()),
                flag if flag.starts_with('-') => {}
                _ if launch.file.is_none() => launch.file = Some(arg),
                _ => {}
            }
        }
        launch
    }
}

static LAUNCH: OnceLock<Launch> = OnceLock::new();
/// The line to show in the file that is opened next.
static LINE: Mutex<Option<u32>> = Mutex::new(None);
/// The id the call that opened the current document gave it (`--id`).
static DOC_ID: Mutex<Option<String>> = Mutex::new(None);
/// The part of it that call asked to show (`--file`).
static DOC_FOCUS: Mutex<Option<String>> = Mutex::new(None);
/// The file standard input was written to, to be removed on exit.
static STDIN_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);
/// What the call that named a file allowed for it, by this call or a later one (`--reuse`).
static GRANTS: Mutex<Option<HashMap<PathBuf, Grants>>> = Mutex::new(None);
/// Set by an app whose comments never go into the file: standard input may be annotated then.
static ANNOTATE_STDIN: AtomicBool = AtomicBool::new(false);

/// What a call allows the app to do with the file it names (Qiew `docs/ANNOTATE.md`). Per call and
/// file, never kept: a later call for the same file replaces it, a file opened by a link or a drop
/// has none.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Grants {
    /// `--annotate`: the user may comment on the document.
    pub annotate: bool,
    /// `CODEDECK_SOCKET` of the caller: where comments are sent. Allows nothing by itself.
    pub codedeck_socket: Option<String>,
    /// `--repo`: a Git repository the app may read from, absolute.
    pub repo: Option<String>,
}

/// For an app whose comments are only sent, never written into the file (Dirq): `--annotate` then
/// also holds for standard input, which is how a program hands it a document. To be called before
/// [`crate::handle_cli`]. Marq writes into the file and does not call it.
pub fn annotate_stdin() {
    ANNOTATE_STDIN.store(true, Ordering::Relaxed);
}

/// The file as the app opens it: symbolic links resolved.
fn real(file: &Path) -> PathBuf {
    fs::canonicalize(file).unwrap_or_else(|_| file.to_path_buf())
}

/// What the call that named `file` allowed, replacing what an earlier call allowed.
fn set_grants(file: &Path, grants: Grants) {
    let mut files = GRANTS.lock().unwrap();
    let files = files.get_or_insert_with(HashMap::new);
    if grants == Grants::default() {
        files.remove(&real(file));
    } else {
        files.insert(real(file), grants);
    }
}

/// What the app may do with `file`: what the call that named it allowed, else nothing.
pub fn grants(file: &Path) -> Grants {
    GRANTS.lock().unwrap().as_ref().and_then(|files| files.get(&real(file)).cloned()).unwrap_or_default()
}

/// Whether the app may annotate `file`: only if the call that named it said `--annotate`.
pub fn may_annotate(file: &Path) -> bool {
    grants(file).annotate
}

/// The command line of this process.
pub fn get() -> &'static Launch {
    LAUNCH.get_or_init(Launch::default)
}

/// What one viewer tells the one that is already running.
#[derive(Serialize, Deserialize)]
struct Handover {
    file: Option<String>,
    line: Option<u32>,
    geometry: Option<(Option<(u32, u32)>, Option<(i32, i32)>)>,
    /// Missing from older viewers: read-only, as they were.
    #[serde(default)]
    annotate: bool,
    /// Missing from older viewers: no id.
    #[serde(default)]
    id: Option<String>,
    /// `CODEDECK_SOCKET` of the caller; missing from older viewers.
    #[serde(default)]
    codedeck_socket: Option<String>,
    /// Missing from older viewers: no repository.
    #[serde(default)]
    repo: Option<String>,
    /// Missing from older viewers: the whole document.
    #[serde(default)]
    focus: Option<String>,
}

/// The app's own directory for what lives only while it runs.
fn runtime_dir(info: &AppInfo) -> PathBuf {
    env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from).unwrap_or_else(env::temp_dir).join(info.bin)
}

fn socket(info: &AppInfo) -> PathBuf {
    runtime_dir(info).join("reuse.sock")
}

/// Removes files from standard input that a viewer left behind (it was
/// killed rather than closed): those of processes that are gone, a day old –
/// a younger one may still be shown by a viewer it was handed to.
fn sweep(info: &AppInfo) {
    let Ok(entries) = fs::read_dir(runtime_dir(info)) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(pid) = name.strip_prefix("stdin-").and_then(|rest| rest.split('.').next()) else { continue };
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .is_ok_and(|at| at.elapsed().is_ok_and(|age| age.as_secs() > 24 * 60 * 60));
        if old && !std::path::Path::new("/proc").join(pid).exists() {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Standard input as a file the viewer can open like any other.
fn keep_stdin(info: &AppInfo) -> io::Result<PathBuf> {
    let mut content = Vec::new();
    io::stdin().read_to_end(&mut content)?;
    let dir = runtime_dir(info);
    fs::create_dir_all(&dir)?;
    let ending = info.extensions.first().copied().unwrap_or(".txt");
    let file = dir.join(format!("stdin-{}{ending}", std::process::id()));
    fs::write(&file, content)?;
    Ok(file)
}

/// Reads the command line. Returns true if the process is done: the file
/// went to a viewer that is already running (`--reuse`).
pub(crate) fn init(info: &AppInfo) -> bool {
    let mut launch = Launch::parse(env::args().skip(1));
    let mut from_stdin = None;
    sweep(info);
    match launch.file.as_deref() {
        Some("-") => match keep_stdin(info) {
            Ok(file) => {
                launch.file = Some(file.to_string_lossy().into_owned());
                from_stdin = Some(file);
            }
            Err(e) => {
                eprintln!("{}: standard input: {e}", info.bin);
                launch.file = None;
            }
        },
        // Another process, with another working directory, may have to find it.
        Some(file) => {
            if let Ok(absolute) = std::path::absolute(file) {
                launch.file = Some(absolute.to_string_lossy().into_owned());
            }
        }
        None => {}
    }
    // Another process, with another working directory, may have to find it.
    if let Some(repo) = launch.repo.as_deref()
        && let Ok(absolute) = std::path::absolute(repo)
    {
        launch.repo = Some(absolute.to_string_lossy().into_owned());
    }
    // Only with --annotate may an app comment; standard input only where the comments are never
    // written into the file (annotate_stdin).
    let annotate = launch.annotate && (from_stdin.is_none() || ANNOTATE_STDIN.load(Ordering::Relaxed));
    let codedeck_socket = env::var("CODEDECK_SOCKET").ok().filter(|s| !s.is_empty());

    if launch.reuse
        && let Ok(mut running) = UnixStream::connect(socket(info))
    {
        let handover = Handover {
            file: launch.file.clone(),
            line: launch.line,
            geometry: launch
                .placement
                .map(|p| (p.size.map(|s| (s.width, s.height)), p.position.map(|p| (p.x, p.y)))),
            annotate,
            id: launch.id.clone(),
            codedeck_socket: codedeck_socket.clone(),
            repo: launch.repo.clone(),
            focus: launch.focus.clone(),
        };
        if let Ok(message) = serde_json::to_string(&handover)
            && writeln!(running, "{message}").is_ok()
        {
            return true; // a file from standard input stays for the running viewer
        }
    }

    if let Some(file) = launch.file.as_deref() {
        set_grants(Path::new(file), Grants { annotate, codedeck_socket, repo: launch.repo.clone() });
    }
    *STDIN_FILE.lock().unwrap() = from_stdin;
    *DOC_ID.lock().unwrap() = launch.id.clone();
    *DOC_FOCUS.lock().unwrap() = launch.focus.clone();
    *LINE.lock().unwrap() = launch.line;
    let _ = LAUNCH.set(launch);
    false
}

/// A viewer started with `--reuse` takes the files of later ones: it shows
/// them in its window, placed and raised as asked.
pub(crate) fn listen(app: &AppHandle, info: &AppInfo) {
    if !get().reuse {
        return;
    }
    let path = socket(info);
    let listener = fs::create_dir_all(runtime_dir(info)).and_then(|()| {
        let _ = fs::remove_file(&path); // left behind by a viewer that is gone (nobody answered above)
        UnixListener::bind(&path)
    });
    let listener = match listener {
        Ok(listener) => listener,
        Err(e) => return eprintln!("{}: --reuse unavailable: {e}", info.bin),
    };
    let app = app.clone();
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut message = String::new();
            if BufReader::new(stream).read_line(&mut message).is_err() {
                continue;
            }
            let Ok(handover) = serde_json::from_str::<Handover>(&message) else { continue };
            *LINE.lock().unwrap() = handover.line;
            *DOC_ID.lock().unwrap() = handover.id.clone();
            *DOC_FOCUS.lock().unwrap() = handover.focus.clone();
            // The grants of the call that sent it, not those of the call that started this window
            if let Some(file) = handover.file.as_deref() {
                set_grants(
                    Path::new(file),
                    Grants { annotate: handover.annotate, codedeck_socket: handover.codedeck_socket.clone(), repo: handover.repo.clone() },
                );
            }
            if let Some(window) = app.get_webview_window("main") {
                if let Some((size, position)) = handover.geometry {
                    crate::window_layout::apply(
                        &window,
                        Placement {
                            size: size.map(|(w, h)| PhysicalSize::new(w, h)),
                            position: position.map(|(x, y)| PhysicalPosition::new(x, y)),
                        },
                    );
                }
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            match handover.file {
                Some(file) => drop(app.emit("open-file", file)),
                None => drop(app.emit("reveal-line", ())),
            }
        }
    });
}

/// Removes what this process left in the runtime directory.
pub(crate) fn clean_up(info: &AppInfo) {
    if let Some(file) = STDIN_FILE.lock().unwrap().take() {
        let _ = fs::remove_file(file);
    }
    if get().reuse {
        let _ = fs::remove_file(socket(info));
    }
}

/// What the call that opened the current document named it (`--id`), if it did. Not taken: the
/// frontend asks once per document it opens.
#[tauri::command]
pub fn doc_id() -> Option<String> {
    DOC_ID.lock().unwrap().clone()
}

/// The part of the current document the call that opened it asked to show (`--file`), if any.
#[tauri::command]
pub fn doc_focus() -> Option<String> {
    DOC_FOCUS.lock().unwrap().clone()
}

/// The line to show in the file just opened, once.
#[tauri::command]
pub fn take_line() -> Option<u32> {
    LINE.lock().unwrap().take()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launch(args: &[&str]) -> Launch {
        Launch::parse(args.iter().map(|a| (*a).to_owned()))
    }

    #[test]
    fn finds_the_file_among_the_options() {
        assert_eq!(launch(&["a.md"]).file.as_deref(), Some("a.md"));
        let l = launch(&["--line", "12", "--reuse", "a.md", "--geometry", "900x700+40+60"]);
        assert_eq!((l.file.as_deref(), l.line, l.reuse), (Some("a.md"), Some(12), true));
        assert_eq!(l.placement, Placement::parse("900x700+40+60"));
        // The value of an option is not the file, not even another app's option.
        assert_eq!(launch(&["--export-html", "out.html", "App.tsx"]).file.as_deref(), Some("App.tsx"));
        assert_eq!(launch(&["-", "--line", "3"]).file.as_deref(), Some("-"));
        assert_eq!(launch(&["--register-default"]).file, None);
        assert_eq!(launch(&["a", "--line", "x"]).line, None);
        assert_eq!(launch(&["a", "--line", "0"]).line, None);
        assert_eq!(launch(&["-", "--id", "round 7", "--reuse"]).id.as_deref(), Some("round 7"));
        assert_eq!(launch(&["--id", "x", "a.patch"]).file.as_deref(), Some("a.patch"), "the id is not the file");
        assert_eq!(launch(&["a.patch", "--id", ""]).id, None);
        assert_eq!(launch(&["a.patch"]).id, None);
        assert!(launch(&["--annotate", "a.md"]).annotate);
        assert!(!launch(&["a.md"]).annotate);
        assert_eq!(launch(&["--annotate", "a.md"]).file.as_deref(), Some("a.md"));
        assert!(launch(&["-", "--reuse", "--annotate", "--annotate"]).annotate);
        assert!(launch(&["--line", "3", "--annotate"]).annotate);
    }

    #[test]
    fn the_repository_is_not_the_file() {
        let l = launch(&["--repo", "/work/project", "-"]);
        assert_eq!((l.repo.as_deref(), l.file.as_deref()), (Some("/work/project"), Some("-")));
        let l = launch(&["-", "--reuse", "--annotate", "--repo", "/work/project", "--id", "x"]);
        assert_eq!((l.repo.as_deref(), l.file.as_deref(), l.id.as_deref()), (Some("/work/project"), Some("-"), Some("x")));
        assert_eq!(launch(&["a.patch", "--repo", ""]).repo, None);
        assert_eq!(launch(&["a.patch"]).repo, None);
        let l = launch(&["-", "--reuse", "--file", "src/limit.rs", "--id", "x"]);
        assert_eq!((l.file.as_deref(), l.focus.as_deref()), (Some("-"), Some("src/limit.rs")), "the part is not the file");
        assert_eq!(launch(&["a.patch", "--file", ""]).focus, None);
    }

    #[test]
    fn annotates_only_the_files_named_with_annotate() {
        let dir = env::temp_dir().join(format!("qiew-annotate-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.md");
        fs::write(&file, "x").unwrap();
        let link = dir.join("link.md");
        let _ = fs::remove_file(&link);
        std::os::unix::fs::symlink(&file, &link).unwrap();

        assert!(!may_annotate(&file), "nothing is allowed without --annotate");
        assert_eq!(grants(&file), Grants::default());
        let given = Grants { annotate: true, codedeck_socket: Some("/run/codedeck/1.sock".into()), repo: Some("/work".into()) };
        set_grants(&link, given.clone());
        assert!(may_annotate(&file) && may_annotate(&link), "a link stands for its target");
        assert_eq!(grants(&file), given);
        assert!(!may_annotate(&dir.join("other.md")));
        set_grants(&file, Grants { codedeck_socket: Some("/run/codedeck/2.sock".into()), ..Grants::default() });
        assert!(!may_annotate(&file), "a later call without --annotate takes it back");
        assert_eq!(grants(&file).codedeck_socket.as_deref(), Some("/run/codedeck/2.sock"), "the last call's socket counts");
        assert_eq!(grants(&file).repo, None, "and only its repository");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_handover_from_an_older_viewer_is_read_only() {
        let old: Handover = serde_json::from_str(r#"{"file":"a.md","line":null,"geometry":null}"#).unwrap();
        assert!(!old.annotate);
        assert_eq!(old.id, None, "an older viewer names no document");
        let new: Handover = serde_json::from_str(r#"{"file":"a.patch","line":null,"geometry":null,"id":"round 7"}"#).unwrap();
        assert_eq!(new.id.as_deref(), Some("round 7"));
        assert_eq!((old.codedeck_socket, old.repo, old.focus), (None, None, None));
        let full = Handover {
            file: Some("/run/dirq/stdin-1.patch".into()),
            line: None,
            geometry: None,
            annotate: true,
            id: Some("x".into()),
            codedeck_socket: Some("/run/codedeck/1.sock".into()),
            repo: Some("/work".into()),
            focus: Some("src/a.rs".into()),
        };
        let back: Handover = serde_json::from_str(&serde_json::to_string(&full).unwrap()).unwrap();
        assert_eq!((back.annotate, back.codedeck_socket.as_deref(), back.repo.as_deref()), (true, Some("/run/codedeck/1.sock"), Some("/work")));
        // An older viewer reads a newer message: unknown fields are ignored
        #[derive(Deserialize)]
        #[allow(dead_code)]
        struct Older {
            file: Option<String>,
            line: Option<u32>,
            geometry: Option<(Option<(u32, u32)>, Option<(i32, i32)>)>,
        }
        assert!(serde_json::from_str::<Older>(&serde_json::to_string(&full).unwrap()).is_ok());
    }

    #[test]
    fn reads_size_and_position_also_alone() {
        let both = Placement::parse("900x700+40+60").unwrap();
        assert_eq!(both.size, Some(PhysicalSize::new(900, 700)));
        assert_eq!(both.position, Some(PhysicalPosition::new(40, 60)));
        assert_eq!(Placement::parse("900x700").unwrap().position, None);
        assert_eq!(Placement::parse("+40+60").unwrap().size, None);
        assert_eq!(Placement::parse("800x600-10+0").unwrap().position, Some(PhysicalPosition::new(-10, 0)));
        for wrong in ["", "900", "900x", "x700", "0x700", "900x700+40", "+40", "wide"] {
            assert_eq!(Placement::parse(wrong), None, "{wrong}");
        }
    }
}
