import React from 'react';
import { useAppStore } from '../store';

export default function RightDock() {
  const rightTab = useAppStore((s) => s.rightTab);

  return <div className="right-dock">{/* Settings/Style panels based on rightTab */}</div>;
}
