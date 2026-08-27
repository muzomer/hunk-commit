import type { Jj } from "./repository";

/**
 * The revisions a reviewer may stage into.
 *
 * Only mutable ancestors of the working copy are offered: staging moves
 * changes *down* a stack, and an immutable revision would be refused by `jj`
 * anyway. Offering exactly what can work keeps the picker honest.
 */
export interface RevisionChoice {
  /** The change id, which is what gets passed to `jj`. */
  readonly revision: string;
  /** What the picker shows. */
  readonly label: string;
}

const SEPARATOR = "\t";

const TEMPLATE = [
  "change_id.shortest(8)",
  `"${SEPARATOR}"`,
  'if(description, description.first_line(), "(no description set)")',
  '"\\n"',
].join(" ++ ");

export const REVISION_LIST_ARGS = [
  "log",
  "--no-graph",
  "--limit",
  "20",
  "-r",
  "::@- & mutable()",
  "-T",
  TEMPLATE,
];

/** Parse the `jj log` output produced by `REVISION_LIST_ARGS`. */
export function parseRevisionChoices(output: string): RevisionChoice[] {
  return output
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [revision, description = ""] = line.split(SEPARATOR);
      return revision ? [{ revision, label: `${revision}  ${description}` }] : [];
    });
}

export async function listStagingTargets(jj: Jj): Promise<RevisionChoice[]> {
  return parseRevisionChoices(await jj.run(REVISION_LIST_ARGS));
}
