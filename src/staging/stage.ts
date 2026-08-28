import type { FilePatch } from "../patch/parse";
import { checkReviewedFile, isRefusal, type ReviewedFile, type ReviewRefusal } from "../review/check";
import type { StagedEntry, StagingBackend } from "./backend";
import type { FileMark } from "./plan";

export type { ReviewedFile } from "../review/check";

export interface StageRequest {
  readonly files: readonly ReviewedFile[];
  /** Marks by file id. Files absent from the map contribute nothing. */
  readonly marks: ReadonlyMap<string, FileMark>;
}

/**
 * Everything staging needs from the outside world.
 *
 * The backend already knows its destination and how to reach it, which is why
 * no repository root is passed around: reads resolve against the workspace the
 * caller opened, and the backend runs inside it.
 */
export interface StageEnvironment {
  readonly backend: StagingBackend;
  /** Read one working-copy file, by path relative to the workspace root. */
  readWorkingCopyFile(path: string): Promise<string>;
}

/** Why staging stopped without touching the repository. */
export type StageRefusal =
  | ReviewRefusal
  /** Nothing in the review would move, so there is nothing to stage. */
  | { readonly kind: "nothing-staged" };

export type StageOutcome =
  | { readonly kind: "staged"; readonly files: number; readonly hunks: number }
  | StageRefusal;

/** Count the hunks a mark covers, for the reviewer-facing summary. */
export function countMarkedHunks(patch: FilePatch, mark: FileMark): number {
  return mark.kind === "whole" ? Math.max(patch.hunks.length, 1) : mark.hunks.size;
}

/**
 * Stage the marked hunks.
 *
 * Every file is checked before any of them is acted on, so a refusal anywhere
 * means the repository was never touched. Only once the whole review has
 * passed does the backend get to run — and it runs once, so its own work is a
 * single operation rather than a sequence that could half-finish.
 */
export async function stageMarkedHunks(
  request: StageRequest,
  environment: StageEnvironment,
): Promise<StageOutcome> {
  const entries: StagedEntry[] = [];
  const staged = { files: 0, hunks: 0 };

  for (const file of request.files) {
    const mark = request.marks.get(file.id);
    const checked = await checkReviewedFile(file, mark, environment.readWorkingCopyFile);

    if (isRefusal(checked)) {
      return checked;
    }

    entries.push(checked);

    if (mark && checked.disposition.kind !== "revert") {
      staged.files += 1;
      staged.hunks += countMarkedHunks(checked.patch, mark);
    }
  }

  // Refuse rather than hand a backend an empty selection. `jj split` answers
  // one by creating an empty revision, which looks like staging that silently
  // lost the marks — so nothing may reach a backend without something to move.
  if (staged.files === 0) {
    return { kind: "nothing-staged" };
  }

  await environment.backend.stage(entries);
  return { kind: "staged", ...staged };
}
