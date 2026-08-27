"use client";

import {
  useEffect,
  useMemo,
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

const pct = value => {
  const n = Number(value || 0);

  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
};

const ratio = value => {
  const n = Number(value || 0);

  return n
    ? `${n.toFixed(2)}x`
    : "—";
};

const ageText = mins => {
  const n = Number(mins);

  if (!Number.isFinite(n)) {
    return "—";
  }

  if (n < 1) {
    return "<1m";
  }

  if (n < 60) {
    return `${Math.round(n)}m`;
  }

  return `${(n / 60).toFixed(1)}h`;
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

export default function Home() {
  const [mode, setMode] =
    useState("momentum");

  const [launches, setLaunches] =
    useState([]);

  const [status, setStatus] =
    useState("Starting...");

  const [auto, setAuto] =
    useState(true);

  async function load() {
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

  async function copyCA(mint) {
    try {
      await navigator.clipboard.writeText(
        mint
      );

      setStatus(
        "Contract copied ✓"
      );

    } catch {
      setStatus(
        "Could not copy contract."
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!auto) return;

    const id =
      setInterval(
        load,
        10000
      );

    return () =>
      clearInterval(id);

  }, [auto]);

  const fresh =
    useMemo(
      () =>
        launches
          .filter(
            x =>
              x.marketReady &&
              Number(
                x.ageMinutes ?? 999
              ) <= 20
          )
          .sort(
            (a, b) =>
              Number(b.score || 0) -
              Number(a.score || 0)
          ),
      [launches]
    );

  const momentum =
    useMemo(
      () =>
        launches
          .filter(
            x =>
              x.marketReady &&
              Number(x.score || 0) >= 35 &&
              Number(x.trades5m || 0) >= 4
          )
          .sort(
            (a, b) =>
              Number(b.score || 0) -
              Number(a.score || 0)
          ),
      [launches]
    );

  const socials =
    useMemo(
      () =>
        launches
          .filter(
            x =>
              x.marketReady &&
              (
                x?.socials?.twitter ||
                x?.socials?.telegram
              )
          )
          .sort(
            (a, b) =>
              Number(b.score || 0) -
              Number(a.score || 0)
          ),
      [launches]
    );

  const visible =
    mode === "fresh"
      ? fresh
      : mode === "social"
      ? socials
      : mode === "all"
      ? launches
      : momentum;

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
          ⚡ Meme Coin Scanner — Classic
        </h1>

        <p
          style={{
            color: "#94a3b8"
          }}
        >
          Simple momentum scanner • fresh launches • exact project socials
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
            <option value="momentum">
              📈 Momentum
            </option>

            <option value="fresh">
              ⚡ Fresh Launches
            </option>

            <option value="social">
              𝕏 Social Links
            </option>

            <option value="all">
              🚨 All Detected
            </option>
          </select>

          <button
            onClick={load}
            style={btn}
          >
            Refresh
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

        <div
          style={{
            display: "grid",
            gap: "12px"
          }}
        >
          {visible.map(coin => {
            const s =
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
                    ⚡ {coin.score || 0}/100
                  </strong>
                </div>

                <p>
                  Age:{" "}
                  {ageText(
                    coin.ageMinutes
                  )}
                  {" • "}
                  5m:{" "}
                  {pct(
                    coin.priceChange5m
                  )}
                </p>

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
                  Pressure:{" "}
                  {ratio(
                    coin.buyRatio
                  )}
                </p>

                <p>
                  Vol accel:{" "}
                  {ratio(
                    coin.volumeAcceleration
                  )}
                  {" • "}
                  Tx accel:{" "}
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
                  <button
                    onClick={() =>
                      copyCA(
                        coin.mint
                      )
                    }
                    style={btn}
                  >
                    📋 Copy Contract
                  </button>

                  <a
                    href={
                      coin.fomoUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    style={btn}
                  >
                    📱 Open Fomo
                  </a>

                  {coin.dexUrl && (
                    <a
                      href={
                        coin.dexUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={btn}
                    >
                      📊 Dex
                    </a>
                  )}

                  {s.twitter && (
                    <a
                      href={
                        s.twitter
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={btn}
                    >
                      𝕏 Twitter
                    </a>
                  )}

                  {s.telegram && (
                    <a
                      href={
                        s.telegram
                      }
                      target="_blank"
                      rel="noreferrer"
                      style={btn}
                    >
                      ✈️ Telegram
                    </a>
                  )}

                  {s.website && (
                    <a
                      href={
                        s.website
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
                No coins in this view yet.
              </span>
            </div>
          )}
        </div>

        <p
          style={{
            color: "#64748b",
            fontSize: "12px",
            lineHeight: 1.5,
            marginTop: "26px"
          }}
        >
          Scores summarize recent market activity only and are not predictions or buy recommendations.
        </p>
      </div>
    </main>
  );
}
