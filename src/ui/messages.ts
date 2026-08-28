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

  gitHasOneDestination: "In a git repository the index is the only destination — press S to stage",

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

  failed: (detail: string) => `jj could not stage the selection: ${detail}`,

  chooseTarget: "Stage marked hunks where?",

  newRevisionOption: "A new revision",

  describeNewRevisionPlaceholder: "Description (optional)",

  describeNewRevision: (summary: MarkSummary) =>
    `Describe the new revision (${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")})`,

  noTargetsAvailable: "No mutable revision is available to stage into",
} as const;
