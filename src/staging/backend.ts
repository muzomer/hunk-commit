import type { Document } from "../patch/document";
import type { FilePatch } from "../patch/parse";
import type { FileDisposition } from "./plan";

/**
 * One reviewed file, once every check has passed and its fate is known.
 *
 * This is the whole vocabulary a backend needs. Everything upstream of it —
 * parsing, cross-checking against Hunk's own hunks, and verifying the working
 * copy still matches — has already happened, identically, whichever version
 * control system is in use.
 */
export interface StagedEntry {
  readonly patch: FilePatch;
  readonly disposition: FileDisposition;
  /** The working-copy text, present exactly when the file needed reading. */
  readonly document?: Document;
}

/**
 * Where marked hunks go, and how they get there.
 *
 * The two implementations differ more than they look. Git has an index, so
 * staging means applying a patch of the marked hunks to it and unmarked files
 * simply do not appear. Jujutsu has no index, so staging means rewriting a
 * revision through a diff editor, and every file — including the ones that
 * stay behind — has to be described explicitly.
 *
 * That difference is exactly what this interface hides.
 */
export interface StagingBackend {
  /** How the destination reads in a sentence: "the index", "@-". */
  readonly destination: string;
  /** Apply the selection. Called once, after every entry has been checked. */
  stage(entries: readonly StagedEntry[]): Promise<void>;
}
