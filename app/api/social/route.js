import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN = process.env.X_BEARER_TOKEN || "";

const g = globalThis;
if (!g.__memeXCacheV11) g.__memeXCacheV11 = new Map();

const CACHE = g.__memeXCacheV11;

const COIN_CACHE_MS = 90 * 60 * 1000;
const GENERAL_CACHE_MS = 4 * 60 * 60 * 1000;

function cacheGet(key) {
  const x = CACHE.get(key);

  if (!x) return null;

  if (Date.now() >= x.expiresAt) {
    CACHE.delete(key);
    return null;
  }

  return x.value;
}

function cacheSet(key, value, ttl) {
  CACHE.set(key, {
    value,
    expiresAt: Date.now() + ttl
  });

  if (CACHE.size > 80) {
    const first = CACHE.keys().next().value;
    if (first) CACHE.delete(first);
  }
}

const clean = v =>
  String(v || "")
    .replace(/[^\p{L}\p{N}_.$@#:\- ]/gu, "")
    .trim();

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function rankCoins(coins) {
  return [...coins]
    .filter(c => c?.mint)
    .sort((a, b) => {
      const ax = a.twitterHandle ? 1 : 0;
      const bx = b.twitterHandle ? 1 : 0;

      if (bx !== ax) return bx - ax;

      return (
        Number(b.earlyScore || 0) -
        Number(a.earlyScore || 0)
      );
    })
    .slice(0, 4);
}

function termsFor(coin) {
  const out = [];

  const symbol = clean(coin?.symbol || "")
    .replace(/^\$/, "");

  const name = clean(coin?.name || "");

  const mint = String(coin?.mint || "").trim();

  const handle = clean(
    coin?.twitterHandle || ""
  ).replace(/^@/, "");

  if (symbol && symbol !== "?") {
    out.push(`"$${symbol}"`);
  }

  if (
    name.length >= 3 &&
    name.toLowerCase() !== "pump.fun token"
  ) {
    out.push(`"${name}"`);
  }

  if (mint.length >= 20) {
    out.push(`"${mint}"`);
  }

  if (handle) {
    out.push(`"@${handle}"`);
  }

  return unique(out).slice(0, 4);
}

function coinQuery(coins) {
  const terms = unique(
    rankCoins(coins).flatMap(termsFor)
  ).slice(0, 12);

  return terms.length
    ? `(${terms.join(" OR ")}) -is:retweet`
    : "";
}

const GENERAL_QUERY =
  `("pump.fun" OR pumpfun OR "solana memecoin" OR "new solana token" OR "CA:") -is:retweet`;

async function xSearch(query) {
  if (!TOKEN) {
    return {
      enabled: false,
      posts: [],
      message: "X_BEARER_TOKEN is not configured."
    };
  }

  const params = new URLSearchParams({
    query,
    max_results: "10",
    sort_order: "recency",
    "tweet.fields":
      "created_at,public_metrics,author_id",
    expansions: "author_id",
    "user.fields":
      "username,name,public_metrics,verified"
  });

  const r = await fetch(
    `https://api.x.com/2/tweets/search/recent?${params.toString()}`,
    {
      cache: "no-store",
      headers: {
        Authorization:
          `Bearer ${TOKEN}`
      }
    }
  );

  if (!r.ok) {
    return {
      enabled: true,
      posts: [],
      message:
        `X API returned ${r.status}`
    };
  }

  const j = await r.json();

  const users = new Map(
    (j?.includes?.users || [])
      .map(u => [u.id, u])
  );

  return {
    enabled: true,
    posts: (j?.data || []).map(t => {
      const u =
        users.get(t.author_id) || {};

      const m =
        t?.public_metrics || {};

      return {
        id: t.id,
        text:
          String(t.text || "")
            .replace(/\s+/g, " ")
            .trim(),
        createdAt:
          t.created_at || null,
        username:
          u.username || "",
        displayName:
          u.name || "",
        followers:
          Number(
            u?.public_metrics
              ?.followers_count || 0
          ),
        likes:
          Number(m.like_count || 0),
        reposts:
          Number(m.retweet_count || 0),
        replies:
          Number(m.reply_count || 0),
        url:
          `https://x.com/i/web/status/${t.id}`
      };
    }),
    message: ""
  };
}

function matches(post, coin) {
  const text =
    String(post?.text || "")
      .toLowerCase();

  const symbol =
    String(coin?.symbol || "")
      .replace(/[^A-Za-z0-9_]/g, "")
      .toLowerCase();

  const name =
    String(coin?.name || "")
      .toLowerCase();

  const mint =
    String(coin?.mint || "")
      .toLowerCase();

  const handle =
    String(coin?.twitterHandle || "")
      .replace(/^@/, "")
      .toLowerCase();

  if (mint && text.includes(mint)) return true;

  if (
    symbol &&
    symbol !== "?" &&
    text.includes(`$${symbol}`)
  ) return true;

  if (
    name.length >= 3 &&
    text.includes(name)
  ) return true;

  if (
    handle &&
    text.includes(`@${handle}`)
  ) return true;

  return false;
}

export async function POST(request) {
  try {
    const body =
      await request.json()
        .catch(() => ({}));

    if (body?.mode === "general") {
      const key = "general:v11";

      const cached =
        cacheGet(key);

      if (cached) {
        return NextResponse.json({
          ...cached,
          cached: true
        });
      }

      const result =
        await xSearch(
          GENERAL_QUERY
        );

      cacheSet(
        key,
        result,
        GENERAL_CACHE_MS
      );

      return NextResponse.json({
        ...result,
        cached: false
      });
    }

    const coins = rankCoins(
      Array.isArray(body?.coins)
        ? body.coins
        : []
    );

    const query =
      coinQuery(coins);

    if (!query) {
      return NextResponse.json({
        enabled:
          Boolean(TOKEN),
        posts: [],
        mentionedMints: [],
        message:
          "No search terms yet."
      });
    }

    const key = `coins:${query}`;

    const cached =
      cacheGet(key);

    if (cached) {
      return NextResponse.json({
        ...cached,
        cached: true
      });
    }

    const result =
      await xSearch(query);

    const mentioned =
      new Set();

    for (const post of result.posts) {
      for (const coin of coins) {
        if (matches(post, coin)) {
          mentioned.add(coin.mint);
        }
      }
    }

    const value = {
      ...result,
      mentionedMints:
        [...mentioned]
    };

    cacheSet(
      key,
      value,
      COIN_CACHE_MS
    );

    return NextResponse.json({
      ...value,
      cached: false
    });

  } catch (error) {
    return NextResponse.json({
      enabled: Boolean(TOKEN),
      posts: [],
      mentionedMints: [],
      message:
        error?.message ||
        "Social search failed."
    }, {
      status: 500
    });
  }
}
