/*
 * Qalam graphs: reads equations like "y = 2x^2 - 3sin(x)" and [graph] blocks.
 * Pure math, no drawing. The converter draws the result in handwriting style.
 *
 * Supported: + - * / ^, brackets, |x| or abs(x), implicit multiplication (2x, 3(x+1), x sin x),
 * sin cos tan sec csc cot asin acos atan sinh cosh tanh sqrt cbrt abs ln log exp floor ceil round,
 * constants pi and e, and the symbols ² ³ π √ × ÷ − typed directly.
 * Expressions are parsed into a function, never run with eval(), so pasted text can't execute code.
 */
(function(){
"use strict";

const FUNCS = {
  sin:Math.sin, cos:Math.cos, tan:Math.tan,
  sec:x=>1/Math.cos(x), csc:x=>1/Math.sin(x), cot:x=>1/Math.tan(x),
  asin:Math.asin, acos:Math.acos, atan:Math.atan,
  sinh:Math.sinh, cosh:Math.cosh, tanh:Math.tanh,
  sqrt:Math.sqrt, cbrt:Math.cbrt, abs:Math.abs, exp:Math.exp,
  ln:Math.log, log:Math.log10, floor:Math.floor, ceil:Math.ceil, round:Math.round
};
const CONSTS = {pi:Math.PI, e:Math.E};
const NAMES = Object.keys(FUNCS).concat(Object.keys(CONSTS), ["x"]).sort((a,b)=>b.length-a.length);

function normalise(s){
  return String(s)
    .replace(/[−–—]/g,"-").replace(/[×·∙]/g,"*").replace(/÷/g,"/")
    .replace(/²/g,"^2").replace(/³/g,"^3").replace(/π/g,"pi").replace(/√/g,"sqrt ")
    .replace(/\*\*/g,"^");
}

function tokenize(src){
  const s = normalise(src).toLowerCase(), out = [];
  let i = 0;
  while(i < s.length){
    const c = s[i];
    if(/\s/.test(c)){ i++; continue; }
    if(/[0-9.]/.test(c)){
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if(!m) throw new Error("“"+c+"” isn’t a number I can read");
      out.push({t:"num", v:parseFloat(m[1])}); i += m[1].length; continue;
    }
    if(/[a-z]/.test(c)){
      let word = /^[a-z]+/.exec(s.slice(i))[0]; i += word.length;
      // split runs like "2pix" or "xsinx" into known names
      while(word){
        const name = NAMES.find(n=>word.startsWith(n));
        if(!name) throw new Error("I don’t know “"+word+"”. Use x as the variable");
        out.push(name in FUNCS ? {t:"fn", v:name} : name==="x" ? {t:"x"} : {t:"num", v:CONSTS[name]});
        word = word.slice(name.length);
      }
      continue;
    }
    if("+-*/^()|".includes(c)){ out.push({t:c}); i++; continue; }
    throw new Error("“"+c+"” can’t be used in an equation");
  }
  return out;
}

// Recursive-descent parser producing a closure tree
function parseExpression(src){
  const tk = tokenize(src);
  if(!tk.length) throw new Error("The equation is empty");
  let p = 0, absDepth = 0;
  const peek = ()=>tk[p], next = ()=>tk[p++];
  const expect = t=>{ if(!tk[p] || tk[p].t!==t) throw new Error(t===")" ? "A bracket isn’t closed" : "Something’s missing near the end"); p++; };
  const startsPrimary = tok=> tok && (tok.t==="num" || tok.t==="x" || tok.t==="fn" || tok.t==="(" || (tok.t==="|" && absDepth===0));

  function expr(){
    let left = term();
    while(peek() && (peek().t==="+" || peek().t==="-")){
      const op = next().t, a = left, b = term();
      left = op==="+" ? x=>a(x)+b(x) : x=>a(x)-b(x);
    }
    return left;
  }
  function term(){
    let left = unary();
    for(;;){
      const tok = peek();
      if(tok && (tok.t==="*" || tok.t==="/")){
        next(); const a = left, b = unary();
        left = tok.t==="*" ? x=>a(x)*b(x) : x=>a(x)/b(x);
      } else if(startsPrimary(tok)){          // implicit multiplication: 2x, x(x+1), 3sin x
        const a = left, b = power();
        left = x=>a(x)*b(x);
      } else break;
    }
    return left;
  }
  function unary(){
    const tok = peek();
    if(tok && tok.t==="-"){ next(); const a = unary(); return x=>-a(x); }
    if(tok && tok.t==="+"){ next(); return unary(); }
    return power();
  }
  function power(){
    const base = primary();
    if(peek() && peek().t==="^"){ next(); const ex = unary(); return x=>Math.pow(base(x), ex(x)); }
    return base;
  }
  function primary(){
    const tok = next();
    if(!tok) throw new Error("The equation ends too early");
    if(tok.t==="num"){ const v = tok.v; return ()=>v; }
    if(tok.t==="x") return x=>x;
    if(tok.t==="("){ const e = expr(); expect(")"); return e; }
    if(tok.t==="|"){ absDepth++; const e = expr(); absDepth--; expect("|"); return x=>Math.abs(e(x)); }
    if(tok.t==="fn"){
      const f = FUNCS[tok.v];
      let arg;
      if(peek() && peek().t==="("){ next(); arg = expr(); expect(")"); }
      else arg = power();                       // "sin x", "sqrt x"
      if(peek() && peek().t==="^"){             // sin(x)^2 means (sin x)^2
        next(); const ex = unary(); return x=>Math.pow(f(arg(x)), ex(x));
      }
      return x=>f(arg(x));
    }
    throw new Error("Something’s out of place near “"+tok.t+"”");
  }

  const fn = expr();
  if(p < tk.length) throw new Error("Something’s out of place near “"+(tk[p].t==="num"?tk[p].v:tk[p].t)+"”");
  return fn;
}

// Display version of an equation for labels: 2*x -> 2x
function prettify(s){
  return normalise(s).replace(/\s+/g," ").trim()
    .replace(/(\d)\s*\*\s*(?=[a-z(√])/gi,"$1")
    .replace(/\*/g,"×").replace(/\bsqrt\s*/g,"√").replace(/\bpi\b/g,"π");
}

const NUM = "(-?\\d*\\.?\\d+)";
const RANGE = new RegExp("^([xy])\\s*(?::|=|from|range|in)?\\s*\\[?\\s*"+NUM+"\\s*(?:to|\\.\\.|,|…|–)\\s*"+NUM+"\\s*\\]?$","i");
const POINT = new RegExp("([A-Za-z][A-Za-z0-9']*)?\\s*=?\\s*\\(\\s*"+NUM+"\\s*,\\s*"+NUM+"\\s*\\)","g");

/* A [graph] block's lines -> graph description */
function parseBlock(lines){
  const g = {curves:[], vlines:[], points:[], xr:null, yr:null, size:"medium", errors:[]};
  for(let raw of lines){
    const line = normalise(raw).trim();
    if(!line) continue;
    let m;
    if((m = /^size\s*[:=]?\s*(small|medium|large)$/i.exec(line))){ g.size = m[1].toLowerCase(); continue; }
    if((m = RANGE.exec(line))){
      const a = parseFloat(m[2]), b = parseFloat(m[3]);
      if(a === b){ g.errors.push("The "+m[1]+" range “"+raw.trim()+"” starts and ends at the same number."); continue; }
      g[m[1].toLowerCase()==="x" ? "xr" : "yr"] = [Math.min(a,b), Math.max(a,b)];
      continue;
    }
    if((m = /^x\s*=\s*(-?\d*\.?\d+)$/i.exec(line))){ g.vlines.push({x:parseFloat(m[1]), label:"x = "+m[1]}); continue; }
    if(/^([A-Za-z][A-Za-z0-9']*\s*=?\s*)?\(\s*-?[\d.]+\s*,/.test(line)){
      POINT.lastIndex = 0; let found = false;
      while((m = POINT.exec(line))){ found = true; g.points.push({name:m[1]||"", x:parseFloat(m[2]), y:parseFloat(m[3])}); }
      if(found) continue;
    }
    const eq = /^(y|[a-z]\s*\(\s*x\s*\))\s*=\s*(.+)$/i.exec(line);
    const lhs = eq ? eq[1].replace(/\s+/g,"") : "y", rhs = eq ? eq[2] : line;
    try{
      const f = parseExpression(rhs);
      g.curves.push({f, label: lhs+" = "+prettify(rhs)});
    }catch(e){
      g.errors.push("Couldn’t draw “"+raw.trim()+"”: "+e.message+".");
    }
  }
  return g;
}

/* Split text into plain lines and graph blocks.
   [graph] ... [/graph]   or one line:   [graph: y = x^2; x from -3 to 3] */
function splitBlocks(text){
  const out = [], lines = String(text||"").replace(/\r/g,"").split("\n");
  for(let i=0; i<lines.length; i++){
    const t = lines[i].trim();
    let m = /^\[graph\s*:\s*(.*)\]$/i.exec(t);
    if(m){ out.push({graph: parseBlock(m[1].split(";"))}); continue; }
    if(/^\[graph\]$/i.test(t)){
      const body = [];
      while(++i < lines.length && !/^\[\/graph\]$/i.test(lines[i].trim())) body.push(lines[i]);
      out.push({graph: parseBlock(body)});
      continue;
    }
    out.push({text: lines[i]});
  }
  return out;
}

const api = {parseExpression, parseBlock, splitBlocks, prettify};
if(typeof window !== "undefined") window.QalamGraph = api;
if(typeof module !== "undefined") module.exports = api;
})();
