# Qiew

**One small viewer per file type.**

Quick viewers for Linux: small, read-only, one file at a time. They open what you drop on them or
double-click, show it nicely, follow the file when it changes – and never write to it.

**Website:** https://bespex.github.io/#qiew · part of [be spex](https://bespex.github.io) – small, focused apps for Linux

| App | Shows | |
| --- | --- | --- |
| [Trisq](apps/trisq/README.md) | TSX/JSX: a React component, running – no Node.js, no project | Tailwind, imports, live reload, error display |
| [Marq](apps/marq/README.md) | Markdown, rendered | links, images, Mermaid diagrams, outline, back/forward |
| [Jayq](apps/jayq/README.md) | JSON source, pretty-printed and foldable | jq filter view |
| [Xaq](apps/xaq/README.md) | XML source, pretty-printed and foldable | XSLT mapping view |
| [Hyqe](apps/hyqe/README.md) | HTML pages, rendered like in a browser – without one | JavaScript, source view |
| [Cusq](apps/cusq/README.md) | CSV/TSV as a table | sort, filter, full-text search |
| [Dirq](apps/dirq/README.md) | diffs and patches, side by side | metadata header, word-level changes |
| [Maiqe](apps/maiqe/README.md) | Mermaid diagrams, one card each | zoom, text view |


All of them: copy, live reload, file association, and the same toolbar: navigation on the left, what is shown in
the centre, on the right the app's view switches, then copy and export, and at the edge
the menu with colour scheme and About. Marq, Xaq and Jayq also search (Ctrl+F) and have four colour
schemes; Trisq takes its colours and its width from the component.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/jayq/docs/images/jayq-split-dark.png">
  <img src="apps/jayq/docs/images/jayq-split-light.png" alt="Jayq's filter view: the JSON on the left, a jq filter in the middle, its result on the right">
</picture>

## Install

### With APT (Debian, Ubuntu, Linux Mint)

Once, add the be spex repository:

```sh
curl -fsSLO https://bespex.github.io/packages/be-spex-archive-keyring.deb
sudo apt install ./be-spex-archive-keyring.deb && sudo apt update
```

Then all viewers at once, including any added later:

```sh
sudo apt install qiew
```

or only the ones you want, e.g. `sudo apt install marq dirq`. Updates arrive with `sudo apt upgrade`.

Each viewer offers once, on its first start, to become the default app for its files. To do that for
all installed viewers in one step instead (as your own user, not with `sudo`):

```sh
qiew-setup
```

### AppImage

Each app has its own AppImage in the [releases](https://github.com/bespex/Qiew/releases) (tags `trisq-v…`,
`marq-v…`, `jayq-v…`, `xaq-v…`). It runs as it is and updates itself; see the README of the app for details.

### Other ways

Take the `.deb` of an app from its release and run `sudo apt install ./<app>_*_amd64.deb`.

Requirements: Ubuntu 24.04+, Linux Mint 22+ or Debian 13+ (x86_64).

## Build from source

Tauri 2 + Vanilla TypeScript; one npm workspace and one Cargo workspace for all apps.

```sh
npm install
npm run tauri --workspace apps/xaq -- dev -- -- path/to/file.xml   # development
npm run tauri --workspace apps/xaq -- build                        # .deb and AppImage (Linux)
npm run check                                                       # type-check and build everything
```

## Layout

```
apps/<app>/            an app: index.html, src/ (frontend), src-tauri/ (backend, window, bundle)
packages/frame/        @qiew/frame – frontend shared by the apps
crates/frame/          qiew-frame – backend shared by the apps
tools/screenshots/     takes the screenshots for the READMEs and the website
.github/workflows/     release.yml: builds and publishes one app per tag
```

The frame is what makes a new viewer cheap:

- `packages/frame`: colour schemes (`views`), toolbar and copy (`toolbar`), About box (`about`), export button (`export`), search (`search`), page and
  toolbar styles (`base.css`); for source views also the markup fragments (`fragment`), folding (`fold`),
  the viewer itself – open, drop, live reload, history – (`viewer`), the split view with editor and result
  (`split`) and their styles (`source.css`). An app adds its parser and highlighter.
- `crates/frame`: the command line (`launch`), window placement and widening, file watcher, reading text in any encoding, export
  (button, save dialog and writing; an app only says what its export is),
  default-handler registration, moving the directories of an old identifier, AppImage update check.

## Command line

Every viewer understands the same command line, so a script or another program can drive it:

```sh
<app> [<file> | -] [--line <n>] [--geometry <W>x<H>+<X>+<Y>] [--reuse]
```

