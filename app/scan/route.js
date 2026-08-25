import { NextResponse } from "next/server";

const BASE = "https://api.dexscreener.com";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function get(path) {
  const response = await fetch(BASE + path, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Market data request failed");
  }

  return response.json();
}

function scorePair(pair) {
  const liquidity = num(pair?.liquidity?.usd);
  const volume5m = num(pair?.volume?.m5);
  const volume1h = num(pair?.volume?.h1);
  const price5m = num(pair?.priceChange?.m5);

  const buys = num(pair?.txns?.m5?.buys);
  const sells = num(pair?.txns?.m5?.sells);
  const totalTrades = buys + sells;

  let score = 0;

  if (price5m > 0) {
    score += clamp((price5m / 20) * 25, 0, 25);
  }

  const normal5mVolume = Math.max(volume1h / 12, 1);
  const volumeAcceleration = volume5m / normal5mVolume;

  score += clamp(
    ((volumeAcceleration - 1) / 4) * 25,
    0,
    25
  );

  if (totalTrades >= 5) {
    const buySellRatio = (buys + 1) / (sells + 1);

    score += clamp(
      ((buySellRatio - 1) / 2) * 20,
      0,
      20
    );
  }

  if (liquidity >= 250000) score += 15;
  else if (liquidity >= 100000) score += 11;
  else if (liquidity >= 50000) score += 7;
  else if (liquidity >= 20000) score += 3;

  score += clamp((totalTrades / 80) * 15, 0, 15);

  let risk = 0;

  if (liquidity < 10000) risk += 35;
  else if (liquidity < 25000) risk += 20;

  if (totalTrades < 5) risk += 15;

  if (Math.abs(price5m) >= 50) {
    risk += 20;
  }

  const momentum = Math.round(
    clamp(score - risk * 0.18, 0, 100)
  );

  return {
    chain: pair.chainId,
    tokenAddress: pair.baseToken?.address,
    pairAddress: pair.pairAddress,

    name: pair.baseToken?.name || "Unknown",
    symbol: pair.baseToken?.symbol || "?",

    url: pair.url,

    priceUsd: num(pair.priceUsd),

    priceChange5m: price5m,

    volume5m,

    liquidity,

    buys,

    sells,

    momentum,

    risk,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);

    const chain =
      url.searchParams.get("chain") || "solana";

    const profiles =
      await get("/token-profiles/latest/v1");

    const tokens = [];

    for (const token of profiles) {
      if (
        token.chainId === chain &&
        token.tokenAddress
      ) {
        tokens.push(token.tokenAddress);
      }

      if (tokens.length >= 15) break;
    }

    const results = [];

    for (const tokenAddress of tokens) {
      try {
        const pairs = await get(
          `/token-pairs/v1/${chain}/${tokenAddress}`
        );

        if (!pairs?.length) continue;

        pairs.sort(
          (a, b) =>
            num(b?.liquidity?.usd) -
            num(a?.liquidity?.usd)
        );

        results.push(
          scorePair(pairs[0])
        );
      } catch {}
    }

    results.sort(
      (a, b) => b.momentum - a.momentum
    );

    return NextResponse.json({
      tokens: results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error.message || "Scanner failed",
      },
      { status: 500 }
    );
  }
}
