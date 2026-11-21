//! Writing comments into the Markdown file shown – the one exception to
//! Marq's never writing to its files, and only with `--annotate`
//! ([`qiew_frame::launch::may_annotate`]).
//!
//! What a comment does to the text is decided by the frontend
//! (`src/annotate.ts`, pure functions with tests). Here the file is written
//! safely:
//!
//! - only a file named with `--annotate` (Z7 in apps/marq/IDEEN.md),
//! - only if it still is what the change was made from: the frontend reads
//!   the file afresh ([`read_document`]), makes the change and hands both
//!   back; if the file changed in between, nothing is written (Z6),
//! - atomically: a temporary file in the same directory, then renamed over
//!   the original, with the original's permissions; a symbolic link stays a
//!   link and its target is written,
//! - never a file marked read-only.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

use qiew_frame::launch::may_annotate;

/// Why nothing was written; the frontend shows it.
fn why(path: &Path, what: impl std::fmt::Display) -> String {
    format!("{}: {what}", path.display())
}

/// Whether this process may write the file itself: opening it for writing
/// (without truncating) changes nothing, not even its time.
fn may_write(path: &Path) -> bool {
    OpenOptions::new().write(true).open(path).is_ok()
}

/// Whether the file can be written at all: the file itself, and the directory
/// that is to take the temporary file.
pub fn writable(path: &Path) -> bool {
    let Ok(meta) = fs::metadata(path) else { return false };
    let dir_ok = path.parent().is_some_and(|d| {
        let probe = d.join(format!(".marq-probe-{}", std::process::id()));
        let ok = OpenOptions::new().write(true).create_new(true).open(&probe).is_ok();
        let _ = fs::remove_file(&probe);
        ok
    });
    may_write(path) && (dir_ok || meta.nlink() > 1)
}

/// Writes `content` to `path` if annotating it is `allowed` and the file still
/// holds `base`. Returns the path written (the target of a link).
pub fn save(path: &Path, base: &str, content: &str, allowed: bool) -> Result<PathBuf, String> {
    if !allowed {
        return Err(why(path, "Marq schreibt nur in Dateien, die mit --annotate geöffnet wurden"));
    }
    let path = fs::canonicalize(path).map_err(|e| why(path, e))?;
    let meta = fs::metadata(&path).map_err(|e| why(&path, e))?;
    if !may_write(&path) {
        return Err(why(&path, "die Datei ist schreibgeschützt"));
    }
    let now = fs::read_to_string(&path).map_err(|e| why(&path, e))?;
    if now != base {
        return Err(why(&path, "die Datei hat sich gerade geändert; nichts geschrieben"));
    }

    // A file with several names (hard links) keeps them only if written in place.
    if meta.nlink() > 1 {
        let mut file = OpenOptions::new().write(true).truncate(true).open(&path).map_err(|e| why(&path, e))?;
        file.write_all(content.as_bytes()).and_then(|()| file.sync_all()).map_err(|e| why(&path, e))?;
        return Ok(path);
    }

    let dir = path.parent().ok_or_else(|| why(&path, "kein Verzeichnis"))?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let temp = dir.join(format!(".{name}.marq-{}.tmp", std::process::id()));
    let written = (|| {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&temp)?;
        file.write_all(content.as_bytes())?;
        fs::set_permissions(&temp, meta.permissions())?;
        file.sync_all()?;
        fs::rename(&temp, &path)?;
        // The rename itself is durable once the directory is.
        File::open(dir).and_then(|d| d.sync_all())
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&temp);
        return Err(why(&path, e));
    }
    Ok(path)
}

/// The file as it is now, to make a change from.
#[tauri::command]
pub fn read_document(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

/// Writes a change made from `base` (see [`save`]).
#[tauri::command]
pub fn save_annotated(path: String, base: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    save(&path, &base, &content, may_annotate(&path)).map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("marq-annotate-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn never_writes_without_annotate() {
        let d = dir("z7");
        let file = d.join("a.md");
        fs::write(&file, "a\n").unwrap();
        assert!(save(&file, "a\n", "b\n", false).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "a\n");
        // The command asks the launch: this test process was not started with --annotate.
        assert!(save_annotated(file.to_string_lossy().into(), "a\n".into(), "b\n".into()).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "a\n");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn writes_nothing_when_the_file_changed() {
        let d = dir("z6");
        let file = d.join("a.md");
        fs::write(&file, "changed meanwhile\n").unwrap();
        assert!(save(&file, "a\n", "b\n", true).unwrap_err().contains("geändert"));
        assert_eq!(fs::read_to_string(&file).unwrap(), "changed meanwhile\n");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn writes_atomically_and_keeps_the_permissions() {
        let d = dir("atomic");
        let file = d.join("a.md");
        fs::write(&file, "a\r\n").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o640)).unwrap();
        save(&file, "a\r\n", "<!-- @ai: x -->\r\n\r\na\r\n", true).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"<!-- @ai: x -->\r\n\r\na\r\n");
        assert_eq!(fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o640);
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1, "no temporary file left");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn writes_the_target_of_a_link() {
        let d = dir("link");
        let file = d.join("a.md");
        let link = d.join("link.md");
        fs::write(&file, "a\n").unwrap();
        std::os::unix::fs::symlink(&file, &link).unwrap();
        assert_eq!(save(&link, "a\n", "b\n", true).unwrap(), fs::canonicalize(&file).unwrap());
        assert!(fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        assert_eq!(fs::read_to_string(&file).unwrap(), "b\n");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn keeps_hard_links() {
        let d = dir("hard");
        let file = d.join("a.md");
        let other = d.join("b.md");
        fs::write(&file, "a\n").unwrap();
        fs::hard_link(&file, &other).unwrap();
        save(&file, "a\n", "b\n", true).unwrap();
        assert_eq!(fs::read_to_string(&other).unwrap(), "b\n");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn leaves_read_only_files_alone() {
        let d = dir("ro");
        let file = d.join("a.md");
        fs::write(&file, "a\n").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o444)).unwrap();
        assert!(!writable(&file));
        assert!(save(&file, "a\n", "b\n", true).unwrap_err().contains("schreibgeschützt"));
        assert_eq!(fs::read_to_string(&file).unwrap(), "a\n");
        let _ = fs::remove_dir_all(&d);
    }
}
