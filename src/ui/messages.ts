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

  nothingMarked: "Nothing is marked yet — mark hunks with x, or a whole file with X",

  noWorkspace: "This review is not inside a git or Jujutsu workspace",

  gitHasOneDestination: "In a git repository the index is the only destination — press S to stage",

  unsupportedPlatform:
    "Staging into Jujutsu needs a POSIX shell to hand jj the selection, which this platform does not provide",

  confirmTitle: (summary: MarkSummary, destination: string) =>
    `Stage ${plural(summary.hunks, "hunk")} into ${destination}?`,

  confirmBody: (summary: MarkSummary, destination: string, kind: "git" | "jj") =>
    `${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")} will move into ${destination}. ` +
    `Your files on disk do not change. ${
      kind === "jj" ? "Undo the whole move with `jj undo`." : "Unstage with `git restore --staged`."
    }`,

  staged: (summary: MarkSummary, destination: string) =>
    `Staged ${plural(summary.hunks, "hunk")} in ${plural(summary.files, "file")} into ${destination}`,

  stale: (path: string, detail: string) =>
    `${path} changed since this review loaded (${detail}). Nothing was staged — refresh with r.`,

  disagreement: (path: string, detail: string) =>
    `Refusing to stage ${path}: ${detail}. This is a bug — please report it.`,

  failed: (detail: string) => `jj could not stage the selection: ${detail}`,

  chooseTarget: "Stage marked hunks into which revision?",

  noTargetsAvailable: "No mutable revision is available to stage into",
} as const;
