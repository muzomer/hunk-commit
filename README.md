# hunk-jj-stage

Mark hunks while you review in [Hunk](https://hunk.dev), and move them into a
[Jujutsu](https://github.com/jj-vcs/jj) revision without leaving the review.

Jujutsu has no index, so "staging" here means what it means in jj: the marked
hunks are squashed into another revision, and everything else stays in the
working-copy change. **Your files on disk never change** — when the target is
an ancestor of `@`, the working copy holds the same content before and after.
Only ownership moves.

## Requirements

- Hunk 0.20 or newer (extension API v8)
- Jujutsu on `PATH`
- A POSIX shell, which is how the selection reaches `jj` (see below).
  Windows is not supported yet.

## Install

```bash
hunk extension install <owner>/hunk-jj-stage
```

Or, to iterate on a checkout:

```bash
hunk diff --extension /path/to/hunk-jj-stage
```

## Use

Open a working-copy review in a jj workspace (`hunk diff`), then:

| Key | Does |
| --- | --- |
| `x` | Mark or unmark the hunk under the cursor |
| `X` | Mark or unmark the whole file — the only way to mark a binary or oversized file |
| `C` | Clear every mark |
| `S` | Stage the marked hunks into the default target (`@-`) |
| `T` | Pick a target revision, then stage into it |

Marked lines are painted in the diff. Staging asks for confirmation, names the
revision, and reloads the review, so what you see afterwards is what is left in
the working-copy change.

Every command is rebindable by its id (`jj-stage.toggleHunk`,
`jj-stage.toggleFile`, `jj-stage.clearMarks`, `jj-stage.stage`,
`jj-stage.stageInto`) in Hunk's `[keybindings]` table.

### Config

```toml
# ~/.config/hunk/config.toml
[extension.jj-stage]
target = "@-"   # revision `S` stages into; any revset jj accepts
```

## How it works

`jj` has no way to be told "move these hunks" — sub-file selection happens in a
diff editor. It runs one with two directories: `$left` holds the target's
content and `$right` holds everything the source revision changed, and whatever
`$right` contains when the editor exits is what moves.

So `$right` already means "stage everything", and staging a subset means
editing it down. This extension:

1. rebuilds each partly marked file by **reverting** its unmarked hunks —
   exact line arithmetic against the patch Hunk is already showing, so there
   is no re-diffing and no fuzz;
2. writes the results, plus a list of files to delete or restore, into a
   temporary staging directory;
3. runs `jj squash --interactive --tool …` with a generated merge-tool config
   pointing at a small `sh` script that copies the staging directory into
   `$right`;
4. refreshes the review.

All the logic lives in TypeScript, where it is unit-tested. The shell script
holds none of it — it copies files and nothing else.

`jj` does the rest: rewriting the target, rebasing its descendants, and
recording one operation. **`jj undo` reverses a staging completely.**

## What it refuses to do

Staging is refused, with nothing written, when:

- **the working copy moved on.** Every marked file is checked against the patch
  the review was built from, line by line. Hunk reviews a snapshot while `jj`
  snapshots the working copy on every command, so a marked hunk can stop
  meaning what it meant. A mismatch stops the whole operation.
- **the two parses disagree.** Hunk parses the patch to render it and assigns
  the hunk indexes you mark; this extension parses it again to rebuild files.
  If the two ever disagree about a hunk's extent, marking hunk 2 could stage
  something else, so staging refuses instead.
- **the review is not a jj working-copy review**, the target is not a usable
  revset, or a path cannot be expressed in the helper's manifests (paths
  containing newlines).

## Known limitations

- **Working-copy reviews only.** Rebuilding a file reads it from the working
  copy, so `hunk show <rev>` and range diffs are not stageable.
- **Squash into an ancestor only.** `jj split` and `jj absorb` are not wired up
  yet; both would reuse the same machinery.
- **Binary and oversized files are all-or-nothing** — Hunk shows no hunks for
  them, so `X` is the only way to move them.
- **Windows** needs a PowerShell equivalent of the helper script. The seam for
  it is `src/staging/script.ts`.

## Development

```bash
bun install
bun test          # unit tests, plus integration tests when `jj` is on PATH
bun run typecheck
```

The integration tests build a real jj workspace in a temp directory and drive a
real `jj` binary end to end; they skip themselves when `jj` is missing.

Layout:

| Path | Holds |
| --- | --- |
| `index.ts` | composition root: Hunk commands, events, highlights |
| `src/patch/` | parsing patches and rebuilding files from a subset of hunks |
| `src/staging/` | deciding what each file contributes, and preparing it for `jj` |
| `src/jj/` | locating the workspace and running `jj` |
| `src/ui/` | marks, painted highlights, wording, settings |

`src/` never imports from `index.ts`, and nothing under `src/patch/` touches
the filesystem.

## License

MIT
