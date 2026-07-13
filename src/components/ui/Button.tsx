/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical Button primitive — see DESIGN_SYSTEM.md.
// Dumb wrapper only. No business logic. Not wired into any panel yet (UI-1).

import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

interface ButtonProps {
  variant?: ButtonVariant;
  className?: string;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  [key: string]: any;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
  destructive: 'bg-rose-600 hover:bg-rose-700 text-white shadow-md',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-600'
};

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest cursor-pointer transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
