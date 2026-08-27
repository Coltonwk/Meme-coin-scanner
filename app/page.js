"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const [mode, setMode] = useState("all");
  const [launches, setLaunches] = useState([]);
  const [coinPosts, setCoinPosts] = useState([]);
  const [generalPosts, setGeneralPosts] = useState([]);
  const [mentioned, setMentioned] = useState(new Set());

  const [status, setStatus] = useState("Starting...");
  const [socialStatus, setSocialStatus] = useState("Tap Refresh X when you want a social update.");
  const [auto, setAuto] = useState(true);
  const [socialBusy, setSocialBusy] = useState(false);
  const [lastSocialCheck, setLastSocialCheck] = useState(0);

  const latestLaunches = useRef([]);

  async function loadLaunches() {
    try {
      const r = await fetch("/api/scan", { cache: "no-store" });
      const data = await r.json();

      if (!r.ok) throw new Error(data.error || "Scan failed");

      const rows = Array.isArray(data.launches) ? data.launches : [];
      latestLaunches.current = rows;
      setLaunches(rows);
      setStatus(`${data.provider || "RPC"} • ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  }

  function socialCoins(rows = latestLaunches.current) {
    return rows
      .filter(x => x.marketReady)
      .sort((a, b) => {
        const ax = a?.socials?.twitter ? 1 : 0;
        const bx = b?.socials?.twitter ? 1 : 0;
        if (bx !== ax) return bx - ax;
        return Number(b.activityScore || 0) - Number(a.activityScore || 0);
      })
      .slice(0, 4)
      .map(x => ({
        mint: x.mint,
        symbol: x.symbol,
        name: x.name,
        twitterHandle: x.searchHints?.twitterHandle || "",
        activityScore: x.activityScore || 0
      }));
  }

  async function refreshX(force = false) {
    if (socialBusy) return;

    if (!force && lastSocialCheck && Date.now() - lastSocialCheck < 60 * 60 * 1000) {
      return;
    }

    setSocialBusy(true);

    try {
      const coins = socialCoins();

      const [coinRes, generalRes] = await Promise.all([
        fetch("/api/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ mode: "coins", coins })
        }),
        fetch("/api/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ mode: "general" })
        })
      ]);

      const coinData = await coinRes.json();
      const generalData = await generalRes.json();

      setCoinPosts(Array.isArray(coinData.posts) ? coinData.posts : []);
      setGeneralPosts(Array.isArray(generalData.posts) ? generalData.posts : []);
      setMentioned(new Set(coinData.mentionedMints || []));

      const messages = [coinData.message, generalData.message].filter(Boolean);

      setSocialStatus(
        messages.length
          ? messages.join(" • ")
          : `X updated ${new Date().toLocaleTimeString()}${coinData.cached || generalData.cached ? " • cached where possible" : ""}`
      );

      setLastSocialCheck(Date.now());
    } catch (e) {
      setSocialStatus(`X feed error: ${e.message}`);
    } finally {
      setSocialBusy(false);
    }
  }

  useEffect(() => {
    loadLaunches();
  }, []);

  useEffect(() => {
    if (!auto) return;

    const launchId = setInterval(loadLaunches, 10000);
    const socialId = setInterval(() => refreshX(false), 60 * 60 * 1000);

    return () => {
      clearInterval(launchId);
      clearInterval(socialId);
    };
  }, [auto, lastSocialCheck]);

  const twitterCoins = useMemo(
    () => launches.filter(x => x?.socials?.twitter),
    [launches]
  );

  const xActiveCoins = useMemo(
    () => twitterCoins.filter(x => mentioned.has(x.mint)),
    [twitterCoins, mentioned]
  );

  const visible =
    mode === "social"
      ? xActiveCoins
      : mode === "twitter"
      ? twitterCoins
      : launches;

  function Feed({ posts, empty }) {
    if (!posts.length) {
      return (
        <div style={card}>
          <span style={{ color: "#94a3b8" }}>{empty}</span>
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
            style={{ ...card, color: "white", textDecoration: "none" }}
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
        <h1>⚡ Meme Coin Social Pulse V9</h1>

        <p style={{ color: "#94a3b8" }}>
          Fast launch scanning • cached X lookups to reduce paid API usage
        </p>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <select value={mode} onChange={e => setMode(e.target.value)} style={btn}>
            <option value="all">🚨 All Detected</option>
            <option value="twitter">𝕏 Has Twitter</option>
            <option value="social">🗣 X Active Coins</option>
          </select>

          <button onClick={loadLaunches} style={btn}>Refresh Coins</button>

          <button
            onClick={() => refreshX(true)}
            disabled={socialBusy}
            style={{ ...btn, opacity: socialBusy ? 0.6 : 1 }}
          >
            {socialBusy ? "Checking X..." : "Refresh X"}
          </button>

          <button onClick={() => setAuto(!auto)} style={btn}>
            Auto {auto ? "ON" : "OFF"}
          </button>
        </div>

        <p style={{ color: "#94a3b8" }}>{status}</p>
        <p style={{ color: "#64748b", fontSize: "13px" }}>{socialStatus}</p>

        <div style={{ display: "grid", gap: "12px" }}>
          {visible.map(coin => {
            const socials = coin.socials || {};
            const active = mentioned.has(coin.mint);

            return (
              <div key={`${coin.mint}:${coin.detectedAt}`} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ margin: 0 }}>
                      {coin.symbol && coin.symbol !== "?" ? `$${coin.symbol}` : "New launch"}
                    </h2>
                    <div style={{ color: "#94a3b8" }}>{coin.name || "Pump.fun token"}</div>
                  </div>

                  <strong style={{ color: active ? "#c4b5fd" : "#94a3b8" }}>
                    {active ? "🗣 X Active" : socials.twitter ? "𝕏 Linked" : coin.marketReady ? "Market ready" : "⏳ Waiting"}
                  </strong>
                </div>

                <p>
                  Score: <strong>{coin.activityScore || 0}/100</strong>
                  {" • "}
                  Liquidity: {money(coin.liquidity)}
                </p>

                <p>
                  5m Volume: {money(coin.volume5m)}
                  {" • "}
                  Buys / Sells: {coin.buys5m || 0} / {coin.sells5m || 0}
                </p>

                <p style={{ color: "#64748b", fontSize: "12px", overflowWrap: "anywhere" }}>
                  {coin.mint}
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <a href={coin.fomoUrl} target="_blank" rel="noreferrer" style={btn}>🚀 Fomo</a>

                  {socials.twitter && (
                    <a href={socials.twitter} target="_blank" rel="noreferrer" style={btn}>𝕏 Twitter</a>
                  )}

                  {socials.telegram && (
                    <a href={socials.telegram} target="_blank" rel="noreferrer" style={btn}>✈️ Telegram</a>
                  )}

                  {socials.website && (
                    <a href={socials.website} target="_blank" rel="noreferrer" style={btn}>🌐 Website</a>
                  )}
                </div>
              </div>
            );
          })}

          {!visible.length && (
            <div style={card}>
              <span style={{ color: "#94a3b8" }}>No coins match this view yet.</span>
            </div>
          )}
        </div>

        <section style={{ marginTop: "28px" }}>
          <h2>🧵 X posts about detected coins</h2>
          <Feed posts={coinPosts} empty="Tap Refresh X when you want a fresh social check." />
        </section>

        <section style={{ marginTop: "28px" }}>
          <h2>🌐 Broader meme-coin X feed</h2>
          <Feed posts={generalPosts} empty="The broader X feed updates much less often to reduce usage." />
        </section>

        <p style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.5, marginTop: "26px" }}>
          X searches are intentionally limited and cached. Social chatter can be manipulated, so use it only as research context.
        </p>
      </div>
    </main>
  );
}
