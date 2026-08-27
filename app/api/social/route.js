import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN = process.env.X_BEARER_TOKEN || "";

const g = globalThis;

if (!g.__verifiedCryptoXCacheV12) {
  g.__verifiedCryptoXCacheV12 = new Map();
}

const CACHE = g.__verifiedCryptoXCacheV12;

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

function cryptoProfile(user) {
  const text = [
    user?.description,
    user?.name,
    user?.username
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const keywords = [
    "crypto",
    "trader",
    "trading",
    "solana",
    "memecoin",
    "meme coin",
    "onchain",
    "on-chain",
    "defi",
    "web3",
    "investor",
    "alpha"
  ];

  return keywords.some(k => text.includes(k));
}

function rankCoins(coins) {
  return [...coins]
    .filter(c => c?.mint)
    .sort((a, b) =>
      Number(b.highSignalScore || 0) -
      Number(a.highSignalScore || 0)
    )
    .slice(0, 4);
}

function termsFor(coin) {
  const out = [];

  const symbol = clean(
    coin?.symbol || ""
  ).replace(/^\$/, "");

  const name = clean(
    coin?.name || ""
  );

  const mint =
    String(coin?.mint || "").trim();

  const handle = clean(
    coin?.twitterHandle || ""
  ).replace(/^@/, "");

  if (
    symbol &&
    symbol !== "?"
  ) {
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

function verifiedCoinQuery(coins) {
  const terms = unique(
    rankCoins(coins).flatMap(termsFor)
  ).slice(0, 12);

  if (!terms.length) return "";

  // Verified authors only. Replies and quotes are NOT removed so real
  // conversations remain visible.
  return `(${terms.join(" OR ")}) is:verified -is:retweet`;
}

const VERIFIED_GENERAL_QUERY =
  `("pump.fun" OR pumpfun OR "solana memecoin" OR "new solana token" OR "CA:") is:verified -is:retweet`;

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
      "created_at,public_metrics,author_id,conversation_id,referenced_tweets",
    expansions:
      "author_id",
    "user.fields":
      "username,name,description,public_metrics,verified,verified_type"
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

  const posts = (j?.data || [])
    .map(t => {
      const u =
        users.get(t.author_id) || {};

      const metrics =
        t?.public_metrics || {};

      const refs =
        Array.isArray(t?.referenced_tweets)
          ? t.referenced_tweets
          : [];

      const conversationType =
        refs.some(x => x.type === "replied_to")
          ? "reply"
          : refs.some(x => x.type === "quoted")
          ? "quote"
          : "post";

      return {
        id: t.id,
        text:
          String(t.text || "")
            .replace(/\s+/g, " ")
            .trim(),

        createdAt:
          t.created_at || null,

        conversationId:
          t.conversation_id || "",

        conversationType,

        username:
          u.username || "",

        displayName:
          u.name || "",

        description:
          u.description || "",

        verified:
          Boolean(u.verified),

        verifiedType:
          u.verified_type || "",

        followers:
          Number(
            u?.public_metrics
              ?.followers_count || 0
          ),

        likes:
          Number(metrics.like_count || 0),

        reposts:
          Number(metrics.retweet_count || 0),

        replies:
          Number(metrics.reply_count || 0),

        url:
          `https://x.com/i/web/status/${t.id}`,

        cryptoProfile:
          cryptoProfile(u)
      };
    })
    // "Verified crypto trader" is a heuristic: verified author + a
    // crypto/trading-related profile + some audience signal.
    .filter(p =>
      p.verified &&
      p.cryptoProfile &&
      p.followers >= 500
    );

  return {
    enabled: true,
    posts,
    message:
      posts.length
        ? ""
        : "No verified crypto-profile posts matched this search."
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
      const key =
        "verified-general:v12";

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
          VERIFIED_GENERAL_QUERY
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

    const coins =
      rankCoins(
        Array.isArray(body?.coins)
          ? body.coins
          : []
      );

    const query =
      verifiedCoinQuery(coins);

    if (!query) {
      return NextResponse.json({
        enabled: Boolean(TOKEN),
        posts: [],
        mentionedMints: [],
        message:
          "No verified-X search terms yet."
      });
    }

    const key =
      `verified-coins:${query}`;

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
      enabled:
        Boolean(TOKEN),
      posts: [],
      mentionedMints: [],
      message:
        error?.message ||
        "Verified X search failed."
    }, {
      status: 500
    });
  }
}
