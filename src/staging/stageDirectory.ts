import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { StageOperation } from "./plan";
import {
  CONTENT_DIRECTORY,
  DELETE_MANIFEST,
  HELPER_SCRIPT,
  HELPER_SCRIPT_NAME,
  isExpressiblePath,
  RESTORE_MANIFEST,
  WRITE_MANIFEST,
} from "./script";

/** A prepared staging directory, and the means to throw it away. */
export interface StageDirectory {
  readonly root: string;
  readonly scriptPath: string;
  dispose(): Promise<void>;
}

export class UnstageablePathError extends Error {
  constructor(readonly path: string) {
    super(`Cannot stage ${JSON.stringify(path)}: paths containing newlines are not supported.`);
    this.name = "UnstageablePathError";
  }
}

function manifest(operations: readonly StageOperation[], kind: StageOperation["kind"]): string {
  const paths = operations.filter((operation) => operation.kind === kind).map((op) => op.path);
  return paths.length === 0 ? "" : `${paths.join("\n")}\n`;
}

/**
 * Write everything the helper script needs into a fresh temporary directory.
 *
 * The directory is self-describing: three manifests naming what to write,
 * delete, and restore, plus the exact bytes for every write. Nothing about the
 * review, the marks, or the patch survives into it.
 */
export async function createStageDirectory(
  operations: readonly StageOperation[],
): Promise<StageDirectory> {
  for (const operation of operations) {
    if (!isExpressiblePath(operation.path)) {
      throw new UnstageablePathError(operation.path);
    }
  }

  const root = await mkdtemp(join(tmpdir(), "hunk-jj-stage-"));

  await Promise.all([
    writeFile(join(root, HELPER_SCRIPT_NAME), HELPER_SCRIPT, "utf8"),
    writeFile(join(root, WRITE_MANIFEST), manifest(operations, "write"), "utf8"),
    writeFile(join(root, DELETE_MANIFEST), manifest(operations, "delete"), "utf8"),
    writeFile(join(root, RESTORE_MANIFEST), manifest(operations, "restore"), "utf8"),
  ]);

  for (const operation of operations) {
    if (operation.kind !== "write") {
      continue;
    }

    const destination = join(root, CONTENT_DIRECTORY, operation.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, operation.content, "utf8");
  }

  return {
    root,
    scriptPath: join(root, HELPER_SCRIPT_NAME),
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
