/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical Input / Select / Textarea primitives — see DESIGN_SYSTEM.md.
// Dumb wrappers only. No business logic. Not wired into any panel yet (UI-1).

import React from 'react';

const FIELD_CLASSES = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20';

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_CLASSES} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${FIELD_CLASSES} cursor-pointer ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_CLASSES} resize-none ${className}`} {...props} />;
}

export default Input;
