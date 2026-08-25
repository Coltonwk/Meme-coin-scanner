import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEX = "https://api.dexscreener.com";
const BIRDEYE = "https://public-api.birdeye.so";

const n = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

async function dexGet(path) {
  const r = await fetch(DEX + path, { cache: "no-store" });
  if (!r.ok) throw new Error(`DEX request failed (${r.status})`);
  return r.json();
}

async function birdeyeFresh(chain) {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return [];

  const params = new URLSearchParams({ limit: "20" });
  if (chain === "solana") params.set("meme_platform_enabled", "true");

  const r = await fetch(
    `${BIRDEYE}/defi/v2/tokens/new_listing?${params}`,
    {
      cache: "no-store",
      headers: {
        "X-API-KEY": key,
        "x-chain": chain,
      },
    }
  );

  if (!r.ok) return [];

  const j = await r.json();
  const items =
    [j?.data?.items, j?.data?.tokens, j?.data?.list, j?.data]
      .find(Array.isArray) || [];

  return items.map(x => ({
    address: x?.address || x?.tokenAddress || x?.token_address || x?.mint || "",
    source: "Birdeye new listing",
  })).filter(x => x.address);
}

async function dexFallback(chain) {
  const [profiles, boosts] = await Promise.all([
    dexGet("/token-profiles/latest/v1").catch(() => []),
    dexGet("/token-boosts/latest/v1").catch(() => []),
  ]);

  const seen = new Set();
  const out = [];

  for (const x of [...profiles, ...boosts]) {
    if ((x?.chainId || "").toLowerCase() !== chain) continue;
    if (!x?.tokenAddress || seen.has(x.tokenAddress)) continue;
    seen.add(x.tokenAddress);
    out.push({ address: x.tokenAddress, source: "DEX fallback" });
    if (out.length >= 20) break;
  }
  return out;
}

async function discover(chain) {
  const [fresh, fallback] = await Promise.all([
    birdeyeFresh(chain),
    dexFallback(chain),
  ]);

  const seen = new Set();
  const out = [];

  for (const x of [...fresh, ...fallback]) {
    if (!x.address || seen.has(x.address)) continue;
    seen.add(x.address);
    out.push(x);
    if (out.length >= 24) break;
  }
  return out;
}

function ageMinutes(pair) {
  if (!pair?.pairCreatedAt) return null;
  const age = (Date.now() - Number(pair.pairCreatedAt)) / 60000;
  return Number.isFinite(age) && age >= 0 ? age : null;
}

async function bestPair(chain, address) {
  const pairs = await dexGet(`/token-pairs/v1/${chain}/${address}`);
  if (!Array.isArray(pairs) || !pairs.length) return null;
  return [...pairs].sort(
    (a,b) => n(b?.liquidity?.usd) - n(a?.liquidity?.usd)
  )[0];
}

function score(pair) {
  const age = ageMinutes(pair);
  const liq = n(pair?.liquidity?.usd);
  const fdv = n(pair?.fdv);
  const vol5 = n(pair?.volume?.m5);
  const vol1h = n(pair?.volume?.h1);
  const p5 = n(pair?.priceChange?.m5);

  const b5 = n(pair?.txns?.m5?.buys);
  const s5 = n(pair?.txns?.m5?.sells);
  const t5 = b5 + s5;

  const b1h = n(pair?.txns?.h1?.buys);
  const s1h = n(pair?.txns?.h1?.sells);
  const t1h = b1h + s1h;

  let risk = 0;
  const riskFlags = [];

  if (liq < 10000) { risk += 35; riskFlags.push("very low liquidity"); }
  else if (liq < 25000) { risk += 20; riskFlags.push("low liquidity"); }

  if (liq > 0 && fdv > 0) {
    const m = fdv / liq;
    if (m >= 100) { risk += 25; riskFlags.push("very high FDV/liquidity"); }
    else if (m >= 40) { risk += 12; riskFlags.push("high FDV/liquidity"); }
  }

  if (t5 < 5) { risk += 15; riskFlags.push("little 5m activity"); }
  if (Math.abs(p5) >= 50) { risk += 20; riskFlags.push("extreme 5m move"); }

  let early = 0;
  const signals = [];

  if (age !== null) {
    if (age <= 2) { early += 30; signals.push("â¤2m old"); }
    else if (age <= 5) { early += 27; signals.push("â¤5m old"); }
    else if (age <= 10) { early += 22; signals.push("â¤10m old"); }
    else if (age <= 20) early += 15;
    else if (age <= 45) early += 7;
  }

  const ratio = (b5 + 1) / (s5 + 1);
  if (t5 >= 4) {
    early += clamp(((ratio - 1) / 2) * 22, 0, 22);
    if (ratio >= 1.5) signals.push(`buy/sell ${ratio.toFixed(2)}`);
  }

  const txAccel = t5 / Math.max(t1h / 12, 1);
  early += clamp(((txAccel - 1) / 4) * 18, 0, 18);
  if (txAccel >= 1.5) signals.push(`tx ${txAccel.toFixed(1)}x pace`);

  const volAccel = vol5 / Math.max(vol1h / 12, 1);
  early += clamp(((volAccel - 1) / 4) * 18, 0, 18);
  if (volAccel >= 1.5) signals.push(`vol ${volAccel.toFixed(1)}x pace`);

  if (liq >= 100000) early += 12;
  else if (liq >= 50000) early += 10;
  else if (liq >= 25000) early += 7;
  else if (liq >= 10000) early += 3;

  let latePenalty = 0;
  if (p5 >= 50) latePenalty = 30;
  else if (p5 >= 30) latePenalty = 20;
  else if (p5 >= 15) latePenalty = 8;

  return {
    earlyScore: Math.round(clamp(early - latePenalty - risk * 0.10, 0, 100)),
    risk: Math.min(100, risk),
    riskFlags,
    signals,
    ageMinutes: age,
  };
}

export async function GET(request) {
  try {
    const chain =
      (new URL(request.url).searchParams.get("chain") || "solana").toLowerCase();

    if (!["solana", "base"].includes(chain)) {
      return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });
    }

    const candidates = await discover(chain);

    const rows = await Promise.all(candidates.map(async c => {
      try {
        const pair = await bestPair(chain, c.address);
        if (!pair) return null;

        const s = score(pair);

        return {
          chain: pair?.chainId || chain,
          tokenAddress: c.address,
          pairAddress: pair?.pairAddress || "",
          name: pair?.baseToken?.name || "Unknown",
          symbol: pair?.baseToken?.symbol || "?",
          url: pair?.url || "",
          priceUsd: n(pair?.priceUsd),
          priceChange5m: n(pair?.priceChange?.m5),
          volume5m: n(pair?.volume?.m5),
          liquidity: n(pair?.liquidity?.usd),
          buys: n(pair?.txns?.m5?.buys),
          sells: n(pair?.txns?.m5?.sells),
          discoverySource: c.source,
          ...s,
        };
      } catch {
        return null;
      }
    }));

    const tokens = rows.filter(Boolean)
      .sort((a,b) => b.earlyScore - a.earlyScore);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      chain,
      birdeyeEnabled: Boolean(process.env.BIRDEYE_API_KEY),
      tokens,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Fresh-launch scanner failed" },
      { status: 500 }
    );
  }
}
