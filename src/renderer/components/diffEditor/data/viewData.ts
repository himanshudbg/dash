import type { FileChange } from '../../../../shared/types';

/** First changed file's path for the auto-pick-on-empty-selection behavior.
 *  Null when the view has no changes (a clean working tree): the pane then
 *  shows its empty state and waits for a pick from the tree. */
export function pickFirstChangedFile(changedFiles: FileChange[]): string | null {
  return changedFiles.length > 0 ? changedFiles[0]!.path : null;
}
