import React from 'react';
import { useAppStore } from '../store';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const project = useAppStore((s) => s.project);

  if (!project) {
    return <>{children}</>;
  }

  return (
    <div className="app">
      {children}
    </div>
  );
}
