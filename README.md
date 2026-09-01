# hunk-commit

Mark hunks while you review in [Hunk](https://hunk.dev), and move them without
leaving the review — into the git index, or into a commit: a git commit, or a
[Jujutsu](https://github.com/jj-vcs/jj) revision.

![Two hunks of a fix marked amber in a Hunk review, then C, then a one-line
summary prompt, then the review reloads with those hunks gone and an unrelated
typo left behind.](demo/hero.gif)

## Requirements

- Hunk 0.20 or newer (extension API v8)
- `git`, or `jj` — whichever the repository uses
- For jj only: a POSIX shell, which is how the selection reaches `jj`.
  The git path has no such requirement and works on Windows.

## Install

```bash
hunk extension install muzomer/hunk-commit
```

Or, to iterate on a checkout:

```bash
hunk diff --extension /path/to/hunk-commit
```

## Use

Open a working-copy review (`hunk diff`), then:

| Key | Does                                                                                      |
| --- | ----------------------------------------------------------------------------------------- |
| `x` | Mark or unmark the hunk under the cursor — only needed to batch several                   |
| `X` | Mark or unmark the whole file — the only way to mark a binary or oversized file           |
| `N` | Clear all marks                                                                           |
| `S` | Stage the marked hunks, or the one under the cursor — git only                            |
| `C` | Commit the marked hunks, asking only for a summary                                        |
| `B` | Commit them with a description as well — one more question                                |
| `F` | Add the marked hunks to a specific commit, selected from a list                           |
| `D` | Discard the marked hunks, or the one under the cursor — reverts them in your working copy |

Marked lines are painted amber in the diff — a hue the diff's own green, red,
and neutral do not use. By default only the lines that will actually move are
marked; `context_marks` (below) can extend that to the context lines around
them, at the cost of making the marked region look larger than what moves,
since a hunk carries up to three context lines on each side. Every one of these
commands asks first — for a message, or for confirmation — names where the
hunks are going, and reloads the review afterwards, so what you see is what is
still unmoved.

Commands are rebindable by id in Hunk's `[keybindings]` table. **The ids come
from the folder the extension is installed into**, so an install from a
repository named `hunk-commit` gives `hunk-commit.toggleHunk`,
`hunk-commit.toggleFile`, `hunk-commit.clearMarks`, `hunk-commit.stage`,
`hunk-commit.commit`, `hunk-commit.commitWithBody`, `hunk-commit.into`, and
`hunk-commit.discard`.

### Config

```toml
# ~/.config/hunk/config.toml
[extension.hunk-commit]
context_marks = "none"  # how much of a marked hunk's context lines is marked:
                        # "none" (default), "edge" (a thin rail), "full".
```

There is no configured destination: `C` always makes a new commit and `F`
always asks which existing one, so where a hunk lands is decided in the review
rather than in a file.

### Committing

`C` turns the marked hunks straight into a commit — a git commit on the current
branch, or a new Jujutsu revision — instead of leaving them staged. It asks one
question, the summary, and commits. `B` is the same command with a description:
Hunk's input dialog holds a single line, so a body costs a second question, and
only the key that promises one asks it. Cancelling any question abandons the
commit, and typing the message _is_ the confirmation, so nothing asks again
afterwards.

In git it refuses, before asking anything, when something is already staged
(`git commit` would sweep it in) or when a rebase, merge, or cherry-pick is
half-finished. If a `pre-commit` hook rejects the commit, the marked hunks are
unstaged again, so the repository is exactly as it was.

![Pressing B on a marked hunk: a dialog asking for the summary, a second
dialog asking for an optional longer description, then the hunk committed and
gone from the review.](demo/commit.gif)

### Putting hunks into an existing commit

`F` lists the commits you can still change and puts the marked hunks into the
one you pick. Only unpushed commits are offered — `@{upstream}..HEAD`, or the
recent history when the branch tracks nothing — so the picker cannot offer a
commit that someone else may already have.

What happens next differs, and the confirmation says which:

- **In Jujutsu it happens now.** `jj squash` moves the hunks into the revision,
  rebases its descendants, and records one operation that `jj undo` reverses.
- **In git it is deferred.** A `fixup!` commit is added on top, naming the
  target by its full hash — git matches a title _or_ a hash, and titles repeat.
  Nothing is rewritten until you run the `git rebase --autosquash --autostash`
  command the message gives you, at a moment you choose. `--autostash` is part
  of it because the hunks you did not mark are still in your working tree.

![In a Jujutsu workspace, pressing F on a marked hunk: a picker of the commits
that can still be changed, a confirmation naming the revision and the jj undo
that reverses it, then the squash landing immediately.](demo/into.gif)

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

![Marking one hunk and pressing D in a git repository: a confirmation naming
what is about to be lost, then the hunk reverting in the working copy while
the unmarked changes stay.](demo/discard.gif)

## How it works

The marking half is shared. The applying half is not, because the two systems
disagree about what staging _is_.

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
- **No unstaging.** `hunk diff --staged` plus a reversed patch would give git
  unstaging; it is not wired up. `U` is left free for it.
- **`S` is git's alone.** Jujutsu has no index, so there is nothing to stage
  into: `C` and `F` are its two destinations.
- **Discarding is not a transaction.** Every file is checked before any file is
  written, so a refusal changes nothing — but an error partway through the
  writes leaves earlier files already reverted.
- **Nothing routes hunks automatically.** `jj absorb` and `git absorb` send each
  hunk to the commit that last touched those lines; `F` always asks instead, so
  no commit is rewritten on a guess.
- **Binary and oversized files are all-or-nothing** — Hunk shows no hunks for
  them, so `X` is the only way to stage them.
- **Windows works for git, not jj.** The jj helper needs a POSIX shell; the
  seam for a PowerShell version is `src/jj/script.ts`.

## Development

```bash
bun install
bun test          # unit tests, plus integration tests when git / jj are on PATH
bun run typecheck
```

The integration tests build real git and jj repositories in temp directories
and drive the real binaries end to end; each suite skips itself when its binary
is missing.

### Recording the demo GIFs

The GIFs above are recordings of the real extension, not mockups. Regenerate
one after changing a key, a prompt, or a confirmation:

```bash
./demo/record.sh hero      # or: commit, into, discard
```

It needs `vhs`, `ttyd`, and `ffmpeg` alongside the usual toolchain. Each run
builds a throwaway repository (`demo/fixture.ts`), installs this extension into
a config directory of its own — so no other extension, theme, or update notice
of yours reaches the frame — then records `demo/<name>.tape` and checks the
result: a size budget, a length budget, and a last frame that differs from the
first, which is what catches a recording of a TUI that never took a keystroke.

GIFs are binary, so a Hunk review cannot show you what changed. Watch the file
before committing it.

## License

MIT
