import React from 'react';
import { useAppStore } from '../store';

export default function Overlays() {
  const busy = useAppStore((s) => s.busy);
  const toast = useAppStore((s) => s.toast);
  const codeWin = useAppStore((s) => s.codeWin);

  return (
    <>
      {busy && <div className="busy-overlay">{busy}</div>}
      {toast && <div className="toast">{toast.msg}</div>}
      {/* CodeWindow, InsertSearch, AssetPicker rendered here */}
    </>
  );
}
