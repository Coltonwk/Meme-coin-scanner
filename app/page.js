"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

const HISTORY_KEY =
  "meme_scanner_history_v3";

const WATCHLIST_KEY =
  "meme_scanner_watchlist_v3";

function money(value) {
  const n = Number(value || 0);

  if (!n) return "—";

  if (n < 0.01) {
    return "$" + n.toPrecision(3);
  }

  return (
    "$" +
    n.toLocaleString(
      undefined,
      {
        maximumFractionDigits: 0,
      }
    )
  );
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
    const value =
      localStorage.getItem(key);

    if (!value) return fallback;

    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [coins, setCoins] =
    useState([]);

  const [chain, setChain] =
    useState("solana");

  const [scanMode, setScanMode] =
    useState("early");

  const [status, setStatus] =
    useState("Starting scanner...");

  const [loading, setLoading] =
    useState(false);

  const [autoRefresh, setAutoRefresh] =
    useState(true);

  const [minMomentum, setMinMomentum] =
    useState(0);

  const [minLiquidity, setMinLiquidity] =
    useState(0);

  const [watchlist, setWatchlist] =
    useState([]);

  const [history, setHistory] =
    useState([]);

  useEffect(() => {
    setWatchlist(
      loadStorage(
        WATCHLIST_KEY,
        []
      )
    );

    setHistory(
      loadStorage(
        HISTORY_KEY,
        []
      )
    );
  }, []);

  async function scan() {
    if (loading) return;

    setLoading(true);

    setStatus(
      scanMode === "early"
        ? "Looking for early activity..."
        : "Scanning momentum..."
    );

    try {
      const response =
        await fetch(
          `/api/scan?chain=${chain}&mode=${scanMode}`,
          {
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Scanner error"
        );
      }

      const tokens =
        data.tokens || [];

      setCoins(tokens);

      updateHistory(tokens);

      setStatus(
        "Updated " +
          new Date().toLocaleTimeString()
      );
    } catch (error) {
      setStatus(
        "Error: " +
          error.message
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyContract(address) {
    try {
      await navigator.clipboard.writeText(
        address
      );

      setStatus(
        "Contract copied ✓"
      );
    } catch {
      setStatus(
        "Could not copy contract"
      );
    }
  }

  function updateHistory(tokens) {
    const now = Date.now();

    let current =
      loadStorage(
        HISTORY_KEY,
        []
      );

    for (const coin of tokens) {
      if (
        coin.momentum < 70 ||
        !coin.priceUsd
      ) {
        continue;
      }

      const existing =
        current.find(
          (item) =>
            item.chain ===
              coin.chain &&
            item.tokenAddress ===
              coin.tokenAddress &&
            now -
              item.createdAt <
              30 * 60 * 1000
        );

      if (!existing) {
        current.unshift({
          id:
            coin.chain +
            ":" +
            coin.tokenAddress +
            ":" +
            now,

          chain:
            coin.chain,

          tokenAddress:
            coin.tokenAddress,

          symbol:
            coin.symbol,

          name:
            coin.name,

          url:
            coin.url,

          momentum:
            coin.momentum,

          risk:
            coin.risk,

          scanMode,

          alertPrice:
            coin.priceUsd,

          createdAt:
            now,

          outcomes: {},
        });
      }
    }

    current =
      current.slice(
        0,
        100
      );

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(
        current
      )
    );

    setHistory(current);
  }

  function toggleWatch(coin) {
    const exists =
      watchlist.some(
        (item) =>
          item.tokenAddress ===
            coin.tokenAddress &&
          item.chain ===
            coin.chain
      );

    const updated =
      exists
        ? watchlist.filter(
            (item) =>
              !(
                item.tokenAddress ===
                  coin.tokenAddress &&
                item.chain ===
                  coin.chain
              )
          )
        : [
            ...watchlist,
            {
              chain:
                coin.chain,

              tokenAddress:
                coin.tokenAddress,

              symbol:
                coin.symbol,

              name:
                coin.name,

              url:
                coin.url,
            },
          ];

    setWatchlist(updated);

    localStorage.setItem(
      WATCHLIST_KEY,
      JSON.stringify(
        updated
      )
    );
  }

  useEffect(() => {
    scan();
  }, [
    chain,
    scanMode,
  ]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer =
      setInterval(
        scan,
        20000
      );

    return () =>
      clearInterval(timer);
  }, [
    autoRefresh,
    chain,
    scanMode,
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

        padding: "18px",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <h1>
          ⚡ Meme Coin Scanner
        </h1>

        <p
          style={{
            color: "#94a3b8",
          }}
        >
          Early activity + momentum scanner
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
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
              background: "#111827",
              color: "white",
            }}
          >
            <option value="solana">
              Solana
            </option>

            <option value="base">
              Base
            </option>
          </select>

          <select
            value={scanMode}
            onChange={(e) =>
              setScanMode(
                e.target.value
              )
            }
            style={{
              padding: "10px",
              borderRadius: "10px",
              background: "#111827",
              color: "white",
            }}
          >
            <option value="early">
              ⚡ Early Mode
            </option>

            <option value="momentum">
              🔥 Momentum Mode
            </option>
          </select>

          <button
            onClick={scan}
            style={{
              padding:
                "10px 14px",
              borderRadius:
                "10px",
              background:
                "#2563eb",
              color: "white",
              border: "none",
              fontWeight:
                "bold",
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
              borderRadius:
                "10px",
              background:
                autoRefresh
                  ? "#14532d"
                  : "#334155",
              color: "white",
              border: "none",
            }}
          >
            Auto{" "}
            {autoRefresh
              ? "ON"
              : "OFF"}
          </button>
        </div>

        <p>{status}</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          <select
            value={minMomentum}
            onChange={(e) =>
              setMinMomentum(
                Number(
                  e.target.value
                )
              )
            }
          >
            <option value="0">
              All scores
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

          <select
            value={minLiquidity}
            onChange={(e) =>
              setMinLiquidity(
                Number(
                  e.target.value
                )
              )
            }
          >
            <option value="0">
              Any liquidity
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

        {strongest && (
          <div
            style={{
              background:
                "#111827",
              padding:
                "15px",
              borderRadius:
                "14px",
              marginBottom:
                "14px",
            }}
          >
            <small>
              {scanMode ===
              "early"
                ? "EARLIEST CURRENT SIGNAL"
                : "STRONGEST MOMENTUM"}
            </small>

            <h2>
              {
                strongest.symbol
              }
            </h2>

            <div>
              Score:{" "}
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
                {
                  strongest.risk
                }
                /100
              </strong>
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
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

              const fomoUrl =
                coin.chain ===
                "solana"
                  ? `https://fomo.family/coin?address=${coin.tokenAddress}&chainId=1399811149`
                  : coin.url;

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
                    }}
                  >
                    <div>
                      <h2>
                        {
                          coin.symbol
                        }
                      </h2>

                      <small>
                        {coin.name}
                      </small>
                    </div>

                    <button
                      onClick={() =>
                        toggleWatch(
                          coin
                        )
                      }
                    >
                      {watching
                        ? "★"
                        : "☆"}
                    </button>
                  </div>

                  {coin.ageMinutes !==
                    null && (
                    <p>
                      Age:{" "}
                      {coin.ageMinutes <
                      60
                        ? `${coin.ageMinutes.toFixed(
                            1
                          )} min`
                        : `${(
                            coin.ageMinutes /
                            60
                          ).toFixed(
                            1
                          )} hr`}
                    </p>
                  )}

                  <p>
                    Score:{" "}
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
                  </p>

                  <p>
                    Risk:{" "}
                    <strong
                      style={{
                        color:
                          riskColor(
                            coin.risk
                          ),
                      }}
                    >
                      {coin.risk}/100
                    </strong>
                  </p>

                  <p>
                    5m Price:{" "}
                    {percent(
                      coin.priceChange5m
                    )}
                  </p>

                  <p>
                    5m Volume:{" "}
                    {money(
                      coin.volume5m
                    )}
                  </p>

                  <p>
                    Liquidity:{" "}
                    {money(
                      coin.liquidity
                    )}
                  </p>

                  <p>
                    Buys/Sells:{" "}
                    {coin.buys} /{" "}
                    {coin.sells}
                  </p>

                  {coin.signals?.length >
                    0 && (
                    <p
                      style={{
                        color:
                          "#facc15",
                      }}
                    >
                      ⚡{" "}
                      {coin.signals.join(
                        " • "
                      )}
                    </p>
                  )}

                  <button
                    onClick={() =>
                      copyContract(
                        coin.tokenAddress
                      )
                    }
                    style={{
                      marginRight:
                        "10px",
                      padding:
                        "9px",
                    }}
                  >
                    📋 Copy Contract
                  </button>

                  <a
                    href={fomoUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
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
              "25px",
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

          {history
            .slice(0, 15)
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
                      "8px 0",
                  }}
                >
                  <strong>
                    {
                      item.symbol
                    }
                  </strong>

                  {" — "}

                  {item.momentum}
                  /100

                  {" • "}

                  {item.scanMode}
                </div>
              )
            )}
        </div>

        <p
          style={{
            color:
              "#64748b",
            fontSize:
              "12px",
            marginTop:
              "25px",
          }}
        >
          These scores detect market
          activity. They do not predict or
          guarantee that a token will rise.
        </p>
      </div>
    </main>
  );
}