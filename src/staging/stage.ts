import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { parseDocument } from "../patch/document";
import { findDisagreement, type HostHunk } from "../patch/agreement";
import { parseFilePatch, type FilePatch } from "../patch/parse";
import { findStaleHunk } from "../patch/select";
import type { Jj } from "../jj/repository";
import { buildSquashArgs, renderToolConfig } from "../jj/tool";
import {
  disposeFile,
  rebuildOperation,
  requiresWorkingCopyCheck,
  revertOperations,
  type FileMark,
  type StageOperation,
} from "./plan";
import { createStageDirectory } from "./stageDirectory";

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
  /** The revision the marked hunks move into. */
  readonly into: string;
}

/**
 * Everything staging needs from the outside world.
 *
 * Both members already know which workspace they belong to, which is why the
 * root itself is not passed around: `jj` runs in it, and reads resolve against
 * it.
 */
export interface StageEnvironment {
  readonly jj: Jj;
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
 * Move the marked hunks into a revision.
 *
 * The sequence is deliberate: everything that can refuse does so before
 * anything is written, so a refusal always leaves the repository exactly as it
 * was. Once `jj` is invoked the operation is atomic and reversible with
 * `jj undo`, which is the only irreversible-looking step and is not one.
 */
export async function stageMarkedHunks(
  request: StageRequest,
  environment: StageEnvironment,
): Promise<StageOutcome> {
  const operations: StageOperation[] = [];
  const staged: StagedTotals = { files: 0, hunks: 0 };

  for (const file of request.files) {
    const planned = await planFile(file, request.marks.get(file.id), environment);

    if (planned.kind !== "planned") {
      return planned;
    }

    operations.push(...planned.operations);
    staged.files += planned.stagedFiles;
    staged.hunks += planned.stagedHunks;
  }

  await runSquash(operations, request.into, environment);
  return { kind: "staged", files: staged.files, hunks: staged.hunks };
}

/** Running totals for the "staged N hunks in M files" summary. */
interface StagedTotals {
  files: number;
  hunks: number;
}

/** One file's contribution, once it is known that nothing about it refuses. */
interface PlannedFile {
  readonly kind: "planned";
  readonly operations: readonly StageOperation[];
  readonly stagedFiles: number;
  readonly stagedHunks: number;
}

/**
 * Decide what one reviewed file contributes, refusing rather than guessing.
 *
 * The order matters: the two checks that can refuse both run before any
 * operation is produced, so a refusal anywhere means nothing was prepared for
 * any file.
 */
async function planFile(
  file: ReviewedFile,
  mark: FileMark | undefined,
  environment: StageEnvironment,
): Promise<PlannedFile | StageRefusal> {
  const patch = parseFilePatch(file.patchText);

  const disagreement = findDisagreement(patch, file.hostHunks);
  if (disagreement) {
    return { kind: "disagreement", path: file.path, detail: disagreement };
  }

  const disposition = disposeFile(patch, mark);

  if (disposition.kind === "revert") {
    return { kind: "planned", operations: revertOperations(patch), stagedFiles: 0, stagedHunks: 0 };
  }

  const contribution = {
    kind: "planned",
    stagedFiles: 1,
    stagedHunks: mark ? countMarkedHunks(patch, mark) : 0,
  } as const;

  if (!requiresWorkingCopyCheck(disposition, patch)) {
    return { ...contribution, operations: [] };
  }

  const document = parseDocument(await environment.readWorkingCopyFile(patch.path));
  const stale = findStaleHunk(document, patch.hunks);
  if (stale) {
    return {
      kind: "stale",
      path: patch.path,
      detail: `line ${stale.line} reads ${JSON.stringify(stale.found ?? "")} but the review expected ${JSON.stringify(stale.expected)}`,
    };
  }

  return {
    ...contribution,
    operations:
      disposition.kind === "rebuild"
        ? [rebuildOperation(patch, document, disposition.selected)]
        : [],
  };
}

async function runSquash(
  operations: readonly StageOperation[],
  into: string,
  environment: StageEnvironment,
): Promise<void> {
  const stage = await createStageDirectory(operations);

  try {
    const configPath = join(stage.root, "tool.toml");
    await writeFile(configPath, renderToolConfig(stage.scriptPath, stage.root), "utf8");
    await environment.jj.run(buildSquashArgs({ configPath, into }));
  } finally {
    await stage.dispose();
  }
}
