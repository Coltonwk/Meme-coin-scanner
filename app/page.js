"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

const money = value => {
  const n = Number(value || 0);

  if (!n) return "—";

  if (n < 0.01) {
    return "$" + n.toPrecision(3);
  }

  return "$" +
    n.toLocaleString(
      undefined,
      { maximumFractionDigits: 0 }
    );
};

const ratio = value => {
  const n = Number(value || 0);

  return n
    ? `${n.toFixed(2)}x`
    : "—";
};

const when = iso => {
  const ms =
    Date.now() -
    Date.parse(iso || "");

  if (
    !Number.isFinite(ms) ||
    ms < 0
  ) return "";

  if (ms < 60000) {
    return `${Math.floor(ms / 1000)}s ago`;
  }

  if (ms < 3600000) {
    return `${Math.floor(ms / 60000)}m ago`;
  }

  return new Date(
    iso
  ).toLocaleTimeString();
};

const btn = {
  background: "#172033",
  border: "1px solid #334155",
  borderRadius: "10px",
  color: "white",
  padding: "10px 12px",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px"
};

const card = {
  background: "#111827",
  border: "1px solid #293548",
  borderRadius: "16px",
  padding: "16px"
};

function liveXUrl(coin) {
  const parts = [];

  const symbol =
    String(coin?.symbol || "")
      .replace(
        /[^A-Za-z0-9_]/g,
        ""
      );

  const name =
    String(coin?.name || "")
      .trim();

  const mint =
    String(coin?.mint || "")
      .trim();

  const handle =
    String(
      coin?.searchHints
        ?.twitterHandle || ""
    ).replace(/^@/, "");

  if (
    symbol &&
    symbol !== "?"
  ) {
    parts.push(`$${symbol}`);
  }

  if (
    name &&
    name !== "Pump.fun token"
  ) {
    parts.push(`"${name}"`);
  }

  if (mint) parts.push(mint);

  if (handle) {
    parts.push(`@${handle}`);
  }

  const query =
    parts.length
      ? parts.join(" OR ")
      : mint || "pump.fun";

  return (
    "https://x.com/search?q=" +
    encodeURIComponent(query) +
    "&src=typed_query&f=live"
  );
}

function broadXUrl() {
  const q =
    'pump.fun OR pumpfun OR "solana memecoin" OR "new solana token" OR "CA:"';

  return (
    "https://x.com/search?q=" +
    encodeURIComponent(q) +
    "&src=typed_query&f=live"
  );
}

