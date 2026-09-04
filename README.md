# hunk-commit

Mark hunks while you review in [Hunk](https://hunk.dev), and move them without
leaving the review — into the git index, or into a commit: a git commit, or a
[Jujutsu](https://github.com/jj-vcs/jj) revision.

![Two hunks of a fix marked amber in a Hunk review, then C, then a one-line
summary prompt, then the review reloads with those hunks gone and an unrelated
typo left behind.](demo/hero.gif)

## Requirements

- Hunk 0.21 or newer
- `git`, or `jj` — whichever the repository uses
- For jj only: a POSIX shell, which is how the selection reaches `jj`

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

| Key | Does                                                                                     |
| --- | ---------------------------------------------------------------------------------------- |
| `x` | Mark or unmark the hunk under the cursor — only needed to batch several                  |
| `X` | Mark or unmark the whole file — the only way to mark a binary or oversized file          |
| `N` | Clear all marks                                                                          |
| `S` | Stage the marked hunks, or the one under the cursor — git only                           |
| `C` | Commit the marked hunks, asking only for a summary                                       |
| `B` | Commit the marked hunks with a description                                               |
| `F` | Add the marked hunks to a specific commit, selected from a list                          |
| `D` | Discard the marked hunks, or the one under the cursor — reverts them in the working copy |
| `L` | Show what is marked, in a pane beside the review                                         |

Commands are rebindable in Hunk's `[keybindings]` table as
`<folder>.<commandId>` — an install from a repository named `hunk-commit` gives
`hunk-commit.toggleHunk`, `hunk-commit.stage`, and so on for every id in
`index.ts`.

### Config

```toml
# ~/.config/hunk/config.toml
[extension.hunk-commit]
context_marks = "none"  # how much of a marked hunk's context lines is marked:
                        # "none" (default), "edge" (a thin rail), "full".
```

Marked context is tinted rather than coloured, so its visibility depends on
your theme; `"edge"` reads almost anywhere, `"full"` can be near-invisible on a
dark one.

### Committing

![Pressing B on a marked hunk: a dialog asking for the summary, a second
dialog asking for an optional longer description, then the hunk committed and
gone from the review.](demo/commit.gif)

### Putting hunks into an existing commit

`F` puts the marked hunks into a commit you pick. Only unpushed commits are
offered — `@{upstream}..HEAD`.

What happens next differs:

- **In Jujutsu it happens now.** `jj squash` moves the hunks into the revision,
  rebases its descendants, and records one operation that `jj undo` reverses.
- **In git it is deferred.** A `fixup!` commit is added on top, naming the
  target by hash rather than title, since titles repeat. Nothing is rewritten
  until you run the `git rebase --autosquash --autostash` command the message
  gives you — `--autostash` because your unmarked hunks are still in the tree.

![In a Jujutsu workspace, pressing F on a marked hunk: a picker of the commits
that can still be changed, a confirmation naming the revision and the jj undo
that reverses it, then the squash landing immediately.](demo/into.gif)

### Discarding

`D` reverts the marked hunks in the working copy:

- **In Jujutsu it is recoverable.** Loading a review runs `jj diff`, which
  snapshots the working copy into the operation log, so `jj undo` brings the
  changes back.
- **In git it is not.** Overwritten uncommitted text exists nowhere else — no
  stash, no dangling object. The same finality as `git restore -p`.

![Marking one hunk and pressing D in a git repository: a confirmation naming
what is about to be lost, then the hunk reverting in the working copy while
the unmarked changes stay.](demo/discard.gif)

## How it works

The marking half is shared. The applying half is not, because the two systems
disagree about what staging _is_.

**Git** has an index, so staging is a patch applied to it, composing with
whatever was staged before. Whole-file marks go through `git add`, which
handles binaries, renames, and mode changes natively.

**Jujutsu** has no index, so staging is a rewrite: `jj split` to extract the
marked hunks, or `jj squash` to fold them into an existing revision. Sub-file
selection goes through jj's diff editor, which this extension drives by
rebuilding each partly marked file with its unmarked hunks reverted. jj does
the rest, recording one operation that **`jj undo` reverses completely**. The
mechanics are in `src/jj/`.

## Development

```bash
bun install
bun test          # unit tests, plus integration tests when git / jj are on PATH
bun run typecheck
```

Integration tests build real git and jj repositories in temp directories and
drive the real binaries; each suite skips itself when its binary is missing.

### Recording the demo GIFs

The GIFs above are recordings of the real extension. Regenerate one after
changing a key, a prompt, or a confirmation:

```bash
./demo/record.sh hero      # or: commit, into, discard
```

It needs `vhs`, `ttyd`, and `ffmpeg`, builds a throwaway repository, and
verifies the result before it lets the run pass. GIFs are binary, so a Hunk
review cannot show you what changed — watch the file before committing it.
