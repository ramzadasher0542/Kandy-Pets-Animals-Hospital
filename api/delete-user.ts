import { createClient } from '@supabase/supabase-js';

type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type DeleteUserBody = {
  user_id?: unknown;
  clinic_id?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function header(req: ApiRequest, name: string): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function respond(res: ApiResponse, status: number, body: unknown): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export default async function deleteUser(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    respond(res, 405, { message: 'Only POST is supported.' });
    return;
  }

  const origin = header(req, 'origin');
  const host = header(req, 'host');
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        respond(res, 403, { message: 'Cross-origin requests are not allowed.' });
        return;
      }
    } catch {
      respond(res, 403, { message: 'Invalid request origin.' });
      return;
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    respond(res, 500, { message: 'User deletion is not configured.' });
    return;
  }

  const authorization = header(req, 'authorization');
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  if (!accessToken) {
    respond(res, 401, { message: 'A valid Super Admin session is required.' });
    return;
  }

  let body: DeleteUserBody;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) as DeleteUserBody;
  } catch {
    respond(res, 400, { message: 'Request body must be valid JSON.' });
    return;
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
  const clinicId = typeof body.clinic_id === 'string' ? body.clinic_id.trim() : '';
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(clinicId)) {
    respond(res, 400, { message: 'Provide a valid user ID and clinic ID.' });
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) {
    respond(res, 401, { message: 'The Super Admin session is invalid or expired.' });
    return;
  }

  const { data: actor, error: actorError } = await admin
    .from('users')
    .select('id')
    .eq('auth_user_id', authData.user.id)
    .eq('active', true)
    .eq('is_deleted', false)
    .eq('is_superadmin', true)
    .maybeSingle();
  if (actorError) {
    respond(res, 500, { message: 'Super Admin authorization could not be checked.' });
    return;
  }
  if (!actor) {
    respond(res, 403, { message: 'Only the Super Admin can delete tenant user accounts.' });
    return;
  }

  const { data: target, error: targetError } = await admin
    .from('users')
    .select('id, auth_user_id, clinic_id, is_superadmin, name, username')
    .eq('auth_user_id', userId)
    .eq('clinic_id', clinicId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (targetError) {
    respond(res, 500, { message: 'The target user could not be checked.' });
    return;
  }
  if (!target) {
    respond(res, 404, { message: 'The target user is not assigned to that clinic or has already been deleted.' });
    return;
  }
  if (target.is_superadmin) {
    respond(res, 403, { message: 'The Super Admin account cannot be deleted from the tenant roster.' });
    return;
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    respond(res, 400, { message: 'The Supabase Auth account could not be deleted.' });
    return;
  }

  const { error: staffError } = await admin
    .from('users')
    .update({ active: false, is_deleted: true })
    .eq('id', target.id)
    .eq('clinic_id', clinicId);
  if (staffError) {
    respond(res, 500, { message: 'The Auth account was deleted, but the clinic staff record needs manual cleanup.' });
    return;
  }

  respond(res, 200, { user_id: userId, clinic_id: clinicId, deleted: true });
}
