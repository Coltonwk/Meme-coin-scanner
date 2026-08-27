import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RAW_FEED = process.env.LAUNCH_FEED_URL || "";
const FEED_TOKEN = process.env.LAUNCH_FEED_TOKEN || "";
const DEX = "https://api.dexscreener.com";

const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function feedEndpoint() {
  if (!RAW_FEED) throw new Error("LAUNCH_FEED_URL is not configured");

  const clean = RAW_FEED.replace(/\/$/, "");

  if (clean.endsWith("/launches")) return clean;
  if (clean.endsWith("/qualified")) {
    return clean.replace(/\/qualified$/, "/launches");
  }

  return `${clean}/launches`;
}

async function loadFeed() {
  const r = await fetch(
    `${feedEndpoint()}?sinceSeconds=3600`,
    {
      cache: "no-store",
      headers: FEED_TOKEN
        ? { Authorization: `Bearer ${FEED_TOKEN}` }
        : {}
    }
  );

  if (!r.ok) throw new Error(`Launch feed returned ${r.status}`);

  return r.json();
}

async function dexPairs(mint) {
  const r = await fetch(
    `${DEX}/token-pairs/v1/solana/${encodeURIComponent(mint)}`,
    {
      cache: "no-store",
      headers: {
        "User-Agent": "meme-coin-high-signal-v11"
      }
    }
  );

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

    if (
      !first ||
      ["i", "home", "search", "intent"].includes(first.toLowerCase())
    ) {
      return "";
    }

    return first.replace(/^@/, "");
  } catch {
    return "";
  }
}

function socialsFrom(pair) {
  const out = {
    twitter: "",
    telegram: "",
    website: ""
  };

  for (const social of Array.isArray(pair?.info?.socials) ? pair.info.socials : []) {
    const type = String(social?.type || "").toLowerCase();
    const url = String(social?.url || "");

    if (!url) continue;

    if (type.includes("twitter") || type === "x") out.twitter = url;
    if (type.includes("telegram")) out.telegram = url;
  }

  const websites = Array.isArray(pair?.info?.websites)
    ? pair.info.websites
    : [];

  if (websites[0]?.url) {
    out.website = String(websites[0].url);
  }

  return out;
}

function ageMinutes(pair, launch) {
  const pairCreated = Number(pair?.pairCreatedAt || 0);

  if (pairCreated > 0) {
    const age = (Date.now() - pairCreated) / 60000;
    if (Number.isFinite(age) && age >= 0) return age;
  }

  const detected = Date.parse(launch?.detectedAt || "");

  if (Number.isFinite(detected)) {
    return Math.max(0, (Date.now() - detected) / 60000);
  }

  return null;
}

function buildSearchPhrases(coin) {
  const phrases = [];
  const symbol = String(coin.symbol || "").replace(/[^A-Za-z0-9_]/g, "");
  const name = String(coin.name || "").replace(/\s+/g, " ").trim();
  const mint = String(coin.mint || "").trim();
  const handle = xHandleFromUrl(coin.socials?.twitter || "");

  if (symbol && symbol !== "?") {
    phrases.push(`$${symbol}`);
    phrases.push(symbol);
  }

  if (name && name.toLowerCase() !== "pump.fun token") {
    phrases.push(name);
  }

  if (mint) {
    phrases.push(mint);
    phrases.push(`CA ${mint}`);
    phrases.push(`contract ${mint}`);
  }

  if (handle) {
    phrases.push(`@${handle}`);
  }

  return [...new Set(phrases.filter(Boolean))].slice(0, 10);
}

function riskFlags(pair) {
  const flags = [];

  const liq = num(pair?.liquidity?.usd);
  const fdv = num(pair?.fdv);
  const p5 = num(pair?.priceChange?.m5);
  const buys = num(pair?.txns?.m5?.buys);
  const sells = num(pair?.txns?.m5?.sells);
  const trades = buys + sells;

  if (liq < 1500) flags.push("very low liquidity");
  else if (liq < 5000) flags.push("low liquidity");

  if (liq > 0 && fdv > 0) {
    const ratio = fdv / liq;

    if (ratio >= 100) flags.push("very high FDV/liquidity");
    else if (ratio >= 50) flags.push("high FDV/liquidity");
  }

  if (trades < 4) flags.push("little 5m activity");

  if (Math.abs(p5) >= 60) flags.push("extreme 5m move");

  return flags;
}

