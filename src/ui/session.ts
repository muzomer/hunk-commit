import type { ExtensionDiffFile } from "hunkdiff/extension";
import type { FileMark } from "../staging/plan";
import type { StageRequest } from "../staging/stage";
import type { MarkSummary } from "./messages";
import { MarkStore } from "./marks";

/**
 * What an operation will act on, and where that came from.
 *
 * `source` exists so a confirmation can say "the hunk under the cursor" rather
 * than leaving a reviewer to wonder which hunk it means.
 */
export interface Selection {
  readonly marks: ReadonlyMap<string, FileMark>;
  readonly source: "marks" | "cursor";
}

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

  /** How much one selection covers, for confirmations and status messages. */
  summarise(marks: ReadonlyMap<string, FileMark>): MarkSummary {
    let hunks = 0;

    for (const file of this.files) {
      const mark = marks.get(file.id);
      if (!mark) {
        continue;
      }

      hunks += mark.kind === "whole" ? Math.max(file.hunks?.length ?? 0, 1) : mark.hunks.size;
    }

    return { files: marks.size, hunks };
  }

  /**
   * The selection an operation should act on.
   *
   * Marks exist to batch: to gather hunks from several places and act on them
   * together. When there are none, the reviewer has still told us which hunk
   * they mean — the one under the cursor — and making them mark it first would
   * be asking twice. So the marks win when they exist, and the cursor answers
   * when they do not.
   */
  selectionFor(cursor: { fileId: string; hunkIndex: number } | null): Selection | null {
    if (!this.marks.isEmpty) {
      return { marks: this.marks.snapshot(), source: "marks" };
    }

    if (!cursor) {
      return null;
    }

    return {
      marks: new Map([[cursor.fileId, { kind: "hunks", hunks: new Set([cursor.hunkIndex]) }]]),
      source: "cursor",
    };
  }

  /**
   * Describe the whole review for staging.
   *
   * Every file goes in, not only the marked ones. A backend may need to say
   * out loud what stays behind — Jujutsu does, having no index — and only a
   * complete list lets it.
   */
  toStageRequest(marks: ReadonlyMap<string, FileMark>): StageRequest {
    return {
      marks,
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
