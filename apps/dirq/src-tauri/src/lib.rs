//! Dirq – read-only viewer for diffs and patches. Groundwork: it opens a file, follows it and
//! hands its text to the frontend; what the app is to become is in README.md.
//!
//! Zero-Touch-Policy: this backend never writes to the files it shows; they
//! are only read, the watcher merely observes. As an AppImage, an accepted
//! update replaces the image file. Comments (only with `--annotate`) are
//! messages to the program that started Dirq, never changes to the file; the
//! repository named with `--repo` is only read (Qiew `docs/ANNOTATE.md`).

mod repo;

use std::fs;
use std::path::{Path, PathBuf};

use qiew_frame::text::{self, Document};
use qiew_frame::launch::grants;
use qiew_frame::{AppInfo, Viewer};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};

static INFO: AppInfo = AppInfo {
    name: "Dirq",
    bin: "dirq",
    version: env!("CARGO_PKG_VERSION"),
    say: "Dirk",
    ipa: "dɜːk",
    generic_name: "Diff Viewer",
    comment: "Read-only viewer for diffs and patches",
    categories: "Utility;Viewer;TextTools;Development;",
    mime_types: &["text/x-patch", "text/x-diff"],
    open_with: &[],
    mime_definition: None,
    files: "Diff-Dateien (.diff, .patch)",
    extensions: &[".diff", ".patch"],
    features: &[
        "Shows diffs and patches side by side or unified, with changed words marked.",
        "A header with the patch's subject, author, date, message and totals.",
        "File list with status and +/- counts; F7 / Shift+F7 jump from change to change.",
        "Reads git diff, git format-patch, IntelliJ IDEA patches, Subversion and plain diff -u.",
        "Exports the view as one HTML file.",
        "Comments on single lines only with --annotate: they go to the program that started Dirq (CODEDECK_SOCKET), never into the patch.",
        "With --repo, more lines around a change from the repository (read-only).",
    ],
    usage: &["git diff | dirq -", "git diff | dirq - --annotate --repo ."],
    options: &[
        (
            "--id <text>",
            "name the document: the same text means a new version of the one shown before (kept: scroll position, folded files, filter, comments), another text a different document. Put it after the file or `-`.",
        ),
        (
            "--annotate",
            "let the user comment on single lines (a \"+\" in the margin); each comment is sent to the program that started Dirq (CODEDECK_SOCKET), never written to the patch. Without it Dirq only views.",
        ),
        (
            "--file <path>",
            "show only this file of the patch, with a bar to step to the others and to show all of them; the file list starts closed. Without it Dirq shows all files. Put it after the file or `-`.",
        ),
        (
            "--repo <path>",
            "let Dirq look into this Git repository, read-only, for more lines around a change and for files marked as generated. Put it after the file or `-`.",
        ),
    ],
};

/// A file as the frontend gets it, with what the call that named it allowed.
#[derive(Serialize)]
struct Opened {
    #[serde(flatten)]
    doc: Document,
    /// `--annotate`: lines may be commented.
    annotate: bool,
    /// Comments have somewhere to go (`CODEDECK_SOCKET`).
    connected: bool,
    /// `--repo`: there is a repository to read from.
    repo: bool,
}

/// The repository the call that named `path` allows reading from, if it is a directory.
fn repo_of(path: &str) -> Option<PathBuf> {
    grants(Path::new(path)).repo.map(PathBuf::from).filter(|r| r.is_dir())
}

/// Reads a file and starts watching it for changes.
#[tauri::command]
fn open_file(
    path: String,
    app: AppHandle,
    window: WebviewWindow,
    viewer: State<'_, Viewer>,
) -> Result<Opened, String> {
    let path: PathBuf = fs::canonicalize(&path).map_err(|e| format!("{path}: {e}"))?;
    let doc = text::load(&path)?;
    viewer.watch(&app, &path, text::load);

    if let Some(name) = path.file_name() {
        let _ = window.set_title(&format!("{} – Dirq", name.to_string_lossy()));
    }
    let given = grants(&path);
    Ok(Opened {
        doc,
        // Only with --annotate: without it there is no "+" and nothing is sent
        annotate: given.annotate,
        connected: given.annotate && given.codedeck_socket.is_some(),
        repo: given.repo.is_some_and(|r| Path::new(&r).is_dir()),
    })
}

/// Which of the blobs the patch names the repository has (`--repo` only; else none).
#[tauri::command]
async fn repo_blobs(path: String, names: Vec<String>) -> Vec<bool> {
    match repo_of(&path) {
        Some(repo) => repo::blobs(&repo, &names),
        None => vec![false; names.len()],
    }
}

/// The text of a blob from the repository (`--repo` only).
#[tauri::command]
async fn repo_blob(path: String, name: String) -> Result<String, String> {
    let repo = repo_of(&path).ok_or("no repository (--repo)")?;
    repo::blob(&repo, &name)
}

/// The files of the patch the repository marks as generated (`--repo` only).
#[tauri::command]
async fn repo_generated(path: String, files: Vec<String>) -> Vec<String> {
    repo_of(&path).map(|repo| repo::generated(&repo, &files)).unwrap_or_default()
}

#[tauri::command]
fn initial_file(viewer: State<'_, Viewer>) -> Option<String> {
    viewer.initial_file()
}

/// The frontend is ready to be seen (colour scheme applied, first file shown).
#[tauri::command]
fn show_window(window: WebviewWindow, viewer: State<'_, Viewer>) {
    viewer.show(&window);
}

/// The width two columns and the file list need; the window takes it (`--geometry` wins).
#[tauri::command]
fn fit_width(width: f64, window: WebviewWindow, viewer: State<'_, Viewer>) {
    viewer.set_width(&window, width.clamp(480.0, 4000.0));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Dirq's comments are sent, never written into the file: --annotate also holds for a patch on
    // standard input, which is how CodeDeck hands one over
    qiew_frame::launch::annotate_stdin();
    if qiew_frame::handle_cli(&INFO) {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Viewer::default())
        // The patch as it is shown, in one HTML file (the frontend makes it).
        .manage(
            qiew_frame::export::Exporter::new("HTML", "html", |app, content| {
                let source = app.state::<Viewer>().current().ok_or("No file is open.")?;
                let html = content.filter(|h| !h.is_empty()).ok_or("This is not a patch Dirq can lay out, so there is nothing to export.")?;
                Ok(qiew_frame::export::Exported { source, content: html.into_bytes() })
            })
            .suffix("view"),
        )
        .invoke_handler(tauri::generate_handler![
            open_file,
            initial_file,
            show_window,
            fit_width,
            qiew_frame::codedeck::send_comment,
            repo_blobs,
            repo_blob,
            repo_generated,
            qiew_frame::about::about_info,
            qiew_frame::about::open_about_link,
            qiew_frame::export::export_info,
            qiew_frame::export::export_file,
            qiew_frame::launch::take_line,
            qiew_frame::launch::doc_id,
            qiew_frame::launch::doc_focus
        ])
        .setup(|app| {
            qiew_frame::setup(app, &INFO);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Dirq")
        .run(|app, event| qiew_frame::on_run_event(app, &event));
}
