//! Writing a comment into the file shown – the one exception to a viewer's never writing to its
//! files, and only with `--annotate` (Marq, Hyqe; [`crate::launch::may_annotate`]). What a comment
//! does to the text is the app's business; here the file is written safely:
//!
//! - only if annotating it is allowed (Z7 in apps/marq/KOMMENTARE.md),
//! - only if it still is what the change was made from (`base`); if it changed in between, nothing
//!   is written (Z6),
//! - atomically: a temporary file in the same directory, then renamed over the original, with the
//!   original's permissions; a symbolic link stays a link and its target is written; a file with
//!   several names (hard links) is written in place, so the names stay together,
//! - never a file marked read-only.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

/// Why nothing was written; the frontend shows it.
fn why(path: &Path, what: impl std::fmt::Display) -> String {
    format!("{}: {what}", path.display())
}

/// Whether this process may write the file itself: opening it for writing (without truncating)
/// changes nothing, not even its time.
fn may_write(path: &Path) -> bool {
    OpenOptions::new().write(true).open(path).is_ok()
}

/// Whether the file can be written at all: the file itself, and the directory that is to take the
/// temporary file.
pub fn writable(path: &Path) -> bool {
    let Ok(meta) = fs::metadata(path) else { return false };
    let dir_ok = path.parent().is_some_and(|d| {
        let probe = d.join(format!(".qiew-probe-{}", std::process::id()));
        let ok = OpenOptions::new().write(true).create_new(true).open(&probe).is_ok();
        let _ = fs::remove_file(&probe);
        ok
    });
    may_write(path) && (dir_ok || meta.nlink() > 1)
}

/// Writes `content` to `path` if annotating it is `allowed` and the file still holds `base`.
/// `app` names the viewer in messages. Returns the path written (the target of a link).
pub fn save(path: &Path, base: &[u8], content: &[u8], allowed: bool, app: &str) -> Result<PathBuf, String> {
    if !allowed {
        return Err(why(path, format!("{app} schreibt nur in Dateien, die mit --annotate geöffnet wurden")));
    }
    let path = fs::canonicalize(path).map_err(|e| why(path, e))?;
    let meta = fs::metadata(&path).map_err(|e| why(&path, e))?;
    if !may_write(&path) {
        return Err(why(&path, "die Datei ist schreibgeschützt"));
    }
    let now = fs::read(&path).map_err(|e| why(&path, e))?;
    if now != base {
        return Err(why(&path, "die Datei hat sich gerade geändert; nichts geschrieben"));
    }

    // A file with several names (hard links) keeps them only if written in place.
    if meta.nlink() > 1 {
        let mut file = OpenOptions::new().write(true).truncate(true).open(&path).map_err(|e| why(&path, e))?;
        file.write_all(content).and_then(|()| file.sync_all()).map_err(|e| why(&path, e))?;
        return Ok(path);
    }

    let dir = path.parent().ok_or_else(|| why(&path, "kein Verzeichnis"))?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let temp = dir.join(format!(".{name}.{}-{}.tmp", app.to_lowercase(), std::process::id()));
    let written = (|| {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&temp)?;
        file.write_all(content)?;
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
