"use client";

import { useEffect, useMemo, useState } from "react";

const money = value => {
  const n = Number(value || 0);
  if (!n) return "—";

  if (n < 0.01) {
    return "$" + n.toPrecision(3);
  }

  return "$" + n.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
};

const percent = value => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "—";
  }

  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
};

const scoreColor = score =>
  score >= 75
    ? "#4ade80"
    : score >= 55
    ? "#facc15"
    : "#94a3b8";

const statusLabel = status => {
  if (status === "strong-early") {
    return "🔥 Strong Early";
  }

  if (status === "active") {
    return "⚡ Early Activity";
  }

  if (status === "forming") {
    return "🟡 Pair Forming";
  }

  return "⏳ Waiting";
};

export default function Home() {
  const [mode, setMode] =
    useState("qualified");

  const [launches, setLaunches] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [status, setStatus] =
    useState("Starting...");

  const [auto, setAuto] =
    useState(true);

  const [minScore, setMinScore] =
    useState(0);

  async function load() {
    if (loading) return;

    setLoading(true);

    try {
      const apiMode =
        mode === "all"
          ? "all"
          : "qualified";

      const r = await fetch(
        `/api/scan?mode=${apiMode}`,
        {
          cache: "no-store",
        }
      );

      const data = await r.json();

      if (!r.ok) {
        throw new Error(
          data.error ||
          "Scanner request failed"
        );
      }

      setLaunches(
        data.launches || []
      );

      setStatus(
        `${data.provider || "RPC"} • ${new Date().toLocaleTimeString()}`
      );
    } catch (error) {
      setStatus(
        "Error: " + error.message
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [mode]);

  useEffect(() => {
    if (!auto) return;

    const id = setInterval(
      load,
      10000
    );

    return () =>
      clearInterval(id);
  }, [auto, mode, loading]);

  const visible = useMemo(
    () =>
      launches.filter(
        coin =>
          Number(
            coin.activityScore || 0
          ) >= minScore
      ),
    [launches, minScore]
  );

  async function copyContract(mint) {
    try {
      await navigator.clipboard.writeText(mint);
      setStatus("Contract copied ✓");
    } catch {
      setStatus("Could not copy contract");
    }
  }

  const button = {
    background: "#172033",
    border: "1px solid #334155",
    borderRadius: "9px",
    color: "white",
    padding: "10px 12px",
  };

  const card = {
    background: "#111827",
    border: "1px solid #243244",
    borderRadius: "14px",
    padding: "15px",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg,#070a10,#0b1019)",
        color: "white",
        padding: "18px",
        fontFamily:
          "Arial,sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <h1>
          ⚡ Meme Coin Launch Scanner
        </h1>

        <p
          style={{
            color: "#94a3b8",
          }}
        >
          Pump.fun launch activity •
          market data • social links
        </p>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "14px",
          }}
        >
          <select
            value={mode}
            onChange={e =>
              setMode(e.target.value)
            }
            style={button}
          >
            <option value="qualified">
              ⚡ Qualified Early
            </option>

            <option value="all">
              🚨 All Detected
            </option>
          </select>

          <select
            value={minScore}
            onChange={e =>
              setMinScore(
                Number(e.target.value)
              )
            }
            style={button}
          >
            <option value="0">
              Any score
            </option>

            <option value="40">
              Score 40+
            </option>

            <option value="60">
              Score 60+
            </option>

            <option value="75">
              Score 75+
            </option>
          </select>

          <button
            onClick={load}
            style={button}
          >
            {loading
              ? "Refreshing..."
              : "Refresh"}
          </button>

          <button
            onClick={() =>
              setAuto(!auto)
            }
            style={button}
          >
            Auto {auto ? "ON" : "OFF"}
          </button>
        </div>

        <p
          style={{
            color: "#94a3b8",
          }}
        >
          {status}
        </p>

        <div
          style={{
            display: "grid",
            gap: "12px",
          }}
        >
          {visible.map(coin => {
            const fomo =
              coin.fomoUrl ||
              `https://fomo.family/coin?address=${coin.mint}&chainId=1399811149`;

            const socials =
              coin.socials || {};

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
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                      }}
                    >
                      {coin.symbol &&
                      coin.symbol !== "?"
                        ? coin.symbol
                        : "New launch"}
                    </h2>

                    <div
                      style={{
                        color:
                          "#94a3b8",
                      }}
                    >
                      {coin.name ||
                        "Pump.fun token"}
                    </div>
                  </div>

                  <strong
                    style={{
                      color:
                        scoreColor(
                          coin.activityScore ||
                            0
                        ),
                    }}
                  >
                    {statusLabel(
                      coin.status
                    )}
                  </strong>
                </div>

                <p>
                  Early Activity Score:{" "}
                  <strong
                    style={{
                      color:
                        scoreColor(
                          coin.activityScore ||
                            0
                        ),
                    }}
                  >
                    {coin.activityScore ||
                      0}
                    /100
                  </strong>
                </p>

                <p>
                  Liquidity:{" "}
                  {money(
                    coin.liquidity
                  )}
                </p>

                <p>
                  5m Volume:{" "}
                  {money(
                    coin.volume5m
                  )}
                </p>

                <p>
                  Buys / Sells:{" "}
                  {coin.buys5m || 0} /{" "}
                  {coin.sells5m || 0}
                </p>

                <p>
                  5m Price:{" "}
                  {percent(
                    coin.priceChange5m
                  )}
                </p>

                <p
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    overflowWrap:
                      "anywhere",
                  }}
                >
                  {coin.mint}
                </p>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "9px",
                    alignItems: "center",
                  }}
                >
                  <button
                    onClick={() =>
                      copyContract(
                        coin.mint
                      )
                    }
                    style={button}
                  >
                    📋 Copy Contract
                  </button>

                  <a
                    href={fomo}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      ...button,
                      textDecoration:
                        "none",
                    }}
                  >
                    🚀 Fomo
                  </a>

                  {socials.twitter && (
                    <a
                      href={
                        socials.twitter
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        ...button,
                        textDecoration:
                          "none",
                      }}
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
                      style={{
                        ...button,
                        textDecoration:
                          "none",
                      }}
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
                      style={{
                        ...button,
                        textDecoration:
                          "none",
                      }}
                    >
                      🌐 Website
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!visible.length &&
          !loading && (
            <p
              style={{
                color: "#94a3b8",
                marginTop: "20px",
              }}
            >
              No launches match the
              current filter yet.
            </p>
          )}

        <p
          style={{
            marginTop: "25px",
            color: "#64748b",
            fontSize: "12px",
            lineHeight: 1.5,
          }}
        >
          Activity scores and social
          links are informational.
          They do not indicate that a
          token is safe or will rise.
        </p>
      </div>
    </main>
  );
}
