import { useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { useWizardToasts } from '../ports/useWizardToasts';
import { useReleaseNotesToast } from './useReleaseNotesToast';

export function ToastContainer() {
  useWizardToasts();
  useReleaseNotesToast();

  useEffect(() => {
    return window.electronAPI.onToast((data) => {
      if (data.url) {
        toast(data.message, {
          action: {
            label: 'Open',
            onClick: () => {
              void window.electronAPI.openExternal(data.url!);
            },
          },
          duration: 6000,
        });
      } else {
        toast(data.message, { duration: 6000 });
      }
    });
  }, []);

  return <Toaster theme="system" position="bottom-right" />;
}
