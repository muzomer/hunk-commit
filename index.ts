import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExtensionCommandContext,
  ExtensionDiffFile,
  ExtensionLineHighlight,
  HunkExtensionAPI,
} from "hunkdiff/extension";
import { createGitBackend } from "./src/git/backend";
import { createGit } from "./src/git/repository";
import { createJjBackend } from "./src/jj/backend";
import { createJj, type Jj } from "./src/jj/repository";
import { listStagingTargets } from "./src/jj/revisions";
import type { JjDestination } from "./src/jj/tool";
import { parseFilePatch } from "./src/patch/parse";
import type { StagingBackend } from "./src/staging/backend";
import { stageMarkedHunks, type StageOutcome } from "./src/staging/stage";
import { detectWorkspace, type Workspace } from "./src/workspace";
import { buildMarkHighlights } from "./src/ui/highlights";
import { messages } from "./src/ui/messages";
import { ReviewSession } from "./src/ui/session";
import { destinationFor, readTargetSetting, type TargetSetting } from "./src/ui/settings";

/**
 * hunk-stage — mark hunks while reviewing, and stage them without leaving the
 * review: into the git index, or into a Jujutsu revision.
 *
 * This file is the composition root and nothing else: it wires Hunk's
 * commands, events, and highlights to the modules that hold the behaviour.
 * Every decision worth testing lives in `src/`, reachable without Hunk.
 */

const HIGHLIGHTER_ID = "marks";

export default function activate(hunk: HunkExtensionAPI): void {
  const session = new ReviewSession();
  const defaultTarget = readTargetSetting(hunk.config, (message) => hunk.log(message));

  hunk.on("changeset_loaded", ({ changeset }) => session.reload(changeset.files));
  hunk.on("session_reload", ({ changeset }) => session.reload(changeset.files));

  hunk.registerLineHighlighter({
    id: HIGHLIGHTER_ID,
    highlight: ({ file }) => markHighlightsFor(file, session, hunk),
  });

  hunk.registerCommand(
    { id: "toggleHunk", title: "Mark hunk for staging", key: "x" },
    (ctx) => {
      const file = ctx.selection.file;
      if (!file || ctx.selection.hunkIndex === null) {
        ctx.notify(messages.noHunkSelected, "warning");
        return;
      }

      session.marks.toggleHunk(file.id, ctx.selection.hunkIndex, file.hunks?.length ?? 0);
      reportMarks(ctx, session, file.id);
    },
  );

  hunk.registerCommand(
    { id: "toggleFile", title: "Mark whole file for staging", key: "X" },
    (ctx) => {
      const file = ctx.selection.file;
      if (!file) {
        ctx.notify(messages.noHunkSelected, "warning");
        return;
      }

      session.marks.toggleFile(file.id);
      reportMarks(ctx, session, file.id);
    },
  );

  hunk.registerCommand({ id: "clearMarks", title: "Clear staging marks", key: "C" }, (ctx) => {
    session.marks.clear();
    ctx.highlights.refresh(HIGHLIGHTER_ID);
    ctx.notify(messages.cleared);
  });

  hunk.registerCommand({ id: "stage", title: "Stage marked hunks", key: "S" }, (ctx) =>
    stage(ctx, session, (workspace) => resolveChoice(ctx, session, workspace, defaultTarget)),
  );

  hunk.registerCommand(
    { id: "stageInto", title: "Stage marked hunks into…", key: "T" },
    async (ctx) => {
      const workspace = requireWorkspace(ctx);
      if (!workspace) {
        return;
      }

      // Only Jujutsu offers a choice: git's index is the one place to stage to.
      if (workspace.kind === "git") {
        ctx.notify(messages.gitHasOneDestination, "warning");
        return;
      }

      const target = await chooseTarget(ctx, createJj({ root: workspace.root }));
      if (target) {
        await stage(ctx, session, (chosen) => resolveChoice(ctx, session, chosen, target));
      }
    },
  );
}

/**
 * What one staging run will do, once the reviewer has settled it.
 *
 * `confirmed` records that choosing the destination already asked the reviewer
 * to commit to it — typing a description for a new revision is an answer, and
 * asking again straight afterwards would be a second question about the same
 * decision.
 */
interface StagingChoice {
  readonly backend: StagingBackend;
  readonly confirmed: boolean;
}

/** Settle the destination, asking for anything only the reviewer can supply. */
async function resolveChoice(
  ctx: ExtensionCommandContext,
  session: ReviewSession,
  workspace: Workspace,
  target: TargetSetting,
): Promise<StagingChoice | null> {
  if (workspace.kind === "git") {
    return { backend: createGitBackend({ git: createGit({ root: workspace.root }) }), confirmed: false };
  }

  let destination: JjDestination;

  if (target.kind === "new") {
    const message = await ctx.dialogs.input({
      title: messages.describeNewRevision(session.summarise()),
      placeholder: messages.describeNewRevisionPlaceholder,
    });

    if (message === null) {
      return null;
    }

    destination = destinationFor(target, message.trim());
  } else {
    destination = destinationFor(target, "");
  }

  return {
    backend: createJjBackend({ jj: createJj({ root: workspace.root }), destination }),
    confirmed: target.kind === "new",
  };
}

