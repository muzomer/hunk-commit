import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { StagedEntry, StagingBackend } from "../staging/backend";
import { operationsFor, type StageOperation } from "./operations";
import type { Jj } from "./repository";
import { createStageDirectory } from "./stageDirectory";
import { buildSquashArgs, renderToolConfig } from "./tool";

/**
 * Stage into a Jujutsu revision.
 *
 * Jujutsu has no index, so "staging" is `jj squash`: the marked hunks move
 * into another revision and the rest stays in the working-copy change. The
 * files on disk do not change when the target is an ancestor of `@` — the
 * working copy holds the same content before and after, and only ownership
 * moves.
 */
export function createJjBackend(options: { jj: Jj; into: string }): StagingBackend {
  return {
    destination: options.into,

    async stage(entries) {
      const operations = entries.flatMap<StageOperation>(operationsFor);
      const stage = await createStageDirectory(operations);

      try {
        const configPath = join(stage.root, "tool.toml");
        await writeFile(configPath, renderToolConfig(stage.scriptPath, stage.root), "utf8");
        await options.jj.run(buildSquashArgs({ configPath, into: options.into }));
      } finally {
        await stage.dispose();
      }
    },
  };
}
