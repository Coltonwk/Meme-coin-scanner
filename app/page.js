"use client";

import { useEffect, useMemo, useState } from "react";

const money = value => {
  const n = Number(value || 0);
  if (!n) return "—";
  if (n < 0.01) return "$" + n.toPrecision(3);
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const when = iso => {
  const ms = Date.now() - Date.parse(iso || "");
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  return new Date(iso).toLocaleTimeString();
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
  const [mode, setMode] = useState("social");
  const [launches, setLaunches] = useState([]);
  const [coinPosts, setCoinPosts] = useState([]);
  const [generalPosts, setGeneralPosts] = useState([]);
  const [mentioned, setMentioned] = useState(new Set());
  const [status, setStatus] = useState("Starting...");
  const [socialMessage, setSocialMessage] = useState("");
  const [auto, setAuto] = useState(true);

  async function loadLaunches() {
    try {
      const r = await fetch("/api/scan", { cache: "no-store" });
      const data = await r.json();

      if (!r.ok) throw new Error(data.error || "Scan failed");

      const rows = Array.isArray(data.launches) ? data.launches : [];
      setLaunches(rows);
      setStatus(`${data.provider || "RPC"} • ${new Date().toLocaleTimeString()}`);

      await loadCoinSocial(rows);
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  }

  async function loadCoinSocial(rows) {
    const coins = rows
      .filter(x => x.marketReady)
      .slice(0, 8)
      .map(x => ({
        mint: x.mint,
        symbol: x.symbol,
        name: x.name,
        twitterHandle: x.searchHints?.twitterHandle || "",
        phrases: x.searchHints?.phrases || []
      }));

    if (!coins.length) {
      setCoinPosts([]);
      setMentioned(new Set());
      setSocialMessage("Waiting for token metadata/search terms.");
      return;
    }

    const r = await fetch("/api/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ mode: "coins", coins })
    });

    const data = await r.json();

    setCoinPosts(Array.isArray(data.posts) ? data.posts : []);
    setMentioned(new Set(data.mentionedMints || []));
    setSocialMessage(data.message || "");
  }

  async function loadGeneral() {
    const r = await fetch("/api/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ mode: "general" })
    });

    const data = await r.json();

    setGeneralPosts(Array.isArray(data.posts) ? data.posts : []);
    if (data.message) setSocialMessage(data.message);
  }

  async function refreshAll() {
    await loadLaunches();
    await loadGeneral();
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (!auto) return;

    const id1 = setInterval(loadLaunches, 10000);
    const id2 = setInterval(loadGeneral, 30000);

    return () => {
      clearInterval(id1);
      clearInterval(id2);
    };
  }, [auto]);

  const twitterCoins = useMemo(
    () => launches.filter(x => x?.socials?.twitter),
    [launches]
  );

  const socialCoins = useMemo(
    () => twitterCoins.filter(x => mentioned.has(x.mint)),
    [twitterCoins, mentioned]
  );

  const visible =
    mode === "social"
      ? socialCoins
      : mode === "twitter"
      ? twitterCoins
      : launches;

  function Feed({ posts, empty }) {
    if (!posts.length) {
      return (
        <div style={card}>
          <span style={{ color: "#94a3b8" }}>
            {socialMessage || empty}
          </span>
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gap: "10px" }}>
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
            <strong>{post.displayName || post.username || "X user"}</strong>

            {post.username && (
              <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                @{post.username}
                {post.followers ? ` • ${post.followers.toLocaleString()} followers` : ""}
              </div>
            )}

            <p>{post.text}</p>

            <small style={{ color: "#64748b" }}>
              {when(post.createdAt)} • ♥ {post.likes || 0} • ↻ {post.reposts || 0} • 💬 {post.replies || 0}
            </small>
          </a>
        ))}
      </div>
    );
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg,#070a10,#0b1019)",
      color: "white",
      padding: "18px",
      fontFamily: "Arial,sans-serif"
    }}>
      <div style={{ maxWidth: "980px", margin: "0 auto" }}>
        <h1>⚡ Meme Coin Social Pulse V8</h1>

        <p style={{ color: "#94a3b8" }}>
          Pump.fun launches • metadata • market activity • deep X search
        </p>

        <div style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap"
        }}>
          <select value={mode} onChange={e => setMode(e.target.value)} style={btn}>
            <option value="social">🗣 X Active Coins</option>
            <option value="twitter">𝕏 Has Twitter</option>
            <option value="all">🚨 All Detected</option>
          </select>

          <button onClick={refreshAll} style={btn}>Refresh</button>
          <button onClick={() => setAuto(!auto)} style={btn}>Auto {auto ? "ON" : "OFF"}</button>
        </div>

        <p style={{ color: "#94a3b8" }}>{status}</p>

        <div style={{ display: "grid", gap: "12px" }}>
          {visible.map(coin => {
            const socials = coin.socials || {};
            const active = mentioned.has(coin.mint);

            return (
              <div key={`${coin.mint}:${coin.detectedAt}`} style={card}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  flexWrap: "wrap"
                }}>
                  <div>
                    <h2 style={{ margin: 0 }}>
                      {coin.symbol && coin.symbol !== "?"
                        ? `$${coin.symbol}`
                        : "New launch"}
                    </h2>

                    <div style={{ color: "#94a3b8" }}>
                      {coin.name || "Pump.fun token"}
                    </div>
                  </div>

                  <strong style={{ color: active ? "#c4b5fd" : "#94a3b8" }}>
                    {active
                      ? "🗣 X Active"
                      : socials.twitter
                      ? "𝕏 Linked"
                      : coin.marketReady
                      ? "Market ready"
                      : "⏳ Waiting"}
                  </strong>
                </div>

                <p>Early Activity Score: <strong>{coin.activityScore || 0}/100</strong></p>
                <p>Liquidity: {money(coin.liquidity)} • 5m Volume: {money(coin.volume5m)}</p>
                <p>Buys / Sells: {coin.buys5m || 0} / {coin.sells5m || 0}</p>

                {coin.searchHints?.phrases?.length > 0 && (
                  <details>
                    <summary style={{ color: "#94a3b8" }}>Search phrases</summary>
                    <p style={{
                      color: "#64748b",
                      fontSize: "12px",
                      lineHeight: 1.5
                    }}>
                      {coin.searchHints.phrases.join(" • ")}
                    </p>
                  </details>
                )}

                <p style={{
                  color: "#64748b",
                  fontSize: "12px",
                  overflowWrap: "anywhere"
                }}>
                  {coin.mint}
                </p>

                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px"
                }}>
                  <a href={coin.fomoUrl} target="_blank" rel="noreferrer" style={btn}>🚀 Fomo</a>
                  {socials.twitter && <a href={socials.twitter} target="_blank" rel="noreferrer" style={btn}>𝕏 Twitter</a>}
                  {socials.telegram && <a href={socials.telegram} target="_blank" rel="noreferrer" style={btn}>✈️ Telegram</a>}
                  {socials.website && <a href={socials.website} target="_blank" rel="noreferrer" style={btn}>🌐 Website</a>}
                </div>
              </div>
            );
          })}

          {!visible.length && (
            <div style={card}>
              <span style={{ color: "#94a3b8" }}>
                No coins match this view yet.
              </span>
            </div>
          )}
        </div>

        <section style={{ marginTop: "28px" }}>
          <h2>🧵 Live X posts about detected coins</h2>
          <Feed posts={coinPosts} empty="No recent matching X posts found yet." />
        </section>

        <section style={{ marginTop: "28px" }}>
          <h2>🌐 Broader meme-coin X feed</h2>
          <p style={{ color: "#94a3b8" }}>
            Searches pump.fun, new launches, CA/contract-address posts, CTO/community takeovers, Solana meme coins, ticker chatter, token names, symbols, mint addresses, and official X handles.
          </p>
          <Feed posts={generalPosts} empty="No broader meme-coin posts found yet." />
        </section>

        <p style={{
          color: "#64748b",
          fontSize: "12px",
          lineHeight: 1.5,
          marginTop: "26px"
        }}>
          Social chatter can be spammed or manipulated. Use it as research context, not proof a token is safe or likely to rise.
        </p>
      </div>
    </main>
  );
}
