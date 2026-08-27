import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * A throwaway Jujutsu workspace for integration tests.
 *
 * Every test gets its own workspace and its own `JJ_CONFIG`, so nothing here
 * reads or writes the machine's real jj configuration.
 */
export interface TestRepository {
  readonly root: string;
  jj(...args: string[]): Promise<string>;
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<string>;
  dispose(): Promise<void>;
}

/** Whether a `jj` binary is available; the integration tests skip without one. */
export async function hasJujutsu(): Promise<boolean> {
  try {
    await run("jj", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function createTestRepository(): Promise<TestRepository> {
  // The config lives beside the workspace rather than inside it, so it never
  // shows up as an untracked file in the diffs under test.
  const container = await mkdtemp(join(tmpdir(), "hunk-jj-stage-test-"));
  const root = join(container, "repo");
  await mkdir(root, { recursive: true });
  const configPath = join(container, "jj-config.toml");
  await writeFile(configPath, '[user]\nname = "Test"\nemail = "test@example.com"\n', "utf8");

  const environment = { ...process.env, JJ_CONFIG: configPath };

  const repository: TestRepository = {
    root,
    async jj(...args) {
      const { stdout } = await run("jj", args, { cwd: root, env: environment });
      return stdout;
    },
    async write(path, content) {
      const absolute = join(root, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
    },
    read: (path) => readFile(join(root, path), "utf8"),
    dispose: () => rm(container, { recursive: true, force: true }),
  };

  await repository.jj("git", "init", ".");
  return repository;
}

/** Split a multi-file `jj diff --git` patch the way Hunk hands files to extensions. */
export function splitPatchByFile(patchText: string): string[] {
  return patchText
    .split(/^(?=diff --git )/m)
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => `${section}\n`);
}
