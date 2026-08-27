/**
 * A text file as lines, kept exactly as they were read.
 *
 * Lines never carry their terminator: the terminator is `\n`, and whether the
 * final line has one is the document's own `endsWithNewline` flag. That split
 * is what makes `\ No newline at end of file` representable — a patch says the
 * flag changed, not that some line's content changed.
 *
 * A CRLF file needs no special handling here. Its `\r` stays inside the line
 * content on both sides of every comparison, so it round-trips untouched.
 */
export interface Document {
  readonly lines: readonly string[];
  readonly endsWithNewline: boolean;
}

/** Split source text into the document model. */
export function parseDocument(text: string): Document {
  if (text === "") {
    return { lines: [], endsWithNewline: false };
  }

  const endsWithNewline = text.endsWith("\n");
  const body = endsWithNewline ? text.slice(0, -1) : text;
  return { lines: body.split("\n"), endsWithNewline };
}

/** Render a document back to source text. Inverse of `parseDocument`. */
export function renderDocument(document: Document): string {
  if (document.lines.length === 0) {
    return "";
  }

  return document.lines.join("\n") + (document.endsWithNewline ? "\n" : "");
}