export default function Home() {
  const [mode, setMode] =
    useState("signal");

  const [launches, setLaunches] =
    useState([]);

  const [coinPosts, setCoinPosts] =
    useState([]);

  const [generalPosts, setGeneralPosts] =
    useState([]);

  const [mentioned, setMentioned] =
    useState(new Set());

  const [status, setStatus] =
    useState("Starting...");

  const [socialStatus, setSocialStatus] =
    useState(
      "Tap Refresh X API when you want a social update."
    );

  const [auto, setAuto] =
    useState(true);

  const [socialBusy, setSocialBusy] =
    useState(false);

  const latest =
    useRef([]);

  async function loadLaunches() {
    try {
      const r =
        await fetch(
          "/api/scan",
          { cache: "no-store" }
        );

      const data =
        await r.json();

      if (!r.ok) {
        throw new Error(
          data.error ||
          "Scan failed"
        );
      }

      const rows =
        Array.isArray(data.launches)
          ? data.launches
          : [];

      latest.current = rows;

      setLaunches(rows);

      setStatus(
        `${data.provider || "RPC"} • ${new Date().toLocaleTimeString()}`
      );
    } catch (e) {
      setStatus(
        `Error: ${e.message}`
      );
    }
  }

  function coinsForX() {
    return latest.current
      .filter(x => x.marketReady)
      .sort((a, b) =>
        Number(b.earlyScore || 0) -
        Number(a.earlyScore || 0)
      )
      .slice(0, 4)
      .map(x => ({
        mint: x.mint,
        symbol: x.symbol,
        name: x.name,
        twitterHandle:
          x.searchHints
            ?.twitterHandle || "",
        earlyScore:
          x.earlyScore || 0
      }));
  }

  async function refreshX() {
    if (socialBusy) return;

    setSocialBusy(true);

    try {
      const [coinRes, generalRes] =
        await Promise.all([
          fetch("/api/social", {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              mode: "coins",
              coins: coinsForX()
            })
          }),

          fetch("/api/social", {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              mode: "general"
            })
          })
        ]);

      const coinData =
        await coinRes.json();

      const generalData =
        await generalRes.json();

      setCoinPosts(
        Array.isArray(
          coinData.posts
        )
          ? coinData.posts
          : []
      );

      setGeneralPosts(
        Array.isArray(
          generalData.posts
        )
          ? generalData.posts
          : []
      );

      setMentioned(
        new Set(
          coinData
            .mentionedMints || []
        )
      );

      const messages = [
        coinData.message,
        generalData.message
      ].filter(Boolean);

      setSocialStatus(
        messages.length
          ? messages.join(" • ")
          : `X updated ${new Date().toLocaleTimeString()}`
      );
    } catch (e) {
      setSocialStatus(
        `X feed error: ${e.message}`
      );
    } finally {
      setSocialBusy(false);
    }
  }

  useEffect(() => {
    loadLaunches();
  }, []);

  useEffect(() => {
    if (!auto) return;

    const id =
      setInterval(
        loadLaunches,
        10000
      );

    return () =>
      clearInterval(id);
  }, [auto]);

  const highSignal =
    useMemo(
      () =>
        launches
          .filter(x => x.highSignal)
          .filter(x =>
            x?.socials?.twitter
              ? mentioned.has(x.mint)
              : true
          )
          .sort((a, b) =>
            Number(b.earlyScore || 0) -
            Number(a.earlyScore || 0)
          ),
      [launches, mentioned]
    );

  const trending =
    useMemo(
      () =>
        launches
          .filter(
            x => x.trendingCandidate
          )
          .sort((a, b) =>
            Number(
              b.trendingScore || 0
            ) -
            Number(
              a.trendingScore || 0
            )
          ),
      [launches]
    );

  const twitter =
    useMemo(
      () =>
        launches.filter(
          x => x?.socials?.twitter
        ),
      [launches]
    );

  const visible =
    mode === "signal"
      ? highSignal
      : mode === "trending"
      ? trending
      : mode === "twitter"
      ? twitter
      : launches;

  function Feed({
    posts,
    empty,
    fallbackUrl,
    fallbackLabel
  }) {
    return (
      <div
        style={{
          display: "grid",
          gap: "10px"
        }}
      >
        {!posts.length && (
          <div style={card}>
            <p
              style={{
                color: "#94a3b8",
                marginTop: 0
              }}
            >
              {empty}
            </p>

            <a
              href={fallbackUrl}
              target="_blank"
              rel="noreferrer"
              style={btn}
            >
              🔎 {fallbackLabel}
            </a>
          </div>
        )}

        {posts.map(post => (
          <a
            key={post.id}
            href={post.url}
            target="_blank"
            rel="noreferrer"
            style={{
              ...card,
              color: "white",
              textDecoration: "none"
            }}
          >
            <strong>
              {post.displayName ||
                post.username ||
                "X user"}
            </strong>

            {post.username && (
              <div
                style={{
                  color: "#94a3b8",
                  fontSize: "13px"
                }}
              >
                @{post.username}
              </div>
            )}

            <p>{post.text}</p>

            <small
              style={{
                color: "#64748b"
              }}
            >
              {when(post.createdAt)}
              {" • "}
              ♥ {post.likes || 0}
              {" • "}
              ↻ {post.reposts || 0}
              {" • "}
              💬 {post.replies || 0}
            </small>
          </a>
        ))}
      </div>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg,#070a10,#0b1019)",
        color: "white",
        padding: "18px",
        fontFamily:
          "Arial,sans-serif"
      }}
    >
      <div
        style={{
          maxWidth: "980px",
          margin: "0 auto"
        }}
      >
        <h1>
          ⚡ Meme Coin Signal Scanner V11
        </h1>

        <p
          style={{
            color: "#94a3b8"
          }}
        >
          Early filters • trending signals • market activity • X context
        </p>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap"
          }}
        >
          <select
            value={mode}
            onChange={e =>
              setMode(e.target.value)
            }
            style={btn}
          >
            <option value="signal">
              ⚡ High Signal
            </option>

            <option value="trending">
              🔥 Trending Signals
            </option>

            <option value="twitter">
              𝕏 Has Twitter
            </option>

            <option value="all">
              🚨 All Detected
            </option>
          </select>

          <button
            onClick={loadLaunches}
            style={btn}
          >
            Refresh Coins
          </button>

          <button
            onClick={refreshX}
            disabled={socialBusy}
            style={{
              ...btn,
              opacity:
                socialBusy ? 0.6 : 1
            }}
          >
            {socialBusy
              ? "Checking X..."
              : "Refresh X API"}
          </button>

          <button
            onClick={() =>
              setAuto(!auto)
            }
            style={btn}
          >
            Auto {auto ? "ON" : "OFF"}
          </button>
        </div>

        <p
          style={{
            color: "#94a3b8"
          }}
        >
          {status}
        </p>

        <p
          style={{
            color: "#64748b",
            fontSize: "13px"
          }}
        >
          {socialStatus}
        </p>

        {mode === "trending" && (
          <div
            style={{
              ...card,
              marginBottom: "12px"
            }}
          >
            <strong>
              🔥 Trending Signals
            </strong>

            <p
              style={{
                color: "#94a3b8",
                marginBottom: 0
              }}
            >
              Ranked by liquidity, recent trades, buy pressure, volume/transaction acceleration, and price momentum. This is not a buy/hold recommendation.
            </p>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gap: "12px"
          }}
        >
          {visible.map(coin => {
            const socials =
              coin.socials || {};

            const xSearch =
              liveXUrl(coin);

            return (
              <div
                key={`${coin.mint}:${coin.detectedAt}`}
                style={card}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    gap: "10px",
                    flexWrap: "wrap"
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0
                      }}
                    >
                      {coin.symbol &&
                      coin.symbol !== "?"
                        ? `$${coin.symbol}`
                        : "New launch"}
                    </h2>

                    <div
                      style={{
                        color:
                          "#94a3b8"
                      }}
                    >
                      {coin.name ||
                        "Pump.fun token"}
                    </div>
                  </div>

                  <strong>
                    {mode === "trending"
                      ? `🔥 ${coin.trendingScore || 0}/100`
                      : `⚡ ${coin.earlyScore || 0}/100`}
                  </strong>
                </div>

                <p>
                  Liquidity:{" "}
                  {money(
                    coin.liquidity
                  )}
                  {" • "}
                  5m Volume:{" "}
                  {money(
                    coin.volume5m
                  )}
                </p>

                <p>
                  Buys / Sells:{" "}
                  {coin.buys5m || 0}
                  {" / "}
                  {coin.sells5m || 0}
                  {" • "}
                  Buy pressure:{" "}
                  {ratio(
                    coin.buyRatio
                  )}
                </p>

                <p>
                  Volume acceleration:{" "}
                  {ratio(
                    coin.volumeAcceleration
                  )}
                  {" • "}
                  Tx acceleration:{" "}
                  {ratio(
                    coin.transactionAcceleration
                  )}
                </p>

                {!!coin.riskFlags?.length && (
                  <p
                    style={{
                      color: "#fbbf24"
                    }}
                  >
                    ⚠️{" "}
                    {coin.riskFlags.join(
                      " • "
                    )}
                  </p>
                )}

                <p
                  style={{
                    color: "#64748b",
                    fontSize: "12px",
                    overflowWrap:
                      "anywhere"
                  }}
                >
                  {coin.mint}
                </p>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px"
                  }}
                >
                  <a
                    href={coin.fomoUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={btn}
                  >
                    🚀 Fomo
                  </a>

                  <a
                    href={xSearch}
                    target="_blank"
                    rel="noreferrer"
                    style={btn}
                  >
                    🔎 Live X Search
                  </a>

                  {socials.twitter && (
                    <a
                      href={
                        socials.twitter
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={btn}
                    >
                      𝕏 Twitter
                    </a>
                  )}

                  {socials.telegram && (
                    <a
                      href={
                        socials.telegram
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={btn}
                    >
                      ✈️ Telegram
                    </a>
                  )}

                  {socials.website && (
                    <a
                      href={
                        socials.website
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={btn}
                    >
                      🌐 Website
                    </a>
                  )}
                </div>
              </div>
            );
          })}

          {!visible.length && (
            <div style={card}>
              <span
                style={{
                  color: "#94a3b8"
                }}
              >
                No coins meet this section's filters yet.
              </span>
            </div>
          )}
        </div>

        <section
          style={{
            marginTop: "28px"
          }}
        >
          <h2>
            🧵 X posts about detected coins
          </h2>

          <Feed
            posts={coinPosts}
            empty={
              socialStatus.includes("402")
                ? "X API billing is not active. Live search still works."
                : "No embedded X posts loaded yet."
            }
            fallbackUrl={
              launches[0]
                ? liveXUrl(
                    launches[0]
                  )
                : broadXUrl()
            }
            fallbackLabel="Open Live X Search"
          />
        </section>

        <section
          style={{
            marginTop: "28px"
          }}
        >
          <h2>
            🌐 Broader meme-coin X feed
          </h2>

          <Feed
            posts={generalPosts}
            empty="Open the free live X search while embedded API results are unavailable."
            fallbackUrl={broadXUrl()}
            fallbackLabel="Open Broad Live X Search"
          />
        </section>

        <p
          style={{
            color: "#64748b",
            fontSize: "12px",
            lineHeight: 1.5,
            marginTop: "26px"
          }}
        >
          High Signal and Trending Signals rank observable activity only. New meme coins are highly speculative and social activity can be manipulated.
        </p>
      </div>
    </main>
  );
}
