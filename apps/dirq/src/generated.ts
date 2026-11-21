/**
 * Files nobody reads line by line: lock files, minified bundles, snapshots, build output.
 * They start folded, with a hint, and still count in the totals. No DOM in here.
 */

const NAMES = new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "go.sum", "gradle.lockfile"]);
const SUFFIXES = [".lock", ".min.js", ".min.css", ".snap", ".map"];
const FOLDERS = new Set(["dist"]);

export function isGenerated(path: string): boolean {
  const parts = path.toLowerCase().split("/");
  const name = parts[parts.length - 1];
  if (NAMES.has(name) || SUFFIXES.some((s) => name.endsWith(s))) return true;
  return parts.slice(0, -1).some((p) => FOLDERS.has(p));
}
