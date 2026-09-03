import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExtensionCommandContext,
  ExtensionDiffFile,
  ExtensionLineHighlight,
  HunkExtensionAPI,
} from "hunkdiff/extension";
import { discardMarkedHunks, type DiscardOutcome } from "./src/discard/discard";
import { createWorkingCopyEnvironment } from "./src/discard/workingCopy";
import { createGitBackend } from "./src/git/backend";
import { createGitCommitBackend, findCommitBlocker } from "./src/git/commit";
import { autosquashCommand, createGitFixupBackend } from "./src/git/fixup";
import { listFixupTargets, type CommitChoice } from "./src/git/history";
import { createGit, type Git } from "./src/git/repository";
import { reviewHasUncommittedWork } from "./src/review/provenance";
import { createJjBackend } from "./src/jj/backend";
import { createJj, type Jj } from "./src/jj/repository";
import { listStagingTargets } from "./src/jj/revisions";
import { parseFilePatch } from "./src/patch/parse";
import type { StagingBackend } from "./src/staging/backend";
import { joinCommitMessage, type CommitMessage } from "./src/staging/message";
import { stageMarkedHunks, type StageOutcome } from "./src/staging/stage";
import { detectWorkspace, type Workspace } from "./src/workspace";
import { buildMarkHighlights } from "./src/ui/highlights";
import { messages, type MarkSummary } from "./src/ui/messages";
import { ReviewSession, type Selection } from "./src/ui/session";
import { readContextMarksSetting } from "./src/ui/settings";
import type { ContextMarks } from "./src/ui/highlights";

/**
 * hunk-commit — mark hunks while reviewing, and move them without leaving the
 * review: into the git index, or into a commit — a git commit, or a Jujutsu
 * revision.
 *
 * This file is the composition root and nothing else: it wires Hunk's
 * commands, events, and highlights to the modules that hold the behaviour.
 * Every decision worth testing lives in `src/`, reachable without Hunk.
 */

const HIGHLIGHTER_ID = "marks";

