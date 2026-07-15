/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical Modal shell primitive — see DESIGN_SYSTEM.md.
// Pattern matched against the existing modal convention in BoardingManager.tsx /
// GroomingManager.tsx (fixed inset-0 overlay + createPortal to document.body).
// Dumb wrapper only. No business logic. Not wired into any panel yet (UI-1).

import React from 'react';
import { createPortal } from 'react-dom';

export type ModalSize = 'sm' | 'md' | 'lg';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  size?: ModalSize;
  headerActions?: React.ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[960px]',
};

export function Modal({ 
  open, 
  onClose, 
  title, 
  icon,
  footer, 
  children, 
  className = '', 
  size = 'md',
  headerActions
}: ModalProps) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-3xl w-full shadow-2xl animate-scale-up flex flex-col overflow-hidden ${SIZE_CLASSES[size]} ${className}`}
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
      >
        {title && (
          <div className="flex justify-between items-center p-6 pb-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              {icon && <div className="text-slate-600">{icon}</div>}
              <h3 className="text-lg font-black text-slate-800">{title}</h3>
            </div>
            <div className="flex items-center gap-2">
              {headerActions}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-slate-100 text-slate-400 rounded-xl cursor-pointer transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="p-6 space-y-4 overflow-y-auto">
          {children}
        </div>

        {footer && (
          <div className="flex gap-3 p-6 pt-4 border-t border-slate-100 justify-between shrink-0 bg-slate-50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

interface ModalSectionProps {
  title: string;
  tone?: 'indigo' | 'rose' | 'emerald' | 'amber' | 'slate';
  children: React.ReactNode;
  className?: string;
}

const TONE_CLASSES = {
  indigo: 'bg-indigo-50 border-indigo-100 text-indigo-800',
  rose: 'bg-rose-50 border-rose-100 text-rose-800',
  emerald: 'bg-emerald-50 border-emerald-100 text-emerald-800',
  amber: 'bg-amber-50 border-amber-100 text-amber-800',
  slate: 'bg-slate-50 border-slate-200 text-slate-800',
};

export function ModalSection({ title, tone = 'slate', children, className = '' }: ModalSectionProps) {
  return (
    <div className={`border rounded-2xl overflow-hidden shadow-sm ${className} ${TONE_CLASSES[tone].split(' ')[1]}`}>
      <div className={`px-5 py-3 border-b text-xs font-black uppercase tracking-widest ${TONE_CLASSES[tone]}`}>
        {title}
      </div>
      <div className="p-5 bg-white space-y-4">
        {children}
      </div>
    </div>
  );
}

export default Modal;
