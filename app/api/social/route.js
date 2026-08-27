import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN = process.env.X_BEARER_TOKEN || "";

const clean = v =>
  String(v || "").replace(/[^\p{L}\p{N}_.$@#:\- ]/gu, "").trim();

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function coinTerms(coin) {
  const out = [];
  const symbol = clean(coin?.symbol || "").replace(/^\$/, "");
  const name = clean(coin?.name || "");
  const mint = String(coin?.mint || "").trim();
  const handle = clean(coin?.twitterHandle || "").replace(/^@/, "");

  if (symbol && symbol !== "?") {
    out.push(`"$${symbol}"`);
    out.push(`"${symbol}"`);
  }

  if (name.length >= 3 && name.toLowerCase() !== "new pump.fun launch") {
    out.push(`"${name}"`);
  }

  if (mint.length >= 20) {
    out.push(`"${mint}"`);
  }

  if (handle) {
    out.push(`"@${handle}"`);
  }

  for (const hint of Array.isArray(coin?.phrases) ? coin.phrases : []) {
    const h = clean(hint);
    if (h.length >= 2) out.push(`"${h}"`);
  }

  return unique(out).slice(0, 8);
}

function buildCoinQuery(coins) {
  const terms = unique(
    coins.slice(0, 8).flatMap(coinTerms)
  ).slice(0, 20);

  return terms.length
    ? `(${terms.join(" OR ")}) -is:retweet`
    : "";
}

const broaderQueries = [
  `("pump.fun" OR pumpfun OR "solana memecoin" OR "solana meme coin") -is:retweet`,
  `("new coin" OR "new token" OR "new launch") (solana OR pumpfun OR "pump.fun") -is:retweet`,
  `("contract address" OR "CA:") (solana OR pumpfun) -is:retweet`,
  `("community takeover" OR CTO OR "meme coin") (solana OR pumpfun) -is:retweet`,
  `("ticker" OR "$") ("pump.fun" OR pumpfun) -is:retweet`
];

async function xSearch(query, maxResults = 20) {
  if (!TOKEN) {
    return {
      enabled: false,
      posts: [],
      message: "X_BEARER_TOKEN is not configured."
    };
  }

  const params = new URLSearchParams({
    query,
    max_results: String(Math.max(10, Math.min(50, maxResults))),
    "tweet.fields": "created_at,public_metrics,author_id",
    expansions: "author_id",
    "user.fields": "username,name,public_metrics,verified"
  });

  const r = await fetch(
    `https://api.x.com/2/tweets/search/recent?${params.toString()}`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${TOKEN}` }
    }
  );

  if (!r.ok) {
    return {
      enabled: true,
      posts: [],
      message: `X API returned ${r.status}`
    };
  }

  const j = await r.json();
  const users = new Map((j?.includes?.users || []).map(u => [u.id, u]));

  return {
    enabled: true,
    posts: (j?.data || []).map(t => {
      const u = users.get(t.author_id) || {};
      const m = t?.public_metrics || {};

      return {
        id: t.id,
        text: String(t.text || "").replace(/\s+/g, " ").trim(),
        createdAt: t.created_at || null,
        username: u.username || "",
        displayName: u.name || "",
        followers: Number(u?.public_metrics?.followers_count || 0),
        likes: Number(m.like_count || 0),
        reposts: Number(m.retweet_count || 0),
        replies: Number(m.reply_count || 0),
        url: `https://x.com/i/web/status/${t.id}`
      };
    }),
    message: ""
  };
}

function matches(post, coin) {
  const text = String(post?.text || "").toLowerCase();
  const symbol = String(coin?.symbol || "").replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
  const name = String(coin?.name || "").toLowerCase();
  const mint = String(coin?.mint || "").toLowerCase();
  const handle = String(coin?.twitterHandle || "").replace(/^@/, "").toLowerCase();

  if (mint && text.includes(mint)) return true;
  if (symbol && symbol !== "?" && text.includes(`$${symbol}`)) return true;
  if (name.length >= 3 && text.includes(name)) return true;
  if (handle && text.includes(`@${handle}`)) return true;

  return false;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body?.mode === "general") {
      const all = [];

      for (const query of broaderQueries) {
        const r = await xSearch(query, 15);

        if (!r.enabled || (r.message && !r.posts.length)) {
          return NextResponse.json(r);
        }

        all.push(...r.posts);
      }

      const seen = new Set();

      const posts = all
        .filter(p => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        })
        .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
        .slice(0, 40);

      return NextResponse.json({
        enabled: true,
        posts,
        message: posts.length ? "" : "No recent broader posts found."
      });
    }

    const coins = Array.isArray(body?.coins)
      ? body.coins.slice(0, 8)
      : [];

    const query = buildCoinQuery(coins);

    if (!query) {
      return NextResponse.json({
        enabled: Boolean(TOKEN),
        posts: [],
        mentionedMints: [],
        message: "No search terms yet."
      });
    }

    const result = await xSearch(query, 35);
    const mentioned = new Set();

    for (const post of result.posts) {
      for (const coin of coins) {
        if (matches(post, coin)) mentioned.add(coin.mint);
      }
    }

    return NextResponse.json({
      ...result,
      mentionedMints: [...mentioned]
    });

  } catch (error) {
    return NextResponse.json({
      enabled: Boolean(TOKEN),
      posts: [],
      mentionedMints: [],
      message: error?.message || "Social search failed."
    }, { status: 500 });
  }
}
