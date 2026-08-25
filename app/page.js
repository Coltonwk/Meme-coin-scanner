"use client";

import { useEffect, useMemo, useState } from "react";

const HISTORY_KEY = "meme_scanner_history_v2";
const WATCHLIST_KEY = "meme_scanner_watchlist_v2";

function money(value) {
  const n = Number(value || 0);

  if (!n) return "—";

  if (n < 0.01) {
    return "$" + n.toPrecision(3);
  }

  return "$" + n.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function percent(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function scoreColor(score) {
  if (score >= 80) return "#4ade80";
  if (score >= 65) return "#facc15";
  return "#94a3b8";
}

function riskColor(score) {
  if (score >= 60) return "#f87171";
  if (score >= 30) return "#facc15";
  return "#4ade80";
}

function loadStorage(key, fallback) {
  try {
    const data = localStorage.getItem(key);

    if (!data) return fallback;

    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [coins, setCoins] = useState([]);

  const [chain, setChain] = useState("solana");

  const [status, setStatus] = useState("Starting scanner...");

  const [loading, setLoading] = useState(false);

  const [autoRefresh, setAutoRefresh] = useState(true);

  const [minMomentum, setMinMomentum] = useState(0);

  const [minLiquidity, setMinLiquidity] = useState(0);

  const [watchlist, setWatchlist] = useState([]);

  const [history, setHistory] = useState([]);

  useEffect(() => {
    setWatchlist(
      loadStorage(WATCHLIST_KEY, [])
    );

    setHistory(
      loadStorage(HISTORY_KEY, [])
    );
  }, []);

  async function scan() {
    if (loading) return;

    setLoading(true);

    setStatus("Scanning live markets...");

    try {
      const response = await fetch(
        `/api/scan?chain=${chain}`,
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Scanner error"
        );
      }

      const tokens = data.tokens || [];

      setCoins(tokens);

      updateHistory(tokens);

      setStatus(
        "Updated " +
          new Date().toLocaleTimeString()
      );
    } catch (error) {
      setStatus(
        "Error: " + error.message
      );
    } finally {
      setLoading(false);
    }
  }

  function updateHistory(tokens) {
    const now = Date.now();

    let currentHistory =
      loadStorage(HISTORY_KEY, []);

    for (const coin of tokens) {
      if (
        coin.momentum < 70 ||
        !coin.priceUsd
      ) {
        continue;
      }

      const recent =
        currentHistory.find(
          (item) =>
            item.chain === coin.chain &&
            item.tokenAddress ===
              coin.tokenAddress &&
            now - item.createdAt <
              30 * 60 * 1000
        );

      if (!recent) {
        currentHistory.unshift({
          id:
            coin.chain +
            ":" +
            coin.tokenAddress +
            ":" +
            now,

          chain: coin.chain,

          tokenAddress:
            coin.tokenAddress,

          symbol: coin.symbol,

          name: coin.name,

          url: coin.url,

          momentum:
            coin.momentum,

          risk: coin.risk,

          alertPrice:
            coin.priceUsd,

          createdAt: now,

          outcomes: {},
        });
      }
    }

    const targets = [
      5,
      15,
      30,
      60,
    ];

    currentHistory =
      currentHistory.map(
        (item) => {
          const currentCoin =
            tokens.find(
              (coin) =>
                coin.chain ===
                  item.chain &&
                coin.tokenAddress ===
                  item.tokenAddress
            );

          if (
            !currentCoin ||
            !currentCoin.priceUsd
          ) {
            return item;
          }

          const ageMinutes =
            (now -
              item.createdAt) /
            60000;

          const outcomes = {
            ...(item.outcomes || {}),
          };

          for (const target of targets) {
            if (
              ageMinutes >= target &&
              outcomes[target] ===
                undefined
            ) {
              outcomes[target] =
                (currentCoin.priceUsd /
                  item.alertPrice -
                  1) *
                100;
            }
          }

          return {
            ...item,
            outcomes,
          };
        }
      );

    currentHistory =
      currentHistory.slice(
        0,
        100
      );

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(
        currentHistory
      )
    );

    setHistory(currentHistory);
  }

  function toggleWatch(coin) {
    let updated;

    const exists =
      watchlist.some(
        (item) =>
          item.tokenAddress ===
            coin.tokenAddress &&
          item.chain === coin.chain
      );

    if (exists) {
      updated =
        watchlist.filter(
          (item) =>
            !(
              item.tokenAddress ===
                coin.tokenAddress &&
              item.chain ===
                coin.chain
            )
        );
    } else {
      updated = [
        ...watchlist,
        {
          chain: coin.chain,
          tokenAddress:
            coin.tokenAddress,
          symbol: coin.symbol,
          name: coin.name,
          url: coin.url,
        },
      ];
    }

    setWatchlist(updated);

    localStorage.setItem(
      WATCHLIST_KEY,
      JSON.stringify(updated)
    );
  }

  useEffect(() => {
    scan();
  }, [chain]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer =
      setInterval(
        scan,
        30000
      );

    return () =>
      clearInterval(timer);
  }, [
    autoRefresh,
    chain,
    loading,
  ]);

  const filteredCoins =
    useMemo(() => {
      return coins.filter(
        (coin) =>
          coin.momentum >=
            minMomentum &&
          coin.liquidity >=
            minLiquidity
      );
    }, [
      coins,
      minMomentum,
      minLiquidity,
    ]);

  const strongest =
    filteredCoins[0];

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg,#070a10,#0b1019)",
        color: "white",
        fontFamily:
          "Arial, sans-serif",
        padding:
          "18px",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <h1
          style={{
            fontSize: "26px",
            marginBottom: "4px",
          }}
        >
          ⚡ Meme Coin Momentum Scanner
        </h1>

        <p
          style={{
            color: "#94a3b8",
            marginTop: 0,
          }}
        >
          Live market activity scanner
        </p>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <select
            value={chain}
            onChange={(e) =>
              setChain(
                e.target.value
              )
            }
            style={{
              padding: "10px",
              borderRadius: "10px",
              background:
                "#111827",
              color: "white",
              border:
                "1px solid #334155",
            }}
          >
            <option value="solana">
              Solana
            </option>

            <option value="base">
              Base
            </option>
          </select>

          <button
            onClick={scan}
            style={{
              padding:
                "10px 14px",
              borderRadius: "10px",
              background:
                "#2563eb",
              color: "white",
              border: "none",
              fontWeight: "bold",
            }}
          >
            {loading
              ? "Scanning..."
              : "Scan Now"}
          </button>

          <button
            onClick={() =>
              setAutoRefresh(
                !autoRefresh
              )
            }
            style={{
              padding:
                "10px 14px",
              borderRadius: "10px",
              background:
                autoRefresh
                  ? "#14532d"
                  : "#334155",
              color: "white",
              border: "none",
            }}
          >
            Auto:{" "}
            {autoRefresh
              ? "ON"
              : "OFF"}
          </button>
        </div>

        <div
          style={{
            background:
              "#111827",
            border:
              "1px solid #1f2937",
            borderRadius:
              "14px",
            padding:
              "14px",
            marginBottom:
              "14px",
          }}
        >
          <strong>
            {status}
          </strong>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: "10px",
              marginTop:
                "12px",
            }}
          >
            <div>
              <div
                style={{
                  color:
                    "#94a3b8",
                  fontSize:
                    "12px",
                }}
              >
                Min Momentum
              </div>

              <select
                value={
                  minMomentum
                }
                onChange={(e) =>
                  setMinMomentum(
                    Number(
                      e.target
                        .value
                    )
                  )
                }
                style={{
                  width:
                    "100%",
                  marginTop:
                    "4px",
                  padding:
                    "9px",
                  borderRadius:
                    "8px",
                  background:
                    "#0f172a",
                  color:
                    "white",
                }}
              >
                <option value="0">
                  All
                </option>

                <option value="50">
                  50+
                </option>

                <option value="65">
                  65+
                </option>

                <option value="70">
                  70+
                </option>

                <option value="80">
                  80+
                </option>
              </select>
            </div>

            <div>
              <div
                style={{
                  color:
                    "#94a3b8",
                  fontSize:
                    "12px",
                }}
              >
                Min Liquidity
              </div>

              <select
                value={
                  minLiquidity
                }
                onChange={(e) =>
                  setMinLiquidity(
                    Number(
                      e.target
                        .value
                    )
                  )
                }
                style={{
                  width:
                    "100%",
                  marginTop:
                    "4px",
                  padding:
                    "9px",
                  borderRadius:
                    "8px",
                  background:
                    "#0f172a",
                  color:
                    "white",
                }}
              >
                <option value="0">
                  Any
                </option>

                <option value="10000">
                  $10k+
                </option>

                <option value="25000">
                  $25k+
                </option>

                <option value="50000">
                  $50k+
                </option>

                <option value="100000">
                  $100k+
                </option>
              </select>
            </div>
          </div>
        </div>

        {strongest && (
          <div
            style={{
              background:
                "#111827",
              border:
                "1px solid #334155",
              borderRadius:
                "14px",
              padding:
                "16px",
              marginBottom:
                "14px",
            }}
          >
            <div
              style={{
                color:
                  "#94a3b8",
                fontSize:
                  "12px",
              }}
            >
              STRONGEST CURRENT SIGNAL
            </div>

            <h2>
              {strongest.name} (
              {strongest.symbol})
            </h2>

            <div>
              Momentum:{" "}
              <strong
                style={{
                  color:
                    scoreColor(
                      strongest.momentum
                    ),
                }}
              >
                {
                  strongest.momentum
                }
                /100
              </strong>
            </div>

            <div>
              Risk:{" "}
              <strong
                style={{
                  color:
                    riskColor(
                      strongest.risk
                    ),
                }}
              >
                {strongest.risk}
                /100
              </strong>
            </div>

            <div>
              5m:{" "}
              {percent(
                strongest.priceChange5m
              )}
            </div>
          </div>
        )}

        <div
          style={{
            display:
              "grid",
            gap: "12px",
          }}
        >
          {filteredCoins.map(
            (coin) => {
              const watching =
                watchlist.some(
                  (item) =>
                    item.tokenAddress ===
                      coin.tokenAddress &&
                    item.chain ===
                      coin.chain
                );

              return (
                <div
                  key={
                    coin.pairAddress
                  }
                  style={{
                    background:
                      "#111827",
                    border:
                      "1px solid #243244",
                    padding:
                      "15px",
                    borderRadius:
                      "14px",
                  }}
                >
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <h2
                        style={{
                          margin:
                            "0 0 4px",
                        }}
                      >
                        {
                          coin.symbol
                        }
                      </h2>

                      <div
                        style={{
                          color:
                            "#94a3b8",
                          fontSize:
                            "12px",
                        }}
                      >
                        {coin.name}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        toggleWatch(
                          coin
                        )
                      }
                      style={{
                        border:
                          "none",
                        borderRadius:
                          "8px",
                        padding:
                          "8px 10px",
                        background:
                          watching
                            ? "#7c3aed"
                            : "#1e293b",
                        color:
                          "white",
                      }}
                    >
                      {watching
                        ? "★ Watching"
                        : "☆ Watch"}
                    </button>
                  </div>

                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: "8px",
                      marginTop:
                        "12px",
                    }}
                  >
                    <div>
                      Momentum
                      <br />

                      <strong
                        style={{
                          color:
                            scoreColor(
                              coin.momentum
                            ),
                        }}
                      >
                        {
                          coin.momentum
                        }
                        /100
                      </strong>
                    </div>

                    <div>
                      Risk
                      <br />

                      <strong
                        style={{
                          color:
                            riskColor(
                              coin.risk
                            ),
                        }}
                      >
                        {
                          coin.risk
                        }
                        /100
                      </strong>
                    </div>

                    <div>
                      5m Price
                      <br />

                      <strong>
                        {percent(
                          coin.priceChange5m
                        )}
                      </strong>
                    </div>

                    <div>
                      Liquidity
                      <br />

                      <strong>
                        {money(
                          coin.liquidity
                        )}
                      </strong>
                    </div>

                    <div>
                      5m Volume
                      <br />

                      <strong>
                        {money(
                          coin.volume5m
                        )}
                      </strong>
                    </div>

                    <div>
                      Buys / Sells
                      <br />

                      <strong>
                        {coin.buys} /{" "}
                        {coin.sells}
                      </strong>
                    </div>
                  </div>

                  <a
                    href={
  coin.chain === "solana"
    ? `https://fomo.family/coin?address=${coin.tokenAddress}&chainId=1399811149`
    : coin.url
}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display:
                        "inline-block",
                      marginTop:
                        "12px",
                      color:
                        "#60a5fa",
                    }}
                  >
                    Open in Fomo →
                  </a>
                </div>
              );
            }
          )}
        </div>

        <div
          style={{
            marginTop:
              "24px",
            background:
              "#111827",
            padding:
              "14px",
            borderRadius:
              "14px",
          }}
        >
          <h2>
            Signal History
          </h2>

          {history.length ===
            0 && (
            <p
              style={{
                color:
                  "#94a3b8",
              }}
            >
              Signals scoring 70+
              will appear here.
            </p>
          )}

          {history
            .slice(0, 20)
            .map(
              (item) => (
                <div
                  key={
                    item.id
                  }
                  style={{
                    borderTop:
                      "1px solid #243244",
                    padding:
                      "10px 0",
                  }}
                >
                  <strong>
                    {
                      item.symbol
                    }
                  </strong>

                  <div
                    style={{
                      fontSize:
                        "12px",
                      color:
                        "#94a3b8",
                    }}
                  >
                    Momentum{" "}
                    {
                      item.momentum
                    }{" "}
                    • Risk{" "}
                    {item.risk}
                  </div>

                  <div
                    style={{
                      marginTop:
                        "4px",
                      fontSize:
                        "13px",
                    }}
                  >
                    +5m{" "}
                    {item
                      .outcomes?.[
                      5
                    ] ===
                    undefined
                      ? "—"
                      : percent(
                          item
                            .outcomes[
                            5
                          ]
                        )}
                    {" | "}
                    +15m{" "}
                    {item
                      .outcomes?.[
                      15
                    ] ===
                    undefined
                      ? "—"
                      : percent(
                          item
                            .outcomes[
                            15
                          ]
                        )}
                    {" | "}
                    +30m{" "}
                    {item
                      .outcomes?.[
                      30
                    ] ===
                    undefined
                      ? "—"
                      : percent(
                          item
                            .outcomes[
                            30
                          ]
                        )}
                    {" | "}
                    +60m{" "}
                    {item
                      .outcomes?.[
                      60
                    ] ===
                    undefined
                      ? "—"
                      : percent(
                          item
                            .outcomes[
                            60
                          ]
                        )}
                  </div>
                </div>
              )
            )}
        </div>

        <p
          style={{
            marginTop:
              "25px",
            color:
              "#64748b",
            fontSize:
              "12px",
            lineHeight:
              "1.5",
          }}
        >
          Momentum and risk
          scores are informational
          indicators only and do
          not guarantee future
          price movement.
        </p>
      </div>
    </main>
  );
}
