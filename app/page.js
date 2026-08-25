"use client";

import { useEffect, useMemo, useState } from "react";

const HISTORY_KEY = "meme_scanner_history_final_v1";
const WATCHLIST_KEY = "meme_scanner_watchlist_final_v1";

const money = v => {
  const n = Number(v || 0);
  if (!n) return "—";
  if (n < 0.01) return "$" + n.toPrecision(3);
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const pct = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
};

const scoreColor = s => s >= 75 ? "#4ade80" : s >= 55 ? "#facc15" : "#94a3b8";
const riskColor = s => s >= 60 ? "#f87171" : s >= 30 ? "#facc15" : "#4ade80";

function loadLocal(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [chain, setChain] = useState("solana");
  const [mode, setMode] = useState("fresh");
  const [tab, setTab] = useState("scanner");

  const [status, setStatus] = useState("Starting scanner...");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [maxAge, setMaxAge] = useState(60);
  const [minScore, setMinScore] = useState(0);
  const [minLiquidity, setMinLiquidity] = useState(0);

  const [watchlist, setWatchlist] = useState([]);
  const [history, setHistory] = useState([]);

  const [social, setSocial] = useState({
    loading: false,
    updatedAt: null,
    x: { enabled: false, posts: [], message: "Not loaded yet." },
    instagram: { enabled: false, message: "" },
    tiktok: { enabled: false, message: "" },
  });

  useEffect(() => {
    setWatchlist(loadLocal(WATCHLIST_KEY, []));
    setHistory(loadLocal(HISTORY_KEY, []));
  }, []);

  function saveHistory(tokens) {
    const now = Date.now();
    let h = loadLocal(HISTORY_KEY, []);

    for (const c of tokens) {
      if (c.score < 65 || !c.priceUsd) continue;

      const recent = h.find(
        x =>
          x.chain === c.chain &&
          x.tokenAddress === c.tokenAddress &&
          now - x.createdAt < 30 * 60 * 1000
      );

      if (!recent) {
        h.unshift({
          id: `${c.chain}:${c.tokenAddress}:${now}`,
          chain: c.chain,
          tokenAddress: c.tokenAddress,
          symbol: c.symbol,
          name: c.name,
          url: c.url,
          score: c.score,
          risk: c.risk,
          mode,
          alertPrice: c.priceUsd,
          createdAt: now,
          outcomes: {},
        });
      }
    }

    const targets = [5, 15, 30, 60];

    h = h.map(item => {
      const live = tokens.find(
        c =>
          c.chain === item.chain &&
          c.tokenAddress === item.tokenAddress
      );

      if (!live?.priceUsd) return item;

      const ageMin = (now - item.createdAt) / 60000;
      const outcomes = { ...(item.outcomes || {}) };

      for (const target of targets) {
        if (ageMin >= target && outcomes[target] === undefined) {
          outcomes[target] = ((live.priceUsd / item.alertPrice) - 1) * 100;
        }
      }

      return { ...item, outcomes };
    });

    h = h.slice(0, 100);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    setHistory(h);
  }

  async function scan() {
    if (loading) return;

    setLoading(true);
    setStatus(mode === "fresh" ? "Checking fresh listings..." : "Checking momentum...");

    try {
      const r = await fetch(`/api/scan?chain=${chain}&mode=${mode}`, {
        cache: "no-store",
      });
      const data = await r.json();

      if (!r.ok) throw new Error(data.error || "Scanner failed");

      const next = data.tokens || [];
      setCoins(next);
      saveHistory(next);

      setStatus(
        `${data.birdeyeEnabled ? "Birdeye + DEX" : "DEX fallback"} • updated ${new Date().toLocaleTimeString()}`
      );
    } catch (e) {
      setStatus("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSocial() {
    const top = coins.slice(0, 5);

    if (!top.length) {
      setSocial(s => ({
        ...s,
        x: { ...s.x, message: "Scan some coins first." },
      }));
      return;
    }

    setSocial(s => ({ ...s, loading: true }));

    try {
      const symbols = top.map(c => c.symbol).join(",");
      const addresses = top.map(c => c.tokenAddress).join(",");

      const r = await fetch(
        `/api/scan?action=social&symbols=${encodeURIComponent(symbols)}&addresses=${encodeURIComponent(addresses)}`,
        { cache: "no-store" }
      );

      const data = await r.json();

      if (!r.ok) throw new Error(data.error || "Social feed failed");

      setSocial({
        loading: false,
        updatedAt: Date.now(),
        x: data.x,
        instagram: data.instagram,
        tiktok: data.tiktok,
      });
    } catch (e) {
      setSocial(s => ({
        ...s,
        loading: false,
        x: { ...s.x, message: "Error: " + e.message },
      }));
    }
  }

  async function copyContract(address) {
    try {
      await navigator.clipboard.writeText(address);
      setStatus("Contract copied ✓");
    } catch {
      setStatus("Could not copy contract");
    }
  }

  function toggleWatch(c) {
    const exists = watchlist.some(
      x => x.chain === c.chain && x.tokenAddress === c.tokenAddress
    );

    const updated = exists
      ? watchlist.filter(
          x => !(x.chain === c.chain && x.tokenAddress === c.tokenAddress)
        )
      : [
          ...watchlist,
          {
            chain: c.chain,
            tokenAddress: c.tokenAddress,
            symbol: c.symbol,
            name: c.name,
            url: c.url,
          },
        ];

    setWatchlist(updated);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
  }

  useEffect(() => {
    scan();
  }, [chain, mode]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(scan, mode === "fresh" ? 15000 : 20000);
    return () => clearInterval(id);
  }, [autoRefresh, chain, mode, loading]);

  useEffect(() => {
    if (tab !== "social" || !autoRefresh) return;
    refreshSocial();
    const id = setInterval(refreshSocial, 60000);
    return () => clearInterval(id);
  }, [tab, autoRefresh, coins]);

  const filtered = useMemo(
    () =>
      coins.filter(c => {
        const ageOK =
          mode !== "fresh" ||
          c.ageMinutes == null ||
          c.ageMinutes <= maxAge;

        return (
          ageOK &&
          c.score >= minScore &&
          c.liquidity >= minLiquidity
        );
      }),
    [coins, mode, maxAge, minScore, minLiquidity]
  );

  const card = {
    background: "#111827",
    border: "1px solid #243244",
    padding: "15px",
    borderRadius: "14px",
  };

  const button = {
    padding: "10px 12px",
    borderRadius: "9px",
    border: "1px solid #334155",
    background: "#172033",
    color: "white",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg,#070a10,#0b1019)",
        color: "white",
        fontFamily: "Arial,sans-serif",
        padding: "18px",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: "4px" }}>⚡ Meme Coin Intelligence</h1>
        <p style={{ color: "#94a3b8", marginTop: 0 }}>
          Fresh launches • momentum • social buzz
        </p>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          <button style={button} onClick={() => setTab("scanner")}>
            📊 Scanner
          </button>
          <button style={button} onClick={() => setTab("social")}>
            📣 Social Buzz
          </button>
          <button style={button} onClick={() => setTab("history")}>
            🕒 History
          </button>
        </div>

        {tab === "scanner" && (
          <>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <select value={chain} onChange={e => setChain(e.target.value)} style={button}>
                <option value="solana">Solana</option>
                <option value="base">Base</option>
              </select>

              <select value={mode} onChange={e => setMode(e.target.value)} style={button}>
                <option value="fresh">⚡ Fresh Launch</option>
                <option value="momentum">🔥 Momentum</option>
              </select>

              <button onClick={scan} style={button}>
                {loading ? "Scanning..." : "Scan Now"}
              </button>

              <button onClick={() => setAutoRefresh(!autoRefresh)} style={button}>
                Auto {autoRefresh ? "ON" : "OFF"}
              </button>
            </div>

            <p>{status}</p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: mode === "fresh" ? "1fr 1fr 1fr" : "1fr 1fr",
                gap: "8px",
                marginBottom: "16px",
              }}
            >
              {mode === "fresh" && (
                <select value={maxAge} onChange={e => setMaxAge(Number(e.target.value))}>
                  <option value="5">≤5 min old</option>
                  <option value="10">≤10 min old</option>
                  <option value="20">≤20 min old</option>
                  <option value="60">≤1 hr old</option>
                </select>
              )}

              <select value={minScore} onChange={e => setMinScore(Number(e.target.value))}>
                <option value="0">Any score</option>
                <option value="40">Score 40+</option>
                <option value="55">Score 55+</option>
                <option value="70">Score 70+</option>
              </select>

              <select
                value={minLiquidity}
                onChange={e => setMinLiquidity(Number(e.target.value))}
              >
                <option value="0">Any liquidity</option>
                <option value="10000">$10k+</option>
                <option value="25000">$25k+</option>
                <option value="50000">$50k+</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              {filtered.map(c => {
                const watching = watchlist.some(
                  x => x.chain === c.chain && x.tokenAddress === c.tokenAddress
                );

                const fomo =
                  c.chain === "solana"
                    ? `https://fomo.family/coin?address=${c.tokenAddress}&chainId=1399811149`
                    : c.url;

                return (
                  <div key={c.pairAddress || c.tokenAddress} style={card}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "10px",
                      }}
                    >
                      <div>
                        <h2 style={{ margin: 0 }}>{c.symbol}</h2>
                        <div style={{ color: "#94a3b8" }}>{c.name}</div>
                      </div>
                      <button onClick={() => toggleWatch(c)} style={button}>
                        {watching ? "★ Watching" : "☆ Watch"}
                      </button>
                    </div>

                    {c.ageMinutes != null && (
                      <p>
                        Age:{" "}
                        <strong>
                          {c.ageMinutes < 60
                            ? `${c.ageMinutes.toFixed(1)} min`
                            : `${(c.ageMinutes / 60).toFixed(1)} hr`}
                        </strong>
                      </p>
                    )}

                    <p>
                      {mode === "fresh" ? "Early Score" : "Momentum"}:{" "}
                      <strong style={{ color: scoreColor(c.score) }}>
                        {c.score}/100
                      </strong>
                    </p>

                    <p>
                      Risk:{" "}
                      <strong style={{ color: riskColor(c.risk) }}>
                        {c.risk}/100
                      </strong>
                    </p>

                    <p>5m Price: {pct(c.priceChange5m)}</p>
                    <p>5m Volume: {money(c.volume5m)}</p>
                    <p>Liquidity: {money(c.liquidity)}</p>
                    <p>Buys / Sells: {c.buys} / {c.sells}</p>

                    {!!c.signals?.length && (
                      <p style={{ color: "#facc15" }}>
                        ⚡ {c.signals.join(" • ")}
                      </p>
                    )}

                    {!!c.riskFlags?.length && (
                      <p style={{ color: "#f87171", fontSize: "13px" }}>
                        Risk flags: {c.riskFlags.join(" • ")}
                      </p>
                    )}

                    {!!c.socials?.length && (
                      <p style={{ fontSize: "13px", color: "#94a3b8" }}>
                        Social links:{" "}
                        {c.socials.map((s, i) => (
                          <span key={s.url}>
                            {i ? " • " : ""}
                            <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
                              {s.type || "social"}
                            </a>
                          </span>
                        ))}
                      </p>
                    )}

                    <p style={{ fontSize: "12px", color: "#64748b" }}>
                      Found via {c.discoverySource}
                    </p>

                    <button
                      onClick={() => copyContract(c.tokenAddress)}
                      style={{ ...button, marginRight: "10px" }}
                    >
                      📋 Copy Contract
                    </button>

                    <a
                      href={fomo}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#60a5fa" }}
                    >
                      Open in Fomo →
                    </a>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "social" && (
          <>
            <div style={card}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 style={{ marginTop: 0 }}>📣 Social Buzz</h2>
                  <p style={{ color: "#94a3b8" }}>
                    Searches recent X posts for the top coins from your current scan.
                  </p>
                </div>

                <button onClick={refreshSocial} style={button}>
                  {social.loading ? "Refreshing..." : "Refresh Social"}
                </button>
              </div>

              <p style={{ color: "#94a3b8", fontSize: "13px" }}>
                {social.updatedAt
                  ? `Updated ${new Date(social.updatedAt).toLocaleTimeString()}`
                  : "Not updated yet"}
              </p>
            </div>

            <div style={{ ...card, marginTop: "12px" }}>
              <h3>𝕏 X / Twitter</h3>

              {!social.x.enabled && (
                <p style={{ color: "#facc15" }}>{social.x.message}</p>
              )}

              {social.x.enabled && social.x.message && (
                <p style={{ color: "#94a3b8" }}>{social.x.message}</p>
              )}

              <div style={{ display: "grid", gap: "10px" }}>
                {(social.x.posts || []).map(p => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      ...card,
                      display: "block",
                      textDecoration: "none",
                      color: "white",
                    }}
                  >
                    <strong>
                      {p.username ? `@${p.username}` : p.displayName || "X user"}
                    </strong>

                    {p.followers > 0 && (
                      <span style={{ color: "#94a3b8", marginLeft: "8px", fontSize: "12px" }}>
                        {p.followers.toLocaleString()} followers
                      </span>
                    )}

                    <p>{p.excerpt}</p>

                    <div style={{ color: "#94a3b8", fontSize: "12px" }}>
                      ❤️ {p.likes} • 🔁 {p.reposts} • 💬 {p.replies}
                      {p.createdAt ? ` • ${new Date(p.createdAt).toLocaleString()}` : ""}
                    </div>
                  </a>
                ))}
              </div>
            </div>

            <div style={{ ...card, marginTop: "12px" }}>
              <h3>Instagram</h3>
              <p style={{ color: "#94a3b8" }}>
                {social.instagram.message ||
                  "Not connected. Broad live public-post search requires separate Meta-approved access."}
              </p>
            </div>

            <div style={{ ...card, marginTop: "12px" }}>
              <h3>TikTok</h3>
              <p style={{ color: "#94a3b8" }}>
                {social.tiktok.message ||
                  "Not connected. Broad live public-content search requires separate approved TikTok API access."}
              </p>
            </div>
          </>
        )}

        {tab === "history" && (
          <div style={card}>
            <h2>🕒 Signal History</h2>

            {!history.length && (
              <p style={{ color: "#94a3b8" }}>Signals scoring 65+ will appear here.</p>
            )}

            {history.slice(0, 30).map(h => (
              <div
                key={h.id}
                style={{
                  borderTop: "1px solid #243244",
                  padding: "10px 0",
                }}
              >
                <strong>{h.symbol}</strong>
                <div style={{ color: "#94a3b8", fontSize: "12px" }}>
                  {h.mode} • score {h.score} • risk {h.risk}
                </div>
                <div style={{ marginTop: "4px", fontSize: "13px" }}>
                  +5m {h.outcomes?.[5] === undefined ? "—" : pct(h.outcomes[5])}
                  {" | "}
                  +15m {h.outcomes?.[15] === undefined ? "—" : pct(h.outcomes[15])}
                  {" | "}
                  +30m {h.outcomes?.[30] === undefined ? "—" : pct(h.outcomes[30])}
                  {" | "}
                  +60m {h.outcomes?.[60] === undefined ? "—" : pct(h.outcomes[60])}
                </div>
              </div>
            ))}
          </div>
        )}

        <p
          style={{
            marginTop: "25px",
            color: "#64748b",
            fontSize: "12px",
            lineHeight: "1.5",
          }}
        >
          Market and social signals show activity, not guaranteed future price movement.
          New meme coins can be extremely volatile.
        </p>
      </div>
    </main>
  );
}
