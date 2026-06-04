import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type RateLimitRule = {
  name: string;
  key: string | null | undefined;
  limit: number;
  windowSec: number;
  message?: string;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
};

const fallbackBuckets = new Map<string, { count: number; resetAt: number }>();
let warnedAboutFallback = false;

export function clientIpKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return `ip:${first}`;
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return `ip:${realIp}`;

  return "ip:unknown";
}

export function rateLimitKey(scope: string, value: string): string {
  return `${scope}:${value}`;
}

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function consumeDbRateLimit(
  supabase: SupabaseClient,
  rule: RateLimitRule & { key: string }
): Promise<RateLimitResult | null> {
  const { data, error } = await supabase
    .rpc("consume_rate_limit", {
      p_action: rule.name,
      p_key_hash: hashKey(rule.key),
      p_window_seconds: rule.windowSec,
      p_max_hits: rule.limit,
    })
    .single<RateLimitResult>();

  if (error || !data) {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn(
        "Rate limit RPC unavailable; falling back to in-memory limiting. Apply the Supabase rate-limit migration in production.",
        error?.message ?? ""
      );
    }
    return null;
  }

  return data;
}

function consumeFallbackRateLimit(rule: RateLimitRule & { key: string }): RateLimitResult {
  const now = Date.now();

  if (fallbackBuckets.size > 5000) {
    for (const [bucketKey, bucket] of fallbackBuckets) {
      if (bucket.resetAt <= now) fallbackBuckets.delete(bucketKey);
    }
  }

  const bucketKey = `${rule.name}:${hashKey(rule.key)}:${rule.windowSec}`;
  const existing = fallbackBuckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + rule.windowSec * 1000;
    fallbackBuckets.set(bucketKey, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(rule.limit - 1, 0),
      retry_after_seconds: Math.max(Math.ceil((resetAt - now) / 1000), 1),
    };
  }

  existing.count += 1;
  fallbackBuckets.set(bucketKey, existing);

  return {
    allowed: existing.count <= rule.limit,
    remaining: Math.max(rule.limit - existing.count, 0),
    retry_after_seconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
  };
}

export async function enforceRateLimits(
  req: Request,
  rules: RateLimitRule[]
): Promise<NextResponse | null> {
  const usableRules = rules.filter((rule): rule is RateLimitRule & { key: string } => Boolean(rule.key));
  if (usableRules.length === 0) return null;

  const supabase = createServiceClient();

  for (const rule of usableRules) {
    const result = (await consumeDbRateLimit(supabase, rule)) ?? consumeFallbackRateLimit(rule);
    if (!result.allowed) {
      return NextResponse.json(
        { error: rule.message ?? "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retry_after_seconds),
            "X-RateLimit-Limit": String(rule.limit),
            "X-RateLimit-Remaining": String(result.remaining),
          },
        }
      );
    }
  }

  return null;
}
