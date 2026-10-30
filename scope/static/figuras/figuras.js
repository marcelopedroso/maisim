// MaiSim / Figuras — figuras para artigo a partir das rodadas (Marcelo, 29/10: "o MATLAB tem umas figuras muito boas"; um
// módulo no trilho, separado do scope): escolher a rodada (e uma B para comparar), os painéis (os do scope desta rodada, um
// com tudo, ou à mão), a janela de tempo e o estilo; a prévia é o PNG do servidor (scope/figura.py, matplotlib) e os botões
// baixam PDF/SVG/EPS (vetoriais) ou PNG/TIFF a 600 dpi. Os ajustes ficam guardados neste navegador, por circuito.
"use strict";
const $ = (id) => document.getElementById(id);
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const PALETA = ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e", "#9467bd", "#8c564b", "#e377c2", "#17becf", "#bcbd22", "#7f7f7f"];   // a do scope
// a notação dos nomes (a regra do scope, partesMat: v_o → v com índice o)
const RE_MAT = /(^|[^\p{L}\p{N}_])([A-Za-z]{1,4})_([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)(?![\p{L}\p{N}_])/gu;
function htmlMat(texto) {
  const s = String(texto); let i = 0, m, out = ""; RE_MAT.lastIndex = 0;
  while ((m = RE_MAT.exec(s))) {
    const ini = m.index + m[1].length;
    out += escH(s.slice(i, ini)) + `<span class="mat"><span class="${m[2].length === 1 ? "mb" : "mr"}">${escH(m[2])}</span><sub>${escH(m[3].split("_").join(","))}</sub></span>`;
    i = RE_MAT.lastIndex;
  }
  return out + escH(s.slice(i));
}
const lerJSON = (k, padrao) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? padrao : v; } catch (e) { return padrao; } };
const guardaJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* só nesta página */ } };
// o tempo com as unidades (10m, 10 ms, 500u, 500 µs, 0.01, 1e-2): em segundos; NaN se não entendeu
function lerTempo(txt) {
  const m = String(txt || "").trim().replace(",", ".").match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([pnuµμmk]?)\s*s?$/i);
  if (!m) return NaN;
  return parseFloat(m[1]) * ({ p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, "μ": 1e-6, m: 1e-3, k: 1e3, "": 1 }[m[2]] ?? NaN);
}
function fmtTempo(s) {
  const a = Math.abs(s);
  const [f, u] = a === 0 ? [1, "s"] : a < 2e-3 ? [1e6, "µs"] : a < 2 ? [1e3, "ms"] : [1, "s"];
  return `${+(s * f).toPrecision(6)} ${u}`;
}

let ESTILOS = {}, RODADAS = [];
const R = { arq: "", meta: {}, canais: [], t0: 0, t1: 0 };   // a rodada A
let arqB = "", paineis = [], estilo = {}, janela = { t0: null, t1: null };
const PADRAO_ESTILO = { preset: "ieee1", largura: null, altura: null, fonte: null, corpo: null, legenda: "melhor", lingua: "", grade: true, letras: false, pb: false };
const dono = (meta) => String((meta && (meta.chave_layout || meta.modelo || meta.planta)) || "");
const chave = () => (dono(R.meta) ? `maisim-figuras-v1:${dono(R.meta)}` : "");
const guarda = () => { if (chave()) guardaJSON(chave(), { paineis, estilo, janela }); };

