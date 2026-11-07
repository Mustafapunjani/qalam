(function(){
"use strict";

/* ---------- Data ---------- */
// x = x-height, H = cap height (fraction of em), measured from the font files
const FONTS = [
  {id:"caveat",  family:"Caveat",                 name:"Caveat",       x:.355, H:.701},
  {id:"kalam",   family:"Kalam",                  name:"Kalam",        x:.511, H:.720},
  {id:"indie",   family:"Indie Flower",           name:"Indie Flower", x:.395, H:.676},
  {id:"shadows", family:"Shadows Into Light",     name:"Shadows",      x:.604, H:.664},
  {id:"patrick", family:"Patrick Hand",           name:"Patrick",      x:.468, H:.662},
  {id:"gochi",   family:"Gochi Hand",             name:"Gochi",        x:.490, H:.558},
  {id:"grace",   family:"Covered By Your Grace",  name:"Grace",        x:.488, H:.776},
  {id:"reenie",  family:"Reenie Beanie",          name:"Reenie",       x:.410, H:.579},
  {id:"nothing", family:"Nothing You Could Do",   name:"Quick scrawl", x:.407, H:.787},
  {id:"dawning", family:"Dawning of a New Day",   name:"Dawning",      x:.313, H:.795, cursive:true},
  {id:"aurore",  family:"La Belle Aurore",        name:"Aurore",       x:.444, H:.661, cursive:true},
  {id:"cedar",   family:"Cedarville Cursive",     name:"Cedarville",   x:.415, H:.848, cursive:true},
  {id:"apple",   family:"Homemade Apple",         name:"Homemade",     x:.586, H:.982, cursive:true}
];
const INKS = {
  blue:  {name:"Blue",   c:"#1e3a9e", a:.96},
  black: {name:"Black",  c:"#1b1c22", a:.95},
  red:   {name:"Red",    c:"#b3261e", a:.95},
  pencil:{name:"Pencil", c:"#46474d", a:.8, pencil:true}
};
const SHADOWS = {
  off:  {name:"Off"},
  left: {name:"Left edge"},
  right:{name:"Right edge"},
  book: {name:"Book spine"}   // alternates sides page by page, like an open notebook
};
const W = 1240, H = 1754, REF_GAP = 46; // A4 at 150 dpi
const PAPERS = {
  notebook:{name:"Notebook",      gap:46, top:214, left:172, right:1168, bottom:1680, dateY:150},
  register:{name:"Register",      gap:46, top:230, left:180, right:1168, bottom:1680, dateY:132, dateX:990},
  exam:    {name:"Exam sheet",    gap:46, top:292, left:180, right:1160, bottom:1690, dateY:182, dateX:960},
  fourline:{name:"4-line copy",   gap:76, top:206, left:120, right:1140, bottom:1660, dateY:120},
  legal:   {name:"Legal pad",     gap:46, top:260, left:182, right:1168, bottom:1690, dateY:168, bg:"#fbf2a4"},
  cornell: {name:"Cornell notes", gap:46, top:214, left:362, right:1168, bottom:1398, dateY:150},
  graph:   {name:"Graph",         gap:60, top:180, left:120, right:1150, bottom:1650, dateY:118},
  dotted:  {name:"Dotted",        gap:60, top:180, left:120, right:1140, bottom:1650, dateY:118},
  blank:   {name:"Plain",         gap:50, top:170, left:120, right:1130, bottom:1650, dateY:110},
  vintage: {name:"Old paper",     gap:52, top:190, left:140, right:1110, bottom:1620, dateY:126, bg:"#eedfbd"}
};

function today(){
  const d = new Date();
  return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();
}
const DEFAULTS = {
  heading:"A few notes",
  date:today(),
  text:"This page was typed, not written. Pick a handwriting style, change the ink and the paper, and turn on the scanned look to see how real it can get.\n\nEvery letter is drawn a little differently, each line drifts slightly, and the ink is never perfectly even, just like a real pen on real paper.\n\nPress “Shuffle variation” to get a fresh version of the same page.",
  font:"caveat", size:100, spacing:0, ink:"blue", paper:"notebook",
  vari:55, drift:40, scan:true, mistakes:false, shadow:"off", shadowAmt:55, seed:20261025
};
const KEY = "qalam-settings-v1";
let state = Object.assign({}, DEFAULTS);
try{ const s = JSON.parse(localStorage.getItem(KEY) || "null"); if(s && typeof s === "object") state = Object.assign(state, s); }catch(e){}
function persist(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }

/* ---------- Helpers ---------- */
function rngFrom(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function mk(w,h){ const c=document.createElement("canvas"); c.width=w; c.height=h; return c; }
function rgba(hex,a){ const n=parseInt(hex.slice(1),16); return "rgba("+(n>>16&255)+","+(n>>8&255)+","+(n&255)+","+a+")"; }
function makeNoise(mode){
  const n=256, cv=mk(n,n), g=cv.getContext("2d"), im=g.createImageData(n,n), r=rngFrom(mode==="a"?7:11);
  for(let i=0;i<n*n;i++){
    const v=r(), j=i*4;
    if(mode==="a"){ im.data[j]=im.data[j+1]=im.data[j+2]=0; im.data[j+3]=Math.pow(v,3)*255; }
    else { const gv=185+v*70; im.data[j]=gv; im.data[j+1]=gv; im.data[j+2]=gv-5; im.data[j+3]=255; }
  }
  g.putImageData(im,0,0); return cv;
}
const NOISE_A = makeNoise("a"), NOISE_G = makeNoise("g");
const CAN_FILTER = (()=>{ try{ const g = mk(1,1).getContext("2d"); g.filter = "blur(1px)"; return g.filter === "blur(1px)"; }catch(e){ return false; } })();
const mctx = mk(4,4).getContext("2d");
let mcache = new Map();
/* ---------- Uploaded font ---------- */
let CUSTOM = null, customFace = null, customSeq = 0;
const FONT_KEY = "qalam-font-v1";
// Same character order as the Qalam font maker; its alternates live at U+E000 + index*4 + variant
const MAKER_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:!?'\"-()/&@#%+=*_";

function fontById(id){ if(id==="custom" && CUSTOM) return CUSTOM; return FONTS.find(f=>f.id===id) || FONTS[0]; }
function getFont(){ return fontById(state.font); }

function privateCodepoints(buf){
  // Reads the font's character map (TTF/OTF only) and returns its codepoints in U+E000-U+E3FF
  try{
    const dv = new DataView(buf), sig = dv.getUint32(0);
    if(sig !== 0x00010000 && sig !== 0x4F54544F && sig !== 0x74727565) return null;
    let cmap = 0;
    for(let i=0, n=dv.getUint16(4); i<n; i++){ const r = 12+i*16; if(dv.getUint32(r) === 0x636D6170){ cmap = dv.getUint32(r+8); break; } }
    if(!cmap) return null;
    let sub = 0, fmt = 0;
    for(let i=0, n=dv.getUint16(cmap+2); i<n; i++){
      const r = cmap+4+i*8, pid = dv.getUint16(r), off = cmap + dv.getUint32(r+4), f = dv.getUint16(off);
      if(pid===0 || pid===3){ if(f===12){ sub=off; fmt=12; } else if(f===4 && fmt!==12){ sub=off; fmt=4; } }
    }
    const out = new Set(), LO = 0xE000, HI = 0xE3FF;
    if(fmt === 4){
      const seg2 = dv.getUint16(sub+6), ends = sub+14, starts = ends+seg2+2, deltas = starts+seg2, ros = deltas+seg2;
      for(let s=0; s<seg2/2; s++){
        const end = dv.getUint16(ends+s*2), start = dv.getUint16(starts+s*2), delta = dv.getInt16(deltas+s*2), ro = dv.getUint16(ros+s*2);
        for(let c=Math.max(start,LO); c<=Math.min(end,HI); c++){
          let g = ro === 0 ? (c+delta)&0xFFFF : dv.getUint16(ros+s*2+ro+(c-start)*2);
          if(ro !== 0 && g) g = (g+delta)&0xFFFF;
          if(g) out.add(c);
        }
      }
    } else if(fmt === 12){
      for(let i=0, n=dv.getUint32(sub+12); i<n; i++){
        const r = sub+16+i*12, s = dv.getUint32(r), e = dv.getUint32(r+4);
        for(let c=Math.max(s,LO); c<=Math.min(e,HI); c++) out.add(c);
      }
    }
    return out;
  }catch(e){ return null; }
}

async function loadCustom(buf, name){
  const family = "QalamUser" + (++customSeq);
  let face;
  try{ face = new FontFace(family, buf.slice(0)); await face.load(); }
  catch(e){ setStatus("That file isn’t a font Qalam can read. Use a .ttf, .otf, .woff or .woff2 file."); return false; }
  if(customFace) document.fonts.delete(customFace);
  document.fonts.add(face); customFace = face;
  mctx.font = '1000px "'+family+'"';
  let x = (mctx.measureText("x").actualBoundingBoxAscent || 0)/1000;
  let h = (mctx.measureText("H").actualBoundingBoxAscent || 0)/1000;
  if(!(x > .1 && x < 1.5)) x = .45;
  if(!(h > .2 && h < 2)) h = .7;
  let alts = null, altCount = 0;
  const pua = privateCodepoints(buf);
  if(pua && pua.size){
    alts = {};
    [...MAKER_CHARS].forEach((ch,i)=>{
      const list = [ch];
      for(let v=1; v<4; v++){ const cp = 0xE000 + i*4 + v; if(pua.has(cp)){ list.push(String.fromCharCode(cp)); altCount++; } }
      if(list.length > 1) alts[ch] = list;
    });
    if(!altCount) alts = null;
  }
  CUSTOM = {id:"custom", family, name: name || "Your font", x, H:h, cursive: !!state.customCursive, alts, altCount};
  mcache = new Map();
  return true;
}
function storeCustom(buf, name){
  try{
    const u = new Uint8Array(buf); let bin = "";
    for(let i=0; i<u.length; i+=0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i+0x8000));
    localStorage.setItem(FONT_KEY, JSON.stringify({name, data: btoa(bin)}));
  }catch(e){}
}
async function restoreCustom(){
  try{
    const s = JSON.parse(localStorage.getItem(FONT_KEY) || "null");
    if(s && s.data){
      const b = atob(s.data), u = new Uint8Array(b.length);
      for(let i=0; i<b.length; i++) u[i] = b.charCodeAt(i);
      await loadCustom(u.buffer, s.name);
    }
  }catch(e){}
  if(state.font === "custom" && !CUSTOM) state.font = DEFAULTS.font;
}

/* ---------- Layout ---------- */
function makeEnv(st, scale){
  const font = fontById(st.font);
  const paperKey = PAPERS[st.paper] ? st.paper : "notebook";
  const paper = PAPERS[paperKey];
  const eff = (font.x + font.H*0.6)/2;
  const fs = REF_GAP*0.36*(st.size/100)/eff;
  const ls = st.spacing*fs*0.01;
  const measure = (t,size)=>{
    if(!t) return 0;
    const k = font.family+"|"+size+"|"+t; let v = mcache.get(k);
    if(v===undefined){ mctx.font = size+'px "'+font.family+'"'; v = mctx.measureText(t).width; if(mcache.size>20000) mcache.clear(); mcache.set(k,v); }
    return v;
  };
  const measureW = (t,size)=> measure(t,size) + ls*Math.max(0,t.length-1);
  const spaceW = size=> Math.max(measure(" ",size), size*0.26)*1.1 + ls;
  return {st, scale, font, paperKey, paper, fs, ls, measure, measureW, spaceW, warnings: [],
          ink: INKS[st.ink] || INKS.blue, vari: st.vari/100, drift: st.drift/100};
}

function misspell(w, r){
  const ch = w.split(""), i = 1 + Math.floor(r()*(ch.length-2));
  const op = r();
  if(op < .45 && ch[i] !== ch[i+1]){ const t=ch[i]; ch[i]=ch[i+1]; ch[i+1]=t; }
  else if(op < .75){ ch.splice(i,1); }
  else { return w.slice(0, Math.max(2, Math.ceil(w.length*0.55))); }
  const out = ch.join("");
  return out === w ? w.slice(0,-1) : out;
}

function layout(env){
  const {st, paper, fs, measureW, spaceW} = env;
  const lr = rngFrom(st.seed ^ 0x5bd1e995);
  const ys = []; for(let y=paper.top; y<=paper.bottom; y+=paper.gap) ys.push(y);
  const maxW = paper.right - paper.left - 24;
  const pages = []; let cur, li;
  const newPage = ()=>{ cur={lines:[]}; pages.push(cur); li=0; };
  newPage();
  const push = line=>{ if(li>=ys.length) newPage(); line.y=ys[li++]; cur.lines.push(line); };
  const splitLong = (t,size)=>{
    const out=[]; let s="";
    for(const c of t){ if(s && measureW(s+c,size)>maxW){ out.push(s); s=c; } else s+=c; }
    if(s) out.push(s); return out;
  };
  const wrap = (tokens,size,heading)=>{
    const sp = spaceW(size); let line=[], w=0;
    const flush = ()=>{ if(line.length){ push({words:line, width:w, size, heading}); line=[]; w=0; } };
    for(const tok of tokens){
      const parts = measureW(tok.t,size) > maxW ? splitLong(tok.t,size).map(t=>({t, struck:tok.struck})) : [tok];
      for(const p of parts){
        const tw = measureW(p.t,size);
        if(line.length && w + sp + tw > maxW) flush();
        w += (line.length ? sp : 0) + tw;
        line.push({t:p.t, struck:p.struck, w:tw});
      }
    }
    flush();
  };
  const heading = (st.heading||"").trim();
  if(heading) wrap(heading.split(/\s+/).map(t=>({t})), fs*1.3, true);
  const blocks = window.QalamGraph
    ? window.QalamGraph.splitBlocks(st.text)
    : String(st.text||"").replace(/\r/g,"").split("\n").map(t=>({text:t}));
  const GRAPH_PX = {small:280, medium:420, large:580};
  let graphNo = 0;
  for(const blk of blocks){
    if(blk.graph){
      graphNo++;
      const rows = Math.min(ys.length, Math.max(4, Math.ceil(GRAPH_PX[blk.graph.size] / paper.gap)));
      if(li + rows > ys.length) newPage();
      cur.lines.push({words:[], graph:blk.graph, y:ys[li], yLast:ys[li+rows-1], size:fs});
      li += rows;
      blk.graph.errors.forEach(e=>env.warnings.push("Graph "+graphNo+": "+e));
      continue;
    }
    const para = blk.text;
    if(!para.trim()){ push({words:[], size:fs}); continue; }
    const toks = [];
    for(const word of para.split(/\s+/).filter(Boolean)){
      const roll = lr();
      if(st.mistakes && word.length>=4 && /^[A-Za-z]{4,}/.test(word) && roll < 0.035){
        toks.push({t:misspell(word.replace(/[^A-Za-z]+$/,""), lr), struck:true});
      }
      toks.push({t:word});
    }
    wrap(toks, fs, false);
  }
  return pages;
}

/* ---------- Drawing ---------- */
function drawPaper(p, env){
  const {paperKey, paper, font, fs, st} = env;
  const BLUE = "rgba(96,140,200,.55)", RED = "rgba(212,62,62,.6)", PRINT = "rgba(70,100,150,.8)";
  const hline = (y,color,w,x0,x1)=>{ p.strokeStyle=color; p.lineWidth=w; p.beginPath(); p.moveTo(x0||0,y); p.lineTo(x1===undefined?W:x1,y); p.stroke(); };
  const vline = (x,color,w,y0,y1)=>{ p.strokeStyle=color; p.lineWidth=w; p.beginPath(); p.moveTo(x,y0||0); p.lineTo(x,y1===undefined?H:y1); p.stroke(); };
  const label = (t,x,y,size)=>{ p.fillStyle=PRINT; p.font="500 "+(size||22)+"px system-ui, -apple-system, Segoe UI, sans-serif"; p.fillText(t,x,y); };
  const rows = (y0,y1,color,w)=>{ for(let y=y0; y<=y1; y+=paper.gap) hline(y,color,w); };

  p.fillStyle = paper.bg || "#fdfdfa"; p.fillRect(0,0,W,H);
  p.save(); p.globalCompositeOperation="multiply"; p.globalAlpha = paperKey==="vintage" ? .22 : .07;
  p.fillStyle=p.createPattern(NOISE_G,"repeat"); p.fillRect(0,0,W,H); p.restore();

  if(paperKey==="notebook" || paperKey==="register"){
    rows(paper.top, paper.bottom, BLUE, 1.6);
    const mx = paperKey==="register" ? [146,153] : [148];
    for(const x of mx) vline(x, RED, 1.8);
    if(paperKey==="register"){
      hline(paper.top-paper.gap, "rgba(96,140,200,.75)", 2.6);
      label("Date", 910, 134);
      hline(138, "rgba(70,100,150,.6)", 1.4, 968, 1168);
    }
  } else if(paperKey==="exam"){
    p.strokeStyle="rgba(70,100,150,.65)"; p.lineWidth=2.2; p.strokeRect(60,56,1120,170);
    const field = (t,lx,y,x0,x1)=>{ label(t,lx,y); hline(y+4,"rgba(70,100,150,.55)",1.4,x0,x1); };
    field("Name", 90, 118, 168, 720); field("Roll No.", 760, 118, 858, 1150);
    field("Class", 90, 188, 160, 440); field("Subject", 478, 188, 570, 840); field("Date", 880, 188, 942, 1150);
    rows(paper.top, paper.bottom, BLUE, 1.6);
    vline(146, RED, 1.8, 250); vline(153, RED, 1.8, 250);
  } else if(paperKey==="fourline"){
    const cap = fs*font.H, xh = fs*font.x;
    for(let y=paper.top; y<=paper.bottom; y+=paper.gap){
      const b = y - 3;
      hline(b-cap, "rgba(214,80,80,.5)", 1.4); hline(b-xh, BLUE, 1.3);
      hline(b, "rgba(70,115,190,.7)", 1.6); hline(b+xh*0.85, "rgba(214,80,80,.5)", 1.4);
    }
  } else if(paperKey==="legal"){
    hline(paper.top-paper.gap*1.6, "rgba(200,60,60,.55)", 2.2); hline(paper.top-paper.gap*1.6+6, "rgba(200,60,60,.55)", 1.2);
    rows(paper.top, paper.bottom, "rgba(70,120,185,.5)", 1.5);
    vline(146, "rgba(200,60,60,.6)", 1.8); vline(154, "rgba(200,60,60,.6)", 1.8);
  } else if(paperKey==="cornell"){
    rows(paper.top, 1680, BLUE, 1.6);
    vline(330, "rgba(200,70,70,.6)", 2, 160, 1430);
    hline(1430, "rgba(70,100,150,.7)", 2.4);
    label("Cues", 60, 196, 20); label("Notes", 362, 196, 20); label("Summary", 60, 1466, 20);
  } else if(paperKey==="dotted"){
    p.fillStyle="rgba(90,105,135,.45)";
    for(let y=30; y<H; y+=30) for(let x=30; x<W; x+=30){ p.beginPath(); p.arc(x,y,1.7,0,6.2832); p.fill(); }
  } else if(paperKey==="vintage"){
    const r = rngFrom((st.seed|0) ^ 0x2c1b3c6d);
    for(let i=0;i<5;i++){
      const x=r()*W, y=r()*H, rad=60+r()*220, g=p.createRadialGradient(x,y,rad*0.2,x,y,rad);
      g.addColorStop(0,"rgba(150,105,45,"+(0.05+r()*0.07).toFixed(3)+")"); g.addColorStop(1,"rgba(150,105,45,0)");
      p.fillStyle=g; p.fillRect(0,0,W,H);
    }
    const e=p.createRadialGradient(W/2,H/2,H*0.3,W/2,H/2,H*0.72);
    e.addColorStop(0,"rgba(120,80,30,0)"); e.addColorStop(1,"rgba(120,80,30,.28)");
    p.fillStyle=e; p.fillRect(0,0,W,H);
  } else if(paperKey==="graph"){
    for(let i=0;i*30<=W;i++){ const x=i*30; p.strokeStyle= i%5 ? "rgba(96,140,200,.22)" : "rgba(96,140,200,.42)"; p.lineWidth = i%5 ? 1 : 1.4; p.beginPath(); p.moveTo(x,0); p.lineTo(x,H); p.stroke(); }
    for(let i=0;i*30<=H;i++){ const y=i*30; p.strokeStyle= i%5 ? "rgba(96,140,200,.22)" : "rgba(96,140,200,.42)"; p.lineWidth = i%5 ? 1 : 1.4; p.beginPath(); p.moveTo(0,y); p.lineTo(W,y); p.stroke(); }
  }
}

function drawWord(c, t, x, base, size, env, r){
  const {font, vari, ls, measure, ink} = env;
  if(font.alts){ // fonts from the Qalam font maker: pick one of the writer's samples for each letter
    let s = "";
    for(const ch of t){ const a = font.alts[ch]; s += a ? a[Math.floor(r()*a.length)] : ch; }
    t = s;
  }
  const cf = font.cursive ? 0.35 : 1;
  c.font = size+'px "'+font.family+'"';
  const ws = (r()-.5)*0.025*vari;
  let dy = 0;
  for(let i=0;i<t.length;i++){
    const ch = t[i];
    const cx = x + measure(t.slice(0,i), size) + ls*i;
    if(ch===" ") continue;
    dy = dy*0.55 + (r()-.5)*2*size*0.05*vari*cf;
    const rot = (r()-.5)*2*0.05*vari*cf;
    const sc = 1 + (r()-.5)*2*0.06*vari*cf;
    c.globalAlpha = ink.a*(1 - r()*0.25*vari);
    const y = base(cx) + dy + ws*(cx-x);
    c.save(); c.translate(cx,y); c.rotate(rot+ws); c.scale(sc,sc); c.fillText(ch,0,0); c.restore();
  }
  c.globalAlpha = 1;
}
function scribble(c, x, w, base, size, env, r){
  const xh = size*env.font.x;
  c.save(); c.globalAlpha = env.ink.a; c.lineWidth = Math.max(1.6, size*0.055); c.beginPath();
  const step = Math.max(5, size*0.16); let i=0;
  for(let xx=x-3; xx<=x+w+3; xx+=step, i++){
    const y = base(xx) - xh*0.5 + (i%2 ? -1 : 1)*xh*0.4 + (r()-.5)*xh*0.2;
    if(i===0) c.moveTo(xx,y); else c.lineTo(xx,y);
  }
  c.stroke(); c.restore();
}
function underline(c, x1, x2, base, size, env, r){
  c.save(); c.globalAlpha = env.ink.a*0.9; c.lineWidth = Math.max(1.6, size*0.045); c.beginPath();
  let first = true;
  for(let xx=x1; xx<=x2; xx+=14){ const y = base(xx) + size*0.2 + (r()-.5)*1.8; if(first){ c.moveTo(xx,y); first=false; } else c.lineTo(xx,y); }
  c.stroke(); c.restore();
}

function scanify(pc, scale, r){
  const w = pc.width, h = pc.height, out = mk(w,h), o = out.getContext("2d");
  o.fillStyle = "#d6d6d1"; o.fillRect(0,0,w,h);
  o.save(); o.translate(w/2,h/2); o.rotate((r()-.5)*2*0.006);
  o.filter = "blur("+(0.45*scale).toFixed(2)+"px)";
  o.drawImage(pc,-w/2,-h/2); o.filter = "none"; o.restore();
  const side = r() < .5;
  const lg = o.createLinearGradient(side?0:w,0,side?w:0,0);
  lg.addColorStop(0,"rgba(0,0,0,.08)"); lg.addColorStop(.14,"rgba(0,0,0,0)"); lg.addColorStop(1,"rgba(0,0,0,.025)");
  o.fillStyle = lg; o.fillRect(0,0,w,h);
  const rg = o.createRadialGradient(w/2,h*.45,h*.22,w/2,h/2,h*.78);
  rg.addColorStop(0,"rgba(0,0,0,0)"); rg.addColorStop(1,"rgba(45,35,20,.1)");
  o.fillStyle = rg; o.fillRect(0,0,w,h);
  o.globalCompositeOperation = "multiply";
  o.globalAlpha = .16; o.fillStyle = o.createPattern(NOISE_G,"repeat"); o.fillRect(0,0,w,h);
  o.globalAlpha = 1; o.fillStyle = "rgb(255,250,241)"; o.fillRect(0,0,w,h);
  o.globalCompositeOperation = "source-over";
  return out;
}

/* Side shadow: the dark band a page gets near the spine or along one edge when it's photographed.
   Drawn as a per-pixel mask so it falls off smoothly and its width wanders a little down the page. */
function shadowSide(mode, idx){
  if(mode === "left" || mode === "right") return mode;
  if(mode === "book") return idx % 2 ? "right" : "left";
  return null;
}
function sideShadow(cv, side, amount, seed){
  const w = cv.width, h = cv.height, s = Math.max(0, Math.min(1, amount/100));
  if(!s) return cv;
  const r = rngFrom(seed);
  const base = w*(0.10 + 0.10*s);                       // shadow reach, as a share of page width
  const tilt = (r()-.5)*0.35, bulge = 0.08 + r()*0.16, ph = r()*6.283, wob = 0.03 + r()*0.03;
  const maxD = Math.ceil(base*(1 + Math.abs(tilt) + bulge + wob) + 2);
  const mw = Math.min(w, maxD), mask = mk(mw, h), mg = mask.getContext("2d");
  const im = mg.createImageData(mw, h), d = im.data;
  for(let y=0; y<h; y++){
    const t = y/h;
    const reach = base*(1 + tilt*(2*t-1) + bulge*(Math.sin(Math.PI*t) - .5) + wob*Math.sin(t*11 + ph));
    for(let x=0; x<mw; x++){
      const u = x/reach;
      if(u >= 1) break;
      const a = s*(0.62*Math.exp(-u*8.5) + 0.2*(1-u)*(1-u));
      const j = (y*mw + x)*4;
      d[j] = 30; d[j+1] = 24; d[j+2] = 16; d[j+3] = Math.min(255, a*255);
    }
  }
  mg.putImageData(im, 0, 0);
  const o = cv.getContext("2d");
  o.save();
  if(side === "right"){ o.translate(w, 0); o.scale(-1, 1); }
  o.globalCompositeOperation = "multiply";
  o.drawImage(mask, 0, 0);
  // light falls off a little towards the far edge too
  const far = o.createLinearGradient(w, 0, w*0.9, 0);
  far.addColorStop(0, "rgba(30,24,16,"+(0.07*s).toFixed(3)+")"); far.addColorStop(1, "rgba(30,24,16,0)");
  o.fillStyle = far; o.fillRect(w*0.9, 0, w*0.1, h);
  o.restore();
  return cv;
}

function drawPage(pg, idx, env, r){
  const {st, scale, paper, paperKey, fs, ink, vari, drift, measureW, spaceW} = env;
  const cw = Math.round(W*scale), chh = Math.round(H*scale);
  const pc = mk(cw,chh), p = pc.getContext("2d"); p.scale(scale,scale); drawPaper(p, env);
  const ic = mk(cw,chh), c = ic.getContext("2d"); c.scale(scale,scale);
  c.fillStyle = ink.c; c.strokeStyle = ink.c; c.lineCap = "round"; c.lineJoin = "round"; c.textBaseline = "alphabetic";

  const date = (st.date||"").trim();
  if(idx===0 && date){
    const ds = fs*0.95, dw = measureW(date, ds);
    const x = paper.dateX || paper.right - dw;
    const y0 = paper.dateY, sl = (r()-.5)*0.006*drift;
    drawWord(c, date, x, xx=> y0 + sl*(xx-x), ds, env, r);
  }
  for(const line of pg.lines){
    if(line.graph){ drawGraph(c, line, env, r); continue; }
    if(!line.words.length) continue;
    const slope = (r()-.5)*2*0.004*drift, amp = 2.4*drift*(line.size/40), ph = r()*6.283, fr = 150 + r()*80;
    let x = line.heading ? (paper.left+paper.right)/2 - line.width/2 : paper.left + r()*8*vari;
    const x0 = x, y0 = line.y - 3;
    const base = xx=> y0 + slope*(xx-x0) + amp*Math.sin(xx/fr + ph);
    const sp = spaceW(line.size);
    let last = x;
    for(const wd of line.words){
      drawWord(c, wd.t, x, base, line.size, env, r);
      if(wd.struck) scribble(c, x, wd.w, base, line.size, env, r);
      last = x + wd.w;
      x += wd.w + sp*(1 + (r()-.5)*0.7*vari);
    }
    if(line.heading) underline(c, x0-8, last+10, base, line.size, env, r);
  }
  c.setTransform(1,0,0,1,0,0);
  if(!ink.pencil && CAN_FILTER){
    // ink bleeds slightly into the paper: one blurred copy of the whole layer behind the letters.
    // Same look as a canvas shadow on each letter, but done once per page instead of once per letter.
    const soft = mk(cw,chh), sg = soft.getContext("2d");
    sg.filter = "blur("+(0.55*scale).toFixed(2)+"px)"; sg.drawImage(ic,0,0); sg.filter = "none";
    c.globalCompositeOperation = "destination-over"; c.globalAlpha = .4; c.drawImage(soft,0,0);
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  }
  c.globalCompositeOperation = "destination-out";
  c.globalAlpha = ink.pencil ? .5 : .16;
  c.fillStyle = c.createPattern(NOISE_A,"repeat"); c.fillRect(0,0,cw,chh);
  c.globalAlpha = 1; c.globalCompositeOperation = "source-over";

  p.setTransform(1,0,0,1,0,0);
  p.globalCompositeOperation = "multiply"; p.drawImage(ic,0,0); p.globalCompositeOperation = "source-over";
  const out = st.scan ? scanify(pc, scale, r) : pc;
  const side = shadowSide(st.shadow, idx);
  // own random stream, so turning the shadow on or off doesn't reshuffle the letters
  return side ? sideShadow(out, side, st.shadowAmt, ((st.seed|0) ^ 0x3c6ef372) + idx*7919) : out;
}

/* ---------- Graphs ---------- */
function penPath(c, pts, env, r, width){
  // A pen stroke through pts with a slight, smooth hand wobble
  if(pts.length < 2) return;
  const v = 0.35 + 1.1*env.vari, ph = r()*6.283, ph2 = r()*6.283, f1 = 0.018 + r()*0.015, f2 = 0.07 + r()*0.03;
  let dist = 0;
  c.save(); c.lineWidth = width; c.globalAlpha = env.ink.a*(0.9 + r()*0.1); c.beginPath();
  for(let i=0; i<pts.length; i++){
    const [x,y] = pts[i];
    if(i) dist += Math.hypot(x - pts[i-1][0], y - pts[i-1][1]);
    const a = pts[Math.max(0,i-1)], b = pts[Math.min(pts.length-1,i+1)];
    const dx = b[0]-a[0], dy = b[1]-a[1], L = Math.hypot(dx,dy) || 1;
    const off = v*(Math.sin(dist*f1 + ph)*0.8 + Math.sin(dist*f2 + ph2)*0.3);
    const px = x - dy/L*off, py = y + dx/L*off;
    if(i) c.lineTo(px,py); else c.moveTo(px,py);
  }
  c.stroke(); c.restore();
}
function penLine(c, x1, y1, x2, y2, env, r, width){
  const n = Math.max(2, Math.ceil(Math.hypot(x2-x1, y2-y1)/8)), pts = [];
  for(let i=0; i<=n; i++) pts.push([x1+(x2-x1)*i/n, y1+(y2-y1)*i/n]);
  penPath(c, pts, env, r, width);
}
function mathRuns(text){
  // "y = x^2 + 2^(x+1)" -> normal and raised (superscript) pieces
  const runs = [], re = /\^(\([^)]*\)|-?[A-Za-z0-9.]+)/g;
  let last = 0, m;
  while((m = re.exec(text))){
    if(m.index > last) runs.push({t:text.slice(last, m.index), sup:false});
    runs.push({t:m[1].replace(/^\((.*)\)$/,"$1"), sup:true});
    last = re.lastIndex;
  }
  if(last < text.length) runs.push({t:text.slice(last), sup:false});
  return runs;
}
function mathWidth(text, size, env){
  return mathRuns(text).reduce((w,run)=> w + env.measureW(run.t, run.sup ? size*0.62 : size) + (run.sup ? 2 : 0), 0);
}
function drawMath(c, text, x, y, size, env, r){
  for(const run of mathRuns(text)){
    const s = run.sup ? size*0.62 : size, yy = run.sup ? y - size*0.36 : y;
    drawWord(c, run.t, x + (run.sup ? 1 : 0), ()=>yy, s, env, r);
    x += env.measureW(run.t, s) + (run.sup ? 2 : 0);
  }
}
function niceStep(span, maxTicks){
  const raw = span / Math.max(1, maxTicks), p = Math.pow(10, Math.floor(Math.log10(raw)));
  for(const m of [1,2,5,10]) if(m*p >= raw - 1e-12) return m*p;
  return 10*p;
}
function fmtNum(v){
  if(Math.abs(v) < 1e-9) return "0";
  return String(parseFloat(v.toFixed(4)));
}
function graphRanges(g){
  let xr = g.xr;
  if(!xr){
    xr = [-5, 5];
    if(g.points.length){
      const xs = g.points.map(p=>p.x).concat(g.vlines.map(v=>v.x));
      const lo = Math.min(...xs, g.curves.length ? -5 : Infinity), hi = Math.max(...xs, g.curves.length ? 5 : -Infinity);
      const pad = Math.max(1, (hi-lo)*0.15);
      xr = [Math.floor(lo - pad), Math.ceil(hi + pad)];
    }
  }
  let yr = g.yr;
  if(!yr){
    const vals = [];
    for(const cv of g.curves) for(let i=0; i<=300; i++){
      const y = cv.f(xr[0] + (xr[1]-xr[0])*i/300);
      if(Number.isFinite(y)) vals.push(y);
    }
    vals.sort((a,b)=>a-b);
    let lo = vals.length ? vals[Math.floor(vals.length*0.03)] : -5;
    let hi = vals.length ? vals[Math.max(0, Math.ceil(vals.length*0.97)-1)] : 5;
    for(const p of g.points){ lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
    if(hi - lo < 1e-9){ lo -= 1; hi += 1; }
    const span = hi - lo;
    if(lo > 0 && lo < span*0.6) lo = 0;          // show the x-axis when it's close
    if(hi < 0 && -hi < span*0.6) hi = 0;
    const pad = (hi - lo)*0.1;
    yr = [lo - pad, hi + pad];
  }
  return {xr, yr};
}
function drawGraph(c, line, env, r){
  const {paper, paperKey, fs} = env, g = line.graph;
  if(!g.curves.length && !g.points.length && !g.vlines.length) return;
  let {xr, yr} = graphRanges(g);
  const top = line.y + 4, bottom = line.yLast - 6;   // leave room for the text line above
  const textL = paper.left, textR = paper.right - 24;
  let bh = bottom - top, bw = Math.min(textR - textL - 40, bh*1.5);
  let bx = (textL + textR)/2 - bw/2, by = top;

  if(paperKey === "graph"){                        // put axes and units on the printed grid
    const cell = 30, gx = [Math.floor(xr[0]), Math.ceil(xr[1])], gy = [Math.floor(yr[0]), Math.ceil(yr[1])];
    const ty = Math.ceil(top/cell)*cell;
    const ux = Math.floor((textR - textL - 60)/(gx[1]-gx[0])/cell)*cell, uy = Math.floor((bottom-ty)/(gy[1]-gy[0])/cell)*cell;
    if(ux >= cell && uy >= cell){
      xr = gx; yr = gy; bw = ux*(gx[1]-gx[0]); bh = uy*(gy[1]-gy[0]);
      bx = Math.round(((textL+textR)/2 - bw/2)/cell)*cell; by = ty;
    }
  }
  const sx = x=> bx + (x - xr[0])/(xr[1]-xr[0])*bw;
  const sy = y=> by + bh - (y - yr[0])/(yr[1]-yr[0])*bh;
  const lw = Math.max(1.8, fs*0.05), ls = fs*0.58;
  const inX = v=> v >= xr[0] && v <= xr[1], inY = v=> v >= yr[0] && v <= yr[1];
  const axX = inX(0) ? 0 : (xr[0] > 0 ? xr[0] : xr[1]);
  const axY = inY(0) ? 0 : (yr[0] > 0 ? yr[0] : yr[1]);
  const ax = sx(axX), ay = sy(axY);

  // Everything already drawn, so labels can avoid it
  const placed = [], obst = [];
  const addLine = (x1,y1,x2,y2)=>{ const n = Math.ceil(Math.hypot(x2-x1,y2-y1)/6); for(let i=0;i<=n;i++) obst.push([x1+(x2-x1)*i/n, y1+(y2-y1)*i/n]); };
  const fits = (x,y,w,h)=> x >= bx-4 && x+w <= bx+bw+30 && y-h >= by-6 && y <= by+bh+4 &&
    !placed.some(q=> x < q.x+q.w+6 && x+w+6 > q.x && y-h < q.y+4 && y+4 > q.y-q.h) &&
    !obst.some(([px,py])=> px > x-4 && px < x+w+4 && py > y-h-4 && py < y+6);

  // axes with arrowheads
  const xTip = bx + bw + 16, yTip = by - 16, j = ()=> (r()-.5)*4;
  penLine(c, bx - 8 + j(), ay, xTip, ay, env, r, lw);
  penLine(c, xTip, ay, xTip - 13, ay - 6 + j()*0.5, env, r, lw);
  penLine(c, xTip, ay, xTip - 13, ay + 6 + j()*0.5, env, r, lw);
  penLine(c, ax, by + bh + 8 + j(), ax, yTip, env, r, lw);
  penLine(c, ax, yTip, ax - 6 + j()*0.5, yTip + 13, env, r, lw);
  penLine(c, ax, yTip, ax + 6 + j()*0.5, yTip + 13, env, r, lw);
  addLine(bx - 8, ay, xTip, ay); addLine(ax, by + bh + 8, ax, yTip);
  drawMath(c, "x", xTip + 6, ay + ls*0.35, fs*0.75, env, r);
  drawMath(c, "y", ax + 10, yTip + fs*0.2, fs*0.75, env, r);

  // ticks and numbers
  const sxStep = niceStep(xr[1]-xr[0], Math.floor(bw/48)), syStep = niceStep(yr[1]-yr[0], Math.floor(bh/40));
  for(let v = Math.ceil(xr[0]/sxStep - 1e-9)*sxStep; v <= xr[1] + 1e-9; v += sxStep){
    if(Math.abs(v - axX) < sxStep*1e-6) continue;
    const px = sx(v), t = fmtNum(v), w = mathWidth(t, ls, env);
    penLine(c, px, ay - 6, px, ay + 6, env, r, lw*0.85);
    const tx = px - w/2 - (v < 0 ? ls*0.15 : 0), tyy = ay + 8 + ls*0.95;
    placed.push({x:tx, y:tyy, w, h:ls*0.8});
    drawMath(c, t, tx, tyy, ls, env, r);
  }
  for(let v = Math.ceil(yr[0]/syStep - 1e-9)*syStep; v <= yr[1] + 1e-9; v += syStep){
    if(Math.abs(v - axY) < syStep*1e-6) continue;
    const py = sy(v), t = fmtNum(v), w = mathWidth(t, ls, env);
    penLine(c, ax - 6, py, ax + 6, py, env, r, lw*0.85);
    placed.push({x:ax - w - 12, y:py + ls*0.35, w, h:ls*0.8});
    drawMath(c, t, ax - w - 12, py + ls*0.35, ls, env, r);
  }
  if(axX === 0 && axY === 0) drawMath(c, "O", ax - mathWidth("O", ls, env) - 10, ay + 8 + ls*0.95, ls, env, r);

  // curves, clipped to the graph area and broken at gaps like 1/x or tan x
  c.save(); c.beginPath(); c.rect(bx - 3, by - 3, bw + 6, bh + 6); c.clip();
  const curvePaths = [];
  for(const cv of g.curves){
    const N = Math.ceil(bw/3); let seg = [], prev = null;
    const flush = ()=>{ if(seg.length > 1) penPath(c, seg, env, r, lw*1.15); seg = []; };
    for(let i=0; i<=N; i++){
      const x = xr[0] + (xr[1]-xr[0])*i/N, y = cv.f(x);
      if(!Number.isFinite(y) || Math.abs(y) > 1e7){ flush(); prev = null; continue; }
      const py = sy(y);
      if(prev !== null && Math.abs(py - prev) > bh*0.8) flush();
      seg.push([sx(x), Math.max(by - bh, Math.min(by + 2*bh, py))]);
      if(i % 2 === 0 && py >= by - 4 && py <= by + bh + 4) obst.push([sx(x), py]);
      prev = py;
    }
    flush();
    curvePaths.push(cv);
  }
  for(const vl of g.vlines) if(inX(vl.x)){ penLine(c, sx(vl.x), by, sx(vl.x), by + bh, env, r, lw*1.1); addLine(sx(vl.x), by, sx(vl.x), by + bh); }
  c.restore();

  // points
  for(const p of g.points){
    if(!inX(p.x) || !inY(p.y)) continue;
    const px = sx(p.x), py = sy(p.y);
    c.save(); c.globalAlpha = env.ink.a; c.beginPath(); c.arc(px + (r()-.5), py + (r()-.5), Math.max(3.2, fs*0.085), 0, 6.2832); c.fill(); c.restore();
    const t = p.name + "(" + fmtNum(p.x) + ", " + fmtNum(p.y) + ")", w = mathWidth(t, ls, env);
    const opts = [[px + 9, py - 9], [px - w - 9, py - 9], [px + 9, py + ls + 6], [px - w - 9, py + ls + 6]];
    const at = opts.find(o=>fits(o[0], o[1], w, ls)) || opts[0];
    placed.push({x:at[0], y:at[1], w, h:ls});
    drawMath(c, t, at[0], at[1], ls, env, r);
  }

  // labels for curves and vertical lines
  const lsz = fs*0.68;
  for(const cv of curvePaths){
    const w = mathWidth(cv.label, lsz, env);
    let spot = null;
    for(const fr of [0.86, 0.78, 0.92, 0.7, 0.62, 0.55, 0.45, 0.35, 0.25, 0.15, 0.08]){
      const x = xr[0] + (xr[1]-xr[0])*fr, y = cv.f(x);
      if(!Number.isFinite(y) || !inY(y)) continue;
      const px = sx(x), py = sy(y);
      for(const [lx, ly] of [[px + 10, py - 10], [px - w - 10, py - 10], [px + 10, py + lsz + 10], [px - w - 10, py + lsz + 10], [px + 16, py - 22], [px - w - 16, py + lsz + 22]]){
        if(fits(lx, ly, w, lsz)){ spot = [lx, ly]; break; }
      }
      if(spot) break;
    }
    if(!spot) spot = [bx + bw - w, by + lsz];
    placed.push({x:spot[0], y:spot[1], w, h:lsz});
    drawMath(c, cv.label, spot[0], spot[1], lsz, env, r);
  }
  for(const vl of g.vlines){
    if(!inX(vl.x)) continue;
    const w = mathWidth(vl.label, lsz, env), px = sx(vl.x);
    const at = [[px + 8, by + lsz], [px - w - 8, by + lsz], [px + 8, by + bh - 4], [px - w - 8, by + bh - 4]].find(o=>fits(o[0], o[1], w, lsz)) || [px + 8, by + lsz];
    placed.push({x:at[0], y:at[1], w, h:lsz});
    drawMath(c, vl.label, at[0], at[1], lsz, env, r);
  }
}

let lastWarnings = [], graphStatus = false;
function buildPages(st, scale){
  const env = makeEnv(st, scale);
  const pages = layout(env);
  lastWarnings = env.warnings;
  const r = rngFrom(st.seed);
  return pages.map((pg,i)=> drawPage(pg, i, env, r));
}

/* ---------- UI ---------- */
const $ = id=>document.getElementById(id);
const pagesEl = $("pages"), countEl = $("count"), statusEl = $("status"), pdfBtn = $("pdf");
let pageCount = 0;

function setStatus(msg){ statusEl.textContent = msg || ""; }

function buildFontTiles(){
  const box = $("fonts"); box.textContent = "";
  for(const f of (CUSTOM ? [CUSTOM, ...FONTS] : FONTS)){
    const b = document.createElement("button");
    b.type = "button"; b.className = "font-tile"; b.dataset.id = f.id;
    b.setAttribute("aria-pressed", String(state.font===f.id));
    b.setAttribute("aria-label", f.name);
    const s = document.createElement("span"); s.className = "s"; s.style.fontFamily = '"'+f.family+'", cursive'; s.textContent = "Hello";
    const n = document.createElement("span"); n.className = "n"; n.textContent = f.name;
    b.append(s,n);
    b.addEventListener("click", ()=>{ state.font = f.id; changed(true); syncPressed(); });
    box.append(b);
  }
  const up = document.createElement("button");
  up.type = "button"; up.className = "font-tile upload";
  up.innerHTML = '<span class="s" aria-hidden="true">+</span><span class="n">Upload font</span>';
  up.setAttribute("aria-label", CUSTOM ? "Upload a different font" : "Upload a font file");
  up.addEventListener("click", ()=>$("fontFile").click());
  box.append(up);
}
function syncCustom(){
  $("customRow").hidden = !CUSTOM;
  if(!CUSTOM) return;
  $("customName").textContent = CUSTOM.name;
  $("customCursive").checked = !!state.customCursive;
  $("customNote").textContent = CUSTOM.alts
    ? "Made with the Qalam font maker: " + CUSTOM.altCount + " extra letter samples found, so each letter picks one of your versions at random."
    : "";
}
function buildChips(boxId, map, key, withDot){
  const box = $(boxId); box.textContent = "";
  for(const k of Object.keys(map)){
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.dataset.k = k;
    b.setAttribute("aria-pressed", String(state[key]===k));
    if(withDot){ const d = document.createElement("span"); d.className = "dot"; d.style.background = map[k].c; if(map[k].pencil) d.style.background = "repeating-linear-gradient(45deg,#6b6c72 0 2px,#9a9ba1 2px 4px)"; b.append(d); }
    b.append(document.createTextNode(map[k].name));
    b.addEventListener("click", ()=>{ state[key] = k; changed(true); syncPressed(); });
    box.append(b);
  }
}
function syncPressed(){
  document.querySelectorAll("#fonts .font-tile").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.id===state.font)));
  document.querySelectorAll("#inks .chip").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.k===state.ink)));
  document.querySelectorAll("#papers .chip").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.k===state.paper)));
  document.querySelectorAll("#shadows .chip").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.k===state.shadow)));
  $("shadowAmtRow").hidden = !SHADOWS[state.shadow] || state.shadow === "off";
}
const OUTS = {
  size: v=>v+"%",
  spacing: v=> (v>0?"+":"")+v,
  vari: v=> v<15 ? "Steady" : v<45 ? "Light" : v<75 ? "Natural" : "Messy",
  drift: v=> v<15 ? "Straight" : v<50 ? "Slight" : v<80 ? "Noticeable" : "Wavy",
  shadowAmt: v=> v<30 ? "Soft" : v<70 ? "Medium" : "Deep"
};
function bindInputs(){
  for(const k of ["heading","date","text"]){
    const el = $(k); el.value = state[k];
    el.addEventListener("input", ()=>{ state[k] = el.value; changed(); });
  }
  for(const k of Object.keys(OUTS)){
    const el = $(k), out = $(k+"Out"); el.value = state[k]; out.textContent = OUTS[k](+el.value);
    el.addEventListener("input", ()=>{ state[k] = +el.value; out.textContent = OUTS[k](state[k]); changed(); });
  }
  for(const k of ["scan","mistakes"]){
    const el = $(k); el.checked = !!state[k];
    el.addEventListener("change", ()=>{ state[k] = el.checked; changed(true); });
  }
}

