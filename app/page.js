"use client";

import { useEffect, useMemo, useState } from "react";

const fmt = n => Number(n || 0) ? "$" + Number(n).toLocaleString(undefined,{maximumFractionDigits:0}) : "—";
const ago = iso => {
  const s = Math.floor((Date.now() - Date.parse(iso || 0))/1000);
  if (!Number.isFinite(s) || s < 0) return "";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return new Date(iso).toLocaleTimeString();
};
const btn = {background:"#172033",border:"1px solid #334155",borderRadius:10,color:"white",padding:"10px 12px",textDecoration:"none"};
const card = {background:"#111827",border:"1px solid #293548",borderRadius:16,padding:16};

export default function Home(){
  const [coins,setCoins]=useState([]);
  const [mode,setMode]=useState("xactive");
  const [mentions,setMentions]=useState(new Set());
  const [coinPosts,setCoinPosts]=useState([]);
  const [generalPosts,setGeneralPosts]=useState([]);
  const [socialMsg,setSocialMsg]=useState("");
  const [status,setStatus]=useState("Starting...");
  const [auto,setAuto]=useState(true);

  async function loadCoins(){
    try{
      const r=await fetch("/api/scan",{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Scanner failed");
      setCoins(d.launches||[]);
      setStatus(`${d.provider||"RPC"} • ${new Date().toLocaleTimeString()}`);
    }catch(e){ setStatus(`Error: ${e.message}`); }
  }

  async function loadSocial(list=coins){
    const ready=list.filter(c=>c?.socials?.twitter).slice(0,8);
    try{
      const r=await fetch("/api/social",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"coins",coins:ready.map(c=>({mint:c.mint,symbol:c.symbol}))})});
      const d=await r.json();
      setCoinPosts(d.posts||[]);
      setMentions(new Set(d.mentionedMints||[]));
      setSocialMsg(d.message||"");
    }catch(e){setSocialMsg(e.message)}
  }

  async function loadGeneral(){
    try{
      const r=await fetch("/api/social",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"general"})});
      const d=await r.json();
      setGeneralPosts(d.posts||[]);
      if(d.message) setSocialMsg(d.message);
    }catch(e){setSocialMsg(e.message)}
  }

  useEffect(()=>{loadCoins();loadGeneral()},[]);
  useEffect(()=>{loadSocial(coins)},[coins]);
  useEffect(()=>{
    if(!auto) return;
    const a=setInterval(loadCoins,10000);
    const b=setInterval(()=>{loadSocial();loadGeneral()},30000);
    return()=>{clearInterval(a);clearInterval(b)};
  },[auto,coins]);

  const visible=useMemo(()=>{
    if(mode==="xactive") return coins.filter(c=>c?.socials?.twitter&&mentions.has(c.mint));
    if(mode==="twitter") return coins.filter(c=>c?.socials?.twitter);
    return coins;
  },[coins,mode,mentions]);

  const Feed=({posts})=><div style={{display:"grid",gap:10}}>{posts.length?posts.map(p=><a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{...card,color:"white",textDecoration:"none"}}><b>{p.displayName||p.username||"X user"}</b>{p.username&&<div style={{color:"#94a3b8",fontSize:13}}>@{p.username}{p.followers?` • ${p.followers.toLocaleString()} followers`:""}</div>}<p style={{lineHeight:1.45}}>{p.text}</p><small style={{color:"#64748b"}}>♥ {p.likes||0} • ↻ {p.reposts||0} • 💬 {p.replies||0} • {ago(p.createdAt)}</small></a>):<div style={card}><span style={{color:"#94a3b8"}}>{socialMsg||"No recent posts found yet."}</span></div>}</div>;

  return <main style={{minHeight:"100vh",background:"linear-gradient(180deg,#070a10,#0b1019)",color:"white",padding:18,fontFamily:"Arial,sans-serif"}}><div style={{maxWidth:980,margin:"0 auto"}}>
    <h1>⚡ Meme Coin Social Pulse</h1>
    <p style={{color:"#94a3b8"}}>Pump.fun launches • market data • X/Twitter activity</p>

    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <select value={mode} onChange={e=>setMode(e.target.value)} style={btn}>
        <option value="xactive">🗣 X Active Coins</option>
        <option value="twitter">𝕏 Has Twitter</option>
        <option value="all">🚨 All Detected</option>
      </select>
      <button onClick={loadCoins} style={btn}>Refresh</button>
      <button onClick={()=>setAuto(!auto)} style={btn}>Auto {auto?"ON":"OFF"}</button>
    </div>
    <p style={{color:"#94a3b8"}}>{status}</p>

    <section style={{display:"grid",gap:12,marginTop:18}}>
      {visible.map(c=><div key={`${c.mint}:${c.detectedAt}`} style={card}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12}}><div><h2 style={{margin:0}}>{c.symbol&&c.symbol!=="?"?`$${c.symbol}`:"New launch"}</h2><div style={{color:"#94a3b8"}}>{c.name||"Pump.fun token"}</div></div><b>{mentions.has(c.mint)?"🗣 X Active":c?.socials?.twitter?"𝕏 Linked":"⏳ Waiting"}</b></div>
        <p>Early Activity Score: <b>{c.activityScore||0}/100</b></p>
        <p>Liquidity: {fmt(c.liquidity)} • 5m Volume: {fmt(c.volume5m)}</p>
        <p>Buys / Sells: {c.buys5m||0} / {c.sells5m||0}</p>
        <p style={{fontSize:12,color:"#64748b",overflowWrap:"anywhere"}}>{c.mint}</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          <a href={c.fomoUrl} target="_blank" rel="noreferrer" style={btn}>🚀 Fomo</a>
          {c?.socials?.twitter&&<a href={c.socials.twitter} target="_blank" rel="noreferrer" style={btn}>𝕏 Twitter</a>}
          {c?.socials?.telegram&&<a href={c.socials.telegram} target="_blank" rel="noreferrer" style={btn}>✈️ Telegram</a>}
          {c?.socials?.website&&<a href={c.socials.website} target="_blank" rel="noreferrer" style={btn}>🌐 Website</a>}
        </div>
      </div>)}
      {!visible.length&&<div style={card}><span style={{color:"#94a3b8"}}>No coins match this view yet.</span></div>}
    </section>

    <section style={{marginTop:28}}><h2>🧵 Live X posts about detected coins</h2><Feed posts={coinPosts}/></section>
    <section style={{marginTop:28}}><h2>🌐 Broader meme-coin X feed</h2><Feed posts={generalPosts}/></section>
    <p style={{color:"#64748b",fontSize:12,lineHeight:1.5,marginTop:26}}>Social activity can be manipulated and does not mean a token is safe or likely to rise. This is a research/alert dashboard only.</p>
  </div></main>
}
