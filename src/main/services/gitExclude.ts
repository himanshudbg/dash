/**
 * Pure helpers for `.git/info/exclude`, the repository-private ignore file.
 * Dash keeps task worktrees inside the main checkout (`<repo>/.claude/worktrees/`,
 * the layout Claude Code assumes) and hides them from `git status` here rather
 * than by editing the project's tracked `.gitignore`.
 */

/** Entry Dash adds so the main checkout never lists task worktrees as untracked. */
export const WORKTREES_EXCLUDE_ENTRY = '.claude/worktrees/';

const DASH_EXCLUDE_COMMENT = '# Dash task worktrees';

/** True when `content` already ignores `entry` (with or without the trailing slash). */
export function hasExcludeEntry(content: string, entry: string): boolean {
  const bare = entry.replace(/\/+$/, '');
  return content.split(/\r?\n/).some((line) => {
    const t = line.trim();
    return t === entry || t === bare || t === `/${entry}` || t === `/${bare}`;
  });
}

/**
 * Return `content` with `entry` appended (plus a comment line), or null when
 * it is already present so the caller can skip the write.
 */
export function withExcludeEntry(content: string, entry: string): string | null {
  if (hasExcludeEntry(content, entry)) return null;
  const body = content.length === 0 || content.endsWith('\n') ? content : `${content}\n`;
  return `${body}${DASH_EXCLUDE_COMMENT}\n${entry}\n`;
}