let timer = 0, token = 0;
// fast = a click (font, ink, paper…): redraw straight away. Typing waits a moment so every key doesn't redraw.
function changed(fast){ persist(); clearTimeout(timer); timer = setTimeout(render, fast ? 0 : 180); }

async function ensureFont(){
  const f = getFont();
  const sample = ((state.heading||"")+(state.date||"")+(state.text||"")).slice(0,3000) || "Hello";
  try{ await document.fonts.load('40px "'+f.family+'"', sample); }catch(e){}
}

// The preview only needs as many pixels as the screen shows; downloads still use full quality.
function previewScale(){
  const cssW = Math.min(760, pagesEl.clientWidth || 760), dpr = window.devicePixelRatio || 1;
  return Math.round(Math.max(0.45, Math.min(1, cssW*dpr/W))*100)/100;
}
const yieldToBrowser = ()=> new Promise(res=>requestAnimationFrame(()=>setTimeout(res,0)));
let endEl = null;

function pageFigure(i){
  let fig = pagesEl.children[i];
  if(fig && fig.classList.contains("page")) return fig;
  fig = document.createElement("figure"); fig.className = "page";
  const cap = document.createElement("figcaption");
  const lab = document.createElement("span"); lab.textContent = "Page "+(i+1);
  const b = document.createElement("button"); b.type = "button"; b.className = "linkbtn"; b.textContent = "Save as image";
  b.addEventListener("click", ()=>savePng(i));
  cap.append(lab, b); fig.append(cap);
  pagesEl.insertBefore(fig, pagesEl.children[i] || null);
  return fig;
}

