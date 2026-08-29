import type { CommitBlocker } from "../git/commit";

/**
 * Everything this extension says to a reviewer.
 *
 * Kept together so the vocabulary stays consistent — "mark" for choosing,
 * "stage" for moving, and the revision always named — and so wording can be
 * reviewed without reading through the command handlers.
 */
export interface MarkSummary {
  readonly files: number;
  readonly hunks: number;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const messages = {
  marked: (summary: MarkSummary) =>
    `Marked: ${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")}`,

  cleared: "Cleared every mark",

  noHunkSelected: "Put the cursor on a hunk first, then mark it",

  nothingToActOn: "Put the cursor on a hunk, or mark several with x",

  noWorkspace: "This review is not inside a git or Jujutsu workspace",

  unsupportedPlatform:
    "Staging into Jujutsu needs a POSIX shell to hand jj the selection, which this platform does not provide",

  confirmTitle: (summary: MarkSummary, destination: string, source: "marks" | "cursor") =>
    `Stage ${source === "cursor" ? "the hunk under the cursor" : plural(summary.hunks, "hunk")} into ${destination}?`,

  confirmBody: (summary: MarkSummary, destination: string, kind: "git" | "jj") =>
    `${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")} will move into ${destination}. ` +
    `Your files on disk do not change. ${
      kind === "jj" ? "Undo the whole move with `jj undo`." : "Unstage with `git restore --staged`."
    }`,

  staged: (summary: MarkSummary, destination: string) =>
    `Staged ${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")} into ${destination}`,

  describeCommit: (summary: MarkSummary) =>
    `Commit ${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")} — describe it`,

  describeCommitPlaceholder: "One line: what this change does",

  describeCommitBody: "Longer description (optional) — Enter to skip",

  describeCommitBodyPlaceholder: "Why, or anything the summary leaves out",

  /**
   * Said after the commit exists, and it names the way back. Both systems can
   * undo this one, which is worth saying: a commit made by accident from a
   * review is exactly the moment someone wants to know that.
   */
  committed: (summary: MarkSummary, destination: string, kind: "git" | "jj") =>
    `Committed ${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")} into ${destination} — ` +
    (kind === "jj" ? "`jj undo` reverses it" : "undo with `git reset --soft HEAD~1`"),

  /**
   * Refusals from the pre-commit checks. Each one names the obstacle, the way
   * to clear it, and how to come back — a reviewer should never have to guess
   * what the extension objected to.
   */
  cannotCommit: (blocker: CommitBlocker) =>
    blocker === "index-not-empty"
      ? "Something is already staged in the index, and committing would include it. Commit or unstage it first (`git restore --staged .`), then press C again."
      : "A rebase, merge, or cherry-pick is half-finished here. Finish or abort it first, then press C again.",

  confirmDiscardTitle: (summary: MarkSummary, source: "marks" | "cursor") =>
    `Discard ${source === "cursor" ? "the hunk under the cursor" : plural(summary.hunks, "hunk")}?`,

  /**
   * The one message where the two systems must not sound alike. In Jujutsu the
   * working copy is already in the operation log, so this is reversible; in
   * git, uncommitted text that is overwritten is gone.
   */
  confirmDiscardBody: (summary: MarkSummary, kind: "git" | "jj") =>
    `${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")} will be reverted in your working copy. ` +
    (kind === "jj"
      ? "This one is recoverable: `jj undo` brings the changes back."
      : "This cannot be undone — the changes exist nowhere else."),

  discarded: (summary: MarkSummary, kind: "git" | "jj") =>
    `Discarded ${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")}` +
    (kind === "jj" ? " — `jj undo` brings them back" : ""),

  nothingToDiscard: "Nothing would be reverted — nothing was discarded",

  cannotDiscard: (path: string, detail: string) =>
    `Cannot discard ${path}: ${detail}. Revert it with your VCS instead.`,

  nothingToStage:
    "Nothing would move — the marks were cleared before staging ran, so nothing was staged",

  stale: (path: string, detail: string) =>
    `${path} changed since this review loaded (${detail}). Nothing was staged — refresh with r.`,

  disagreement: (path: string, detail: string) =>
    `Refusing to stage ${path}: ${detail}. This is a bug — please report it.`,

  /** Whatever the backend reported, whichever backend it was. */
  failed: (detail: string) => `Could not finish: ${detail}`,

  chooseTarget: "Stage marked hunks where?",

  chooseCommit: "Put the marked hunks into which commit?",

  noCommitsAvailable:
    "There is no unpushed commit here to put these hunks into — press C to make a new one",

  confirmFixupTitle: (summary: MarkSummary, short: string, source: "marks" | "cursor") =>
    `Put ${source === "cursor" ? "the hunk under the cursor" : plural(summary.hunks, "hunk")} into ${short}?`,

  /**
   * The message that has to correct an expectation. "Into an existing commit"
   * sounds like history changes now, and it does not: what appears is one more
   * commit, and the reviewer decides when to fold it in.
   */
  confirmFixupBody: (summary: MarkSummary, short: string, finish: string) =>
    `${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")} will become a \`fixup!\` commit on top, ` +
    `marked for ${short}. Nothing is rewritten now — fold it in when you are ready with \`${finish}\`.`,

  fixedUp: (summary: MarkSummary, short: string, finish: string) =>
    `Committed ${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")} as a \`fixup!\` for ${short} — ` +
    `history is unchanged until you run \`${finish}\``,

  newRevisionOption: "A new revision",

  describeNewRevisionPlaceholder: "Description (optional)",

  describeNewRevision: (summary: MarkSummary) =>
    `Describe the new revision (${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")})`,

} as const;
