import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN = process.env.X_BEARER_TOKEN || "";

const clean = s => String(s || "").replace(/[^A-Za-z0-9_]/g, "");

function queryForCoins(coins) {
  const terms = [];
  for (const c of coins.slice(0, 8)) {
    const sym = clean(c.symbol);
    if (sym.length >= 2) terms.push(`\"$${sym}\"`);
    if (String(c.mint || "").length >= 20) terms.push(`\"${c.mint}\"`);
  }
  return terms.length ? `(${[...new Set(terms)].slice(0, 12).join(" OR ")}) -is:retweet` : "";
}

async function searchX(query) {
  if (!TOKEN) return { enabled: false, posts: [], message: "Add X_BEARER_TOKEN in Vercel to enable the live X feed." };
  if (!query) return { enabled: true, posts: [], message: "No search terms yet." };

  const p = new URLSearchParams({
    query,
    max_results: "25",
    "tweet.fields": "created_at,public_metrics,author_id",
    expansions: "author_id",
    "user.fields": "username,name,public_metrics,verified",
  });

  const r = await fetch(`https://api.x.com/2/tweets/search/recent?${p.toString()}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  if (!r.ok) return { enabled: true, posts: [], message: `X API returned ${r.status}.` };

  const j = await r.json();
  const users = new Map((j?.includes?.users || []).map(u => [u.id, u]));
  const posts = (j?.data || []).map(t => {
    const u = users.get(t.author_id) || {};
    const m = t?.public_metrics || {};
    return {
      id: t.id,
      text: String(t.text || "").replace(/\s+/g, " ").slice(0, 240),
      createdAt: t.created_at || null,
      username: u.username || "",
      displayName: u.name || "",
      followers: Number(u?.public_metrics?.followers_count || 0),
      likes: Number(m.like_count || 0),
      reposts: Number(m.retweet_count || 0),
      replies: Number(m.reply_count || 0),
      url: `https://x.com/i/web/status/${t.id}`,
    };
  });

  return { enabled: true, posts, message: posts.length ? "" : "No recent matching X posts." };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.mode === "general") {
      return NextResponse.json(await searchX(`(\"pump.fun\" OR \"pumpfun\" OR \"solana memecoin\" OR \"meme coin\") -is:retweet`));
    }

    const coins = Array.isArray(body.coins) ? body.coins.slice(0, 8) : [];
    const result = await searchX(queryForCoins(coins));
    const mentioned = new Set();

    for (const post of result.posts || []) {
      const text = String(post.text || "").toLowerCase();
      for (const c of coins) {
        const mint = String(c.mint || "");
        const sym = clean(c.symbol).toLowerCase();
        if ((mint && text.includes(mint.toLowerCase())) || (sym.length >= 2 && text.includes(`$${sym}`))) {
          mentioned.add(mint);
        }
      }
    }

    return NextResponse.json({ ...result, mentionedMints: [...mentioned] });
  } catch (e) {
    return NextResponse.json({ enabled: Boolean(TOKEN), posts: [], mentionedMints: [], message: e?.message || "Social search failed" }, { status: 500 });
  }
}
