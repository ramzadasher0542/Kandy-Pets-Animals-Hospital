/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical Label primitive (the uppercase micro-label) — see DESIGN_SYSTEM.md.
// Dumb wrapper only. No business logic. Not wired into any panel yet (UI-1).

import React from 'react';

interface LabelProps {
  className?: string;
  children?: React.ReactNode;
  htmlFor?: string;
  [key: string]: any;
}

export function Label({ className = '', children, ...props }: LabelProps) {
  return (
    <label className={`text-[10px] font-black text-slate-500 uppercase tracking-widest block ${className}`} {...props}>
      {children}
    </label>
  );
}

export default Label;
