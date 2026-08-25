"use client";

import { useEffect, useMemo, useState } from "react";
import "./globals.css";

const STORAGE_KEY = "memecoin_scanner_history_v1";
const ALERT_THRESHOLD = 70;

const money = (n) => {
  const x = Number(n || 0);
  if (!x) return "—";
  if (x < 0.01) return "$" + x.toPrecision(3);
  return "$" + x.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const pct = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
};
const cls = (n) => Number(n) >= 0 ? "good" : "bad";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function Home() {
  const [chain, setChain] = useState("solana");
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [autoScan, setAutoScan] = useState(true);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  async function scan() {
    if (loading) return;
    setLoading(true);
    setStatus("Scanning live markets…");

    try {
      const res = await fetch(`/api/scan?chain=${encodeURIComponent(chain)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Scan failed");

      setRows(data.tokens || []);
      updateHistory(data.tokens || []);
      setStatus(`Updated ${new Date().toLocaleTimeString()} • ${data.tokens?.length || 0} tokens`);
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  function updateHistory(tokens) {
    const now = Date.now();
    let h = loadHistory();

    // Create alert records for new high-scoring tokens.
    for (const t of tokens) {
      if (t.momentumScore < ALERT_THRESHOLD || !t.priceUsd) continue;

      const recent = h.find(
        (a) =>
          a.chain === t.chain &&
          a.tokenAddress === t.tokenAddress &&
          now - a.alertedAt < 30 * 60 * 1000
      );

      if (!recent) {
        h.unshift({
          id: `${t.chain}:${t.tokenAddress}:${now}`,
          chain: t.chain,
          tokenAddress: t.tokenAddress,
          symbol: t.symbol,
          name: t.name,
          url: t.url,
          momentumScore: t.momentumScore,
          riskScore: t.riskScore,
          alertedAt: now,
          alertPrice: t.priceUsd,
          outcomes: {},
        });
      }
    }

    // Update +5/+15/+30/+60m outcome checkpoints.
    const targets = [5, 15, 30, 60];
    h = h.map((a) => {
      const current = tokens.find(
        (t) => t.chain === a.chain && t.tokenAddress === a.tokenAddress
      );
      if (!current?.priceUsd) return a;

      const ageMin = (now - a.alertedAt) / 60000;
      const outcomes = { ...(a.outcomes || {}) };

      for (const target of targets) {
        if (ageMin >= target && outcomes[target] === undefined) {
          outcomes[target] =
            ((current.priceUsd / a.alertPrice) - 1) * 100;
        }
      }
      return { ...a, outcomes };
    });

    h = h.slice(0, 120);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
    setHistory(h);
  }

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  useEffect(() => {
    if (!autoScan) return;
    const id = setInterval(scan, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan, chain, loading]);

  const stats = useMemo(() => {
    const high = rows.filter((r) => r.momentumScore >= ALERT_THRESHOLD).length;
    const avgRisk = rows.length
      ? Math.round(rows.reduce((a, r) => a + r.riskScore, 0) / rows.length)
      : 0;
    return { high, avgRisk };
  }, [rows]);

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }

  return (
    <main className="page">
      <div className="top">
        <div>
          <h1>⚡ Meme Coin Momentum Scanner</h1>
          <div className="sub">
            Live informational scanner • no wallet connection • no automatic trades
          </div>
        </div>

        <div className="controls">
          <select value={chain} onChange={(e) => setChain(e.target.value)}>
            <option value="solana">Solana</option>
            <option value="base">Base</option>
          </select>
          <button onClick={scan} disabled={loading}>
            {loading ? "Scanning…" : "Scan now"}
          </button>
          <button onClick={() => setAutoScan((x) => !x)}>
            Auto: {autoScan ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="sub">Tokens scanned</div>
          <div className="big">{rows.length}</div>
        </div>
        <div className="card">
          <div className="sub">70+ signals</div>
          <div className="big">{stats.high}</div>
        </div>
        <div className="card">
          <div className="sub">Average risk</div>
          <div className="big">{stats.avgRisk}</div>
        </div>
        <div className="card">
          <div className="sub">Saved alerts</div>
          <div className="big">{history.length}</div>
        </div>
      </div>

      <div className="panel">
        <div className="top">
          <h2>Live candidates</h2>
          <span className="badge">{status}</span>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Momentum</th>
                <th>Risk</th>
                <th>5m</th>
                <th>5m volume</th>
                <th>Buys/Sells</th>
                <th>Liquidity</th>
                <th>Community</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={`${t.chain}:${t.pairAddress}`}>
                  <td>
                    <a className="token" href={t.url} target="_blank" rel="noreferrer">
                      {t.symbol}
                    </a>
                    <div className="sub">{t.name}</div>
                  </td>
                  <td className={`score ${t.momentumScore >= 70 ? "good" : ""}`}>
                    {t.momentumScore}
                  </td>
                  <td className={t.riskScore >= 50 ? "bad" : t.riskScore >= 25 ? "warn" : ""}>
                    {t.riskScore}
                  </td>
                  <td className={cls(t.priceChangeM5)}>{pct(t.priceChangeM5)}</td>
                  <td>{money(t.volumeM5)}</td>
                  <td>{t.buysM5}/{t.sellsM5}</td>
                  <td>{money(t.liquidityUsd)}</td>
                  <td>{t.communityScore}/30</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty">No scan results yet.</div>}
        </div>
      </div>

      <div className="panel">
        <div className="top">
          <div>
            <h2>Signal history</h2>
            <div className="sub">
              Stored on this device. Returns are measured when a later scan sees the same token.
            </div>
          </div>
          <button onClick={clearHistory}>Clear history</button>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Score</th>
                <th>Risk</th>
                <th>+5m</th>
                <th>+15m</th>
                <th>+30m</th>
                <th>+60m</th>
              </tr>
            </thead>
            <tbody>
              {history.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a className="token" href={a.url} target="_blank" rel="noreferrer">
                      {a.symbol}
                    </a>
                    <div className="sub">
                      {new Date(a.alertedAt).toLocaleString()}
                    </div>
                  </td>
                  <td>{a.momentumScore}</td>
                  <td>{a.riskScore}</td>
                  {[5, 15, 30, 60].map((m) => (
                    <td
                      key={m}
                      className={
                        a.outcomes?.[m] === undefined ? "" : cls(a.outcomes[m])
                      }
                    >
                      {a.outcomes?.[m] === undefined ? "—" : pct(a.outcomes[m])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!history.length && (
            <div className="empty">
              Alerts scoring 70+ will appear here automatically.
            </div>
          )}
        </div>
      </div>

      <div className="note">
        Momentum is a heuristic, not a prediction. Very new or thinly traded tokens can move
        sharply in either direction. This version intentionally does not connect to a wallet or
        execute trades.
      </div>
    </main>
  );
}
