/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AUTH-3 — the single authorization modal that requireAuth() drives.
 *
 * Mount <AuthPromptHost /> once, near the app root. It registers the bridge so
 * any call site can `await requireAuth(user, 'void_invoice')` and get a modal,
 * without prop-drilling a callback through every panel.
 *
 * Two modes, one component:
 *   confirm  — operator is permitted; re-enter YOUR OWN credential.
 *   override — operator is not permitted; a supervisor authorizes on the spot.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Lock, Eye, EyeOff } from 'lucide-react';
import { Modal } from './Modal';
import {
  registerAuthBridge, AuthPromptRequest, CredentialCheckFn,
} from '../../lib/requireAuth';

type Resolver = (v: { username: string; credential: string } | null) => void;

interface Props {
  /** Verifies a username + credential. Owned by App (it holds systemConfig). */
  checkCredential: CredentialCheckFn;
}

export default function AuthPromptHost({ checkCredential }: Props) {
  const [request, setRequest] = useState<AuthPromptRequest | null>(null);
  const [resolver, setResolver] = useState<{ fn: Resolver } | null>(null);
  const [username, setUsername] = useState('');
  const [credential, setCredential] = useState('');
  const [showCredential, setShowCredential] = useState(false);

  const prompt = useCallback((req: AuthPromptRequest) => {
    setRequest(req);
    setUsername(req.mode === 'confirm' ? req.currentUser.username : '');
    setCredential('');
    setShowCredential(false);
    return new Promise<{ username: string; credential: string } | null>(resolve => {
      setResolver({ fn: resolve });
    });
  }, []);

  useEffect(() => {
    registerAuthBridge(prompt, checkCredential);
  }, [prompt, checkCredential]);

  const finish = (value: { username: string; credential: string } | null) => {
    resolver?.fn(value);
    setResolver(null);
    setRequest(null);
    setCredential('');
    setUsername('');
  };

  if (!request) return null;

  const isOverride = request.mode === 'override';
  const canSubmit = credential.trim().length > 0 && (!isOverride || username.trim().length > 0);

  return (
    <Modal
      open={true}
      onClose={() => finish(null)}
      size="sm"
      icon={isOverride ? <ShieldAlert className="w-5 h-5 text-amber-600" /> : <Lock className="w-5 h-5 text-indigo-600" />}
      title={isOverride ? 'Supervisor Approval Required' : 'Confirm It’s You'}
      footer={
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            data-testid="auth-cancel"
            onClick={() => finish(null)}
            className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-slate-50 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="auth-prompt-form"
            data-testid="auth-submit"
            disabled={!canSubmit}
            className={`px-5 py-2.5 font-black rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-colors ${canSubmit ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
          >
            {isOverride ? 'Approve' : 'Confirm'}
          </button>
        </div>
      }
    >
      <form
        id="auth-prompt-form"
        onSubmit={(e) => { e.preventDefault(); if (canSubmit) finish({ username: username.trim(), credential }); }}
        className="p-6 space-y-4"
      >
        {isOverride ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
            <p className="text-xs font-bold text-amber-800 leading-relaxed">
              Your role (<span className="font-black uppercase">{request.currentUser.role}</span>) cannot {request.actionDescription}.
            </p>
            <p className="text-[10px] font-bold text-amber-700">
              A supervisor can approve it now. Allowed: {request.authorizedRoles.join(', ')}.
            </p>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-700 leading-relaxed">
              You are about to <span className="font-black">{request.actionDescription}</span>. Re-enter your own credential to confirm.
            </p>
          </div>
        )}

        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
            {isOverride ? 'Supervisor Username' : 'Your Account'}
          </label>
          <input
            data-testid="auth-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            readOnly={!isOverride}
            autoFocus={isOverride}
            placeholder={isOverride ? 'e.g. hospital_owner' : ''}
            className={`w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 ${isOverride ? 'bg-slate-50' : 'bg-slate-100 text-slate-500 cursor-not-allowed'}`}
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
            {isOverride ? 'Supervisor Password / PIN' : 'Your Password / PIN'}
          </label>
          <div className="relative">
            <input
              data-testid="auth-credential"
              type={showCredential ? 'text' : 'password'}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              autoFocus={!isOverride}
              autoComplete="off"
              className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowCredential(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
              aria-label={showCredential ? 'Hide' : 'Show'}
            >
              {showCredential ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
