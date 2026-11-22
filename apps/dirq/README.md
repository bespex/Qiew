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
- **Files at a glance** – a side panel lists the files with status (modified, added, deleted, renamed, copied) and
  `+`/`−` counts, the common folder cut off; click to jump. It folds away (the button on the left of the toolbar,
  Ctrl+Shift+O), and its width can be dragged at its edge (200 to 400 pixels; double click: 300). Files fold; very
  long ones start folded.
- **Two ways through it, in the toolbar** – changes (± ↑ 2/5 ↓, Alt+↓ / Alt+↑ or F7 / Shift+F7) and files (‹ 2/7 ›,
  Alt+→ / Alt+←), each with where you are. The centre names what is shown.
- **One file alone** – the button with the page on the right of the toolbar shows one file at a time under a compact
  header; ‹ › step to the other files, the same button shows all of them again. The file list stays as you set it.
  `--file <path>` starts with that file, the file list closed; without it Dirq starts with all files and the list open. CodeDeck opens a file this way on a double click.
- **Generated files fold themselves** – lock files, minified bundles, snapshots, source maps and `dist/` start
  folded with a line such as “generated · 1,240 lines · Show”; they still count in the totals.
- **Filter and sort the file list** – type to filter by path, toggle new / changed / deleted / renamed, sort by
  patch order, size of the change or status. The filter survives a reload of the patch file.
- **Live review** – while a patch changes (a file that is rewritten, or a program that hands Dirq new versions
  with `--reuse`), the view stays where it is: it keeps its place by the hunk you were reading, not by pixels, and
  the folded files, the filter and the selection stay. What is new or changed since the last version flashes and
  keeps a thin bar at the left; the file list shows a dot at such files, and a strip beside the scroll bar marks
  every change, new ones stronger – click a mark to go there. "Clear" in the file list (or a click on a dot) removes
  the marks. Dirq tells a new version from another document by the path, or by `--id <text>` when a program hands
  the patch over through standard input: the same text is a new version of the same document.
- **Navigate by keyboard** – up and down within, left and right across: Alt+↓ / Alt+↑ (or F7 / Shift+F7) jump to
  the next or previous change, Alt+→ / Alt+← to the next or previous file; Alt+Shift+← / Alt+Shift+→ (or the
  mouse's back and forward buttons) go back and forward along the jumps made, Ctrl+Shift+O shows or hides the file
  list, Esc closes the window. `?` – or "Keyboard Shortcuts" in the menu – lists them.
- **Ignore whitespace** – changes in blanks only show as unchanged.
- **Formats** – `git diff`, `git format-patch`, IntelliJ IDEA "Create Patch", Subversion and plain `diff -u`:
  renames, mode changes, binary files, "no newline at end of file". What is not a unified diff is shown as written.
- **Search, copy, export** – Ctrl+F; copy the patch text; export the view as one HTML file.
- **Comments for the assistant** – only when the program that started Dirq allows it (`--annotate`, see below).
- **More lines around a change** – only with `--repo`: between the hunks "20 more", "All" and "Whole file", the
  lines read from the repository, with the right numbers on both sides and in colour.

Like every Qiew viewer: read-only (comments are messages to another program, not changes to the file), one file at a time, Esc closes the window, live reload, copy, About box, four colour schemes, and the
question whether it should become the default viewer.

## Usage

- **Open a file:** drag it onto the window, `dirq change.patch`, `git diff | dirq -` or double-click. Dirq
  handles `.diff` and `.patch`. `--line <n>` shows that line of the patch file.
- **Keys:** Alt+↓ / Alt+↑ (or F7 / Shift+F7) next / previous change, Alt+→ / Alt+← next / previous file, Ctrl+F search, Esc closes.
- **Options:** `--file <path>` shows one file alone (above); `--annotate` lets the user comment on lines (below); `--repo <path>` lets Dirq read that Git
  repository, read-only, for more lines around a change and for files its `.gitattributes` mark as generated
  (`linguist-generated`). `--id <text>` names the document. Put options after the file or `-`.

## Comments for the assistant (`--annotate`)

A program that starts Dirq – CodeDeck – can let you comment on single lines of the patch. Each comment goes to
that program, which hands it to the AI with your next prompt.

1. **Without `--annotate` nothing changes.** No "+" at the lines, no cards, no button, no key. That is the normal case.
2. **With it you can add, change and remove comments on single lines** – context, added and removed lines. Point at
   a line and click the "+" in the margin, or press Ctrl+Alt+M (the line under the pointer, else the change the
   last jump went to). Ctrl+Enter sends, Esc cancels. Pointing at a card shows a pen (change) and a bin (remove).
   That is all the option turns on: Dirq still writes nothing anywhere.
3. **Dirq keeps no comments.** They live in the window while the document is shown; the receiving program keeps
   them. A new version of the same document (same `--id`, or a file that changed) keeps them at their line,
   found again by its text; a line that is gone leaves its card dimmed with "line changed". Another document
   starts without them.
4. **It is a permission, not a setting.** Only on the command line of a call, never in a file or a menu.
5. **It holds for that call's document.** A document handed over later without `--annotate` is read-only again.

| `--annotate` | `CODEDECK_SOCKET` | What happens |
|---|---|---|
| no | no | view only |
| no | yes | view only: the variable allows nothing by itself |
| yes | yes | comments; each one is sent to the socket |
| yes | no | comments stay in the window ("kept here"); "Copy as list" in the comment list gives Markdown |

A comment that could not be sent says "not sent" and offers "Send again"; the comment list offers to send all
of them again. Esc does not close the window while comments have reached nobody: the first Esc shows them, a second
one closes anyway. The button with the bubble in the toolbar shows how many there are and opens the list.

```sh
git diff | dirq - --annotate --repo .    # comment, and nothing receives them: copy them as a list
```


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
