---
name: hunkdiff-upgrade
description: Complete a hunkdiff dependency bump for hunk-commit — read the release notes, reconcile the declared extension API generation, the README, and the demo GIFs with what the new Hunk actually does. Use when a Renovate PR bumps hunkdiff, when the user asks whether a new Hunk release needs changes here, or after manually changing the hunkdiff version.
---

# Completing a hunkdiff bump

Renovate announces the version bump; it cannot finish it. `renovate.json5` says
why in full — hunkdiff is imported almost entirely as `import type`, so it is
erased before runtime and only one test module actually evaluates it. Green CI
on a hunkdiff PR means almost nothing.

**Work on Renovate's own branch.** Its cooldown is turned off precisely so that
branch arrives on release day, with `package.json` and `bun.lock` already
bumped. Add your reconciliation commits on top, so one PR carries the bump and
everything the bump implies — a reviewer sees the new version and the README
line it moved as one change. Do not open a competing PR and close Renovate's:
Renovate treats a closed PR as a decision and its PRs can regenerate, so that
path fights the bot instead of using it.

```sh
git fetch origin && git switch renovate/hunkdiff-0.x   # name varies
```

Two cautions once you are on it:

- **Never tick the rebase/retry checkbox** in the PR body. That hands the
  branch back to Renovate, which rebuilds it from its own commit — your work
  is not on the version it rebuilds from.
- **Renovate may or may not keep updating a branch a human has pushed to**
  (it detects modification, but confirm the behaviour for this install rather
  than trusting this line). If a newer hunkdiff lands while the PR is open,
  check that the branch is on the version you think it is before finishing.

**Your job is the part CI cannot do:** read what changed in Hunk, and reconcile
this repository's *claims* about Hunk with what Hunk now is.

## Ground rules

- **Never open the TUI or `reload` the user's Hunk session.** Same rule as
  `demo-gifs`; the only Hunk that may run is one VHS drives.
- **Never commit or push** when a human is driving. Stop at the working copy
  and hand off — Renovate's branch is shared, with an open PR on it, so
  pushing to it is the owner's call.

  The one exception is `.github/workflows/hunkdiff-upgrade.yml`, which runs
  this skill unattended when Renovate opens the PR and grants the push in its
  prompt. Push only when something has said so explicitly; the default is
  still stop-and-report.
- **Never claim a release note says something you did not read.** If `gh` fails
  or the release has no notes, say so and stop. Guessing at an API change is
  worse than reporting that you could not check.

## 1. Establish the range

```sh
git diff origin/main -- package.json          # on Renovate's branch
jj diff -r @ package.json                     # or, in jj
```

You need **old version → new version**, and every release in between. Renovate
skips versions, so 0.20.1 → 0.22.0 means reading three sets of notes, not one.

hunkdiff is **0.x**: a minor bump is breaking by convention, and Hunk uses that
convention — extension API generations advance on minors.

## 2. Read the release notes

Notes live on the git tag, `v` prefixed, in the upstream repo:

```sh
gh release view v0.21.0 --repo modem-dev/hunk --json body -q .body
gh release list --repo modem-dev/hunk --limit 15
```

Skip prereleases (`v0.21.0-beta.1`) — npm dist-tags never ship them here.

Two places in each body carry the signal:

- the **`### For extension authors`** section — the curated summary; read it
  whole, it is short.
- the collapsed commit list — grep it for `(extension`, `(extensions`,
  `(api`. A breaking rename sometimes lands there without reaching the
  curated section.

A permalink form also exists (`https://hunk.dev/changelog/0.21/`), linked from
the bottom of each release body. Use it if `gh` is unavailable.

## 3. Run the gates

```sh
bun install
bun test
bun run typecheck
```

`bun test` covers `hunk.apiVersion` (see below). `tsc --noEmit` is the *only*
thing checking the four types this repo imports —
`ExtensionCommandContext`, `ExtensionDiffFile`, `ExtensionLineHighlight`,
`HunkExtensionAPI` (`index.ts`, `src/ui/session.ts`). Neither gate says
anything about runtime behaviour, wording, or keybindings.

