/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical Card primitives — see DESIGN_SYSTEM.md.
// Dumb wrappers only. No business logic. Not wired into any panel yet (UI-1).

import React from 'react';

interface CardProps {
  className?: string;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  [key: string]: any;
}

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }: CardProps) {
  return (
    <div className={`p-4 border-b border-slate-100 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className = '', children, ...props }: CardProps) {
  return (
    <div className={`p-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export default Card;
