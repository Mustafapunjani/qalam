(function(){
"use strict";
// Must match the keys used by converter.js
const FONT_KEY = "qalam-font-v1", SETTINGS_KEY = "qalam-settings-v1";
const $ = id=>document.getElementById(id);
const form = $("form"), input = $("pages"), filesEl = $("files"), statusEl = $("status");
const go = $("go"), result = $("result"), drop = $("drop");
const EMPTY = filesEl.textContent;
let last = null, fontUrl = null;

function setStatus(msg, bad){ statusEl.textContent = msg || ""; statusEl.classList.toggle("error", !!bad); }
function showFiles(){ filesEl.textContent = input.files.length ? Array.from(input.files).map(f=>f.name).join(", ") : EMPTY; }
input.addEventListener("change", showFiles);
["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("over"); }));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev, ()=>drop.classList.remove("over")));
drop.addEventListener("drop", e=>{ e.preventDefault(); if(e.dataTransfer.files.length){ input.files = e.dataTransfer.files; showFiles(); } });

// Hosting platforms limit upload size (Vercel: 4.5 MB per request), and phone photos are often
// 3-8 MB each. Resize and recompress in the browser so all pages together stay under ~4 MB.
const UPLOAD_BUDGET = 4.0e6;
function toJpeg(canvas, q){ return new Promise(res=>canvas.toBlob(res, "image/jpeg", q)); }
async function shrink(file, target){
  if(file.size <= target && /jpe?g/i.test(file.type)) return file;
  let bmp;
  try{ bmp = await createImageBitmap(file, {imageOrientation:"from-image"}); }
  catch(e){ return file; }            // a format the browser can't decode: send as-is and let the server explain
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  for(const longest of [3000, 2600, 2200]){
    const s = Math.min(1, longest / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width*s); c.height = Math.round(bmp.height*s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    for(const q of [0.88, 0.8, 0.72]){
      const blob = await toJpeg(c, q);
      if(blob && blob.size <= target) return new File([blob], name, {type:"image/jpeg"});
    }
  }
  const c = document.createElement("canvas"), s = 1800 / Math.max(bmp.width, bmp.height);
  c.width = Math.round(bmp.width*s); c.height = Math.round(bmp.height*s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new File([await toJpeg(c, 0.7)], name, {type:"image/jpeg"});
}

function b64ToBytes(b64){ const s = atob(b64), a = new Uint8Array(s.length); for(let i=0;i<s.length;i++) a[i] = s.charCodeAt(i); return a; }

form.addEventListener("submit", async e=>{
  e.preventDefault();
  if(!input.files.length){ setStatus("Choose at least one photo first.", true); return; }
  if(input.files.length > 4){ setStatus("Upload at most 4 photos: one for each template page.", true); return; }
  go.disabled = true; setStatus("Preparing your photos…");
  try{
    const files = Array.from(input.files), body = new FormData();
    body.append("name", form.elements.name.value);
    for(const f of files) body.append("pages", await shrink(f, UPLOAD_BUDGET / files.length));
    setStatus("Building your font. This takes a few seconds…");
    const res = await fetch(window.QALAM.api, {method:"POST", body});
    const data = res.status === 413
      ? {error:"Those photos are too large to upload. Try photos taken at a lower resolution."}
      : await res.json().catch(()=>({error:"The server sent an unexpected reply. Try again in a minute."}));
    if(!res.ok || data.error){ setStatus(data.error || "The font couldn’t be built.", true); return; }
    last = data;
    const bytes = b64ToBytes(data.font_base64);
    if(fontUrl) URL.revokeObjectURL(fontUrl);
    fontUrl = URL.createObjectURL(new Blob([bytes], {type:"font/ttf"}));
    const dl = $("download");
    dl.href = fontUrl; dl.download = (data.family.replace(/[^A-Za-z0-9]+/g,"") || "MyHandwriting") + ".ttf";
    $("preview").src = "data:image/png;base64," + data.preview_base64;
    const notes = $("notes"); notes.textContent = "";
    const add = t=>{ const li = document.createElement("li"); li.textContent = t; notes.append(li); };
    if(data.missing_pages.length) add("Not uploaded yet: page " + data.missing_pages.join(" and ") + ". Add it to include the remaining characters.");
    else if(data.missing.length) add("These characters were left blank, so they’ll use a fallback font: " + data.missing.join(" "));
    data.warnings.forEach(add);
    const face = new FontFace("UserHand", bytes.buffer);
    await face.load(); document.fonts.add(face);
    $("try").style.fontFamily = '"UserHand", cursive';
    result.hidden = false; setStatus("");
    result.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  }catch(err){
    setStatus("Couldn’t reach the server. Check your connection and try again.", true);
  }finally{ go.disabled = false; }
});

$("use").addEventListener("click", ()=>{
  if(!last) return;
  try{
    localStorage.setItem(FONT_KEY, JSON.stringify({name: last.family, data: last.font_base64}));
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
    s.font = "custom";
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    location.href = window.QALAM.converter;
  }catch(e){
    setStatus("Your browser blocked saving the font. Download it instead, then use “Upload font” in the converter.", true);
  }
});
})();
