/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical Badge primitive — see DESIGN_SYSTEM.md for the semantic color meanings.
// One meaning per tone, no exceptions:
//   indigo=primary/admin/owner  emerald=success/paid/active/healthy
//   amber=warning/pending/expiring/urgent  rose=danger/emergency/expired/void/overdue
//   sky=informational/cashier/boarding  slate=neutral/inactive/draft
// Dumb wrapper only. No business logic. Not wired into any panel yet (UI-1).

import React from 'react';

type BadgeTone = 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'slate';

interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  indigo: 'bg-indigo-100 text-indigo-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
  sky: 'bg-sky-100 text-sky-700',
  slate: 'bg-slate-100 text-slate-600'
};

export function Badge({ tone = 'slate', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
