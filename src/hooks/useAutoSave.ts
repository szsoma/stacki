import { useEffect, useRef } from 'react';
import { getState } from '../store';

function cleanError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useAutoSave() {
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const unsubscribe = () => {
      clearTimeout(saveTimer.current);
    };
    return unsubscribe;
  }, []);

  const scheduleSave = (immediate = false) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      async () => {
        const state = getState();
        const page = state.currentPage;
        const ps = state.pageState;
        if (!page || !ps || !ps.dirty) return;
        try {
          if (ps.editable) {
            await window.avb.writePage({ pagePath: page.path, model: ps.model });
          } else {
            await window.avb.writePageRaw({ pagePath: page.path, source: ps.source });
          }
          getState().markClean();
        } catch (err) {
          getState().showToast(`Save failed: ${cleanError(err)}`, 'error');
        }
      },
      immediate ? 0 : 300
    );
  };

  return { scheduleSave };
}
