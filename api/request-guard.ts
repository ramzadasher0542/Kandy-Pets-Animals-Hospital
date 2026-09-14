type GuardRequest = {
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

function header(req: GuardRequest, name: string): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function exceedsBodyLimit(req: GuardRequest, limitBytes = 16 * 1024): boolean {
  const declared = Number(header(req, 'content-length') || 0);
  if (declared > limitBytes) return true;
  if (req.body === undefined || req.body === null) return false;
  let serialized: string;
  try {
    serialized = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  } catch {
    return true;
  }
  return new TextEncoder().encode(serialized).byteLength > limitBytes;
}

export function isRateLimited(req: GuardRequest, action: string, limit = 5, windowMs = 5 * 60 * 1000): boolean {
  const source = header(req, 'x-forwarded-for')?.split(',')[0]?.trim()
    || header(req, 'x-real-ip')
    || 'unknown';
  const key = `${action}:${source}`;
  const now = Date.now();
  if (buckets.size > 1000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}
