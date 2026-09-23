export interface LineRange {
  start: number;
  end: number;
}

/** A reference to paste into a prompt or chat: `src/a.ts:12` or `src/a.ts:12-18`. */
export function fileRef(filePath: string, lines: LineRange | null): string {
  if (!lines) return filePath;
  const lo = Math.min(lines.start, lines.end);
  const hi = Math.max(lines.start, lines.end);
  return lo === hi ? `${filePath}:${lo}` : `${filePath}:${lo}-${hi}`;
}

/** The repo-relative `filePath` resolved against the repo root `cwd`. */
export function absolutePath(cwd: string, filePath: string): string {
  return `${cwd.replace(/\/+$/, '')}/${filePath}`;
}
