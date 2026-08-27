import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN = process.env.X_BEARER_TOKEN || "";

function cryptoProfile(user) {
  const text = [user?.description,user?.name,user?.username].filter(Boolean).join(" ").toLowerCase();
  return ["crypto","trader","trading","solana","memecoin","meme coin","onchain","on-chain","defi","web3","alpha","investor"]
    .some(k => text.includes(k));
}

function exactTerms(coin) {
  const out = [];
  const mint = String(coin?.mint || "").trim();
  const handle = String(coin?.twitterHandle || "").replace(/^@/,"").replace(/[^A-Za-z0-9_]/g,"");
  if (mint.length >= 20) out.push(`"${mint}"`);
  if (handle) out.push(`"@${handle}"`);
  return [...new Set(out)];
}

function buildQuery(coins) {
  const terms = coins.slice(0,5).flatMap(exactTerms).slice(0,12);
  return terms.length ? `(${terms.join(" OR ")}) is:verified -is:retweet` : "";
}

async function xSearch(query) {
  if (!TOKEN) return { enabled:false, posts:[], message:"X_BEARER_TOKEN is not configured." };

  const params = new URLSearchParams({
    query,
    max_results:"10",
    sort_order:"recency",
    "tweet.fields":"created_at,public_metrics,author_id,conversation_id,referenced_tweets",
    expansions:"author_id",
    "user.fields":"username,name,description,public_metrics,verified,verified_type"
  });

  const r = await fetch(`https://api.x.com/2/tweets/search/recent?${params.toString()}`, {
    cache:"no-store",
    headers:{ Authorization:`Bearer ${TOKEN}` }
  });

  if (!r.ok) return { enabled:true, posts:[], message:`X API returned ${r.status}` };

  const j = await r.json();
  const users = new Map((j?.includes?.users || []).map(u=>[u.id,u]));

  const posts = (j?.data || []).map(t=>{
    const u = users.get(t.author_id) || {};
    const metrics = t?.public_metrics || {};
    const refs = Array.isArray(t?.referenced_tweets) ? t.referenced_tweets : [];
    const type = refs.some(x=>x.type==="replied_to") ? "reply" : refs.some(x=>x.type==="quoted") ? "quote" : "post";

    return {
      id:t.id,
      text:String(t.text||"").replace(/\s+/g," ").trim(),
      createdAt:t.created_at || null,
      username:u.username || "",
      displayName:u.name || "",
      followers:Number(u?.public_metrics?.followers_count || 0),
      verified:Boolean(u.verified),
      verifiedType:u.verified_type || "",
      cryptoProfile:cryptoProfile(u),
      conversationType:type,
      likes:Number(metrics.like_count || 0),
      reposts:Number(metrics.retweet_count || 0),
      replies:Number(metrics.reply_count || 0),
      url:`https://x.com/i/web/status/${t.id}`
    };
  }).filter(p => p.verified && p.cryptoProfile && p.followers >= 500);

  return {
    enabled:true,
    posts,
    message:posts.length ? "" : "No verified crypto-account posts matched the exact contract/handle."
  };
}

function matchesExact(post, coin) {
  const text = String(post?.text || "").toLowerCase();
  const mint = String(coin?.mint || "").toLowerCase();
  const handle = String(coin?.twitterHandle || "").replace(/^@/,"").toLowerCase();
  if (mint && text.includes(mint)) return true;
  if (handle && text.includes(`@${handle}`)) return true;
  return false;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(()=>({}));
    const coins = Array.isArray(body?.coins) ? body.coins.filter(x=>x?.mint).slice(0,5) : [];
    const query = buildQuery(coins);

    if (!query) return NextResponse.json({
      enabled:Boolean(TOKEN), posts:[], mentionedMints:[], message:"No exact contract/handle search terms yet."
    });

    const result = await xSearch(query);
    const mentioned = new Set();

    for (const post of result.posts) {
      for (const coin of coins) {
        if (matchesExact(post, coin)) mentioned.add(coin.mint);
      }
    }

    return NextResponse.json({ ...result, mentionedMints:[...mentioned] });
  } catch (error) {
    return NextResponse.json({
      enabled:Boolean(TOKEN), posts:[], mentionedMints:[],
      message:error?.message || "Exact X search failed."
    }, { status:500 });
  }
}
