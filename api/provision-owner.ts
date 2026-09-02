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

type ProvisionOwnerBody = {
  email?: unknown;
  password?: unknown;
  clinic_id?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function header(req: ApiRequest, name: string): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function respond(res: ApiResponse, status: number, body: unknown): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export default async function provisionOwner(req: ApiRequest, res: ApiResponse): Promise<void> {
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
    respond(res, 500, { message: 'Owner provisioning is not configured.' });
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

  let body: ProvisionOwnerBody;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) as ProvisionOwnerBody;
  } catch {
    respond(res, 400, { message: 'Request body must be valid JSON.' });
    return;
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const clinicId = typeof body.clinic_id === 'string' ? body.clinic_id.trim() : '';
  if (!EMAIL_PATTERN.test(email) || password.length < 12 || !UUID_PATTERN.test(clinicId)) {
    respond(res, 400, { message: 'Provide a valid email, a password of at least 12 characters, and a valid clinic ID.' });
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
    respond(res, 403, { message: 'Only the Super Admin can provision tenant owners.' });
    return;
  }

  const { data: clinic, error: clinicError } = await admin
    .from('clinics')
    .select('id')
    .eq('id', clinicId)
    .maybeSingle();
  if (clinicError) {
    respond(res, 500, { message: 'The target clinic could not be checked.' });
    return;
  }
  if (!clinic) {
    respond(res, 404, { message: 'The target clinic does not exist.' });
    return;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    const duplicate = createError?.message.toLowerCase().includes('already');
    respond(res, duplicate ? 409 : 400, {
      message: duplicate ? 'An Auth account already exists for this email.' : 'The Auth account could not be created.',
    });
    return;
  }

  const { error: staffError } = await admin.from('users').insert({
    id: created.user.id,
    name: email,
    username: email,
    role: 'owner',
    active: true,
    is_deleted: false,
    auth_user_id: created.user.id,
    clinic_id: clinicId,
  });
  if (staffError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    respond(res, 500, {
      message: cleanupError
        ? 'The staff record could not be created. The Auth account needs manual cleanup.'
        : 'The staff record could not be created; the Auth account was rolled back.',
    });
    return;
  }

  respond(res, 201, { email, clinic_id: clinicId, role: 'owner' });
}