/** Paint one file's marked hunks, or nothing if its patch cannot be read. */
function markHighlightsFor(
  file: ExtensionDiffFile,
  session: ReviewSession,
  hunk: HunkExtensionAPI,
): ExtensionLineHighlight[] | null {
  const mark = session.marks.markFor(file.id);
  if (!mark) {
    return null;
  }

  try {
    return buildMarkHighlights(parseFilePatch(file.patch), mark).map((highlight) => ({
      ...highlight,
      tone: "info" as const,
    }));
  } catch (error) {
    hunk.log(`Could not paint marks for ${file.path}: ${describe(error)}`);
    return null;
  }
}

function reportMarks(ctx: ExtensionCommandContext, session: ReviewSession, fileId: string): void {
  ctx.highlights.refresh(HIGHLIGHTER_ID, { fileId });
  ctx.notify(session.marks.isEmpty ? messages.cleared : messages.marked(session.summarise()));
}

/** Resolve the workspace this review sits in, reporting when there is none. */
function requireWorkspace(ctx: ExtensionCommandContext): Workspace | null {
  const workspace = detectWorkspace(ctx.cwd);
  if (!workspace) {
    ctx.notify(messages.noWorkspace, "error");
  }
  return workspace;
}

/**
 * Offer the destinations this repository actually has.
 *
 * A new revision comes first because it rewrites nothing that already exists;
 * the rest are the mutable ancestors a squash could fold into.
 */
async function chooseTarget(
  ctx: ExtensionCommandContext,
  jj: Jj,
): Promise<TargetSetting | null> {
  try {
    const revisions = await listStagingTargets(jj);
    const options = [messages.newRevisionOption, ...revisions.map((choice) => choice.label)];

    const chosen = await ctx.dialogs.select({ title: messages.chooseTarget, options });
    if (chosen === null) {
      return null;
    }

    if (chosen === messages.newRevisionOption) {
      return { kind: "new" };
    }

    const revision = revisions.find((choice) => choice.label === chosen)?.revision;
    return revision ? { kind: "revision", revset: revision } : null;
  } catch (error) {
    ctx.notify(messages.failed(describe(error)), "error");
    return null;
  }
}

/**
 * Move the marked hunks, after asking.
 *
 * Every refusal — nothing marked, no workspace, no POSIX shell, a stale
 * review, a `jj` error — leaves the repository untouched and says why. The one
 * step that changes anything is a single `jj` operation, which `jj undo`
 * reverses.
 */
async function stage(
  ctx: ExtensionCommandContext,
  session: ReviewSession,
  chooseBackend: (workspace: Workspace) => Promise<StagingChoice | null>,
): Promise<void> {
  if (session.marks.isEmpty) {
    ctx.notify(messages.nothingMarked, "warning");
    return;
  }

  const workspace = requireWorkspace(ctx);
  if (!workspace) {
    return;
  }

  // Only the Jujutsu path needs a shell, to hand jj its selection.
  if (workspace.kind === "jj" && process.platform === "win32") {
    ctx.notify(messages.unsupportedPlatform, "error");
    return;
  }

  const choice = await chooseBackend(workspace);
  if (!choice) {
    return;
  }

  const { backend } = choice;
  const summary = session.summarise();

  if (!choice.confirmed) {
    const confirmed = await ctx.dialogs.confirm({
      title: messages.confirmTitle(summary, backend.destination),
      body: messages.confirmBody(summary, backend.destination, workspace.kind),
      confirmLabel: "stage",
    });

    if (!confirmed) {
      return;
    }
  }

  try {
    const outcome = await stageMarkedHunks(session.toStageRequest(), {
      backend,
      readWorkingCopyFile: (path) => readFile(join(workspace.root, path), "utf8"),
    });

    await report(ctx, session, outcome, backend.destination);
  } catch (error) {
    ctx.notify(messages.failed(describe(error)), "error");
  }
}

async function report(
  ctx: ExtensionCommandContext,
  session: ReviewSession,
  outcome: StageOutcome,
  destination: string,
): Promise<void> {
  if (outcome.kind === "stale") {
    ctx.notify(messages.stale(outcome.path, outcome.detail), "warning");
    return;
  }

  if (outcome.kind === "disagreement") {
    ctx.notify(messages.disagreement(outcome.path, outcome.detail), "error");
    return;
  }

  ctx.notify(messages.staged(outcome, destination));
  session.marks.clear();
  ctx.commands.execute("hunk.app.refresh");
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
