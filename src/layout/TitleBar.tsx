import React from 'react';
import { useAppStore } from '../store';

export default function TitleBar() {
  const project = useAppStore((s) => s.project);
  const devStatus = useAppStore((s) => s.devStatus);
  const inPreview = useAppStore((s) => s.inPreview);
  const devUrl = useAppStore((s) => s.devUrl);

  if (!project) return null;

  return (
    <div className="titlebar">
      <span className="app-title">{project.name}</span>
    </div>
  );
}
