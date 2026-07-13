/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical EmptyState primitive — see DESIGN_SYSTEM.md.
// Dumb wrapper only. No business logic. Not wired into any panel yet (UI-1).

import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`h-full flex flex-col items-center justify-center text-slate-300 space-y-3 ${className}`}>
      {icon && (
        <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-2">
          {icon}
        </div>
      )}
      <div className="text-xs uppercase tracking-widest font-black text-center text-slate-400">{title}</div>
      {description && <p className="text-[10px] font-bold text-slate-400 text-center max-w-xs">{description}</p>}
      {action}
    </div>
  );
}

export default EmptyState;
