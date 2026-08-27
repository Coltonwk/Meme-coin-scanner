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
  if (clean.endsWith("/qualified")) return clean.replace(/\/qualified$/, "/launches");
  return `${clean}/launches`;
}

async function loadFeed() {
  const r = await fetch(`${feedEndpoint()}?sinceSeconds=3600`, {
    cache: "no-store",
    headers: FEED_TOKEN ? { Authorization: `Bearer ${FEED_TOKEN}` } : {}
  });
  if (!r.ok) throw new Error(`Launch feed returned ${r.status}`);
  return r.json();
}

async function dexPairs(mint) {
  const r = await fetch(`${DEX}/token-pairs/v1/solana/${encodeURIComponent(mint)}`, {
    cache: "no-store",
    headers: { "User-Agent": "meme-coin-exact-social-v13" }
  });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function xHandle(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return "";
    const first = u.pathname.split("/").filter(Boolean)[0] || "";
    if (!first || ["i","home","search","intent"].includes(first.toLowerCase())) return "";
    return first.replace(/^@/, "");
  } catch { return ""; }
}

function socials(pair) {
  const out = { twitter: "", telegram: "", website: "" };
  for (const s of Array.isArray(pair?.info?.socials) ? pair.info.socials : []) {
    const type = String(s?.type || "").toLowerCase();
    const url = String(s?.url || "");
    if (!url) continue;
    if (type.includes("twitter") || type === "x") out.twitter = url;
    if (type.includes("telegram")) out.telegram = url;
  }
  const sites = Array.isArray(pair?.info?.websites) ? pair.info.websites : [];
  if (sites[0]?.url) out.website = String(sites[0].url);
  return out;
}

function evaluate(pair) {
  const liquidity = num(pair?.liquidity?.usd);
  const volume5m = num(pair?.volume?.m5);
  const volume1h = num(pair?.volume?.h1);
  const buys5m = num(pair?.txns?.m5?.buys);
  const sells5m = num(pair?.txns?.m5?.sells);
  const trades5m = buys5m + sells5m;
  const buys1h = num(pair?.txns?.h1?.buys);
  const sells1h = num(pair?.txns?.h1?.sells);
  const trades1h = buys1h + sells1h;
  const p5 = num(pair?.priceChange?.m5);
  const p1h = num(pair?.priceChange?.h1);
  const fdv = num(pair?.fdv);
  const buyRatio = (buys5m + 1) / (sells5m + 1);
  const volAccel = volume5m / Math.max(volume1h / 12, 1);
  const txAccel = trades5m / Math.max(trades1h / 12, 1);
  const fdvLiq = liquidity > 0 && fdv > 0 ? fdv / liquidity : null;

  const flags = [];
  let risk = 0;
  if (liquidity < 10000) { risk += 35; flags.push("low liquidity"); }
  if (volume5m < 1500) { risk += 20; flags.push("weak 5m volume"); }
  if (trades5m < 12) { risk += 20; flags.push("too few 5m trades"); }
  if (buyRatio < 0.9) { risk += 18; flags.push("sell pressure"); }
  if (p5 <= -18) { risk += 28; flags.push("sharp 5m drop"); }
  if (p1h <= -40) { risk += 20; flags.push("weak 1h trend"); }
  if (fdvLiq !== null && fdvLiq >= 60) { risk += 20; flags.push("high FDV/liquidity"); }

  let move = 0;
  move += liquidity >= 50000 ? 20 : liquidity >= 25000 ? 16 : liquidity >= 15000 ? 12 : liquidity >= 10000 ? 8 : 0;
  move += volume5m >= 20000 ? 18 : volume5m >= 10000 ? 15 : volume5m >= 5000 ? 11 : volume5m >= 1500 ? 6 : 0;
  move += trades5m >= 60 ? 18 : trades5m >= 35 ? 15 : trades5m >= 20 ? 11 : trades5m >= 12 ? 7 : 0;
  move += clamp((buyRatio - 1) * 12, 0, 18);
  move += clamp((volAccel - 1) * 8, 0, 14);
  move += clamp((txAccel - 1) * 8, 0, 14);
  if (p5 > 0) move += clamp(p5 / 4, 0, 8);
  if (p1h > 0) move += clamp(p1h / 12, 0, 6);
  move -= risk * 0.35;

  return {
    liquidity, volume5m, volume1h, buys5m, sells5m, trades5m, p5, p1h, fdv,
    buyRatio, volumeAcceleration: volAccel, transactionAcceleration: txAccel,
    fdvLiquidityRatio: fdvLiq, riskScore: Math.round(clamp(risk,0,100)),
    riskFlags: flags, movementScore: Math.round(clamp(move,0,100))
  };
}

async function enrich(launch) {
  const mint = String(launch?.mint || "").trim();
  if (!mint) return launch;

  const pairs = await dexPairs(mint).catch(() => []);
  if (!pairs.length) return {
    ...launch, marketReady:false, exactSocials:false, riskScreenPassed:false,
    moving:false, movementScore:0, riskScore:100,
    riskFlags:["no DEX market data yet"], fomoUrl:"https://fomo.family/"
  };

  const pair = [...pairs].sort((a,b)=>num(b?.liquidity?.usd)-num(a?.liquidity?.usd))[0];
  const social = socials(pair);
  const m = evaluate(pair);
  const exactSocials = Boolean(social.twitter) && Boolean(social.telegram);
  const riskScreenPassed =
    m.riskScore <= 30 &&
    m.liquidity >= 10000 &&
    m.volume5m >= 1500 &&
    m.trades5m >= 12 &&
    m.buyRatio >= 0.95 &&
    m.p5 > -18;
  const moving = riskScreenPassed && m.movementScore >= 55;

  return {
    ...launch,
    marketReady:true,
    symbol:pair?.baseToken?.symbol || "?",
    name:pair?.baseToken?.name || "Pump.fun token",
    pairAddress:pair?.pairAddress || "",
    dexUrl:pair?.url || "",
    priceUsd:num(pair?.priceUsd),
    priceChange5m:m.p5,
    priceChange1h:m.p1h,
    liquidity:m.liquidity,
    fdv:m.fdv,
    volume5m:m.volume5m,
    volume1h:m.volume1h,
    buys5m:m.buys5m,
    sells5m:m.sells5m,
    trades5m:m.trades5m,
    buyRatio:m.buyRatio,
    volumeAcceleration:m.volumeAcceleration,
    transactionAcceleration:m.transactionAcceleration,
    fdvLiquidityRatio:m.fdvLiquidityRatio,
    riskScore:m.riskScore,
    riskFlags:m.riskFlags,
    movementScore:m.movementScore,
    exactSocials,
    riskScreenPassed,
    moving,
    socials:social,
    searchHints:{ twitterHandle:xHandle(social.twitter) },
    fomoUrl:"https://fomo.family/"
  };
}

export async function GET() {
  try {
    const data = await loadFeed();
    const recent = Array.isArray(data.launches) ? data.launches.slice(0,30) : [];
    const launches = [];
    for (let i=0;i<recent.length;i+=5) {
      launches.push(...await Promise.all(recent.slice(i,i+5).map(enrich)));
    }
    launches.sort((a,b)=>Number(b.movementScore||0)-Number(a.movementScore||0));
    return NextResponse.json({
      generatedAt:new Date().toISOString(),
      provider:data.provider || null,
      version:"13.0-exact-social-moving",
      launches
    }, { headers:{ "Cache-Control":"no-store, max-age=0" }});
  } catch (error) {
    return NextResponse.json({ error:error?.message || "Scanner failed", launches:[] }, { status:500 });
  }
}
