type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("cf-connecting-ip") || "unknown";
}

export function rateLimit(request: Request, scope: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    if (buckets.size > MAX_BUCKETS) buckets.clear();
  }
  const key = `${scope}:${clientKey(request)}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  current.count += 1;
  if (current.count > limit) {
    return Response.json(
      { error: "Terlalu banyak percobaan. Silakan tunggu beberapa saat." },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(Math.ceil((current.resetAt - now) / 1000)),
        },
      },
    );
  }
  return null;
}

export function rateLimitKey(request: Request) {
  return clientKey(request);
}