## 4. Reconcile every claim

Work this table top to bottom. The first two rows a gate will fail on; the rest
drift **silently** and are the actual reason this skill exists.

| Claim | Where | How to check |
| --- | --- | --- |
| Declared API generation | `package.json` → `hunk.apiVersion` | `bun test`; the value is `HUNK_EXTENSION_API_VERSION` from `hunkdiff/extension` |
| Imported type surface | `index.ts`, `src/ui/session.ts` | `bun run typecheck` |
| Minimum Hunk version + API generation, in prose | `README.md` → `## Requirements` | **Fix the numbers.** Nothing checks this line |
| Command ids, keybindings, config keys | `README.md` → the command table, `[extension.hunk-commit]` | Against the release notes only — read `hunk-extensions` (below) if an id scheme changed |
| Dialog and confirmation wording | `demo/*.tape`, `README.md` | Release notes; the tapes assert on screen text |
| The four demo GIFs | `demo/*.gif` | See *GIFs*, below |

**On the Requirements line:** it states a minimum Hunk version *and* an API
generation, and both move together — mechanically, with no judgement call.

The host refuses any extension declaring a generation **higher** than its own,
and `test/manifest.test.ts` pins our declaration to the installed hunkdiff's
`HUNK_EXTENSION_API_VERSION`. So raising the dependency raises what we declare,
which raises the oldest Hunk that will load us at all. It is not "the oldest
Hunk whose API we happen to use" — the declaration alone locks older hosts out.

The minimum is therefore **the first Hunk release shipping the generation we
now declare**. Generations advance on minors, so it is normally the new minor
itself. Confirm rather than assume — read the constant out of the published
tarballs:

```sh
for v in 0.20.1 0.21.0; do
  curl -sL "$(npm view hunkdiff@$v dist.tarball)" \
    | tar -xzO package/dist/npm/extension/index.js \
    | grep -o "HUNK_EXTENSION_API_VERSION = [0-9]*" | head -1 | sed "s/^/$v: /"
done
```

Worked example: 0.19.0 ships generation 6, 0.20.0 and 0.20.1 ship 8, 0.21.0
ships 16 — so the 0.20.1 → 0.21.0 bump moved the line from
"Hunk 0.20 or newer (extension API v8)" to "Hunk 0.21 or newer (extension
API v16)". Note 0.20.1 did *not* move it: patches keep the generation, so a
patch bump leaves this line alone.

## 5. Deeper API questions

hunkdiff ships its own authoring map at
`node_modules/hunkdiff/skills/hunk-extensions/SKILL.md`, and it is versioned
with the package — so after `bun install` it already describes the *new* API.
Read it when the release notes mention an extension change you cannot map onto
this repo's code. Diffing it across the bump is the fastest way to see what
actually moved:

```sh
git diff HEAD -- node_modules/hunkdiff/skills/   # if vendored; otherwise
                                                 # read the new one directly
```

## 6. GIFs

If wording, a keybinding, a dialog, or Hunk's rendering changed, the committed
GIFs are now lying. **Do not re-record them here** — hand off to the
`demo-gifs` skill, which owns `demo/record.sh` and the tape inventory. Your
output is the *decision*: which GIFs are stale and which release note makes
them stale.

If nothing visible changed, say so explicitly. Re-recording four GIFs for a
no-op churns binary files in git for nothing.

## Handoff

Report, in this order:

1. **Versions** — old → new, and every release read in between.
2. **What the notes say for extension authors** — the relevant lines, quoted.
3. **Gates** — `bun test` and `bun run typecheck`, pass or fail with output.
4. **Files changed**, and the claim each change reconciles.
5. **GIFs** — stale (which, and why) or unaffected.
6. **Unresolved** — anything the notes imply but you could not verify without
   running Hunk. This section is the point of the handoff; an empty one should
   be rare on a minor bump.

Then stop. Suggest the commit — Conventional Commits, `chore(deps):` or
`docs:` depending on what dominates — and let the user run it.