export default function activate(hunk: HunkExtensionAPI): void {
  const session = new ReviewSession();
  const contextMarks = readContextMarksSetting(hunk.config, (message) => hunk.log(message));

  hunk.on("changeset_loaded", ({ changeset }) => session.reload(changeset.files));
  hunk.on("session_reload", ({ changeset }) => session.reload(changeset.files));

  hunk.registerLineHighlighter({
    id: HIGHLIGHTER_ID,
    highlight: ({ file }) => markHighlightsFor(file, session, hunk, contextMarks),
  });

  hunk.registerCommand(
    { id: "toggleHunk", title: "Mark hunk", key: "x" },
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
    { id: "toggleFile", title: "Mark whole file", key: "X" },
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

  hunk.registerCommand({ id: "clearMarks", title: "Clear marks", key: "N" }, (ctx) => {
    session.marks.clear();
    ctx.highlights.refresh(HIGHLIGHTER_ID);
    ctx.notify(messages.cleared);
  });

  hunk.registerCommand({ id: "stage", title: "Stage marked hunks", key: "S" }, async (ctx) => {
    const workspace = requireWorkspace(ctx);
    if (!workspace) {
      return;
    }

    // Staging is git's word for a place jj does not have. Rather than quietly
    // doing something else here — splitting a revision, as this command used
    // to — it names the two keys that do have a meaning in a jj workspace.
    if (workspace.kind === "jj") {
      ctx.notify(messages.jjHasNoIndex, "warning");
      return;
    }

    await stage(ctx, session, async () => indexChoice(workspace));
  });

  // Two commands rather than one that always asks twice. Hunk's input dialog
  // holds a single line, so a description costs a second modal — and a second
  // modal nobody asked for is worse than no description at all. Whoever wants
  // one says so up front, by pressing a different key.
  hunk.registerCommand({ id: "commit", title: "Commit marked hunks", key: "C" }, (ctx) =>
    stage(ctx, session, (workspace, summary) => commitChoice(ctx, workspace, summary, "subject")),
  );

  hunk.registerCommand(
    { id: "commitWithBody", title: "Commit marked hunks with a description…", key: "B" },
    (ctx) =>
      stage(ctx, session, (workspace, summary) =>
        commitChoice(ctx, workspace, summary, "subject-and-body"),
      ),
  );

  hunk.registerCommand(
    { id: "discard", title: "Discard marked hunks", key: "D" },
    (ctx) => discard(ctx, session),
  );

  // One key, two mechanisms. Both systems can put marked hunks into a commit
  // that already exists, but jj rewrites it now and rebases its descendants
  // while git defers behind a `fixup!`, so the menu entry stays neutral and
  // each dialog names what its own repository is about to do.
  hunk.registerCommand(
    { id: "into", title: "Put marked hunks into…", key: "F" },
    async (ctx) => {
      const workspace = requireWorkspace(ctx);
      if (!workspace) {
        return;
      }

      if (workspace.kind === "git") {
        const target = await chooseCommit(ctx, createGit({ root: workspace.root }));
        if (target) {
          await stage(ctx, session, async (chosen) => fixupChoice(chosen, target));
        }
        return;
      }

      const revset = await chooseRevision(ctx, createJj({ root: workspace.root }));
      if (revset) {
        await stage(ctx, session, async (chosen) => squashChoice(chosen, revset));
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
  /** Which word the reporting uses: the hunks were staged, or committed. */
  readonly action: "stage" | "commit" | "fixup";
  /** The command that completes the job, when one is left to run. */
  readonly finish?: string;
}

/** Stage into git's index: one destination, so there is nothing to settle. */
function indexChoice(workspace: Workspace): StagingChoice {
  return {
    backend: createGitBackend({ git: createGit({ root: workspace.root }) }),
    confirmed: false,
    action: "stage",
  };
}

/** Squash into a Jujutsu revision the reviewer has already picked. */
function squashChoice(workspace: Workspace, revset: string): StagingChoice {
  return {
    backend: createJjBackend({
      jj: createJj({ root: workspace.root }),
      destination: { kind: "revision", revset },
    }),
    confirmed: false,
    action: "stage",
  };
}

/**
 * Settle a commit: refuse early if the repository is not ready, then ask.
 *
 * The order matters. Git's checks run *before* the reviewer types anything,
 * because asking for a commit message and only then refusing to commit wastes
 * the one thing they had to supply. Jujutsu needs no such check: it has no
 * index to sweep up, and a rewrite in progress is not a state it can be in.
 *
 * No confirmation follows, because typing a message is the confirmation —
 * asking "commit?" straight after "describe your commit" is one question too
 * many about the same decision.
 */
async function commitChoice(
  ctx: ExtensionCommandContext,
  workspace: Workspace,
  summary: MarkSummary,
  asking: MessageParts,
): Promise<StagingChoice | null> {
  const git: Git | null = workspace.kind === "git" ? createGit({ root: workspace.root }) : null;

  if (git) {
    const blocker = await findCommitBlocker({ git, pathExists });
    if (blocker) {
      ctx.notify(messages.cannotCommit(blocker), "warning");
      return null;
    }
  }

  const message = await askCommitMessage(ctx, summary, asking);
  if (!message) {
    return null;
  }

  return {
    backend: git
      ? createGitCommitBackend({ git, message })
      : createJjBackend({
          jj: createJj({ root: workspace.root }),
          destination: { kind: "new", message: joinCommitMessage(message) },
        }),
    confirmed: true,
    action: "commit",
  };
}

/** How much of the message this run asks for — one dialog, or two. */
type MessageParts = "subject" | "subject-and-body";

/**
 * Ask for the commit message, one line per dialog.
 *
 * Cancelling any question abandons the commit; submitting an empty description
 * simply means there is none. An empty *summary* is treated as a cancellation
 * too — a commit with no subject is never what someone meant.
 */
async function askCommitMessage(
  ctx: ExtensionCommandContext,
  summary: MarkSummary,
  asking: MessageParts,
): Promise<CommitMessage | null> {
  const subject = await ctx.dialogs.input({
    title: messages.describeCommit(summary),
    placeholder: messages.describeCommitPlaceholder,
  });

  if (subject === null || subject.trim() === "") {
    return null;
  }

  if (asking === "subject") {
    return { subject: subject.trim(), body: "" };
  }

  const body = await ctx.dialogs.input({
    title: messages.describeCommitBody,
    placeholder: messages.describeCommitBodyPlaceholder,
  });

  if (body === null) {
    return null;
  }

  return { subject: subject.trim(), body: body.trim() };
}

/** Whether a path exists, for the checks in `src/git/commit.ts`. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Settle a fixup: the target is already chosen, so nothing more is asked here.
 *
 * The confirmation is left on, unlike committing: the reviewer picked a commit
 * from a list, which is a smaller commitment than typing a message, and the
 * thing worth saying — that history is *not* being rewritten yet — is said in
 * that dialog.
 */
function fixupChoice(workspace: Workspace, target: CommitChoice): StagingChoice {
  return {
    backend: createGitFixupBackend({ git: createGit({ root: workspace.root }), target }),
    confirmed: false,
    action: "fixup",
    finish: autosquashCommand(target),
  };
}

/**
 * Offer the commits this branch has not published.
 *
 * The pre-commit checks run here rather than after the pick, so a repository
 * that cannot be committed to says so before asking the reviewer to choose.
 */
async function chooseCommit(
  ctx: ExtensionCommandContext,
  git: Git,
): Promise<CommitChoice | null> {
  try {
    const blocker = await findCommitBlocker({ git, pathExists });
    if (blocker) {
      ctx.notify(messages.cannotCommit(blocker), "warning");
      return null;
    }

    const targets = await listFixupTargets(git);
    if (targets.length === 0) {
      ctx.notify(messages.noCommitsAvailable("git"), "warning");
      return null;
    }

    const chosen = await ctx.dialogs.select({
      title: messages.chooseCommit("git"),
      options: targets.map((target) => target.label),
    });

    return targets.find((target) => target.label === chosen) ?? null;
  } catch (error) {
    ctx.notify(messages.failed(describe(error)), "error");
    return null;
  }
}

/** Paint one file's marked hunks, or nothing if its patch cannot be read. */
function markHighlightsFor(
  file: ExtensionDiffFile,
  session: ReviewSession,
  hunk: HunkExtensionAPI,
  contextMarks: ContextMarks,
): ExtensionLineHighlight[] | null {
  const mark = session.marks.markFor(file.id);
  if (!mark) {
    return null;
  }

  try {
    // Tones come from the highlight itself, one per line, rather than being
    // stamped on the whole set here.
    //
    // The lines that move take amber, where the diff's own vocabulary is
    // green, red, and neutral: a mark has to say "chosen", and the two tones
    // that carry meaning already — red for removed, near-white for the current
    // search match — would either lie or flatten the diff's colours.
    //
    // Context takes `dim`, which the host added in API 16. Until then the only
    // alternatives shifted brightness alone and vanished against an added
    // line's green, so context had to borrow the amber and overstate the
    // hunk's reach. It no longer does.
    return buildMarkHighlights(parseFilePatch(file.patch), mark, contextMarks);
  } catch (error) {
    hunk.log(`Could not paint marks for ${file.path}: ${describe(error)}`);
    return null;
  }
}

function reportMarks(ctx: ExtensionCommandContext, session: ReviewSession, fileId: string): void {
  ctx.highlights.refresh(HIGHLIGHTER_ID, { fileId });
  ctx.notify(
    session.marks.isEmpty ? messages.cleared : messages.marked(session.summarise(session.marks.snapshot())),
  );
}

/**
 * What this command should act on: the marks, or the hunk under the cursor.
 *
 * Reports and returns null when there is neither, so callers can bail without
 * repeating the message.
 */
function requireSelection(ctx: ExtensionCommandContext, session: ReviewSession): Selection | null {
  const file = ctx.selection.file;
  const cursor =
    file && ctx.selection.hunkIndex !== null
      ? { fileId: file.id, hunkIndex: ctx.selection.hunkIndex }
      : null;

  const selection = session.selectionFor(cursor);
  if (!selection) {
    ctx.notify(messages.nothingToActOn, "warning");
  }
  return selection;
}

/**
 * Refuse a review that holds no uncommitted work, reporting why.
 *
 * The guard every command here shares: they all treat the diff on screen as
 * work that has not landed, and Hunk will just as happily show a commit
 * (`hunk show`) or a comparison of two revisions (`hunk diff <from> <to>`).
 * The extension cannot ask which of those it is looking at — the API hands it
 * `sourceLabel` and `title`, both free-form display strings — so it asks the
 * VCS what is uncommitted instead.
 */
async function requireWorkingCopy(
  ctx: ExtensionCommandContext,
  session: ReviewSession,
  workspace: Workspace,
): Promise<boolean> {
  const run =
    workspace.kind === "jj"
      ? createJj({ root: workspace.root }).run
      : createGit({ root: workspace.root }).run;

  const paths = session.reviewedFiles.map((file) => file.path);

  try {
    if (await reviewHasUncommittedWork(paths, workspace, run)) {
      return true;
    }
  } catch (error) {
    // A VCS that cannot answer is not evidence of anything, so this reports
    // the failure rather than silently letting the command through — the
    // whole point of the check is that the dangerous case looks fine.
    ctx.notify(messages.failed(describe(error)), "error");
    return false;
  }

  ctx.notify(messages.notWorkingCopy, "warning");
  return false;
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
async function chooseRevision(ctx: ExtensionCommandContext, jj: Jj): Promise<string | null> {
  try {
    const revisions = await listStagingTargets(jj);
    if (revisions.length === 0) {
      ctx.notify(messages.noCommitsAvailable("jj"), "warning");
      return null;
    }

    const chosen = await ctx.dialogs.select({
      title: messages.chooseCommit("jj"),
      options: revisions.map((choice) => choice.label),
    });

    return revisions.find((choice) => choice.label === chosen)?.revision ?? null;
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
  chooseBackend: (workspace: Workspace, summary: MarkSummary) => Promise<StagingChoice | null>,
): Promise<void> {
  const selection = requireSelection(ctx, session);
  if (!selection) {
    return;
  }

  const workspace = requireWorkspace(ctx);
  if (!workspace) {
    return;
  }

  if (!(await requireWorkingCopy(ctx, session, workspace))) {
    return;
  }

  // Only the Jujutsu path needs a shell, to hand jj its selection.
  if (workspace.kind === "jj" && process.platform === "win32") {
    ctx.notify(messages.unsupportedPlatform, "error");
    return;
  }

  // Capture the review and the marks together, before the first dialog, and
  // work from that capture alone. Staging asks questions, and a reload while
  // one is on screen replaces the review and clears its marks — reading them
  // again afterwards would stage a selection nobody made. This mirrors what
  // Hunk does with `ctx.selection`: captured at invocation, not live.
  const request = session.toStageRequest(selection.marks);
  const summary = session.summarise(selection.marks);

  const choice = await chooseBackend(workspace, summary);
  if (!choice) {
    return;
  }

  const { backend } = choice;

  if (!choice.confirmed) {
    const isFixup = choice.action === "fixup";

    const confirmed = await ctx.dialogs.confirm({
      title: isFixup
        ? messages.confirmFixupTitle(summary, backend.destination, selection.source)
        : messages.confirmTitle(summary, backend.destination, selection.source),
      body: isFixup
        ? messages.confirmFixupBody(summary, backend.destination, choice.finish ?? "")
        : messages.confirmBody(summary, backend.destination, workspace.kind),
      confirmLabel: isFixup ? "commit" : "stage",
    });

    if (!confirmed) {
      return;
    }
  }

  try {
    const outcome = await stageMarkedHunks(request, {
      backend,
      readWorkingCopyFile: (path) => readFile(join(workspace.root, path), "utf8"),
    });

    await report(ctx, session, outcome, {
      destination: backend.destination,
      action: choice.action,
      kind: workspace.kind,
      finish: choice.finish,
    });
  } catch (error) {
    ctx.notify(messages.failed(describe(error)), "error");
  }
}

async function report(
  ctx: ExtensionCommandContext,
  session: ReviewSession,
  outcome: StageOutcome,
  run: RunDescription,
): Promise<void> {
  if (outcome.kind === "stale") {
    ctx.notify(messages.stale(outcome.path, outcome.detail), "warning");
    return;
  }

  if (outcome.kind === "disagreement") {
    ctx.notify(messages.disagreement(outcome.path, outcome.detail), "error");
    return;
  }

  if (outcome.kind === "unsafe-path") {
    ctx.notify(messages.unsafePath(outcome.path, outcome.detail), "error");
    return;
  }

  if (outcome.kind === "unsupported-type") {
    ctx.notify(messages.unsupportedType(outcome.path, outcome.detail), "error");
    return;
  }

  if (outcome.kind === "nothing-staged") {
    ctx.notify(messages.nothingToStage, "warning");
    return;
  }

  ctx.notify(successMessage(outcome, run));
  session.marks.clear();
  ctx.commands.execute("hunk.app.refresh");
}

/**
 * Revert the marked hunks in the working copy.
 *
 * The one command here that destroys something. It always asks — there is no
 * path that skips the confirmation — and what it promises differs by backend,
 * because what it does differs: Jujutsu has already snapshotted the working
 * copy into its operation log, so `jj undo` brings the changes back, while git
 * keeps no record of uncommitted text and cannot.
 */
async function discard(ctx: ExtensionCommandContext, session: ReviewSession): Promise<void> {
  const selection = requireSelection(ctx, session);
  if (!selection) {
    return;
  }

  const workspace = requireWorkspace(ctx);
  if (!workspace) {
    return;
  }

  if (!(await requireWorkingCopy(ctx, session, workspace))) {
    return;
  }

  const request = session.toStageRequest(selection.marks);
  const summary = session.summarise(selection.marks);

  const confirmed = await ctx.dialogs.confirm({
    title: messages.confirmDiscardTitle(summary, selection.source),
    body: messages.confirmDiscardBody(summary, workspace.kind),
    confirmLabel: "discard",
  });

  if (!confirmed) {
    return;
  }

  try {
    const outcome = await discardMarkedHunks(
      request,
      createWorkingCopyEnvironment(workspace.root),
    );

    reportDiscard(ctx, session, outcome, workspace.kind);
  } catch (error) {
    ctx.notify(messages.failed(describe(error)), "error");
  }
}

function reportDiscard(
  ctx: ExtensionCommandContext,
  session: ReviewSession,
  outcome: DiscardOutcome,
  kind: "git" | "jj",
): void {
  if (outcome.kind === "stale") {
    ctx.notify(messages.stale(outcome.path, outcome.detail), "warning");
    return;
  }

  if (outcome.kind === "disagreement") {
    ctx.notify(messages.disagreement(outcome.path, outcome.detail), "error");
    return;
  }

  if (outcome.kind === "unsafe-path") {
    ctx.notify(messages.unsafePath(outcome.path, outcome.detail), "error");
    return;
  }

  if (outcome.kind === "unsupported-type") {
    ctx.notify(messages.unsupportedType(outcome.path, outcome.detail), "error");
    return;
  }

  if (outcome.kind === "unsupported") {
    ctx.notify(messages.cannotDiscard(outcome.path, outcome.detail), "error");
    return;
  }

  if (outcome.kind === "nothing-discarded") {
    ctx.notify(messages.nothingToDiscard, "warning");
    return;
  }

  ctx.notify(messages.discarded(outcome, kind));
  session.marks.clear();
  ctx.commands.execute("hunk.app.refresh");
}

/** What a finished run was, in the terms its messages are written in. */
interface RunDescription {
  readonly destination: string;
  readonly action: StagingChoice["action"];
  readonly kind: "git" | "jj";
  readonly finish?: string;
}

/** How one finished run reads, in the vocabulary of what it actually did. */
function successMessage(
  outcome: { files: number; hunks: number },
  run: RunDescription,
): string {
  switch (run.action) {
    case "commit":
      return messages.committed(outcome, run.destination, run.kind);
    case "fixup":
      return messages.fixedUp(outcome, run.destination, run.finish ?? "");
    case "stage":
      return messages.staged(outcome, run.destination);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
