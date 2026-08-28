import { execFile } from "node:child_process";

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

/** Runs `git` in one repository. The only place the git backend touches a subprocess. */
export interface Git {
  run(args: readonly string[], stdin?: string): Promise<string>;
}

/** Reduce git's diagnostics to the one line worth showing a reviewer. */
export function summariseGitError(stderr: string): string {
  const firstLine = stderr
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return (firstLine ?? "").replace(/^(fatal|error):\s*/i, "") || "The git command failed.";
}

export function createGit(options: { root: string; executable?: string }): Git {
  const executable = options.executable ?? "git";

  return {
    run(args, stdin) {
      return new Promise((resolve, reject) => {
        const child = execFile(
          executable,
          [...args],
          { cwd: options.root, maxBuffer: 64 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) {
              reject(new GitCommandError(summariseGitError(stderr), stderr));
              return;
            }
            resolve(stdout);
          },
        );

        // `git apply` reads the patch from stdin, which is the only way to hand
        // it a patch that was never written to disk.
        if (stdin !== undefined) {
          child.stdin?.end(stdin);
        }
      });
    },
  };
}
