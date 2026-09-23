import { useSettings } from '../stores/settingsStore';
import { useProjects } from '../stores/projectsStore';
import { resolveIdeId } from '../components/ui/IdeIcon';

/**
 * The IDE "Open in IDE" will launch, for labelling it: its id (for IdeIcon) and
 * a ready-made "Open in Cursor" / "Open in IDE" label. One source so the task
 * header button and every task "…" menu name the same IDE.
 */
export function usePreferredIde(): { ideId: string | null; openLabel: string } {
  const preferredIDE = useSettings((s) => s.preferredIDE);
  const availableIDEs = useProjects((s) => s.availableIDEs);
  const ideId = resolveIdeId(preferredIDE, availableIDEs);
  const name = availableIDEs.find((i) => i.id === ideId)?.label;
  return { ideId, openLabel: name ? `Open in ${name}` : 'Open in IDE' };
}
