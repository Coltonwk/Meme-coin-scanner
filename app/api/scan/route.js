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
  const r = await fetch(`${feedEndpoint()}?sinceSeconds=3600`, {
    cache: "no-store",
    headers: FEED_TOKEN
      ? { Authorization: `Bearer ${FEED_TOKEN}` }
      : {}
  });

  if (!r.ok) {
    throw new Error(`Launch feed returned ${r.status}`);
  }

  return r.json();
}

async function dexPairs(mint) {
  const r = await fetch(
    `${DEX}/token-pairs/v1/solana/${encodeURIComponent(mint)}`,
    {
      cache: "no-store",
      headers: {
        "User-Agent": "meme-coin-classic-v14"
      }
    }
  );

  if (!r.ok) return [];

  const j = await r.json();

  return Array.isArray(j) ? j : [];
}

function getSocials(pair) {
  const out = {
    twitter: "",
    telegram: "",
    website: ""
  };

  for (const s of Array.isArray(pair?.info?.socials) ? pair.info.socials : []) {
    const type = String(s?.type || "").toLowerCase();
    const url = String(s?.url || "");

    if (!url) continue;

    if (type.includes("twitter") || type === "x") {
      out.twitter = url;
    }

    if (type.includes("telegram")) {
      out.telegram = url;
    }
  }

  const sites = Array.isArray(pair?.info?.websites)
    ? pair.info.websites
    : [];

  if (sites[0]?.url) {
    out.website = String(sites[0].url);
  }

  return out;
}

function ageMinutes(pair, launch) {
  const created = Number(pair?.pairCreatedAt || 0);

  if (created > 0) {
    const age = (Date.now() - created) / 60000;

    if (Number.isFinite(age) && age >= 0) {
      return age;
    }
  }

  const detected = Date.parse(launch?.detectedAt || "");

  if (Number.isFinite(detected)) {
    return Math.max(0, (Date.now() - detected) / 60000);
  }

  return null;
}

function scorePair(pair, age) {
  const liquidity = num(pair?.liquidity?.usd);

  const volume5m = num(pair?.volume?.m5);
  const volume1h = num(pair?.volume?.h1);

  const buys5m = num(pair?.txns?.m5?.buys);
  const sells5m = num(pair?.txns?.m5?.sells);

  const buys1h = num(pair?.txns?.h1?.buys);
  const sells1h = num(pair?.txns?.h1?.sells);

  const trades5m = buys5m + sells5m;
  const trades1h = buys1h + sells1h;

  const priceChange5m = num(pair?.priceChange?.m5);
  const priceChange1h = num(pair?.priceChange?.h1);

  const fdv = num(pair?.fdv);

  const buyRatio =
    (buys5m + 1) /
    (sells5m + 1);

  const volumeAcceleration =
    volume5m /
    Math.max(volume1h / 12, 1);

  const transactionAcceleration =
    trades5m /
    Math.max(trades1h / 12, 1);

  const fdvLiquidityRatio =
    liquidity > 0 && fdv > 0
      ? fdv / liquidity
      : null;

  let score = 0;

  // Freshness
  if (age !== null) {
    score +=
      age <= 2 ? 18 :
      age <= 5 ? 16 :
      age <= 10 ? 13 :
      age <= 20 ? 9 :
      age <= 45 ? 4 : 0;
  }

  // Liquidity
  score +=
    liquidity >= 50000 ? 18 :
    liquidity >= 25000 ? 15 :
    liquidity >= 10000 ? 11 :
    liquidity >= 5000 ? 7 :
    liquidity >= 1500 ? 3 : 0;

  // Recent trading
  score +=
    trades5m >= 40 ? 18 :
    trades5m >= 25 ? 15 :
    trades5m >= 12 ? 11 :
    trades5m >= 6 ? 6 : 0;

  // Buy pressure
  score += clamp((buyRatio - 1) * 12, 0, 16);

  // Acceleration
  score += clamp((volumeAcceleration - 1) * 8, 0, 14);
  score += clamp((transactionAcceleration - 1) * 8, 0, 14);

  // Price momentum
  if (priceChange5m > 0) {
    score += clamp(priceChange5m / 3, 0, 10);
  }

  if (priceChange1h > 0) {
    score += clamp(priceChange1h / 12, 0, 5);
  }

  // Mild penalties, not hard blocking
  const riskFlags = [];

  if (liquidity < 1500) {
    score -= 15;
    riskFlags.push("very low liquidity");
  }

  if (trades5m < 4) {
    score -= 10;
    riskFlags.push("very low activity");
  }

  if (buyRatio < 0.7) {
    score -= 15;
    riskFlags.push("heavy sell pressure");
  }

  if (priceChange5m <= -25) {
    score -= 18;
    riskFlags.push("sharp 5m drop");
  }

  if (
    fdvLiquidityRatio !== null &&
    fdvLiquidityRatio >= 75
  ) {
    score -= 12;
    riskFlags.push("high FDV/liquidity");
  }

  return {
    score: Math.round(clamp(score, 0, 100)),
    liquidity,
    volume5m,
    volume1h,
    buys5m,
    sells5m,
    trades5m,
    buyRatio,
    volumeAcceleration,
    transactionAcceleration,
    priceChange5m,
    priceChange1h,
    fdv,
    fdvLiquidityRatio,
    riskFlags
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
      score: 0,
      riskFlags: ["waiting for market data"],
      fomoUrl: "https://fomo.family/"
    };
  }

  const pair = [...pairs].sort(
    (a, b) =>
      num(b?.liquidity?.usd) -
      num(a?.liquidity?.usd)
  )[0];

  const age = ageMinutes(pair, launch);
  const market = scorePair(pair, age);
  const socials = getSocials(pair);

  return {
    ...launch,

    marketReady: true,

    symbol:
      pair?.baseToken?.symbol || "?",

    name:
      pair?.baseToken?.name || "Pump.fun token",

    pairAddress:
      pair?.pairAddress || "",

    dexUrl:
      pair?.url || "",

    ageMinutes: age,

    priceUsd:
      num(pair?.priceUsd),

    priceChange5m:
      market.priceChange5m,

    priceChange1h:
      market.priceChange1h,

    liquidity:
      market.liquidity,

    fdv:
      market.fdv,

    volume5m:
      market.volume5m,

    volume1h:
      market.volume1h,

    buys5m:
      market.buys5m,

    sells5m:
      market.sells5m,

    trades5m:
      market.trades5m,

    buyRatio:
      market.buyRatio,

    volumeAcceleration:
      market.volumeAcceleration,

    transactionAcceleration:
      market.transactionAcceleration,

    fdvLiquidityRatio:
      market.fdvLiquidityRatio,

    score:
      market.score,

    riskFlags:
      market.riskFlags,

    socials,

    fomoUrl:
      "https://fomo.family/"
  };
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
          recent
            .slice(i, i + 5)
            .map(enrich)
        )
      );
    }

    launches.sort(
      (a, b) =>
        Number(b.score || 0) -
        Number(a.score || 0)
    );

    return NextResponse.json({
      generatedAt:
        new Date().toISOString(),

      provider:
        data.provider || null,

      version:
        "14.0-classic",

      launches
    }, {
      headers: {
        "Cache-Control":
          "no-store, max-age=0"
      }
    });

  } catch (error) {
    return NextResponse.json({
      error:
        error?.message ||
        "Scanner failed",

      launches: []
    }, {
      status: 500
    });
  }
}
