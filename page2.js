"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [chain, setChain] = useState("solana");
  const [status, setStatus] = useState("Starting scanner...");

  async function scan() {
    try {
      setStatus("Scanning...");

      const response = await fetch(
        `/api/scan?chain=${chain}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Scanner error"
        );
      }

      setCoins(data.tokens || []);

      setStatus(
        "Updated " +
          new Date().toLocaleTimeString()
      );
    } catch (error) {
      setStatus("Error: " + error.message);
    }
  }

  useEffect(() => {
    scan();

    const timer = setInterval(
      scan,
      30000
    );

    return () => clearInterval(timer);
  }, [chain]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#080b11",
        color: "white",
        fontFamily: "Arial",
        padding: "20px",
      }}
    >
      <h1>⚡ Meme Coin Scanner</h1>

      <p style={{ color: "#999" }}>
        Live momentum and risk scanner
      </p>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <select
          value={chain}
          onChange={(e) =>
            setChain(e.target.value)
          }
          style={{
            padding: "10px",
            borderRadius: "8px",
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
            padding: "10px 16px",
            borderRadius: "8px",
          }}
        >
          Scan Now
        </button>
      </div>

      <p>{status}</p>

      <div
        style={{
          display: "grid",
          gap: "12px",
        }}
      >
        {coins.map((coin) => (
          <div
            key={coin.pairAddress}
            style={{
              background: "#111823",
              border: "1px solid #263244",
              padding: "15px",
              borderRadius: "12px",
            }}
          >
            <h2
              style={{
                margin: "0 0 8px",
              }}
            >
              {coin.symbol}
            </h2>

            <div>
              Momentum:
              <strong>
                {" "}
                {coin.momentum}/100
              </strong>
            </div>

            <div>
              Risk:
              <strong>
                {" "}
                {coin.risk}/100
              </strong>
            </div>

            <div>
              5m Price:
              {" "}
              {coin.priceChange5m >= 0
                ? "+"
                : ""}
              {coin.priceChange5m.toFixed(
                1
              )}
              %
            </div>

            <div>
              5m Volume: $
              {Math.round(
                coin.volume5m
              ).toLocaleString()}
            </div>

            <div>
              Liquidity: $
              {Math.round(
                coin.liquidity
              ).toLocaleString()}
            </div>

            <div>
              Buys / Sells:
              {" "}
              {coin.buys} /{" "}
              {coin.sells}
            </div>

            <br />

            <a
              href={coin.url}
              target="_blank"
              style={{
                color: "#66aaff",
              }}
            >
              View Token
            </a>
          </div>
        ))}
      </div>

      <p
        style={{
          marginTop: "30px",
          color: "#777",
          fontSize: "12px",
        }}
      >
        Momentum scores are indicators,
        not guarantees of future price
        movement.
      </p>
    </main>
  );
}
