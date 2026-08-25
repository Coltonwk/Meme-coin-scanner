import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEX = "https://api.dexscreener.com";
const BIRDEYE = "https://public-api.birdeye.so";
const X_API = "https://api.x.com/2/tweets/search/recent";

const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

async function dexGet(path) {
  const r = await fetch(DEX + path, {
    cache: "no-store",
    headers: { "User-Agent": "meme-coin-research-scanner/4.0" },
  });
  if (!r.ok) throw new Error(`DEX request failed (${r.status})`);
  return r.json();
}

async function birdeyeFresh(chain) {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return [];

  const params = new URLSearchParams({ limit: "20" });
  if (chain === "solana") params.set("meme_platform_enabled", "true");

  const r = await fetch(
    `${BIRDEYE}/defi/v2/tokens/new_listing?${params.toString()}`,
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
  const items = [
    j?.data?.items,
    j?.data?.tokens,
    j?.data?.list,
    j?.data,
  ].find(Array.isArray) || [];

  return items
    .map((x) => ({
      address:
        x?.address ||
        x?.tokenAddress ||
        x?.token_address ||
        x?.mint ||
        "",
      source: "Birdeye new listing",
    }))
    .filter((x) => x.address);
}

async function dexFresh(chain) {
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
    out.push({ address: x.tokenAddress, source: "DEX fresh fallback" });
    if (out.length >= 24) break;
  }

  return out;
}

async function dexMomentum(chain) {
  const [profiles, boosts, topBoosts] = await Promise.all([
    dexGet("/token-profiles/latest/v1").catch(() => []),
    dexGet("/token-boosts/latest/v1").catch(() => []),
    dexGet("/token-boosts/top/v1").catch(() => []),
  ]);

  const seen = new Set();
  const out = [];

  for (const x of [...topBoosts, ...boosts, ...profiles]) {
    if ((x?.chainId || "").toLowerCase() !== chain) continue;
    if (!x?.tokenAddress || seen.has(x.tokenAddress)) continue;
    seen.add(x.tokenAddress);
    out.push({ address: x.tokenAddress, source: "DEX momentum" });
    if (out.length >= 24) break;
  }

  return out;
}

async function discover(chain, mode) {
  if (mode === "fresh") {
    const [birdeye, fallback] = await Promise.all([
      birdeyeFresh(chain),
      dexFresh(chain),
    ]);

    const seen = new Set();
    const out = [];

    for (const x of [...birdeye, ...fallback]) {
      if (!x.address || seen.has(x.address)) continue;
      seen.add(x.address);
      out.push(x);
      if (out.length >= 24) break;
    }
    return out;
  }

  return dexMomentum(chain);
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
    (a, b) => num(b?.liquidity?.usd) - num(a?.liquidity?.usd)
  )[0];
}

function riskScore(pair) {
  const liq = num(pair?.liquidity?.usd);
  const fdv = num(pair?.fdv);
  const p5 = num(pair?.priceChange?.m5);
  const b5 = num(pair?.txns?.m5?.buys);
  const s5 = num(pair?.txns?.m5?.sells);
  const trades = b5 + s5;

  let risk = 0;
  const flags = [];

  if (liq < 10000) {
    risk += 35;
    flags.push("very low liquidity");
  } else if (liq < 25000) {
    risk += 20;
    flags.push("low liquidity");
  }

  if (liq > 0 && fdv > 0) {
    const multiple = fdv / liq;
    if (multiple >= 100) {
      risk += 25;
      flags.push("very high FDV/liquidity");
    } else if (multiple >= 40) {
      risk += 12;
      flags.push("high FDV/liquidity");
    }
  }

  if (trades < 5) {
    risk += 15;
    flags.push("little 5m activity");
  }

  if (Math.abs(p5) >= 50) {
    risk += 20;
    flags.push("extreme 5m move");
  }

  return { risk: Math.min(100, risk), flags };
}

