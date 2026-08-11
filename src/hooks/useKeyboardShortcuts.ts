import { useEffect } from 'react';
import { getState } from '../store';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const offMenu = window.avb.onMenu('undo', () => getState().undo());
    const offMenu2 = window.avb.onMenu('redo', () => getState().redo());
    const offMenu3 = window.avb.onMenu('insert', () => {
      if (getState().pageState?.editable && !getState().inPreview) {
        getState().setInsertOpen(true);
      }
    });

    return () => {
      offMenu();
      offMenu2();
      offMenu3();
    };
  }, []);
}
