---
name: demo-gifs
description: Record and maintain the README demo GIFs for hunk-commit — a real Hunk TUI session driven by VHS against a throwaway fixture repository. Use when the user wants to add, regenerate, or fix a demo GIF, or when a keybinding, prompt, or confirmation wording changes and the committed GIFs may no longer match.
---

# hunk-commit demo GIFs

The README's GIFs are recordings of the **real extension** running in a real
Hunk session. They are evidence, not illustration — so they are produced by a
checked-in pipeline anyone can run, not by an agent improvising a recording.

Your job is to **write and maintain that pipeline**, and to run it when asked.
`./demo/record.sh` must keep working with no agent involved.

## Ground rules

- **Never fake a frame.** Every GIF comes from a real session against the
  fixture repository. If a demo cannot be recorded, say so — do not simulate it.
- **Never commit.** Stop at the working copy and hand off (see *Handoff*).
- **Never `reload` the user's Hunk session or open the TUI interactively**
  outside a VHS recording.

## Inventory

Four GIFs. This list is deliberate — commands not listed here are explained
well enough in prose, and a GIF per command rots faster than it teaches.

| GIF | Shows | Backend | README home |
| --- | --- | --- | --- |
| `hero.gif` | Mark two hunks with `x`, `C`, type a summary, review reloads without them | git | under the opening paragraph, before `## Requirements` |
| `commit.gif` | `C` end to end, including the refusal when something is already staged | git | end of `### Committing` |
| `into.gif` | `F`, the picker, the squash landing immediately | **jj** | end of `### Putting hunks into an existing commit` |
| `discard.gif` | `D`, the confirmation naming what is lost, the hunks reverting | git | end of `### Discarding` |

`into.gif` is jj because jj's squash completes on screen; git's path ends on
"now go run this rebase command", which is a dead final frame. **The backend
must be visible inside the frame** — the fixture sets a shell prompt naming it
(`git-demo ~/cart>` / `jj-demo ~/cart>`) so no viewer mistakes jj's immediate
squash for git's deferred one.

No GIFs for `S` (staging is the familiar `git add -p` shape) or `B` (it is `C`
plus one question).

## Pipeline layout

```
demo/
  fixture.ts     builds the throwaway repo — git and jj variants
  record.sh      preflight, then every tape, then verification
  *.tape         one VHS tape per GIF
  *.gif          committed output
```

`demo/fixture.ts` follows the shape of `test/support/repo.ts` and
`test/support/gitRepo.ts` — pinned author (`Test <test@example.com>`), isolated
`JJ_CONFIG` so nothing reads the machine's real jj configuration — but does
**not import them**. Tests and demos want to diverge; coupling them means a
test refactor silently breaks the README.

### Fixture content

A tiny fake project, not this repo's own source. TypeScript at 16px is
unreadable and `bun.lock` shows up in a real working copy.

Two files, 2–3 hunks, all visible without scrolling, and the *intent* legible
in three seconds without narration: one hunk that is clearly **the fix**, one
that is clearly **an unrelated typo**. That is what makes "mark only some
hunks" self-explanatory.

## Capture settings

Fixed in every tape, so the GIFs match each other and do not change when the
user rethemes:

- **90×28 cells.** Hunk is a split-pane viewer and wants width, but a 120-col
  capture scaled into GitHub's ~900px column is unreadable. If the split diff
  wraps at 90, **stop and ask** rather than silently widening.
- **Font size 16–18**, `Set Theme` pinned in the tape.
- **~12 fps, 15–20s maximum.**
- **1.5 MB hard cap per GIF.** Over budget: fewer frames or a shorter take —
  not more columns.

## Recording loop

1. **Preflight.** Require `vhs`, `ttyd`, `ffmpeg`, `git`, `jj`, `hunk`. `ttyd`
   is the one that is usually missing and VHS shells out to it
   (`nix profile install nixpkgs#ttyd`). Missing binary → stop, name it.
2. **Build the fixture** for that tape's backend.
3. **Gate on readiness.** Poll `hunk session list --json` until the session
   exists, *before* the tape's first keystroke. **If it never appears, fail
   hard** — a tape that types into a TUI that has not painted yet records a
   blank terminal and looks like a successful run.
4. **Record**, with real keystrokes for everything the README documents. Keys
   are the whole story of this tool; a cursor that moves by RPC is not
   evidence that `x` works. `hunk session navigate --file X --hunk N` is a
   fallback for a tape that proves flaky, not the default.
5. **Verify** (see below).
6. **Hand off.**

Sleeps are generous — 800ms+, timed to read well to a human, not to just
barely win the race. A GIF too fast to follow fails at the only thing it was
for.

## Verification

Every recording asserts, and `record.sh` exits non-zero on any failure:

- the session appeared before the first keystroke;
- the **last frame differs from the first** — proof something visibly
  happened, and the one check that catches a frozen or blank recording;
- the file is **under 1.5 MB**.

## README integration

GIFs **supplement** the prose; no paragraph is removed. The `F` and `D`
sections explain consequences (recoverable in jj, not in git) that no GIF can
show.

Each GIF goes at the **end** of its section, after the explanation — a reader
who meets an autoplaying animation first loses the explanation.

**Every GIF gets real alt text** describing what happens — "Two hunks marked
amber, then C, then a summary prompt, then the review reloads without them" —
never `demo`. GIFs are invisible to screen readers, to slow connections, and
to the agents that will read this README when someone asks how the extension
works.

## Handoff

Report the paths written, the verification results, and the size of each GIF.

Then say explicitly: **open the GIFs and watch them before committing.**
GIFs are binary, so a Hunk review cannot show the change — `X` marks a binary
file wholesale and there is no hunk to read. Watching is the only real review
a demo GIF can get.