| | |
| --- | --- |
| `<file>` | the file to show |
| `-` | read the document from standard input: `git diff \| dirq -`, `curl -s … \| jayq -` |
| `--line <n>` | show that line of the file and mark it for a moment. Xaq and Jayq re-indent, so they find the line by what it says; Marq shows the block that holds it; Trisq has no lines to show. |
| `--geometry` | place the window: content size and position in physical pixels; either part may be left out (`900x700`, `+40+60`) |
| `--annotate` | Marq only: allow comments on the blocks of this file (`<!-- @ai: … -->`); Marq writes them into the file and changes nothing else. It holds for this call and this file: a file handed over again without it, or opened by a link, is read-only. |
| `--reuse` | hand the file to a window that was started with `--reuse` before, if one is open, instead of opening another; it comes to the front. Windows started without it are left alone. `<app> --reuse --line 40` shows a line of the file that window already has. |
| `--register-default` | make the app the default for its files, without asking |
| `--help`, `-h`, `-?` | print what the program is, how it is called and what it can do, then exit |
| `--version` | print the version, then exit |

Standard input is kept as a file of the app's own in the runtime directory (`$XDG_RUNTIME_DIR/<app>/`) and
removed when the window is closed; the files a viewer shows are never written to – except comment lines in
a file Marq was asked to annotate (`--annotate`).

## Working with CodeDeck

Every viewer is a program of its own and stays one. [CodeDeck](https://github.com/bespex), the be spex
coding deck, leaves viewing files to such programs; this is how the two meet without depending on each other.

- **Found through the desktop** – CodeDeck offers the programs installed for a file type ("View with…") and
  remembers one per kind of file. A viewer's desktop entry and file types are all it needs to be on that list.
- **Driven through the command line** (above) – `--reuse` keeps one window per viewer while stepping through
  files, `--line` jumps to a place, `--geometry` puts the window beside CodeDeck's own, and `-` shows what
  CodeDeck has only in memory, such as a diff.

- **Permissions per call, never kept** – what a viewer may do beyond showing is given by the program that
  starts it, on the command line of that call, for the document of that call. `--reuse` hands it over with
  the document; a document opened by a drop or a link gets none.
  - `--annotate` lets the user comment. Marq writes the comment into the Markdown file (`<!-- @ai: … -->`).
    Dirq has nothing to write into: it sends each comment on a line to the program that started it.
  - `CODEDECK_SOCKET=<path>` in the environment names where Dirq sends comments. By itself it allows nothing.
  - `--repo <path>` lets Dirq read a Git repository (only `git cat-file` and `git check-attr`) for more lines
    around a change and for files marked as generated.
  - `--id <text>` names the document: the same text is a new version of the one shown before.
- **The way back** – a comment from Dirq is one line of JSON on the Unix socket; nothing is read back:
  `{"v":1,"action":"line_comment","source":"dirq","id":"<id>","file":"<path in the patch>","line":<new line>,"code":"<the line>","text":"<comment>","session":"<X-CodeDeck-Session>","doc":"<--id>"}`
  and `{"v":1,"action":"line_comment_remove","source":"dirq","id":"<id>"}`. A comment on a removed line names
  the next line of the new side and starts its `code` with `(gelöschte Zeile) `.

Options go after the file or `-`: a viewer ignores options it does not know, and an older one would take a
value for the file if it came first.

CodeDeck's part: start the viewers with these options (`--annotate` for Dirq only for a patch of the working
tree, whose line numbers are those of the files on disk), set the variable, take the comments as line comments
of the next prompt, and prefer the be spex viewers in its list. With Dirq installed, CodeDeck's Changes show
the files and Dirq shows their diffs (a double click on a file).

## Release

Each app has its own version and its own tag. Bump the version in `apps/<app>/package.json`,
`apps/<app>/src-tauri/tauri.conf.json` and `apps/<app>/src-tauri/Cargo.toml`, write the release notes into
`apps/<app>/release-notes/<version>.md` (they become the text of the GitHub release; without the file the release has
none), commit, then

```sh
git tag xaq-v<version> && git push origin xaq-v<version>
```

[`release.yml`](.github/workflows/release.yml) builds the app, publishes the release `xaq-v<version>` and
updates `xaq.json` in the release `updater`, which is where the AppImages look for a newer version.
The package repository picks up the `.deb` within half an hour.

Marq and Xaq started in repositories of their own; their history is part of this one (tags `marq-v*`, `xaq-v*`).

## License

MIT – see [LICENSE](LICENSE).
