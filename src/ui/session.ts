import type { ExtensionDiffFile } from "hunkdiff/extension";
import type { StageRequest } from "../staging/stage";
import type { MarkSummary } from "./messages";
import { MarkStore } from "./marks";

/**
 * The review as this extension sees it: the files Hunk is showing, and what
 * the reviewer has marked on them.
 *
 * Marks and files are replaced together. Hunk reloads a review whenever the
 * working copy moves, and a mark made against the previous generation would
 * point at a hunk index that no longer means the same thing, so a reload
 * always starts from nothing marked.
 */
export class ReviewSession {
  private files: readonly ExtensionDiffFile[] = [];
  readonly marks = new MarkStore();

  reload(files: readonly ExtensionDiffFile[]): void {
    this.files = files;
    this.marks.clear();
  }

  get reviewedFiles(): readonly ExtensionDiffFile[] {
    return this.files;
  }

  /** How much is marked, for confirmations and status messages. */
  summarise(): MarkSummary {
    let hunks = 0;

    for (const file of this.files) {
      const mark = this.marks.markFor(file.id);
      if (!mark) {
        continue;
      }

      hunks += mark.kind === "whole" ? Math.max(file.hunks?.length ?? 0, 1) : mark.hunks.size;
    }

    return { files: this.marks.markedFileCount, hunks };
  }

  /**
   * Describe the whole review for staging.
   *
   * Every file goes in, not only the marked ones. A backend may need to say
   * out loud what stays behind — Jujutsu does, having no index — and only a
   * complete list lets it.
   */
  toStageRequest(): StageRequest {
    return {
      marks: this.marks.snapshot(),
      files: this.files.map((file) => ({
        id: file.id,
        path: file.path,
        patchText: file.patch,
        hostHunks: (file.hunks ?? []).map((hunk) => ({
          index: hunk.index,
          newRange: hunk.newRange,
        })),
      })),
    };
  }
}
