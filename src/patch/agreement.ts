import { hunkRange, type FilePatch } from "./parse";

/** One hunk as Hunk itself reports it, for cross-checking our own parse. */
export interface HostHunk {
  readonly index: number;
  readonly newRange?: readonly [number, number];
}

/**
 * Check that this extension's parse of a patch agrees with Hunk's.
 *
 * Both sides parse the same text, but with different code: Hunk renders the
 * review, and the reviewer marks hunks by the indexes it assigns. If the two
 * parses ever disagreed about what hunk 2 is, marking hunk 2 would stage
 * something else. Rather than assume they agree, staging asks — and refuses if
 * the answer is no.
 */
export function findDisagreement(patch: FilePatch, hostHunks: readonly HostHunk[]): string | null {
  if (patch.hunks.length !== hostHunks.length) {
    return `Hunk sees ${hostHunks.length} hunk(s) where this extension parsed ${patch.hunks.length}`;
  }

  for (const hunk of patch.hunks) {
    const host = hostHunks[hunk.index];
    if (!host?.newRange) {
      continue;
    }

    const [start, end] = hunkRange(hunk, "new");
    if (host.newRange[0] !== start || host.newRange[1] !== end) {
      return `hunk ${hunk.index + 1} spans lines ${start}-${end} here but ${host.newRange[0]}-${host.newRange[1]} in Hunk`;
    }
  }

  return null;
}