async function render(){
  const t = ++token;
  await ensureFont();
  if(t !== token) return;
  let env, pages;
  try{ env = makeEnv(state, previewScale()); pages = layout(env); lastWarnings = env.warnings; }
  catch(e){ setStatus("The preview couldn’t be drawn. Try a different handwriting style."); return; }
  const r = rngFrom(state.seed), n = pages.length;
  if(endEl) endEl.remove();
  // Draw page by page and show each one as soon as it's ready, so the first page updates
  // almost instantly even for long text. A newer change cancels the rest.
  for(let i=0; i<n; i++){
    let cv;
    try{ cv = drawPage(pages[i], i, env, r); }
    catch(e){ setStatus("The preview couldn’t be drawn. Try a different handwriting style."); return; }
    if(t !== token) return;
    cv.setAttribute("role","img"); cv.setAttribute("aria-label","Handwritten page "+(i+1)+" of "+n);
    const fig = pageFigure(i), old = fig.querySelector("canvas");
    if(old) old.replaceWith(cv); else fig.prepend(cv);
    if(i < n-1){ await yieldToBrowser(); if(t !== token) return; }
  }
  while(pagesEl.children.length > n) pagesEl.lastElementChild.remove();
  pageCount = n;
  countEl.textContent = n === 1 ? "1 page" : n+" pages";
  pdfBtn.textContent = pdfLabel();
  if(lastWarnings.length){ setStatus(lastWarnings.join(" ")); graphStatus = true; }
  else if(graphStatus){ setStatus(""); graphStatus = false; }
  if(n > 1){
    // a second download button under the last page, so nobody has to scroll back up
    endEl = document.createElement("div"); endEl.className = "pages-end";
    const b = document.createElement("button"); b.type = "button"; b.className = "btn primary"; b.dataset.pdf = "";
    b.textContent = "Download all "+n+" pages as one PDF";
    b.addEventListener("click", savePdf);
    endEl.append(b); pagesEl.append(endEl);
  }
}
function pdfLabel(){ return pageCount > 1 ? "Download all "+pageCount+" pages (PDF)" : "Download PDF"; }

