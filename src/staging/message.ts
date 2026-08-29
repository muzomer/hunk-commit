/**
 * The message a reviewer types when committing.
 *
 * Hunk's input dialog takes one line at a time, so the two parts are asked for
 * separately and carried together from there. Both backends need the same
 * pair — git passes them to `git commit`, jj to `jj split --message` — which
 * is why the shape lives here rather than in either one.
 */
export interface CommitMessage {
  /** The first line. Always present. */
  readonly subject: string;
  /** The rest, or empty when the reviewer skipped it. */
  readonly body: string;
}

/** Render a message as the single string `jj` expects, blank line and all. */
export function joinCommitMessage(message: CommitMessage): string {
  return message.body === "" ? message.subject : `${message.subject}\n\n${message.body}`;
}
