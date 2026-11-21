# Dirq

**Diffs and patches, side by side – like a diff tool.**

Dirq (read: Dirk) shows a diff or patch file the way a diff tool would: old and new text next to each other,
the changed words marked, the files in a list on the left and the patch's own data – subject, author, message –
in a header on top.

say “Dirk” /dɜːk/ · part of [Qiew](../../README.md) and [be spex](https://bespex.github.io) – small, focused apps for Linux

## Install

### With APT (Debian, Ubuntu, Linux Mint)

Once, add the be spex repository:

```sh
curl -fsSLO https://bespex.github.io/packages/be-spex-archive-keyring.deb
sudo apt install ./be-spex-archive-keyring.deb && sudo apt update
```

Then:

```sh
sudo apt install dirq
```

Updates arrive with `sudo apt upgrade`.

### AppImage

Download `Dirq_*_amd64.AppImage` from the [latest Dirq release](https://github.com/bespex/Qiew/releases?q=dirq-v),
make it executable (`chmod +x Dirq_*_amd64.AppImage`) and start it.

Dirq updates itself: it checks for a newer version and offers to replace the AppImage in place. That update
is built into Dirq and does not use zsync, so tools that rely on AppImageUpdate cannot update it.

An AppImage has no menu entry of its own. To get one (and a file association), use an AppImage manager such
as [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever),
[AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or
[appimaged](https://github.com/probonopd/go-appimage). With APT you get both without extra tools.

### Other ways

Take the `.deb` from the same release and run `sudo apt install ./dirq_*_amd64.deb`.

Requirements: Ubuntu 24.04+, Linux Mint 22+ or Debian 13+ (x86_64).

## Features

- **Side by side or unified** – switch in the toolbar; the choice is kept. Changed words are marked inside
  changed lines; removed and added blocks line up row by row.
- **Syntax colours** – code is coloured by its language (from the file name: Rust, TypeScript, Java, XML,
  Python, Go, SQL, YAML, Dockerfile, Gradle, Protobuf, Nginx and many more), in every colour scheme and in
  the HTML export. The old and the new side are coloured apart, so a comment that spans a hunk boundary stays
  a comment; changed words stay marked on top. Unknown languages and very large files stay plain.
- **A header for the patch** – subject, author, date and commit, the message, trailers (`Co-Authored-By`,
  `Reviewed-by` …) and the totals as numbers and a bar.
- **Files at a glance** – list with status (modified, added, deleted, renamed, copied), `+`/`−` counts and the
  common folder cut off; click to jump. Files fold; very long ones start folded.
- **Generated files fold themselves** – lock files, minified bundles, snapshots, source maps and `dist/` start
  folded with a line such as “generated · 1,240 lines · Show”; they still count in the totals.
- **Filter and sort the file list** – type to filter by path, toggle new / changed / deleted / renamed, sort by
  patch order, size of the change or status. The filter survives a reload of the patch file.
- **Outline** – the function or class names in the `@@ … @@` lines appear under each file; click one to jump
  to its hunk.
- **Navigate by keyboard** – F7 / Shift+F7 (or the arrows) jump to the next or previous change, Alt+↓ / Alt+↑
  to the next or previous file, Alt+← / Alt+→ back and forward along the jumps made (files, changes, outline
  entries), Ctrl+Shift+O shows or hides the file list. `?` – or "Keyboard Shortcuts" in the menu – lists them.
- **Ignore whitespace** – changes in blanks only show as unchanged.
- **Formats** – `git diff`, `git format-patch`, IntelliJ IDEA "Create Patch", Subversion and plain `diff -u`:
  renames, mode changes, binary files, "no newline at end of file". What is not a unified diff is shown as written.
- **Search, copy, export** – Ctrl+F; copy the patch text; export the view as one HTML file.

Like every Qiew viewer: read-only, one file at a time, live reload, copy, About box, four colour schemes, and the
question whether it should become the default viewer.

## Usage

- **Open a file:** drag it onto the window, `dirq change.patch`, `git diff | dirq -` or double-click. Dirq
  handles `.diff` and `.patch`. `--line <n>` shows that line of the patch file.
- **Keys:** F7 / Shift+F7 next / previous change, Ctrl+F search.


## Try it

`example.patch` next to `run.sh` shows the common cases:

```sh
apps/dirq/run.sh apps/dirq/example.patch
```

## Working with CodeDeck

Dirq stays a program of its own; [CodeDeck](https://github.com/bespex) uses it the way it uses any viewer. The
common part (`--line`, `--geometry`, standard input, `--reuse`) is described in the [Qiew README](../../README.md#working-with-codedeck).

## License

MIT – see [LICENSE](../../LICENSE).
