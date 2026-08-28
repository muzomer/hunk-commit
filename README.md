# hunk-stage

Mark hunks while you review in [Hunk](https://hunk.dev), and stage them without
leaving the review — into the git index, or into a [Jujutsu](https://github.com/jj-vcs/jj)
revision.

Either way, **your files on disk never change**. Staging moves ownership of a
change, not the change itself: in git the marked hunks land in the index, and
in jj they move into another revision while the rest stays in the working-copy
change.

## Requirements

- Hunk 0.20 or newer (extension API v8)
- `git`, or `jj` — whichever the repository uses
- For jj only: a POSIX shell, which is how the selection reaches `jj`.
  The git path has no such requirement and works on Windows.

## Install

```bash
hunk extension install <owner>/hunk-stage
```

Or, to iterate on a checkout:

```bash
hunk diff --extension /path/to/hunk-stage
```

## Use

Open a working-copy review (`hunk diff`), then:

| Key | Does |
| --- | --- |
| `x` | Mark or unmark the hunk under the cursor |
| `X` | Mark or unmark the whole file — the only way to mark a binary or oversized file |
| `C` | Clear every mark |
| `S` | Stage the marked hunks |
| `T` | jj only: pick which revision to stage into |

Marked lines are painted in the diff. Staging asks first, names its
destination, and reloads the review, so what you see afterwards is what is
still unstaged.

Commands are rebindable by id in Hunk's `[keybindings]` table. **The ids come
from the folder the extension is installed into**, so an install from a
repository named `hunk-stage` gives `hunk-stage.toggleHunk`,
`hunk-stage.toggleFile`, `hunk-stage.clearMarks`, `hunk-stage.stage`, and
`hunk-stage.stageInto`.

### Config

```toml
# ~/.config/hunk/config.toml
[extension.hunk-stage]
target = "@-"   # jj only: the revision `S` stages into. Ignored in git repositories.
```

## How it works

The marking half is shared. The applying half is not, because the two systems
disagree about what staging *is*.

**Git** has an index, so staging is a patch applied to it. `hunk diff` in a git
repository is a bare `git diff` — the working tree against the index — so a
patch of the marked hunks applies exactly where it was measured, and composes
with whatever was staged before. Whole-file marks go through `git add` instead,
which handles binaries, renames, and mode changes natively.

**Jujutsu** has no index, so staging is `jj squash`, and sub-file selection has
to go through jj's diff editor: it runs one with `$left` holding the target's
content and `$right` holding everything the source revision changed, and
whatever `$right` contains when the editor exits is what moves. So this
extension rebuilds each partly marked file by **reverting** its unmarked hunks,
writes the results into a staging directory, and points a generated merge-tool
config at a small `sh` script that copies that directory into `$right`. `jj`
does the rest — rewriting the target, rebasing descendants, and recording one
operation, which **`jj undo` reverses completely**.

The difference shows up in one detail: in git, a file nobody marked needs no
instruction at all, because "not staged" is git's default state. In jj, a
revision has to be told what stays behind.

Both paths use the same line arithmetic against the patch Hunk is already
showing, so there is no re-diffing and no fuzz, and all of it stays in
TypeScript where it is unit-tested. The shell script holds none of it.

## What it refuses to do

Staging is refused, with nothing written, when:

- **the working copy moved on.** Every marked file is checked against the patch
  the review was built from, line by line. Hunk reviews a snapshot, so a marked
  hunk can stop meaning what it meant. A mismatch stops the whole operation.
- **the two parses disagree.** Hunk parses the patch to render it and assigns
  the hunk indexes you mark; this extension parses it again to rebuild files.
  If the two ever disagree about a hunk's extent, marking hunk 2 could stage
  something else, so staging refuses instead.
- **the review is not a working-copy review**, the jj target is not a usable
  revset, or a path cannot be expressed in the helper's manifests (paths
  containing newlines).

## Known limitations

- **Working-copy reviews only.** Rebuilding a file reads it from the working
  copy, so `hunk show <rev>` and range diffs are not stageable.
- **Staging only, not unstaging.** `hunk diff --staged` plus a reversed patch
  would give git unstaging; it is not wired up.
- **jj stages into an ancestor only.** `jj split` and `jj absorb` are not wired
  up yet; both would reuse the same machinery.
- **Binary and oversized files are all-or-nothing** — Hunk shows no hunks for
  them, so `X` is the only way to stage them.
- **Windows works for git, not jj.** The jj helper needs a POSIX shell; the
  seam for a PowerShell version is `src/jj/script.ts`.

### Compared with `hunk-git-lite`

[`hunk-git-lite`](https://github.com/joshedler/hunk-git-lite) also stages from
inside Hunk, at **file** granularity, with a status pane showing staged and
unstaged sections. This extension works at **hunk** granularity and covers
Jujutsu as well, but has no status pane. They are complementary.

## Development

```bash
bun install
bun test          # unit tests, plus integration tests when git / jj are on PATH
bun run typecheck
```

The integration tests build real git and jj repositories in temp directories
and drive the real binaries end to end; each suite skips itself when its binary
is missing.

Layout:

| Path | Holds |
| --- | --- |
| `index.ts` | composition root: Hunk commands, events, highlights |
| `src/patch/` | parsing patches, rebuilding files, writing a patch back out |
| `src/staging/` | the backend port, and what each file contributes |
| `src/git/` | the index backend |
| `src/jj/` | the revision backend, and jj's diff-editor protocol |
| `src/ui/` | marks, painted highlights, wording, settings |
| `src/workspace.ts` | which system a review sits in — jj wins a colocated tie |

`src/` never imports from `index.ts`, nothing under `src/patch/` touches the
filesystem, and neither backend knows the other exists.

## License

MIT
