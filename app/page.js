"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const money = v => {
  const n = Number(v || 0);
  if (!n) return "—";
  if (n < 0.01) return "$" + n.toPrecision(3);
  return "$" + n.toLocaleString(undefined,{maximumFractionDigits:0});
};

const ratio = v => {
  const n = Number(v || 0);
  return n ? `${n.toFixed(2)}x` : "—";
};

const btn = {
  background:"#172033", border:"1px solid #334155", borderRadius:"10px",
  color:"white", padding:"10px 12px", textDecoration:"none",
  display:"inline-flex", alignItems:"center", gap:"6px"
};

const card = {
  background:"#111827", border:"1px solid #293548",
  borderRadius:"16px", padding:"16px"
};

function liveXUrl(coin) {
  const parts = [];
  const mint = String(coin?.mint || "").trim();
  const handle = String(coin?.searchHints?.twitterHandle || "").replace(/^@/,"");
  if (mint) parts.push(mint);
  if (handle) parts.push(`@${handle}`);
  const q = parts.length ? parts.join(" OR ") : mint || "pump.fun";
  return "https://x.com/search?q=" + encodeURIComponent(q) + "&src=typed_query&f=live";
}

export default function Home() {
  const [mode,setMode] = useState("qualified");
  const [launches,setLaunches] = useState([]);
  const [posts,setPosts] = useState([]);
  const [mentioned,setMentioned] = useState(new Set());
  const [status,setStatus] = useState("Starting...");
  const [socialStatus,setSocialStatus] = useState("Exact X check not run yet.");
  const [auto,setAuto] = useState(true);
  const [socialBusy,setSocialBusy] = useState(false);
  const latest = useRef([]);

  async function loadLaunches() {
    try {
      const r = await fetch("/api/scan",{cache:"no-store"});
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Scan failed");
      const rows = Array.isArray(data.launches) ? data.launches : [];
      latest.current = rows;
      setLaunches(rows);
      setStatus(`${data.provider || "RPC"} • ${new Date().toLocaleTimeString()}`);
    } catch(e) {
      setStatus(`Error: ${e.message}`);
    }
  }

  function coinsForX() {
    return latest.current
      .filter(x=>x.exactSocials && x.riskScreenPassed && x.moving)
      .sort((a,b)=>Number(b.movementScore||0)-Number(a.movementScore||0))
      .slice(0,5)
      .map(x=>({ mint:x.mint, twitterHandle:x.searchHints?.twitterHandle || "" }));
  }

  async function refreshX() {
    if (socialBusy) return;
    setSocialBusy(true);
    try {
      const r = await fetch("/api/social",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({coins:coinsForX()})
      });
      const data = await r.json();
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      setMentioned(new Set(data.mentionedMints || []));
      setSocialStatus(data.message || `Exact X updated ${new Date().toLocaleTimeString()}`);
    } catch(e) {
      setSocialStatus(`X feed error: ${e.message}`);
    } finally {
      setSocialBusy(false);
    }
  }

  async function copyCA(mint) {
    try {
      await navigator.clipboard.writeText(mint);
      setStatus("CA copied ✓ — open Fomo and paste it into search.");
    } catch {
      setStatus("Could not copy CA.");
    }
  }

  useEffect(()=>{ loadLaunches(); },[]);
  useEffect(()=>{
    if (!auto) return;
    const id = setInterval(loadLaunches,10000);
    return ()=>clearInterval(id);
  },[auto]);

  const socialMoving = useMemo(
    ()=>launches
      .filter(x=>x.exactSocials && x.riskScreenPassed && x.moving)
      .sort((a,b)=>Number(b.movementScore||0)-Number(a.movementScore||0)),
    [launches]
  );

  const qualified = useMemo(
    ()=>socialMoving.filter(x=>mentioned.has(x.mint)),
    [socialMoving,mentioned]
  );

  const visible = mode==="qualified" ? qualified : mode==="moving" ? socialMoving : launches;

  return (
    <main style={{
      minHeight:"100vh", background:"linear-gradient(180deg,#070a10,#0b1019)",
      color:"white", padding:"18px", fontFamily:"Arial,sans-serif"
    }}>
      <div style={{maxWidth:"980px",margin:"0 auto"}}>
        <h1>⚡ Exact Social Coin Scanner V13</h1>
        <p style={{color:"#94a3b8"}}>
          Exact Twitter + Telegram • real market movement • exact-contract X chatter
        </p>

        <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
          <select value={mode} onChange={e=>setMode(e.target.value)} style={btn}>
            <option value="qualified">✅ Social + Moving + X Confirmed</option>
            <option value="moving">📈 Social + Moving</option>
            <option value="all">🚨 All Detected</option>
          </select>

          <button onClick={loadLaunches} style={btn}>Refresh Coins</button>
          <button onClick={refreshX} disabled={socialBusy} style={{...btn,opacity:socialBusy?0.6:1}}>
            {socialBusy ? "Checking X..." : "Confirm Exact X"}
          </button>
          <button onClick={()=>setAuto(!auto)} style={btn}>Auto {auto ? "ON" : "OFF"}</button>
        </div>

        <p style={{color:"#94a3b8"}}>{status}</p>
        <p style={{color:"#64748b",fontSize:"13px"}}>{socialStatus}</p>

        <div style={{display:"grid",gap:"12px"}}>
          {visible.map(coin=>{
            const s = coin.socials || {};
            return (
              <div key={`${coin.mint}:${coin.detectedAt}`} style={card}>
                <div style={{display:"flex",justifyContent:"space-between",gap:"10px",flexWrap:"wrap"}}>
                  <div>
                    <h2 style={{margin:0}}>
                      {coin.symbol && coin.symbol!=="?" ? `$${coin.symbol}` : "New launch"}
                    </h2>
                    <div style={{color:"#94a3b8"}}>{coin.name || "Pump.fun token"}</div>
                  </div>
                  <strong>📈 {coin.movementScore || 0}/100</strong>
                </div>

                <p>Liquidity: {money(coin.liquidity)} • 5m Volume: {money(coin.volume5m)}</p>
                <p>Trades: {coin.trades5m || 0} • Buys / Sells: {coin.buys5m || 0} / {coin.sells5m || 0}</p>
                <p>Buy pressure: {ratio(coin.buyRatio)} • Risk: {coin.riskScore ?? "—"}/100</p>

                {!!coin.riskFlags?.length && (
                  <p style={{color:"#fbbf24"}}>⚠️ {coin.riskFlags.join(" • ")}</p>
                )}

                <p style={{color:"#64748b",fontSize:"12px",overflowWrap:"anywhere"}}>{coin.mint}</p>

                <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
                  <button onClick={()=>copyCA(coin.mint)} style={btn}>📋 Copy CA</button>
                  <a href={coin.fomoUrl} target="_blank" rel="noreferrer" style={btn}>📱 Open Fomo</a>
                  <a href={liveXUrl(coin)} target="_blank" rel="noreferrer" style={btn}>🔎 Live X Search</a>
                  {s.twitter && <a href={s.twitter} target="_blank" rel="noreferrer" style={btn}>𝕏 Exact Twitter</a>}
                  {s.telegram && <a href={s.telegram} target="_blank" rel="noreferrer" style={btn}>✈️ Exact Telegram</a>}
                </div>
              </div>
            );
          })}

          {!visible.length && (
            <div style={card}>
              <span style={{color:"#94a3b8"}}>No coins meet all of these filters yet.</span>
            </div>
          )}
        </div>

        <section style={{marginTop:"28px"}}>
          <h2>✓ Verified crypto X posts for exact contracts</h2>
          <p style={{color:"#94a3b8"}}>
            Only verified crypto-profile posts matching the exact mint/contract or exact official X handle count.
          </p>

          <div style={{display:"grid",gap:"10px"}}>
            {posts.map(post=>(
              <a key={post.id} href={post.url} target="_blank" rel="noreferrer"
                 style={{...card,color:"white",textDecoration:"none"}}>
                <strong>✓ {post.displayName || post.username || "Verified crypto account"}</strong>
                {post.username && (
                  <div style={{color:"#94a3b8",fontSize:"13px"}}>
                    @{post.username} • {post.followers.toLocaleString()} followers • {post.conversationType}
                  </div>
                )}
                <p>{post.text}</p>
              </a>
            ))}

            {!posts.length && (
              <div style={card}>
                <span style={{color:"#94a3b8"}}>No exact verified crypto X matches returned yet.</span>
              </div>
            )}
          </div>
        </section>

        <p style={{color:"#64748b",fontSize:"12px",lineHeight:1.5,marginTop:"26px"}}>
          Fomo holder count still has to be checked manually because this integration has no authorized Fomo holder-count API.
        </p>
      </div>
    </main>
  );
}
