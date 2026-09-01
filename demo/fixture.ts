/**
 * Builds the throwaway repository the README demos are recorded against.
 *
 * Deliberately not importing `test/support/` — tests and demos want to
 * diverge, and coupling them means a test refactor silently breaks the
 * README. The shape is copied (pinned author, isolated `JJ_CONFIG`), not the
 * code.
 *
 *   bun demo/fixture.ts --backend git --out /tmp/hunk-commit-demo/cart
 */
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Pinned identity and dates: a demo repository that commits "now" produces a
 * different log on every take, and `F`'s commit picker puts that log on screen.
 */
const IDENTITY = {
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_AUTHOR_DATE: "2026-01-01T09:00:00+00:00",
  GIT_COMMITTER_DATE: "2026-01-01T09:00:00+00:00",
};

/**
 * Lines stay under ~40 columns: the demos record at 90 cells, and a split
 * diff halves that before anything is drawn.
 */
const BASE = {
  "cart.ts": `export interface Item {
  name: string;
  price: number;
  qty: number;
}

export function subtotal(items: Item[]) {
  let total = 0;
  for (const item of items) {
    total += item.price * item.qty;
  }
  return total;
}

export function count(items: Item[]) {
  return items.length;
}

export function withTax(items: Item[]) {
  return subtotal(items) * 1.2;
}
`,
  "README.md": `# cart

A tiny shopping cart.

Orders recieve a 20% tax.
`,
};

/**
 * Three hunks, two stories. Both `cart.ts` hunks are the money fix and belong
 * in one commit; the `README.md` typo is unrelated and is what stays behind —
 * that contrast is what makes "mark only some hunks" legible without
 * narration. `count()` sits between the two cart hunks so three lines of
 * context on each side cannot merge them into one.
 */
const EDITED = {
  "cart.ts": BASE["cart.ts"]
    .replace(
      "    total += item.price * item.qty;",
      "    if (item.qty < 1) continue;\n    total += item.price * item.qty;",
    )
    .replace(
      "  return subtotal(items) * 1.2;",
      "  const gross = subtotal(items) * 1.2;\n  return Math.round(gross * 100) / 100;",
    ),
  "README.md": BASE["README.md"].replace("recieve", "receive"),
};

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

async function writeAll(root: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
}

const backend = arg("backend", "git");
const root = arg("out", join(process.cwd(), ".demo-work", "cart"));

await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });

const env = { ...process.env, ...IDENTITY };
const git = (...args: string[]) => run("git", args, { cwd: root, env });

await git("init", "-q", "-b", "main", ".");
await git("config", "user.name", IDENTITY.GIT_AUTHOR_NAME);
await git("config", "user.email", IDENTITY.GIT_AUTHOR_EMAIL);

await writeAll(root, BASE);
await git("add", ".");
await git("commit", "-q", "-m", "feat: add the cart");

if (backend === "jj") {
  // Colocated, so the recording shows jj driving a repository git also
  // understands — and `JJ_CONFIG` keeps the machine's real config out of it.
  // That isolation has a cost: an empty config makes jj render every revision
  // as "(no email set)", which lands in `F`'s commit picker, so the identity
  // has to be written back in. It is written beside the repository, not in it:
  // jj tracks the working copy, so a config in the root becomes a third
  // changed file in the demo.
  const jjConfig = join(root, "..", "jjconfig.toml");
  await writeFile(
    jjConfig,
    `[user]
name = "${IDENTITY.GIT_AUTHOR_NAME}"
email = "${IDENTITY.GIT_AUTHOR_EMAIL}"
`,
    "utf8",
  );
  await run("jj", ["git", "init", "--colocate"], {
    cwd: root,
    env: { ...env, JJ_CONFIG: jjConfig },
  });
}

// The working-copy state the demo opens on.
await writeAll(root, EDITED);


console.log(root);