function saveBlob(blob, filename){
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
}
function saveError(){ setStatus("The file couldn’t be saved. Try again."); }
async function savePng(i){
  setStatus("Preparing a high-quality image…");
  try{
    await ensureFont();
    const cv = buildPages(state, 1.6)[i];
    const blob = await new Promise(res=>cv.toBlob(res,"image/png"));
    saveBlob(blob, fileBase()+"-page-"+(i+1)+".png");
    setStatus("");
  }catch(e){ saveError(e); }
}
function fileBase(){
  const h = (state.heading||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,50);
  return h || "handwriting";
}
const nextFrame = ()=> new Promise(res=>setTimeout(res, 0));
async function savePdf(){
  if(!window.jspdf){ setStatus("The PDF tool didn’t load. Reload the page and try again."); return; }
  const btns = document.querySelectorAll("[data-pdf]");
  btns.forEach(b=>b.disabled = true); setStatus("Preparing your PDF…");
  try{
    await ensureFont();
    const pages = buildPages(state, 1.6);
    const doc = new window.jspdf.jsPDF({unit:"mm", format:"a4", compress:true});
    for(let i=0; i<pages.length; i++){
      if(pages.length > 1){ setStatus("Adding page "+(i+1)+" of "+pages.length+"…"); await nextFrame(); }
      if(i) doc.addPage();
      doc.addImage(pages[i].toDataURL("image/jpeg",0.9),"JPEG",0,0,210,297);
    }
    saveBlob(doc.output("blob"), fileBase()+".pdf");
    setStatus(pages.length > 1 ? "Saved all "+pages.length+" pages in one PDF." : "");
  }catch(e){ saveError(e); }
  finally{ btns.forEach(b=>b.disabled = false); }
}