function scores(pair, age) {
  const liq = num(pair?.liquidity?.usd);
  const vol5 = num(pair?.volume?.m5);
  const vol1h = num(pair?.volume?.h1);

  const buys5 = num(pair?.txns?.m5?.buys);
  const sells5 = num(pair?.txns?.m5?.sells);
  const trades5 = buys5 + sells5;

  const buys1 = num(pair?.txns?.h1?.buys);
  const sells1 = num(pair?.txns?.h1?.sells);
  const trades1 = buys1 + sells1;

  const p5 = num(pair?.priceChange?.m5);
  const p1h = num(pair?.priceChange?.h1);

  const buyRatio = (buys5 + 1) / (sells5 + 1);
  const volAccel = vol5 / Math.max(vol1h / 12, 1);
  const txAccel = trades5 / Math.max(trades1 / 12, 1);

  let early = 0;

  if (age !== null) {
    early += age <= 2 ? 24 :
      age <= 5 ? 21 :
      age <= 10 ? 17 :
      age <= 20 ? 11 :
      age <= 45 ? 5 : 0;
  }

  early += liq >= 50000 ? 18 :
    liq >= 25000 ? 15 :
    liq >= 10000 ? 11 :
    liq >= 5000 ? 7 :
    liq >= 1500 ? 3 : 0;

  early += trades5 >= 30 ? 18 :
    trades5 >= 15 ? 14 :
    trades5 >= 8 ? 10 :
    trades5 >= 4 ? 5 : 0;

  early += clamp((buyRatio - 1) * 12, 0, 18);
  early += clamp((volAccel - 1) * 8, 0, 14);
  early += clamp((txAccel - 1) * 8, 0, 14);

  if (p5 >= 60) early -= 20;
  else if (p5 >= 35) early -= 10;

  let trending = 0;

  trending += liq >= 100000 ? 20 :
    liq >= 50000 ? 16 :
    liq >= 25000 ? 12 :
    liq >= 10000 ? 7 :
    liq >= 5000 ? 4 : 0;

  trending += trades5 >= 60 ? 20 :
    trades5 >= 30 ? 16 :
    trades5 >= 15 ? 12 :
    trades5 >= 8 ? 7 : 0;

  trending += clamp((volAccel - 1) * 9, 0, 18);
  trending += clamp((txAccel - 1) * 9, 0, 18);
  trending += clamp((buyRatio - 1) * 10, 0, 16);

  if (p5 > 0) trending += clamp(p5 / 3, 0, 10);
  if (p1h > 0) trending += clamp(p1h / 10, 0, 8);

  return {
    earlyScore: Math.round(clamp(early, 0, 100)),
    trendingScore: Math.round(clamp(trending, 0, 100)),
    buyRatio,
    volAccel,
    txAccel
  };
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
      highSignal: false,
      trendingCandidate: false,
      riskFlags: ["no DEX market data yet"],
      searchHints: {
        twitterHandle: "",
        phrases: [mint, `CA ${mint}`]
      },
      fomoUrl:
        launch?.fomoUrl ||
        `https://fomo.family/coin?address=${mint}&chainId=1399811149`
    };
  }

  const pair = [...pairs].sort(
    (a, b) =>
      num(b?.liquidity?.usd) -
      num(a?.liquidity?.usd)
  )[0];

  const socials = socialsFrom(pair);
  const age = ageMinutes(pair, launch);

  const s = scores(pair, age);

  const liq = num(pair?.liquidity?.usd);
  const vol5 = num(pair?.volume?.m5);
  const buys = num(pair?.txns?.m5?.buys);
  const sells = num(pair?.txns?.m5?.sells);
  const trades = buys + sells;

  const flags = riskFlags(pair);

  const highSignal =
    liq >= 5000 &&
    vol5 >= 500 &&
    trades >= 6 &&
    s.buyRatio >= 1.10 &&
    s.earlyScore >= 45 &&
    flags.length <= 1;

  const trendingCandidate =
    liq >= 10000 &&
    trades >= 10 &&
    s.trendingScore >= 55 &&
    flags.length <= 1;

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
    priceChange5m: num(pair?.priceChange?.m5),
    priceChange1h: num(pair?.priceChange?.h1),

    liquidity: liq,
    volume5m: vol5,
    volume1h: num(pair?.volume?.h1),

    buys5m: buys,
    sells5m: sells,
    buys1h: num(pair?.txns?.h1?.buys),
    sells1h: num(pair?.txns?.h1?.sells),

    ageMinutes: age,

    earlyScore: s.earlyScore,
    trendingScore: s.trendingScore,

    buyRatio: s.buyRatio,
    volumeAcceleration: s.volAccel,
    transactionAcceleration: s.txAccel,

    highSignal,
    trendingCandidate,

    riskFlags: flags,
    socials,

    fomoUrl:
      launch?.fomoUrl ||
      `https://fomo.family/coin?address=${mint}&chainId=1399811149`
  };

  enriched.searchHints = {
    twitterHandle: xHandleFromUrl(socials.twitter),
    phrases: buildSearchPhrases(enriched)
  };

  return enriched;
}

export async function GET() {
  try {
    const data = await loadFeed();

    const recent = Array.isArray(data.launches)
      ? data.launches.slice(0, 30)
      : [];

    const launches = [];

    for (let i = 0; i < recent.length; i += 5) {
      launches.push(
        ...await Promise.all(
          recent.slice(i, i + 5).map(enrich)
        )
      );
    }

    launches.sort((a, b) =>
      Number(b.earlyScore || 0) -
      Number(a.earlyScore || 0)
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      provider: data.provider || null,
      version: "11.0-high-signal",
      launches
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    });

  } catch (error) {
    return NextResponse.json({
      error: error?.message || "Scanner failed",
      launches: []
    }, { status: 500 });
  }
}
