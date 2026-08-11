import React from 'react';
import { useAppStore } from '../store';

export default function LeftDock() {
  const leftTab = useAppStore((s) => s.leftTab);

  return <div className="left-dock">{/* Panel content based on leftTab */}</div>;
}
