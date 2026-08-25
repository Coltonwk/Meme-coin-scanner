"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [chain, setChain] = useState("solana");
  const [status, setStatus] = useState("Starting fresh-launch scanner...");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [maxAge, setMaxAge] = useState(60);
  const [minScore, setMinScore] = useState(0);
  const [minLiquidity, setMinLiquidity] = useState(0);

  async function scan() {
    if (loading) return;
    setLoading(true);
    setStatus("Checking newly listed tokens...");

    try {
      const r = await fetch(`/api/scan?chain=${chain}`, { cache: "no-store" });
      const data = await r.json();

      if (!r.ok) throw new Error(data.error || "Scanner failed");

      setCoins(data.tokens || []);
      setStatus(
        `${data.birdeyeEnabled ? "Birdeye + DEX" : "DEX fallback"} • updated ${new Date().toLocaleTimeString()}`
      );
    } catch (e) {
      setStatus("Error: " + e.message);
    } finally {
      setLoading(false);
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

  useEffect(() => {
    scan();
  }, [chain]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(scan, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, chain, loading]);

  const filtered = useMemo(() =>
    coins.filter(c => {
      const ageOK = c.ageMinutes == null || c.ageMinutes <= maxAge;
      return ageOK && c.earlyScore >= minScore && c.liquidity >= minLiquidity;
    }),
    [coins, maxAge, minScore, minLiquidity]
  );

  return (
    <main style={{
      minHeight:"100vh",
      background:"linear-gradient(180deg,#070a10,#0b1019)",
      color:"white",
      fontFamily:"Arial,sans-serif",
      padding:"18px"
    }}>
      <div style={{maxWidth:"900px",margin:"0 auto"}}>
        <h1>⚡ Fresh Meme Coin Scanner</h1>
        <p style={{color:"#94a3b8"}}>New listings + early activity</p>

        <div style={{display:"flex",flexWrap:"wrap",gap:"8px",marginBottom:"12px"}}>
          <select value={chain} onChange={e=>setChain(e.target.value)}>
            <option value="solana">Solana</option>
            <option value="base">Base</option>
          </select>

          <button onClick={scan} style={{padding:"10px 14px"}}>
            {loading ? "Scanning..." : "Scan Now"}
          </button>

          <button onClick={()=>setAutoRefresh(!autoRefresh)} style={{padding:"10px 14px"}}>
            Auto {autoRefresh ? "ON" : "OFF"}
          </button>
        </div>

        <p>{status}</p>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",marginBottom:"16px"}}>
          <select value={maxAge} onChange={e=>setMaxAge(Number(e.target.value))}>
            <option value="5">≤5 min old</option>
            <option value="10">≤10 min old</option>
            <option value="20">≤20 min old</option>
            <option value="60">≤1 hr old</option>
          </select>

          <select value={minScore} onChange={e=>setMinScore(Number(e.target.value))}>
            <option value="0">Any score</option>
            <option value="40">Score 40+</option>
            <option value="55">Score 55+</option>
            <option value="70">Score 70+</option>
          </select>

          <select value={minLiquidity} onChange={e=>setMinLiquidity(Number(e.target.value))}>
            <option value="0">Any liquidity</option>
            <option value="10000">$10k+</option>
            <option value="25000">$25k+</option>
            <option value="50000">$50k+</option>
          </select>
        </div>

        <div style={{display:"grid",gap:"12px"}}>
          {filtered.map(c => {
            const fomo = c.chain === "solana"
              ? `https://fomo.family/coin?address=${c.tokenAddress}&chainId=1399811149`
              : c.url;

            return (
              <div key={c.pairAddress || c.tokenAddress} style={{
                background:"#111827",
                border:"1px solid #243244",
                padding:"15px",
                borderRadius:"14px"
              }}>
                <h2 style={{marginTop:0}}>{c.symbol}</h2>
                <div style={{color:"#94a3b8"}}>{c.name}</div>

                <p>Age: <strong>{
                  c.ageMinutes == null ? "Unknown" :
                  c.ageMinutes < 60 ? `${c.ageMinutes.toFixed(1)} min` :
                  `${(c.ageMinutes/60).toFixed(1)} hr`
                }</strong></p>

                <p>Early Score: <strong style={{color:scoreColor(c.earlyScore)}}>
                  {c.earlyScore}/100
                </strong></p>

                <p>Risk: <strong style={{color:riskColor(c.risk)}}>{c.risk}/100</strong></p>
                <p>5m Price: {pct(c.priceChange5m)}</p>
                <p>5m Volume: {money(c.volume5m)}</p>
                <p>Liquidity: {money(c.liquidity)}</p>
                <p>Buys/Sells: {c.buys} / {c.sells}</p>

                {!!c.signals?.length && (
                  <p style={{color:"#facc15"}}>⚡ {c.signals.join(" • ")}</p>
                )}

                {!!c.riskFlags?.length && (
                  <p style={{color:"#f87171",fontSize:"13px"}}>
                    Risk flags: {c.riskFlags.join(" • ")}
                  </p>
                )}

                <p style={{fontSize:"12px",color:"#64748b"}}>
                  Found via {c.discoverySource}
                </p>

                <button onClick={()=>copyContract(c.tokenAddress)} style={{marginRight:"10px",padding:"9px"}}>
                  📋 Copy Contract
                </button>

                <a href={fomo} target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>
                  Open in Fomo →
                </a>
              </div>
            );
          })}
        </div>

        {!filtered.length && !loading && (
          <p style={{color:"#94a3b8"}}>No tokens currently match these filters.</p>
        )}

        <p style={{marginTop:"25px",color:"#64748b",fontSize:"12px"}}>
          New listings and Early Scores are discovery signals, not guarantees of future price movement.
        </p>
      </div>
    </main>
  );
}
