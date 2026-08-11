import { useEffect, useCallback } from 'react';
import { getState } from '../store';

function stripAnsi(s: string): string {
  return s.replace(
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g,
    ''
  );
}

function cleanError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useDevServer() {
  const diagnose = useCallback(() => {
    const p = getState().project?.path;
    if (!p) return;
    window.avb
      .diagnoseDev(p)
      .then((d) => getState().setDevDiag(d))
      .catch(() => getState().setDevDiag(null));
  }, []);

  useEffect(() => {
    const offProgress = window.avb.onProgress((e: any) =>
      getState().setBusy(e.message || null)
    );
    const offExit = window.avb.onDevExit((e: any) => {
      getState().setDevStatus('off');
      getState().setDevUrl(null);
      if (e.log) {
        getState().setDevLog(stripAnsi(e.log).slice(-4000));
      }
      diagnose();
    });
    const offLog = window.avb.onDevLog((chunk) => {
      const current = getState().devLog;
      const next = stripAnsi(current + chunk).slice(-4000);
      getState().setDevLog(next);
    });
    return () => {
      offProgress();
      offExit();
      offLog();
    };
  }, [diagnose]);
}
