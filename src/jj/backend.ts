import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { StagedEntry, StagingBackend } from "../staging/backend";
import { operationsFor, type StageOperation } from "./operations";
import type { Jj } from "./repository";
import { createStageDirectory } from "./stageDirectory";
import { buildStageArgs, describeDestination, renderToolConfig, type JjDestination } from "./tool";

/**
 * Stage into a Jujutsu revision — a new one, or one that already exists.
 *
 * Jujutsu has no index, so "staging" is a rewrite: `jj split` to extract the
 * marked hunks into a new revision, or `jj squash` to fold them into an
 * existing one. Either way the rest stays in the working-copy change, and the
 * files on disk do not change — the working copy holds the same content before
 * and after, and only ownership moves.
 */
export function createJjBackend(options: { jj: Jj; destination: JjDestination }): StagingBackend {
  return {
    destination: describeDestination(options.destination),

    async stage(entries) {
      const operations = entries.flatMap<StageOperation>(operationsFor);
      const stage = await createStageDirectory(operations);

      try {
        const configPath = join(stage.root, "tool.toml");
        await writeFile(configPath, renderToolConfig(stage.scriptPath, stage.root), "utf8");
        await options.jj.run(buildStageArgs({ configPath, destination: options.destination }));
      } finally {
        await stage.dispose();
      }
    },
  };
}
