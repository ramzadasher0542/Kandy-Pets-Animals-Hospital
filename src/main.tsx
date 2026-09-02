import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import App from './App.tsx';
import './index.css';
import { getAuthSession, SYNC_ENABLED, supabase } from './lib/supabase';

const rootElement = document.getElementById('root');

if (!rootElement) throw new Error('Application root is missing.');

async function bootstrap() {
  let initialSession: Session | null = null;
  let initialAuthError: Error | null = null;
  const hasDevTestAuth = import.meta.env.DEV && Boolean((window as any).__KP_TEST_AUTH__);

  if (!hasDevTestAuth && SYNC_ENABLED && supabase) {
    try {
      initialSession = await getAuthSession();
    } catch (error) {
      initialAuthError = error instanceof Error ? error : new Error('Authentication could not be restored.');
    }
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App initialSession={initialSession} initialAuthError={initialAuthError} />
    </StrictMode>,
  );
}

void bootstrap();
