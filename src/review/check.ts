import { parseDocument, type Document } from "../patch/document";
import { findDisagreement, type HostHunk } from "../patch/agreement";
import { parseFilePatch, type FilePatch } from "../patch/parse";
import { findStaleHunk } from "../patch/select";
import { disposeFile, requiresWorkingCopyCheck, type FileDisposition, type FileMark } from "../staging/plan";

/** One file of the review, as an operation on marks needs to see it. */
export interface ReviewedFile {
  readonly id: string;
  readonly path: string;
  readonly patchText: string;
  readonly hostHunks: readonly HostHunk[];
}

/**
 * Why an operation stopped without touching anything.
 *
 * Both refusals mean the same thing to a reviewer — what you are looking at is
 * not what is on disk — but they are found in different ways, so they are
 * reported separately.
 */
export type ReviewRefusal =
  | { readonly kind: "stale"; readonly path: string; readonly detail: string }
  | { readonly kind: "disagreement"; readonly path: string; readonly detail: string };

/** One reviewed file, once every check has passed and its fate is known. */
export interface CheckedFile {
  readonly patch: FilePatch;
  readonly disposition: FileDisposition;
  /** The working-copy text, present exactly when the file needed reading. */
  readonly document?: Document;
}

/**
 * Check one file and decide what the marks say about it.
 *
 * Shared by staging and discarding, which ask the same two questions before
 * acting — does this extension read the patch the way Hunk does, and does the
 * patch still describe what is on disk — and differ only in what they do with
 * the answer.
 */
export async function checkReviewedFile(
  file: ReviewedFile,
  mark: FileMark | undefined,
  readWorkingCopyFile: (path: string) => Promise<string>,
): Promise<CheckedFile | ReviewRefusal> {
  const patch = parseFilePatch(file.patchText);

  const disagreement = findDisagreement(patch, file.hostHunks);
  if (disagreement) {
    return { kind: "disagreement", path: file.path, detail: disagreement };
  }

  const disposition = disposeFile(patch, mark);

  if (!requiresWorkingCopyCheck(disposition, patch)) {
    return { patch, disposition };
  }

  const document = parseDocument(await readWorkingCopyFile(patch.path));
  const stale = findStaleHunk(document, patch.hunks);

  return stale
    ? {
        kind: "stale",
        path: patch.path,
        detail: `line ${stale.line} reads ${JSON.stringify(stale.found ?? "")} but the review expected ${JSON.stringify(stale.expected)}`,
      }
    : { patch, disposition, document };
}

/** True when a checked result is a refusal rather than a decision. */
export function isRefusal(result: CheckedFile | ReviewRefusal): result is ReviewRefusal {
  return "kind" in result;
}
