import { parseDocument, type Document } from "../patch/document";
import { findDisagreement, type HostHunk } from "../patch/agreement";
import { parseFilePatch, type FilePatch } from "../patch/parse";
import { findStaleHunk } from "../patch/select";
import type { StagedEntry, StagingBackend } from "./backend";
import { disposeFile, requiresWorkingCopyCheck, type FileMark } from "./plan";

/** One file of the review, as staging needs to see it. */
export interface ReviewedFile {
  readonly id: string;
  readonly path: string;
  readonly patchText: string;
  readonly hostHunks: readonly HostHunk[];
}

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

/**
 * Why staging stopped without touching the repository.
 *
 * Both refusals mean the same thing to a reviewer — what you are looking at is
 * not what is on disk — but they are found in different ways, so they are
 * reported separately.
 */
export type StageRefusal =
  | { readonly kind: "stale"; readonly path: string; readonly detail: string }
  | { readonly kind: "disagreement"; readonly path: string; readonly detail: string };

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
    const checked = await checkFile(file, mark, environment);

    if ("kind" in checked) {
      return checked;
    }

    entries.push(checked.entry);

    if (mark && checked.entry.disposition.kind !== "revert") {
      staged.files += 1;
      staged.hunks += countMarkedHunks(checked.entry.patch, mark);
    }
  }

  await environment.backend.stage(entries);
  return { kind: "staged", ...staged };
}

/**
 * Check one file and decide its fate, refusing rather than guessing.
 *
 * Both refusals live here because both are questions about whether the review
 * still describes reality — one against Hunk's own parse, one against the
 * bytes on disk.
 */
async function checkFile(
  file: ReviewedFile,
  mark: FileMark | undefined,
  environment: StageEnvironment,
): Promise<{ entry: StagedEntry } | StageRefusal> {
  const patch = parseFilePatch(file.patchText);

  const disagreement = findDisagreement(patch, file.hostHunks);
  if (disagreement) {
    return { kind: "disagreement", path: file.path, detail: disagreement };
  }

  const disposition = disposeFile(patch, mark);

  if (!requiresWorkingCopyCheck(disposition, patch)) {
    return { entry: { patch, disposition } };
  }

  const document = parseDocument(await environment.readWorkingCopyFile(patch.path));
  const stale = findStaleHunk(document, patch.hunks);

  return stale
    ? { kind: "stale", path: patch.path, detail: describeStaleness(document, stale) }
    : { entry: { patch, disposition, document } };
}

function describeStaleness(
  _document: Document,
  stale: { line: number; found: string | undefined; expected: string },
): string {
  return `line ${stale.line} reads ${JSON.stringify(stale.found ?? "")} but the review expected ${JSON.stringify(stale.expected)}`;
}
