import { useEffect } from 'react';
import { getState } from '../store';

export function useProjectWatcher() {
  useEffect(() => {
    const off = window.avb.onFsChanged(async ({ files }) => {
      const project = getState().project;
      if (!project) return;
      const result = await window.avb.scanProject(project.path);
      getState().setScan(result);
      window.avb
        .listProjectClasses(project.path)
        .then((c) => getState().setProjectClasses(c || []))
        .catch(() => {});

      const current = getState().currentPage;
      if (
        current &&
        files.some((f) => f === current.path || f.includes(current.name))
      ) {
        const fresh = await window.avb.readPage(current.path);
        if (fresh) {
          getState().setPageState({ ...fresh, dirty: false });
          getState().select(null);
          getState().resetHistory();
        }
      }
    });
    return off;
  }, []);
}