function scoreFresh(pair) {
  const age = ageMinutes(pair);
  const liq = num(pair?.liquidity?.usd);
  const vol5 = num(pair?.volume?.m5);
  const vol1h = num(pair?.volume?.h1);
  const p5 = num(pair?.priceChange?.m5);

  const b5 = num(pair?.txns?.m5?.buys);
  const s5 = num(pair?.txns?.m5?.sells);
  const t5 = b5 + s5;

  const b1 = num(pair?.txns?.h1?.buys);
  const s1 = num(pair?.txns?.h1?.sells);
  const t1 = b1 + s1;

  const r = riskScore(pair);
  let score = 0;
  const signals = [];

  if (age !== null) {
    if (age <= 2) {
      score += 30;
      signals.push("â¤2m old");
    } else if (age <= 5) {
      score += 27;
      signals.push("â¤5m old");
    } else if (age <= 10) {
      score += 22;
      signals.push("â¤10m old");
    } else if (age <= 20) {
      score += 15;
    } else if (age <= 45) {
      score += 7;
    }
  }

  const ratio = (b5 + 1) / (s5 + 1);
  if (t5 >= 4) {
    score += clamp(((ratio - 1) / 2) * 22, 0, 22);
    if (ratio >= 1.5) signals.push(`buy/sell ${ratio.toFixed(2)}`);
  }

  const txAccel = t5 / Math.max(t1 / 12, 1);
  score += clamp(((txAccel - 1) / 4) * 18, 0, 18);
  if (txAccel >= 1.5) signals.push(`tx ${txAccel.toFixed(1)}x pace`);

  const volAccel = vol5 / Math.max(vol1h / 12, 1);
  score += clamp(((volAccel - 1) / 4) * 18, 0, 18);
  if (volAccel >= 1.5) signals.push(`vol ${volAccel.toFixed(1)}x pace`);

  if (liq >= 100000) score += 12;
  else if (liq >= 50000) score += 10;
  else if (liq >= 25000) score += 7;
  else if (liq >= 10000) score += 3;

  let latePenalty = 0;
  if (p5 >= 50) latePenalty = 30;
  else if (p5 >= 30) latePenalty = 20;
  else if (p5 >= 15) latePenalty = 8;

  if (latePenalty) signals.push("already moving fast");

  return {
    score: Math.round(clamp(score - latePenalty - r.risk * 0.10, 0, 100)),
    risk: r.risk,
    flags: r.flags,
    signals,
    age,
  };
}

function scoreMomentum(pair) {
  const liq = num(pair?.liquidity?.usd);
  const vol5 = num(pair?.volume?.m5);
  const vol1h = num(pair?.volume?.h1);
  const p5 = num(pair?.priceChange?.m5);
  const b5 = num(pair?.txns?.m5?.buys);
  const s5 = num(pair?.txns?.m5?.sells);
  const trades = b5 + s5;

  const r = riskScore(pair);
  let score = 0;
  const signals = [];

  if (p5 > 0) score += clamp((p5 / 20) * 25, 0, 25);

  const volAccel = vol5 / Math.max(vol1h / 12, 1);
  score += clamp(((volAccel - 1) / 4) * 25, 0, 25);
  if (volAccel >= 1.5) signals.push(`vol ${volAccel.toFixed(1)}x pace`);

  const ratio = (b5 + 1) / (s5 + 1);
  if (trades >= 5) {
    score += clamp(((ratio - 1) / 2) * 20, 0, 20);
    if (ratio >= 1.5) signals.push(`buy/sell ${ratio.toFixed(2)}`);
  }

  if (liq >= 250000) score += 15;
  else if (liq >= 100000) score += 11;
  else if (liq >= 50000) score += 7;
  else if (liq >= 20000) score += 3;

  score += clamp((trades / 80) * 15, 0, 15);

  return {
    score: Math.round(clamp(score - r.risk * 0.18, 0, 100)),
    risk: r.risk,
    flags: r.flags,
    signals,
    age: ageMinutes(pair),
  };
}