// ---- os sinais e os painéis
function estiloSinal(canal) {
  const cores = lerJSON("maisim-scope-cores", {}), esp = lerJSON("maisim-scope-espessuras", {}), tr_ = lerJSON("maisim-scope-tracos", {});
  const idx = Math.max(0, R.canais.indexOf(canal));
  return { canal, cor: /^#[0-9a-f]{6}$/i.test(cores[canal] || "") ? cores[canal] : PALETA[idx % PALETA.length], esp: esp[canal] || 1.3, traco: tr_[canal] || "continua" };
}
function doScope() {                                    // os painéis desta rodada no scope (o layout guardado do circuito)
  const L = lerJSON(`maisim-scope-layout-v5:${dono(R.meta)}`, null);
  const ps = ((L && L.itens) || []).filter((x) => !x.secao && !x.xy && Array.isArray(x.sinais))
    .map((x) => ({ sinais: x.sinais.filter((c) => R.canais.includes(c)), ylabel: null, ymin: null, ymax: null })).filter((p) => p.sinais.length);
  return ps.length ? ps : null;
}
const tudo = () => [{ sinais: R.canais.slice(), ylabel: null, ymin: null, ymax: null }];
// a grandeza pelo nome (a mesma regra da unidade sugerida em scope/figura.py): v → V, i → A, P → W, T → °C…; "" sem unidade
function grandeza(c) {
  const b = String(c).split("_")[0];
  if (/^(theta|th|ang)$/i.test(b)) return "rad";
  if (/^(omega|w|wm|we)$/i.test(b)) return "rad/s";
  if (b === "n" || /^n[A-Z]/.test(b)) return "rpm";
  if (["Tel", "Te", "Tm", "Tl"].includes(b)) return "N·m";
  return { v: "V", u: "V", V: "V", U: "V", i: "A", I: "A", P: "W", T: "°C" }[b[0]] || "";
}
function porGrandeza() {                                // um painel por grandeza (as tensões juntas, as correntes juntas…); sem unidade, no fim
  const ordem = ["V", "A", "W", "°C", "rpm", "rad/s", "rad", "N·m", ""], g = new Map();
  for (const c of R.canais) { const u = grandeza(c); if (!g.has(u)) g.set(u, []); g.get(u).push(c); }
  return [...g.entries()].sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0])).map(([, sinais]) => ({ sinais, ylabel: null, ymin: null, ymax: null }));
}

function desenhaPaineis() {
  const box = $("paineis"); box.innerHTML = "";
  paineis.forEach((p, k) => {
    const d = document.createElement("div"); d.className = "painel";
    d.innerHTML = `<div class="topo"><b>${escH(tr("fig.painel.n", { n: k + 1 }))}</b>
      <button type="button" class="sobe" title="${escH(tr("fig.painel.sobe"))}" ${k ? "" : "disabled"}>↑</button>
      <button type="button" class="desce" title="${escH(tr("fig.painel.desce"))}" ${k < paineis.length - 1 ? "" : "disabled"}>↓</button>
      <button type="button" class="tira" title="${escH(tr("fig.painel.tira"))}">✕</button></div>
      <div class="sinais">${p.sinais.map((c) => `<span class="chip" data-c="${escH(c)}" style="--cor:${escH(estiloSinal(c).cor)}">${htmlMat(c)}<button type="button" class="tira-sinal" title="${escH(tr("fig.painel.tira_sinal"))}" aria-label="${escH(tr("fig.painel.tira_sinal"))}">✕</button></span>`).join("")}
        <button type="button" class="mais-sinais">${escH(tr("fig.painel.mais_sinais"))} ▾</button></div>
      <div class="campo"><label>${escH(tr("fig.painel.ylabel"))}</label><input type="text" class="ylabel" placeholder="${escH(tr("fig.painel.auto"))}" value="${escH(p.ylabel ?? "")}"></div>
      <div class="campo"><label>${escH(tr("fig.painel.y"))}</label><input type="text" class="curto ymin" placeholder="auto" value="${p.ymin ?? ""}">
        <span>${escH(tr("fig.janela.ate"))}</span><input type="text" class="curto ymax" placeholder="auto" value="${p.ymax ?? ""}"></div>
      ${p.sinais.length ? "" : `<div class="info">${escH(tr("fig.painel.vazio"))}</div>`}`;
    d.querySelectorAll(".tira-sinal").forEach((bt) => bt.addEventListener("click", () => {
      p.sinais = p.sinais.filter((c) => c !== bt.parentElement.dataset.c); mudou(true); }));
    d.querySelector(".mais-sinais").addEventListener("click", (e) => abreLista(e.currentTarget, p));
    d.querySelector(".ylabel").addEventListener("input", (e) => { p.ylabel = e.target.value === "" ? null : e.target.value; mudou(); });
    for (const k2 of ["ymin", "ymax"]) d.querySelector("." + k2).addEventListener("input", (e) => {
      const v = parseFloat(String(e.target.value).replace(",", ".")); p[k2] = Number.isFinite(v) ? v : null; mudou(); });
    d.querySelector(".sobe").onclick = () => { paineis.splice(k - 1, 0, paineis.splice(k, 1)[0]); mudou(true); };
    d.querySelector(".desce").onclick = () => { paineis.splice(k + 1, 0, paineis.splice(k, 1)[0]); mudou(true); };
    d.querySelector(".tira").onclick = () => { paineis.splice(k, 1); mudou(true); };
    box.appendChild(d);
  });
}

