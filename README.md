# hunk-commit

Mark hunks while you review in [Hunk](https://hunk.dev), and move them without
leaving the review — into the git index, or into a commit: a git commit, or a
[Jujutsu](https://github.com/jj-vcs/jj) revision.

Either way, **your files on disk never change**. Staging moves ownership of a
change, not the change itself: in git the marked hunks land in the index, and
in jj they are extracted into their own revision — the `git add -p` shape,
without an index to hold them — while the rest stays in the working-copy
change.

## Requirements

- Hunk 0.20 or newer (extension API v8)
- `git`, or `jj` — whichever the repository uses
- For jj only: a POSIX shell, which is how the selection reaches `jj`.
  The git path has no such requirement and works on Windows.

## Install

```bash
hunk extension install <owner>/hunk-commit
```

Or, to iterate on a checkout:

```bash
hunk diff --extension /path/to/hunk-commit
```

## Use

Open a working-copy review (`hunk diff`), then:

| Key | Does |
| --- | --- |
| `x` | Mark or unmark the hunk under the cursor — only needed to batch several |
| `X` | Mark or unmark the whole file — the only way to mark a binary or oversized file |
| `N` | Clear every mark |
| `S` | Stage the marked hunks, or the one under the cursor |
| `C` | Commit them, asking for a summary and an optional description |
| `D` | Discard the marked hunks, or the one under the cursor — reverts them in your working copy |
| `T` | jj only: pick where they go — a new revision, or one that exists |

Marked lines are painted amber in the diff — a hue the diff's own green, red,
and neutral do not use. By default only the lines that will actually move are
marked; `context_marks` (below) can extend that to the context lines around
them, at the cost of making the marked region look larger than what moves,
since a hunk carries up to three context lines on each side. A completely
blank line stays untinted whatever you choose: marks colour characters, and a
blank line has none to colour. Staging asks first — for a description
when it is extracting a new revision, otherwise for confirmation — names its
destination, and reloads the review, so what you see afterwards is what is
still unstaged.

Commands are rebindable by id in Hunk's `[keybindings]` table. **The ids come
from the folder the extension is installed into**, so an install from a
repository named `hunk-commit` gives `hunk-commit.toggleHunk`,
`hunk-commit.toggleFile`, `hunk-commit.clearMarks`, `hunk-commit.stage`,
`hunk-commit.commit`, `hunk-commit.discard`, and `hunk-commit.stageInto`.

### Config

```toml
# ~/.config/hunk/config.toml
[extension.hunk-commit]
target = "new"          # jj only, and the default: extract a new revision.
                        # Any revset instead — "@-", a change id — squashes into it.
                        # Ignored in git repositories.
context_marks = "none"  # how much of a marked hunk's context lines is marked:
                        # "none" (default), "edge" (a thin rail), "full".
```

`"new"` suits the working style where `@` *is* the change you are building:
marking hunks and pressing `S` carves a finished piece out from under it,
rewriting nothing that already exists. Set a revset instead if you work the
other way, keeping `@` as scratch above the change you are building and
squashing down into it as you go.

### Committing

`C` turns the marked hunks straight into a commit — a git commit on the current
branch, or a new Jujutsu revision — instead of leaving them staged. It asks for
a summary and then an optional description; an empty description is fine, and
cancelling either question abandons the commit. Typing the message *is* the
confirmation, so nothing asks again afterwards.

In git it refuses, before asking anything, when something is already staged
(`git commit` would sweep it in) or when a rebase, merge, or cherry-pick is
half-finished. If a `pre-commit` hook rejects the commit, the marked hunks are
unstaged again, so the repository is exactly as it was.

### Discarding

`D` is the opposite of `S`: instead of moving the marked hunks somewhere, it
reverts them in your working copy. The arithmetic is the same one staging
uses, run the other way round — staging keeps the marked hunks and reverts the
rest, discarding reverts the marked hunks and keeps the rest.

The consequence is not the same, and the confirmation says so in different
words depending on where you are:

- **In a Jujutsu workspace it is recoverable.** Loading a review runs
  `jj diff`, which snapshots the working copy into the operation log, so the
  state before the discard is already recorded. `jj undo` brings the changes
  back.
- **In a git repository it is not.** Uncommitted text that gets overwritten
  exists nowhere else — there is no stash, no dangling object, nothing to
  recover from. This is the same finality as `git restore -p`.

Discarding always asks first; there is no path that skips the confirmation. A
binary file is refused rather than guessed at, because the patch carries no
record of what it held before — revert those with `jj restore` or
`git restore`.

## How it works

The marking half is shared. The applying half is not, because the two systems
disagree about what staging *is*.

**Git** has an index, so staging is a patch applied to it. `hunk diff` in a git
repository is a bare `git diff` — the working tree against the index — so a
patch of the marked hunks applies exactly where it was measured, and composes
with whatever was staged before. Whole-file marks go through `git add` instead,
which handles binaries, renames, and mode changes natively.

**Jujutsu** has no index, so staging is a rewrite — `jj split` to extract the
marked hunks into a new revision, or `jj squash` to fold them into one that
already exists. Either way sub-file selection goes through jj's diff editor: it
runs one with `$left` holding the target's content and `$right` holding
everything the source revision changed, and whatever `$right` contains when the
editor exits is what moves. So this extension rebuilds each partly marked file
by **reverting** its unmarked hunks, writes the results into a staging
directory, and points a generated merge-tool config at a small `sh` script that
copies that directory into `$right`. Both commands read the same two
directories, so the selection means the same thing to either. `jj` does the
rest — rewriting revisions, rebasing descendants, and recording one operation,
which **`jj undo` reverses completely**.

The new revision's description is passed with `--message`, so jj never opens an
editor that would fight Hunk for the terminal.

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
- **Discarding is not a transaction.** Every file is checked before any file is
  written, so a refusal changes nothing — but an error partway through the
  writes leaves earlier files already reverted.
- **`jj absorb` is not wired up** — routing each hunk to the ancestor that last
  touched those lines would reuse the same machinery.
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
