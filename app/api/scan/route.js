import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RAW_FEED = process.env.LAUNCH_FEED_URL || "";
const FEED_TOKEN = process.env.LAUNCH_FEED_TOKEN || "";
const DEX = "https://api.dexscreener.com";

function endpoint() {
  if (!RAW_FEED) throw new Error("LAUNCH_FEED_URL is not configured");
  const clean = RAW_FEED.replace(/\/$/, "");
  return clean.endsWith("/launches") ? clean : `${clean}/launches`;
}

async function getLaunches() {
  const r = await fetch(`${endpoint()}?sinceSeconds=1800`, {
    cache: "no-store",
    headers: FEED_TOKEN ? { Authorization: `Bearer ${FEED_TOKEN}` } : {},
  });
  if (!r.ok) throw new Error(`Launch feed returned ${r.status}`);
  return r.json();
}

async function enrich(coin) {
  try {
    const r = await fetch(`${DEX}/token-pairs/v1/solana/${encodeURIComponent(coin.mint)}`, {
      cache: "no-store",
      headers: { "User-Agent": "meme-coin-social-pulse/7.0" },
    });
    if (!r.ok) return coin;
    const pairs = await r.json();
    if (!Array.isArray(pairs) || !pairs.length) return coin;

    const pair = [...pairs].sort(
      (a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0)
    )[0];

    const socials = { twitter: "", telegram: "", website: "" };
    for (const s of Array.isArray(pair?.info?.socials) ? pair.info.socials : []) {
      const type = String(s?.type || "").toLowerCase();
      const url = String(s?.url || "");
      if (!url) continue;
      if (type.includes("twitter") || type === "x") socials.twitter = url;
      if (type.includes("telegram")) socials.telegram = url;
    }
    const sites = Array.isArray(pair?.info?.websites) ? pair.info.websites : [];
    if (sites[0]?.url) socials.website = String(sites[0].url);

    const buys = Number(pair?.txns?.m5?.buys || 0);
    const sells = Number(pair?.txns?.m5?.sells || 0);
    const liq = Number(pair?.liquidity?.usd || 0);
    const vol = Number(pair?.volume?.m5 || 0);
    const trades = buys + sells;
    const ratio = (buys + 1) / (sells + 1);

    let score = 0;
    score += liq >= 25000 ? 30 : liq >= 10000 ? 24 : liq >= 3000 ? 15 : liq >= 1000 ? 7 : 0;
    score += trades >= 25 ? 30 : trades >= 10 ? 22 : trades >= 4 ? 12 : trades >= 2 ? 5 : 0;
    score += vol >= 10000 ? 20 : vol >= 3000 ? 14 : vol >= 500 ? 7 : 0;
    score += ratio >= 2 ? 20 : ratio >= 1.4 ? 14 : ratio >= 1.05 ? 6 : 0;

    return {
      ...coin,
      marketReady: true,
      symbol: pair?.baseToken?.symbol || coin.symbol || "?",
      name: pair?.baseToken?.name || coin.name || "Pump.fun token",
      dexUrl: pair?.url || "",
      pairAddress: pair?.pairAddress || "",
      imageUrl: pair?.info?.imageUrl || "",
      priceUsd: Number(pair?.priceUsd || 0),
      priceChange5m: Number(pair?.priceChange?.m5 || 0),
      liquidity: liq,
      volume5m: vol,
      buys5m: buys,
      sells5m: sells,
      activityScore: Math.min(100, Math.round(score)),
      socials,
      fomoUrl: coin.fomoUrl || `https://fomo.family/coin?address=${coin.mint}&chainId=1399811149`,
    };
  } catch {
    return coin;
  }
}

export async function GET() {
  try {
    const data = await getLaunches();
    const raw = Array.isArray(data.launches) ? data.launches.slice(0, 20) : [];
    const launches = await Promise.all(raw.map(enrich));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      provider: data.provider || null,
      launches,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Scanner failed", launches: [] }, { status: 500 });
  }
}