// a lista dos sinais de um painel (Marcelo, 30/10: "com muitos sinais, tem que ser dropdown, que só mostra os selecionados"):
// um filtro em cima e uma caixa por sinal; marcar e desmarcar muda o painel na hora; Esc, clicar fora ou o botão de novo fecha
function fechaLista() { const m = document.getElementById("lista-sinais"); if (m) { m.remove(); return true; } return false; }
function abreLista(bt, p) {
  const aberta = document.getElementById("lista-sinais"), mesma = aberta && aberta.dataset.de === String(paineis.indexOf(p));
  fechaLista(); if (mesma) return;
  const m = document.createElement("div"); m.id = "lista-sinais"; m.className = "lista-sinais"; m.dataset.de = String(paineis.indexOf(p));
  m.innerHTML = `<input type="search" class="filtro" placeholder="${escH(tr("fig.painel.filtro"))}" aria-label="${escH(tr("fig.painel.filtro"))}">
    <div class="itens">${R.canais.map((c) => `<label data-c="${escH(c)}"><input type="checkbox" value="${escH(c)}" ${p.sinais.includes(c) ? "checked" : ""}> ${htmlMat(c)}</label>`).join("")}</div>
    <div class="pe"><button type="button" class="todos">${escH(tr("fig.painel.todos"))}</button><button type="button" class="nenhum">${escH(tr("fig.painel.nenhum"))}</button></div>`;
  document.body.appendChild(m);
  const r = bt.getBoundingClientRect(); m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8))}px`;
  m.style.top = `${r.bottom + 4 + scrollY}px`;
  const aplica = () => { p.sinais = R.canais.filter((c) => m.querySelector(`input[value="${CSS.escape(c)}"]`).checked); mudou(true);
    const novo = document.querySelectorAll("#paineis .mais-sinais")[paineis.indexOf(p)];
    if (novo) { const rr = novo.getBoundingClientRect(); m.style.top = `${rr.bottom + 4 + scrollY}px`; } };
  m.querySelectorAll(".itens input").forEach((ck) => ck.addEventListener("change", aplica));
  m.querySelector(".filtro").addEventListener("input", (e) => { const f = e.target.value.trim().toLowerCase();
    m.querySelectorAll(".itens label").forEach((l) => { l.hidden = !!f && !l.dataset.c.toLowerCase().includes(f); }); });
  m.querySelector(".todos").onclick = () => { m.querySelectorAll(".itens label:not([hidden]) input").forEach((ck) => { ck.checked = true; }); aplica(); };
  m.querySelector(".nenhum").onclick = () => { m.querySelectorAll(".itens label:not([hidden]) input").forEach((ck) => { ck.checked = false; }); aplica(); };
  m.querySelector(".filtro").focus();
}
document.addEventListener("mousedown", (e) => { if (!e.target.closest("#lista-sinais, .mais-sinais")) fechaLista(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechaLista(); });

// ---- o estilo
function opcoes(sel, lista, valor) {
  sel.innerHTML = lista.map(([v, rot]) => `<option value="${escH(v)}">${escH(rot)}</option>`).join(""); sel.value = valor;
}
function desenhaEstilo() {
  const e = ESTILOS[estilo.preset] || ESTILOS.ieee1 || {};
  opcoes($("sel-estilo"), Object.keys(ESTILOS).map((k) => [k, tr(`fig.est.${k}`)]), estilo.preset);
  opcoes($("sel-fonte"), [["serif", tr("fig.fonte.serif")], ["sans", tr("fig.fonte.sans")]], estilo.fonte || e.fonte || "serif");
  opcoes($("sel-legenda"), [["melhor", tr("fig.leg.melhor")], ["acima", tr("fig.leg.acima")], ["nenhuma", tr("fig.leg.nenhuma")]], estilo.legenda);
  opcoes($("sel-lingua"), [["", tr("fig.ling.pagina")], ["pt", tr("fig.ling.pt")], ["en", tr("fig.ling.en")]], estilo.lingua || "");
  $("larg").value = String(estilo.largura ?? e.largura ?? "").replace(".", maisimI18n.lingua() === "en" ? "." : ",");
  $("alt").value = estilo.altura == null ? "" : String(estilo.altura);
  $("corpo").value = String(estilo.corpo ?? e.corpo ?? "");
  $("ck-grade").checked = estilo.grade !== false; $("ck-letras").checked = !!estilo.letras; $("ck-pb").checked = !!estilo.pb;
}
const num = (v) => { const x = parseFloat(String(v).replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : null; };
$("sel-estilo").addEventListener("change", (e) => { estilo = { ...estilo, preset: e.target.value, largura: null, altura: null, fonte: null, corpo: null }; desenhaEstilo(); mudou(); });
$("sel-fonte").addEventListener("change", (e) => { estilo.fonte = e.target.value; mudou(); });
$("sel-legenda").addEventListener("change", (e) => { estilo.legenda = e.target.value; mudou(); });
$("sel-lingua").addEventListener("change", (e) => { estilo.lingua = e.target.value; mudou(); });
$("larg").addEventListener("input", (e) => { estilo.largura = num(e.target.value); mudou(); });
$("alt").addEventListener("input", (e) => { estilo.altura = num(e.target.value); mudou(); });
$("corpo").addEventListener("input", (e) => { estilo.corpo = num(e.target.value); mudou(); });
for (const [id, k] of [["ck-grade", "grade"], ["ck-letras", "letras"], ["ck-pb", "pb"]]) $(id).addEventListener("change", (e) => { estilo[k] = e.target.checked; mudou(); });

// ---- a janela de tempo
function desenhaJanela() {
  $("t0").value = fmtTempo(janela.t0 ?? R.t0); $("t1").value = fmtTempo(janela.t1 ?? R.t1);
  const a = janela.t0 ?? R.t0, b = janela.t1 ?? R.t1;
  $("info-janela").textContent = R.arq ? tr("fig.janela.info", { dur: fmtTempo(b - a), total: fmtTempo(R.t1 - R.t0) }) : "";
}
for (const id of ["t0", "t1"]) $(id).addEventListener("change", (e) => {
  const v = lerTempo(e.target.value);
  if (Number.isNaN(v)) { estado(tr("fig.janela.invalido", { txt: e.target.value }), true); return; }
  janela[id] = v; desenhaJanela(); mudou();
});
$("bt-inteira").onclick = () => { janela = { t0: null, t1: null }; desenhaJanela(); mudou(); };

// ---- a rodada
function desenhaRodadas() {
  const op = (r) => `<option value="${escH(r.arq)}">${escH(r.rotulo || r.arq)}</option>`;
  $("sel-a").innerHTML = (RODADAS.length ? "" : `<option value="">${escH(tr("fig.rodada.nenhuma_gravada"))}</option>`) + RODADAS.map(op).join("");
  $("sel-b").innerHTML = `<option value="">${escH(tr("fig.rodada.nenhuma"))}</option>` + RODADAS.map(op).join("");
  $("sel-a").value = R.arq; $("sel-b").value = arqB;
}
async function abreRodada(arq, de = null) {
  if (!arq) return;
  const r = await fetch(`canais?arq=${encodeURIComponent(arq)}`).then((x) => x.json()).catch(() => null);
  if (!r || r.erro) { estado((r && r.erro) || tr("fig.rodada.erro"), true); return; }
  Object.assign(R, { arq, meta: r.meta || {}, canais: r.canais || [], t0: r.t0, t1: r.t1 });
  const salvo = lerJSON(chave(), null);
  if (de) { paineis = de.paineis; janela = { t0: de.t0 ?? null, t1: de.t1 ?? null }; arqB = de.arqB || ""; }
  else if (salvo && Array.isArray(salvo.paineis)) {
    paineis = salvo.paineis.map((p) => ({ ...p, sinais: (p.sinais || []).filter((c) => R.canais.includes(c)) }));
    janela = salvo.janela || { t0: null, t1: null };
  } else { paineis = doScope() || porGrandeza(); janela = { t0: null, t1: null }; }
  if (janela.t0 != null && (janela.t0 < R.t0 || janela.t0 >= R.t1)) janela.t0 = null;
  if (janela.t1 != null && (janela.t1 > R.t1 || janela.t1 <= R.t0)) janela.t1 = null;
  estilo = { ...PADRAO_ESTILO, ...((salvo && salvo.estilo) || estilo) };
  const sel = RODADAS.find((x) => x.arq === arq);
  $("info-rodada").textContent = tr("fig.rodada.info", { n: R.canais.length, dur: fmtTempo(R.t1 - R.t0) }) + (sel && sel.rotulo ? ` · ${sel.rotulo}` : "");
  desenhaRodadas(); desenhaPaineis(); desenhaJanela(); desenhaEstilo(); mudou(false, true);
}
$("sel-a").addEventListener("change", (e) => abreRodada(e.target.value));
$("sel-b").addEventListener("change", (e) => { arqB = e.target.value; mudou(); });
$("bt-painel").onclick = () => { paineis.push({ sinais: [], ylabel: null, ymin: null, ymax: null }); mudou(true); };
$("bt-do-scope").onclick = () => { const p = doScope(); if (p) { paineis = p; mudou(true); } else estado(tr("fig.paineis.sem_scope"), true); };
$("bt-tudo").onclick = () => { paineis = tudo(); mudou(true); };
$("bt-grandeza").onclick = () => { paineis = porGrandeza(); mudou(true); };

// ---- a prévia e os arquivos
function pedido(formato) {
  const ps = paineis.filter((p) => p.sinais.length).map((p) => ({ sinais: p.sinais.map(estiloSinal), ylabel: p.ylabel, ymin: p.ymin, ymax: p.ymax }));
  const lg = estilo.lingua || (maisimI18n.lingua() === "en" ? "en" : "pt");
  return { arq: R.arq, arqB: arqB || null, t0: janela.t0, t1: janela.t1, paineis: ps, estilo: { ...estilo, lingua: lg }, formato };
}
async function gera(formato) {
  const r = await fetch("figura", { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(pedido(formato)) });
  if (!r.ok) { let m = ""; try { m = (await r.json()).erro; } catch (e) { /* sem corpo */ } throw new Error(m || `HTTP ${r.status}`); }
  return r.blob();
}
function estado(txt, erro) { const e = $("estado"); e.textContent = txt || ""; e.className = erro ? "erro" : ""; }
let tPrevia = null, nPrevia = 0, urlPrevia = null;
function mudou(redesenha, ja) {
  if (redesenha) desenhaPaineis();
  guarda();
  clearTimeout(tPrevia); tPrevia = setTimeout(previa, ja ? 0 : 400);
}
async function previa() {
  if (!R.arq || !paineis.some((p) => p.sinais.length)) { $("previa").hidden = true; estado(tr("fig.previa.vazia")); return; }
  const n = ++nPrevia; estado(tr("fig.previa.gerando"));
  try {
    const b = await gera("previa"); if (n !== nPrevia) return;
    if (urlPrevia) URL.revokeObjectURL(urlPrevia);
    urlPrevia = URL.createObjectURL(b); const img = $("previa");
    img.onload = () => { const cm = (px) => (px / 150 * 2.54).toLocaleString(maisimI18n.lingua() === "en" ? "en" : "pt-BR", { maximumFractionDigits: 1 });
      img.style.width = `${Math.min(img.naturalWidth, img.parentElement.clientWidth - 32)}px`;
      estado(tr("fig.previa.tam", { l: cm(img.naturalWidth), a: cm(img.naturalHeight) })); };
    img.src = urlPrevia; img.hidden = false;
  } catch (e) { if (n === nPrevia) { estado(e.message, true); } }
}
const pad = (x) => String(x).padStart(2, "0");
document.querySelectorAll("#exportar button").forEach((bt) => bt.addEventListener("click", async () => {
  const f = bt.dataset.formato; if (!R.arq) return;
  bt.disabled = true; estado(tr("fig.exp.gerando", { formato: bt.textContent }));
  try {
    const b = await gera(f), d = new Date();
    const nome = `figura_${String(R.meta.planta || "maisim").replace(/[^\w-]+/g, "_")}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${f === "tiff" ? "tif" : f}`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    estado(tr("fig.exp.baixado", { arq: nome }));
  } catch (e) { estado(e.message, true); }
  bt.disabled = false;
}));

// ---- o tema (o trilho grava "maisim-tema"; "sistema" segue o sistema) e o idioma
function acompanhaTema() {
  let t = "sistema"; try { t = localStorage.getItem("maisim-tema") || "sistema"; } catch (e) { /* ok */ }
  document.documentElement.dataset.tema = t === "escuro" || (t === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches) ? "escuro" : "claro";
}
window.addEventListener("storage", (e) => { if (e.key === "maisim-tema") acompanhaTema(); });
window.addEventListener("maisim-tema", acompanhaTema);
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", acompanhaTema); } catch (e) { /* ok */ }
maisimI18n.aoMudar(() => { desenhaRodadas(); desenhaPaineis(); desenhaEstilo(); desenhaJanela();
  if (R.arq) $("info-rodada").textContent = tr("fig.rodada.info", { n: R.canais.length, dur: fmtTempo(R.t1 - R.t0) }); mudou(); });

// ---- a partida: os estilos, as rodadas e a escolhida (?a=, ou a que veio do scope: "Abrir no Figuras")
(async () => {
  [ESTILOS, RODADAS] = await Promise.all([fetch("estilos").then((r) => r.json()).catch(() => ({})), fetch("rodadas").then((r) => r.json()).catch(() => [])]);
  estilo = { ...PADRAO_ESTILO };
  let de = lerJSON("maisim-figuras-do-scope", null);
  try { localStorage.removeItem("maisim-figuras-do-scope"); } catch (e) { /* ok */ }
  if (de && !(Date.now() - (de.quando || 0) < 60000)) de = null;
  const q = new URLSearchParams(location.search).get("a");
  const arq = (de && de.arq) || q || (RODADAS[0] && RODADAS[0].arq) || "";
  desenhaRodadas(); desenhaEstilo();
  if (arq) await abreRodada(arq, de && de.arq === arq ? de : null); else estado(tr("fig.previa.vazia"));
})();
