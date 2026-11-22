//! Looking into the repository named with `--repo` (Qiew `docs/ANNOTATE.md`, section 6): read-only,
//! with a fixed argument list and no shell. Only `git cat-file` (lines around a change, from the
//! blobs the patch names in its `index` lines) and `git check-attr` (`linguist-generated`). This
//! lives in Dirq, not in the frame, so no other viewer inherits access to Git.

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

/// The largest blob that is read, in bytes: more context is no help in a file this big.
const MAX_BLOB: usize = 8 * 1024 * 1024;

/// An abbreviated or full object name, nothing else (never an option or a revision expression).
pub fn is_object_name(name: &str) -> bool {
    (4..=64).contains(&name.len()) && name.bytes().all(|b| b.is_ascii_hexdigit()) && !name.bytes().all(|b| b == b'0')
}

fn git(repo: &Path) -> Command {
    let mut command = Command::new("git");
    command.arg("-C").arg(repo).env("GIT_OPTIONAL_LOCKS", "0").stdin(Stdio::null()).stderr(Stdio::null());
    command
}

/// Which of the objects are blobs the repository has, in the order asked.
pub fn blobs(repo: &Path, names: &[String]) -> Vec<bool> {
    let asked: Vec<&String> = names.iter().filter(|n| is_object_name(n)).collect();
    if asked.is_empty() {
        return vec![false; names.len()];
    }
    let child = git(repo).args(["cat-file", "--batch-check"]).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn();
    let Ok(mut child) = child else { return vec![false; names.len()] };
    if let Some(mut stdin) = child.stdin.take() {
        let input: String = asked.iter().map(|n| format!("{n}\n")).collect();
        let _ = stdin.write_all(input.as_bytes());
    }
    let Ok(output) = child.wait_with_output() else { return vec![false; names.len()] };
    let found = String::from_utf8_lossy(&output.stdout);
    // One answer per name asked: "<name> blob <size>", "<name> missing", "<name> ambiguous"
    let mut answers = found.lines().map(|l| l.split(' ').nth(1) == Some("blob"));
    names.iter().map(|n| is_object_name(n) && answers.next().unwrap_or(false)).collect()
}

/// The text of a blob; an error if it is not there, too big or not text.
pub fn blob(repo: &Path, name: &str) -> Result<String, String> {
    if !is_object_name(name) {
        return Err(format!("{name}: not an object name"));
    }
    let output = git(repo).args(["cat-file", "blob", name]).output().map_err(|e| format!("git: {e}"))?;
    if !output.status.success() {
        return Err(format!("{name}: not in the repository"));
    }
    if output.stdout.len() > MAX_BLOB {
        return Err(format!("{name}: too big"));
    }
    if output.stdout.contains(&0) {
        return Err(format!("{name}: not text"));
    }
    Ok(qiew_frame::text::decode(&output.stdout))
}

/// The paths the repository's `.gitattributes` mark as generated (`linguist-generated`).
pub fn generated(repo: &Path, paths: &[String]) -> Vec<String> {
    let paths: Vec<&String> = paths.iter().filter(|p| !p.is_empty()).take(5000).collect();
    if paths.is_empty() {
        return Vec::new();
    }
    let child = git(repo).args(["check-attr", "--stdin", "-z", "linguist-generated"]).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn();
    let Ok(mut child) = child else { return Vec::new() };
    if let Some(mut stdin) = child.stdin.take() {
        let input: Vec<u8> = paths.iter().flat_map(|p| p.bytes().chain([0])).collect();
        let _ = stdin.write_all(&input);
    }
    let Ok(output) = child.wait_with_output() else { return Vec::new() };
    parse_check_attr(&String::from_utf8_lossy(&output.stdout))
}

/// `-z` output: path, attribute, value, each ended by NUL.
fn parse_check_attr(out: &str) -> Vec<String> {
    let parts: Vec<&str> = out.split('\0').collect();
    parts
        .chunks(3)
        .filter(|c| c.len() == 3 && matches!(c[2], "set" | "true"))
        .map(|c| c[0].to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(dir: &Path, args: &[&str]) {
        let ok = Command::new("git").arg("-C").arg(dir).args(args).env("GIT_CONFIG_GLOBAL", "/dev/null").output().unwrap();
        assert!(ok.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&ok.stderr));
    }

    #[test]
    fn only_object_names() {
        assert!(is_object_name("3b18e51"));
        assert!(is_object_name(&"a".repeat(40)));
        assert!(!is_object_name("0000000"), "git's name for nothing");
        assert!(!is_object_name("--all"));
        assert!(!is_object_name("HEAD"));
        assert!(!is_object_name("abc"));
        assert!(!is_object_name("3b18e51:x"));
    }

    #[test]
    fn reads_blobs_and_attributes_of_a_repository() {
        let dir = std::env::temp_dir().join(format!("dirq-repo-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("gen")).unwrap();
        run(&dir, &["init", "-q"]);
        std::fs::write(dir.join("a.txt"), "one\ntwo\nthree\n").unwrap();
        std::fs::write(dir.join(".gitattributes"), "gen/** linguist-generated\n").unwrap();
        run(&dir, &["add", "a.txt", ".gitattributes"]);
        let out = Command::new("git").arg("-C").arg(&dir).args(["hash-object", "a.txt"]).output().unwrap();
        let full = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let short = full[..7].to_string();

        assert_eq!(blob(&dir, &short).unwrap(), "one\ntwo\nthree\n");
        assert!(blob(&dir, "1234567").is_err());
        assert!(blob(&dir, "--help").is_err());
        assert_eq!(blobs(&dir, &[short.clone(), "1234567".into(), "HEAD".into(), full]), [true, false, false, true]);
        assert_eq!(generated(&dir, &["gen/x.js".into(), "a.txt".into()]), ["gen/x.js"]);
        assert_eq!(blobs(&dir.join("nope"), &[short]), [false], "no repository: nothing, no error");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
