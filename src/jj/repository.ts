import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export class JjCommandError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "JjCommandError";
  }
}

/** Runs `jj` in one workspace. The only place this extension touches a subprocess. */
export interface Jj {
  run(args: readonly string[]): Promise<string>;
}

/** Reduce `jj`'s multi-line diagnostics to the one line worth showing a reviewer. */
export function summariseJjError(stderr: string): string {
  const firstLine = stderr
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return (firstLine ?? "").replace(/^error:\s*/i, "") || "The jj command failed.";
}

/** Recover the `stderr` a failed subprocess carries, or describe the failure. */
function stderrOf(error: unknown): string {
  const reported = (error as { stderr?: unknown }).stderr;
  return typeof reported === "string" && reported.trim() !== "" ? reported : String(error);
}

export function createJj(options: { root: string; executable?: string }): Jj {
  const executable = options.executable ?? "jj";

  return {
    async run(args) {
      try {
        const { stdout } = await run(executable, [...args], {
          cwd: options.root,
          maxBuffer: 64 * 1024 * 1024,
        });
        return stdout;
      } catch (error) {
        const stderr = stderrOf(error);
        throw new JjCommandError(summariseJjError(stderr), stderr);
      }
    },
  };
}