function serialize(pair, candidate, mode) {
  const s = mode === "fresh" ? scoreFresh(pair) : scoreMomentum(pair);
  const socials = Array.isArray(pair?.info?.socials) ? pair.info.socials : [];

  return {
    chain: pair?.chainId || "solana",
    tokenAddress: candidate.address,
    pairAddress: pair?.pairAddress || "",
    name: pair?.baseToken?.name || "Unknown",
    symbol: pair?.baseToken?.symbol || "?",
    url: pair?.url || "",
    priceUsd: num(pair?.priceUsd),
    priceChange5m: num(pair?.priceChange?.m5),
    priceChange1h: num(pair?.priceChange?.h1),
    volume5m: num(pair?.volume?.m5),
    volume1h: num(pair?.volume?.h1),
    liquidity: num(pair?.liquidity?.usd),
    buys: num(pair?.txns?.m5?.buys),
    sells: num(pair?.txns?.m5?.sells),
    ageMinutes: s.age,
    score: s.score,
    momentum: s.score,
    risk: s.risk,
    signals: s.signals,
    riskFlags: s.flags,
    discoverySource: candidate.source,
    socials: socials.map(x => ({
      type: String(x?.type || ""),
      url: String(x?.url || ""),
    })).filter(x => x.url),
  };
}

function safeWords(text, maxWords = 20) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

function buildXQuery(symbols, addresses) {
  const terms = [];

  for (const sym of symbols.slice(0, 5)) {
    const clean = String(sym || "").replace(/[^A-Za-z0-9_]/g, "");
    if (clean.length >= 2) {
      terms.push(`"$${clean}"`);
    }
  }

  for (const addr of addresses.slice(0, 3)) {
    const clean = String(addr || "").trim();
    if (clean.length >= 12) {
      terms.push(`"${clean}"`);
    }
  }

  if (!terms.length) return "";
  return `(${terms.join(" OR ")}) -is:retweet lang:en`;
}

async function searchX(symbols, addresses) {
  const token = process.env.X_BEARER_TOKEN;

  if (!token) {
    return {
      enabled: false,
      posts: [],
      message: "Add X_BEARER_TOKEN in Vercel to enable live X posts.",
    };
  }

  const query = buildXQuery(symbols, addresses);

  if (!query) {
    return { enabled: true, posts: [], message: "No search terms." };
  }

  const params = new URLSearchParams({
    query,
    max_results: "25",
    "tweet.fields": "created_at,public_metrics,author_id",
    expansions: "author_id",
    "user.fields": "username,name,public_metrics,verified",
  });

  const r = await fetch(`${X_API}?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!r.ok) {
    return {
      enabled: true,
      posts: [],
      message: `X API returned ${r.status}. Check your X developer access or usage.`,
    };
  }

  const j = await r.json();
  const users = new Map(
    (j?.includes?.users || []).map(u => [u.id, u])
  );

  const posts = (j?.data || []).map(t => {
    const u = users.get(t.author_id) || {};
    const metrics = t?.public_metrics || {};

    return {
      id: t.id,
      excerpt: safeWords(t.text, 20),
      createdAt: t.created_at || null,
      username: u.username || "",
      displayName: u.name || "",
      followers: num(u?.public_metrics?.followers_count),
      likes: num(metrics.like_count),
      reposts: num(metrics.retweet_count),
      replies: num(metrics.reply_count),
      url: `https://x.com/i/web/status/${t.id}`,
    };
  });

  return {
    enabled: true,
    posts,
    message: posts.length ? "" : "No matching recent X posts found.",
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "scan";

    if (action === "social") {
      const symbols = (url.searchParams.get("symbols") || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);

      const addresses = (url.searchParams.get("addresses") || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);

      const x = await searchX(symbols, addresses);

      return NextResponse.json({
        x,
        instagram: {
          enabled: false,
          message:
            "Instagram broad public-post search requires separate Meta-approved professional-account access.",
        },
        tiktok: {
          enabled: false,
          message:
            "TikTok broad public-content search requires separate approved API access.",
        },
      }, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    const chain = (url.searchParams.get("chain") || "solana").toLowerCase();
    const mode = url.searchParams.get("mode") === "momentum" ? "momentum" : "fresh";

    if (!["solana", "base"].includes(chain)) {
      return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });
    }

    const candidates = await discover(chain, mode);

    const rows = await Promise.all(
      candidates.map(async candidate => {
        try {
          const pair = await bestPair(chain, candidate.address);
          if (!pair) return null;
          return serialize(pair, candidate, mode);
        } catch {
          return null;
        }
      })
    );

    const tokens = rows
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      chain,
      mode,
      birdeyeEnabled: Boolean(process.env.BIRDEYE_API_KEY),
      xEnabled: Boolean(process.env.X_BEARER_TOKEN),
      tokens,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Scanner failed" },
      { status: 500 }
    );
  }
}