/* ---------- Add a graph form ---------- */
let graphSize = "medium", lastCaret = null;
["click","keyup","select","input"].forEach(ev=>$("text").addEventListener(ev, ()=>{ lastCaret = $("text").selectionEnd; }));
document.querySelectorAll("#gSize .chip").forEach(b=>b.addEventListener("click", ()=>{
  graphSize = b.dataset.size;
  document.querySelectorAll("#gSize .chip").forEach(x=>x.setAttribute("aria-pressed", String(x===b)));
}));
$("gInsert").addEventListener("click", ()=>{
  const msg = $("gMsg"), num = v=> v.trim()==="" ? null : Number(v.replace(/[−–]/g,"-"));
  const eqs = $("gEq").value.split("\n").map(t=>t.trim()).filter(Boolean);
  const pts = $("gPts").value.trim();
  const x0 = num($("gX0").value), x1 = num($("gX1").value), y0 = num($("gY0").value), y1 = num($("gY1").value);
  if(!eqs.length && !pts){ msg.textContent = "Add at least one equation or point."; return; }
  for(const [a,b,name] of [[x0,x1,"x"],[y0,y1,"y"]]){
    if((a===null) !== (b===null)){ msg.textContent = "Fill in both "+name+" values, or leave both empty."; return; }
    if(a!==null && (!Number.isFinite(a) || !Number.isFinite(b) || a===b)){ msg.textContent = "The "+name+" range needs two different numbers."; return; }
  }
  const lines = eqs.slice();
  if(pts) lines.push(pts);
  if(x0!==null) lines.push("x from "+Math.min(x0,x1)+" to "+Math.max(x0,x1));
  if(y0!==null) lines.push("y from "+Math.min(y0,y1)+" to "+Math.max(y0,y1));
  if(graphSize !== "medium") lines.push("size "+graphSize);
  const check = window.QalamGraph.parseBlock(lines);
  if(check.errors.length){ msg.textContent = check.errors[0]; return; }
  msg.textContent = "";
  const block = "[graph]\n" + lines.join("\n") + "\n[/graph]";
  const ta = $("text"), v = ta.value;
  const at = lastCaret === null ? v.length : Math.min(lastCaret, v.length);   // end of text unless they clicked into it
  let start = v.slice(0, at), end = v.slice(at);
  // keep the block on its own lines: finish the current line first
  const nl = end.indexOf("\n");
  if(start && !start.endsWith("\n") && nl !== -1 && nl > 0){ start += end.slice(0, nl); end = end.slice(nl); }
  else if(start && !start.endsWith("\n") && nl === -1){ start += end; end = ""; }
  const before = start && !start.endsWith("\n") ? "\n" : "";
  const after = end.startsWith("\n") ? "" : "\n";
  ta.value = start + before + block + after + end;
  state.text = ta.value; changed(true);
  const pos = (start + before + block).length;
  ta.focus(); ta.setSelectionRange(pos, pos); lastCaret = pos;
  $("gEq").value = ""; $("gPts").value = "";
});

