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

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, footer, children, className = '' }: ModalProps) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-3xl max-w-md w-full shadow-2xl animate-scale-up flex flex-col overflow-hidden ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex justify-between items-start p-6 pb-4 border-b border-slate-100 shrink-0">
            <h3 className="text-lg font-black text-slate-800">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 text-slate-400 rounded-xl cursor-pointer transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}

        <div className="p-6 space-y-4 overflow-y-auto">
          {children}
        </div>

        {footer && (
          <div className="flex gap-3 p-6 pt-0 justify-end shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
