//! Writing comments into the Markdown file shown – the one exception to
//! Marq's never writing to its files, and only with `--annotate`
//! ([`qiew_frame::launch::may_annotate`]).
//!
//! What a comment does to the text is decided by the frontend
//! (`src/annotate.ts`, pure functions with tests). The frame writes the file
//! safely (`qiew_frame::write`):
//!
//! - only a file named with `--annotate` (Z7 in apps/marq/IDEEN.md),
//! - only if it still is what the change was made from: the frontend reads
//!   the file afresh ([`read_document`]), makes the change and hands both
//!   back; if the file changed in between, nothing is written (Z6),
//! - atomically: a temporary file in the same directory, then renamed over
//!   the original, with the original's permissions; a symbolic link stays a
//!   link and its target is written,
//! - never a file marked read-only.

use std::fs;
use std::path::{Path, PathBuf};

use qiew_frame::launch::may_annotate;

/// Whether the file can be written at all (the frame's `write::writable`).
pub fn writable(path: &Path) -> bool {
    qiew_frame::write::writable(path)
}

/// Writes `content` to `path` if annotating it is `allowed` and the file still
/// holds `base` (the frame's `write::save`). Returns the path written.
pub fn save(path: &Path, base: &str, content: &str, allowed: bool) -> Result<PathBuf, String> {
    qiew_frame::write::save(path, base.as_bytes(), content.as_bytes(), allowed, "Marq")
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