$("shuffle").addEventListener("click", ()=>{ state.seed = Math.floor(Math.random()*2147483647); changed(true); });
pdfBtn.addEventListener("click", savePdf);

buildFontTiles();
buildChips("inks", INKS, "ink", true);
buildChips("papers", PAPERS, "paper", false);
buildChips("shadows", SHADOWS, "shadow", false);
syncPressed();
bindInputs();
$("fontFile").addEventListener("change", async e=>{
  const f = e.target.files && e.target.files[0]; e.target.value = "";
  if(!f) return;
  if(f.size > 15*1024*1024){ setStatus("That font file is over 15 MB. Choose a smaller one."); return; }
  setStatus("Loading your font…");
  const buf = await f.arrayBuffer(), name = f.name.replace(/\.[^.]+$/, "");
  if(!(await loadCustom(buf, name))) return;
  storeCustom(buf, name);
  state.font = "custom";
  setStatus(""); buildFontTiles(); syncCustom(); changed();
});
$("customRemove").addEventListener("click", ()=>{
  if(customFace) document.fonts.delete(customFace);
  CUSTOM = null; customFace = null;
  try{ localStorage.removeItem(FONT_KEY); }catch(e){}
  if(state.font === "custom") state.font = DEFAULTS.font;
  buildFontTiles(); syncCustom(); changed();
});
$("customCursive").addEventListener("change", e=>{
  state.customCursive = e.target.checked;
  if(CUSTOM) CUSTOM.cursive = state.customCursive;
  changed();
});
restoreCustom()
  .then(()=>{ buildFontTiles(); syncCustom(); return document.fonts && document.fonts.ready; })
  .then(render);

})();
