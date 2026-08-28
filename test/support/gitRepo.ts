import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** A throwaway git repository for integration tests. */
export interface TestGitRepository {
  readonly root: string;
  git(...args: string[]): Promise<string>;
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<string>;
  dispose(): Promise<void>;
}

export async function hasGit(): Promise<boolean> {
  try {
    await run("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function createTestGitRepository(): Promise<TestGitRepository> {
  const root = await mkdtemp(join(tmpdir(), "hunk-stage-git-test-"));

  const repository: TestGitRepository = {
    root,
    async git(...args) {
      const { stdout } = await run("git", args, { cwd: root });
      return stdout;
    },
    async write(path, content) {
      const absolute = join(root, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
    },
    read: (path) => readFile(join(root, path), "utf8"),
    dispose: () => rm(root, { recursive: true, force: true }),
  };

  await repository.git("init", "-q", ".");
  await repository.git("config", "user.email", "test@example.com");
  await repository.git("config", "user.name", "Test");
  return repository;
}
