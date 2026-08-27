import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RAW_FEED = process.env.LAUNCH_FEED_URL || "";
const FEED_TOKEN = process.env.LAUNCH_FEED_TOKEN || "";
const DEX = "https://api.dexscreener.com";

const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;

function feedEndpoint() {
  if (!RAW_FEED) throw new Error("LAUNCH_FEED_URL is not configured");
  const clean = RAW_FEED.replace(/\/$/, "");
  if (clean.endsWith("/launches")) return clean;
  if (clean.endsWith("/qualified")) return clean.replace(/\/qualified$/, "/launches");
  return `${clean}/launches`;
}

async function loadFeed() {
  const r = await fetch(`${feedEndpoint()}?sinceSeconds=1800`, {
    cache: "no-store",
    headers: FEED_TOKEN ? { Authorization: `Bearer ${FEED_TOKEN}` } : {}
  });

  if (!r.ok) throw new Error(`Launch feed returned ${r.status}`);
  return r.json();
}

async function dexPairs(mint) {
  const r = await fetch(`${DEX}/token-pairs/v1/solana/${encodeURIComponent(mint)}`, {
    cache: "no-store",
    headers: { "User-Agent": "meme-coin-social-pulse-v9" }
  });

  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function xHandleFromUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return "";
    const first = u.pathname.split("/").filter(Boolean)[0] || "";
    if (!first || ["i","home","search","intent"].includes(first.toLowerCase())) return "";
    return first.replace(/^@/, "");
  } catch {
    return "";
  }
}

function socialsFrom(pair) {
  const out = { twitter: "", telegram: "", website: "" };

  for (const social of Array.isArray(pair?.info?.socials) ? pair.info.socials : []) {
    const type = String(social?.type || "").toLowerCase();
    const url = String(social?.url || "");
    if (!url) continue;
    if (type.includes("twitter") || type === "x") out.twitter = url;
    if (type.includes("telegram")) out.telegram = url;
  }

  const websites = Array.isArray(pair?.info?.websites) ? pair.info.websites : [];
  if (websites[0]?.url) out.website = String(websites[0].url);

  return out;
}

function searchPhrases(coin) {
  const phrases = [];
  const symbol = String(coin.symbol || "").replace(/[^A-Za-z0-9_]/g, "");
  const name = String(coin.name || "").replace(/\s+/g, " ").trim();
  const mint = String(coin.mint || "").trim();
  const handle = xHandleFromUrl(coin.socials?.twitter || "");

  if (symbol && symbol !== "?") {
    phrases.push(`$${symbol}`);
    phrases.push(symbol);
  }
  if (name && name.toLowerCase() !== "new pump.fun launch") phrases.push(name);
  if (mint) {
    phrases.push(mint);
    phrases.push(`CA ${mint}`);
  }
  if (handle) phrases.push(`@${handle}`);

  return [...new Set(phrases.filter(Boolean))].slice(0, 8);
}

function activityScore(pair) {
  const liq = num(pair?.liquidity?.usd);
  const vol = num(pair?.volume?.m5);
  const buys = num(pair?.txns?.m5?.buys);
  const sells = num(pair?.txns?.m5?.sells);
  const trades = buys + sells;
  const ratio = (buys + 1) / (sells + 1);

  let score = 0;
  score += liq >= 25000 ? 30 : liq >= 10000 ? 24 : liq >= 3000 ? 15 : liq >= 1000 ? 7 : 0;
  score += trades >= 25 ? 30 : trades >= 10 ? 22 : trades >= 4 ? 12 : trades >= 2 ? 5 : 0;
  score += vol >= 10000 ? 20 : vol >= 3000 ? 14 : vol >= 500 ? 7 : 0;
  score += ratio >= 2 ? 20 : ratio >= 1.4 ? 14 : ratio >= 1.05 ? 6 : 0;

  return Math.min(100, Math.round(score));
}

async function enrich(launch) {
  const mint = String(launch?.mint || "").trim();
  if (!mint) return launch;

  const pairs = await dexPairs(mint).catch(() => []);

  if (!pairs.length) {
    return {
      ...launch,
      marketReady: false,
      status: "waiting",
      searchHints: {
        twitterHandle: "",
        phrases: [mint, `CA ${mint}`]
      }
    };
  }

  const pair = [...pairs].sort(
    (a, b) => num(b?.liquidity?.usd) - num(a?.liquidity?.usd)
  )[0];

  const socials = socialsFrom(pair);

  const enriched = {
    ...launch,
    marketReady: true,
    status: "market-ready",
    pairAddress: pair?.pairAddress || "",
    dexUrl: pair?.url || "",
    symbol: pair?.baseToken?.symbol || "?",
    name: pair?.baseToken?.name || "Pump.fun token",
    imageUrl: pair?.info?.imageUrl || "",
    priceUsd: num(pair?.priceUsd),
    liquidity: num(pair?.liquidity?.usd),
    volume5m: num(pair?.volume?.m5),
    buys5m: num(pair?.txns?.m5?.buys),
    sells5m: num(pair?.txns?.m5?.sells),
    priceChange5m: num(pair?.priceChange?.m5),
    activityScore: activityScore(pair),
    socials
  };

  enriched.searchHints = {
    twitterHandle: xHandleFromUrl(socials.twitter),
    phrases: searchPhrases(enriched)
  };

  enriched.fomoUrl = launch?.fomoUrl || `https://fomo.family/coin?address=${mint}&chainId=1399811149`;

  return enriched;
}

export async function GET() {
  try {
    const data = await loadFeed();
    const recent = Array.isArray(data.launches) ? data.launches.slice(0, 20) : [];
    const launches = [];

    for (let i = 0; i < recent.length; i += 4) {
      launches.push(...await Promise.all(recent.slice(i, i + 4).map(enrich)));
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      provider: data.provider || null,
      version: "9.0-low-cost-x",
      launches
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    return NextResponse.json({
      error: error?.message || "Scanner failed",
      launches: []
    }, { status: 500 });
  }
}
