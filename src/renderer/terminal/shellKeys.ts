/**
 * macOS text-editing shortcuts for the drawer shell, sent the way Terminal.app
 * and iTerm2 send them. xterm.js encodes Option/Cmd+arrow as modified CSI
 * sequences (`ESC[1;3D`, `ESC[1;9C`), which a stock zsh/bash line editor has no
 * binding for, so it echoes the tail (";3C") instead of moving the cursor.
 * The emacs-mode bindings below exist in every default zsh/bash keymap.
 */
export interface ShellKeyEvent {
  key: string;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export function macShellKeySequence(e: ShellKeyEvent): string | null {
  if (e.ctrlKey || e.shiftKey) return null;
  if (e.altKey && !e.metaKey) {
    if (e.key === 'ArrowLeft') return '\x1bb'; // backward-word
    if (e.key === 'ArrowRight') return '\x1bf'; // forward-word
  }
  if (e.metaKey && !e.altKey) {
    if (e.key === 'ArrowLeft') return '\x01'; // beginning-of-line
    if (e.key === 'ArrowRight') return '\x05'; // end-of-line
  }
  return null;
}
