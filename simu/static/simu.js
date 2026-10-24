// MaiSim / simu: desenho e edição do circuito; o GeckoCIRCUITS (backend) aplica, simula e grava o .ipes (ipes.py lê).
// SVG na grade do Gecko (G px por unidade), arrastar move, roda dá zoom no ponto do mouse; SM (subcircuito): clique abre
// a folha de dentro. Os scopes do Gecko ficam de fora (o /maisim/scope faz esse papel).
"use strict";
const G = 16, NS = "http://www.w3.org/2000/svg";
// cores do desenho por tema (as da interface estão no CSS); o trilho do MaiSim troca o tema (<html data-tema>) e avisa com "maisim-tema"
const TEMA_COR = {
  claro: { lk: "#2233aa", fioLK: "#2b4be0", ct: "#2e8b3d", fioCT: "#2e8b3d", rot: "#1b7f2a", par: "#b0249a", nome: "#1b1f24", sub: "#5b3fd1",
    cartao: "#fff", corpo: "#eef1ff", ctFundo: "#e4f5df", subFundo: "#f6f3ff", bordaSM: "#b9a8f0", grade: "#d5d9e0", seta: "#c2410c",
    texto: "#1f2937", texto2: "#334155", ampFundo: "#e0f2fe", ampTexto: "#0369a1", erro: "#b42318", fraco: "#8a939d", liga: "#1b7f2a",
    atuFundo: "#fff7e6", atuBorda: "#d97706", atuIcone: "#b45309", atuTexto: "#92400e" },
  escuro: { lk: "#8fa2ff", fioLK: "#6d86ff", ct: "#4fc56c", fioCT: "#4fc56c", rot: "#6ee7a0", par: "#f08ae0", nome: "#e6e8ec", sub: "#b39dff",
    cartao: "#171a21", corpo: "#1c2240", ctFundo: "#13261a", subFundo: "#221d38", bordaSM: "#5b4a9c", grade: "#2a303a", seta: "#fb923c",
    texto: "#e6e8ec", texto2: "#cbd5e1", ampFundo: "#0c2a3a", ampTexto: "#7dd3fc", erro: "#f87171", fraco: "#6b7480", liga: "#4ade80",
    atuFundo: "#33280f", atuBorda: "#d97706", atuIcone: "#fbbf24", atuTexto: "#fcd34d" } };
const temaAtual = () => (document.documentElement.dataset.tema === "escuro" ? "escuro" : "claro");
const COR = Object.assign({}, TEMA_COR[temaAtual()]);
addEventListener("maisim-tema", () => {                    // o tema mudou: o desenho e a paleta com as cores novas
  Object.assign(COR, TEMA_COR[temaAtual()]);
  if (typeof dados !== "undefined" && dados) desenha();
  if (typeof ed !== "undefined" && ed.catalogo) desenhaPaleta();
});
// o nome de um subcircuito (subcircuito é qualquer coisa, não só um submódulo): o que o usuário deu ao bloco; o padrão do
// Gecko, SUBCIRCUIT.k, fica curto, Sub.k. O prefixo dos nomes de dentro (canais do scope, atuações) é o mesmo, com _
// a janela do código (/maisim/simu/?vista=codigo, pelo trilho): só o painel do controle, em tela cheia, ligado ao circuito
// aberto no simu (o mesmo servidor). O ▶ fica na janela do circuito; aqui, a rodada trava a edição e mostra o andamento.
// As janelas conversam pelo BroadcastChannel: controle guardado, circuito mudou, rodada começou, a janela do código aberta
const VISTA_CODIGO = new URLSearchParams(location.search).get("vista") === "codigo";
if (VISTA_CODIGO) document.body.classList.add("vista-codigo");
const canal = typeof BroadcastChannel === "function" ? new BroadcastChannel("maisim-simu") : null;
const EU = Math.random().toString(36).slice(2);
function avisa(tipo, extra = {}) { if (canal) try { canal.postMessage(Object.assign({ tipo, de: EU, codigo: VISTA_CODIGO }, extra)); } catch (e) { /* ok */ } }
const nomeSub = (nome) => String(nome).replace(/^SUBCIRCUIT\.(\d+)$/, "Sub.$1");
const prefixoSub = (nome) => nomeSub(nome).replace(/[^A-Za-z0-9_]/g, "_");
const DESCR = { R: "resistor", L: "indutor", C: "capacitor", U: "fonte de tensão", I: "fonte de corrente", D: "diodo", IGBT: "IGBT",
  S: "chave ideal", MOSFET: "MOSFET", THYR: "tiristor", CONST: "constante", SIGNAL: "fonte de sinal", GATE: "comando de gate",
  GAIN: "ganho", ADD: "soma", SUB: "subtração", NOT: "NÃO lógico", AND: "E lógico", DELAY: "atraso", GE: "comparador (≥)",
  VOLT: "voltímetro", AMP: "amperímetro", SUBCIRCUIT: "subcircuito", TERM: "terminal do subcircuito" };
const SIMBOLO = { CONST: "C", SIGNAL: "∿", GATE: "G", GAIN: "K", ADD: "+", SUB: "−", NOT: "¬", AND: "&", DELAY: "Δt", GE: "≥", VOLT: "V", AMP: "A" };
const UNID = { resistance: "Ω", inductance: "H", capacitance: "F", amplitude: "V", dcValue: "V", frequency: "Hz", onResistance: "Ω",
  offResistance: "Ω", frequenz: "Hz", phaseDegrees: "°", phase: "°", initialCurrent: "A" };
const $ = (id) => document.getElementById(id);
let dados = null, folhaAtual = "0", ver = { x: 0, y: 0, w: 100, h: 60 }, mostrar = { controle: true, rotulos: true, corrente: true, medicoes: true };

function si(v, u) {
  if (v == null || !isFinite(v)) return "–";
  const a = Math.abs(v); if (a === 0) return `0 ${u || ""}`.trim();
  const P = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]];
  const [f, p] = P.find(([f]) => a >= f * 0.9999) || P[P.length - 1];
  return `${+(v / f).toPrecision(4)} ${p}${u || ""}`.trim();
}
function no(tag, at, pai) { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (pai) pai.appendChild(e); return e; }
let rotulosFeitos = new Set();                              // o mesmo rótulo no mesmo lugar só uma vez (fio e terminal)
function rotulo(pai, x, y, s, at) {
  const k = `${s}@${Math.round(x)},${Math.round(y)}`;
  if (rotulosFeitos.has(k)) return null;
  rotulosFeitos.add(k); return texto(pai, x, y, s, at);
}
// corta um texto já desenhado (com …) até caber em larg quadrados da grade, pela largura medida; curto demais, sai
function cortaAte(t, larg) {
  const cheio = t.textContent; let n = cheio.length;
  while (n > 2 && t.getComputedTextLength() > larg * G) { n--; t.textContent = cheio.slice(0, n - 1) + "…"; }
  if (t.getComputedTextLength() > larg * G) t.remove();
}
function texto(pai, x, y, s, at = {}) { const t = no("text", Object.assign({ x: x * G, y: y * G, "font-size": 0.62 * G, "dominant-baseline": "middle" }, at), pai); t.textContent = s; return t; }
const P = (p) => `${p[0] * G},${p[1] * G}`;
const ICONE_TOPO = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 1.8 14 5 8 8.2 2 5z" fill="currentColor" fill-opacity=".85"/><path d="M2 8l6 3.2L14 8" opacity=".6"/><path d="M2 11l6 3.2 6-3.2" opacity=".35"/></svg>`;
const soma = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1]];

// ---------------------------------------------------------------- símbolos dos elementos de dois pinos
// bolinhas de junção. Regra do Gecko (PotentialArea.geometricOnSamePotential): há ligação onde uma PONTA (de conexão ou
// terminal de componente) cai em qualquer ponto de outra conexão; cruzamento sem ponta não liga. Bolinha onde três ou mais
// ramos se encontram e há uma ponta: conexão que passa pelo ponto conta 2 ramos; ponta ou terminal, 1. Potência e controle à parte.
const domTerm = (e, t) => t.dom || (e.dom === "CONTROL" || e.dom === "THERM" ? e.dom : "LK");
function juncoes(f) {
  const ramos = new Map(), ponta = new Set();
  const soma = (d, x, y, n, eh) => { const k = `${d}|${x},${y}`; ramos.set(k, (ramos.get(k) || 0) + n); if (eh) ponta.add(k); };
  for (const w of f.fios) {
    const visto = new Set();
    w.pts.forEach((p, i) => { const fim = i === 0 || i === w.pts.length - 1, k = p.join(",");
      if (visto.has(k) && !fim) return; visto.add(k); soma(w.dom, p[0], p[1], fim ? 1 : 2, fim); });
  }
  for (const e of f.elementos) { if (e.tipo === "SCOPE") continue; for (const t of e.terminais || []) soma(domTerm(e, t), t.x, t.y, 1, true); }
  return [...ramos].filter(([k, n]) => n >= 3 && ponta.has(k)).map(([k]) => { const [d, xy] = k.split("|"); return [d, ...xy.split(",").map(Number)]; });
}
function desenhaJuncoes(g, f) {
  for (const [d, x, y] of juncoes(f)) {
    if (d === "CONTROL" && !mostrar.controle) continue;
    no("circle", { class: "juncao", cx: x * G, cy: y * G, r: 0.24 * G, fill: d === "CONTROL" ? COR.fioCT : COR.fioLK }, g);
  }
}
// medidores: o nome com que o sinal vai para o /maisim/scope (o rótulo da saída, ou o nome do bloco, como em rodar() no servidor)
// dentro de um subcircuito, o nome leva o SM na frente (SM_1_vCSm), como em rodar() no servidor
const canalScope = (e, fid = folhaAtual) => { const c = (e.saidas[0] || e.nome).replace(/[^A-Za-z0-9_]/g, "_");
  return fid === "0" ? c : `${prefixoSub(dados.folhas[fid].nome)}_${c}`; };
const MEDIDOR = new Set(["VOLT", "AMP"]);
// a seção e o painel do scope de um sinal (Marcelo, 23/10): o layout do scope é por circuito, guardado no navegador (o mesmo
// endereço do simu: as duas páginas veem o mesmo); escolher aqui muda o layout, e o scope (aqui dentro ou na
// janela dele) se remonta. Um circuito ainda no automático: o automático vira o layout dele antes (os outros sinais não somem)
// A chave é a mesma do scope (o servidor diz qual: o caminho do circuito; um novo, o momento em que foi criado)
function circuitoDoLayout() {
  if (!dados || dados.fechado) return "";
  return String(dados.chave_layout || (/^\(/.test(dados.arq || "") ? "" : dados.arq || ""));
}
const nomeDoLayout = () => (ed.novo || String((dados && dados.arq) || "").split("/").pop().replace(/\.ipes$/, ""));
// o padrão do circuito (o .scope.json ao lado dele): um circuito ainda sem layout neste navegador parte dele, como no scope
let padraoLayout = { chave: null, L: null };
async function lePadraoLayout() {
  const c = circuitoDoLayout(); if (!c || padraoLayout.chave === c) return;
  let L = null;
  if (!/^novo[: ]/.test(c)) try { const r = await fetch(`/maisim/simu/scope/padrao?modelo=${encodeURIComponent(c)}`); if (r.ok) L = (await r.json()).layout || null; } catch (e) { /* sem padrão */ }
  padraoLayout = { chave: c, L };
}
function canaisDoCircuito() {                            // os sinais que vão para o scope (medidores, tags, saídas de blocos), na ordem do scope
  const out = [];
  for (const [fid, f] of Object.entries((dados && dados.folhas) || {}))
    for (const e of f.elementos) if ((MEDIDOR.has(e.tipo) || ehTag(e) || ehSinal(e, fid)) && !foraDoScope(e)) out.push(canalScope(e, fid));
  return [...new Set(out)].sort();
}
function leLayoutCircuito() {                          // o guardado (v5; o de antes, v4, pelo nome), o padrão ou o automático
  const c = circuitoDoLayout(); if (!c) return null;
  const auto = () => ({ colunas: 2, itens: [{ secao: nomeDoLayout() }, { titulo: "Sinais da rodada", sinais: canaisDoCircuito().slice(0, 8), largura: 1 }] });   // o automático do scope
  let j = null; try { j = JSON.parse(localStorage.getItem(`maisim-scope-layout-v5:${c}`) || "null"); } catch (e) { /* o próximo */ }
  if (j && Array.isArray(j.itens)) return j.itens.length ? j : auto();   // guardado vazio: o automático (como no scope)
  if (!/^novo[: ]/.test(c)) try { j = JSON.parse(localStorage.getItem(`maisim-scope-layout-v4:${nomeDoLayout()}`) || "null");
    if (j && Array.isArray(j.itens) && j.itens.length) return j; } catch (e) { /* o próximo */ }
  if (padraoLayout.chave === c && padraoLayout.L) return JSON.parse(JSON.stringify(padraoLayout.L));
  return auto();
}
function gravaLayoutCircuito(L) {
  try { localStorage.setItem(`maisim-scope-layout-v5:${circuitoDoLayout()}`, JSON.stringify(L)); return true; } catch (e) { msg("o navegador não deixou guardar o layout do scope", "erro"); return false; }
}
// salvar como: o layout do scope vai junto para o arquivo novo (como o .scope.json no servidor); sem layout, o que estava
// guardado para aquele caminho (de outro circuito, que estava lá antes) sai
function levaLayout(de, para) {
  if (!de || !para || de === para) return;
  try { const v = localStorage.getItem(`maisim-scope-layout-v5:${de}`);
    if (v !== null) localStorage.setItem(`maisim-scope-layout-v5:${para}`, v); else localStorage.removeItem(`maisim-scope-layout-v5:${para}`); } catch (e) { /* ok */ }
}
// o layout mudou no scope (outra janela) com as escolhas abertas aqui: refaz as listas (os números delas são posições)
let redesenhaNoPainel = null;
addEventListener("storage", (e) => { if (redesenhaNoPainel && e.key === `maisim-scope-layout-v5:${circuitoDoLayout()}`) redesenhaNoPainel(); });
function gruposDoLayout(L) {                             // [{secao, paineis: [item]}]; os painéis antes da 1ª seção ficam em "(sem seção)"
  const gs = []; let g = null;
  for (const x of L.itens) { if (x.secao) { g = { secao: x.secao, item: x, paineis: [] }; gs.push(g); } else { if (!g) { g = { secao: "(sem seção)", item: null, paineis: [] }; gs.push(g); } g.paineis.push(x); } }
  return gs;
}
function ligaNoPainel(np) {
  const canal = np.dataset.canal, selS = np.querySelector("#p-secao"), selP = np.querySelector("#p-painel");
  const desenhaOps = (secaoEscolhida) => {
    if (!np.isConnected) { redesenhaNoPainel = null; return; }   // o painel de propriedades já é outro
    const L = leLayoutCircuito(), gs = gruposDoLayout(L);
    const onde = gs.flatMap((g) => g.paineis.map((p) => ({ g, p }))).find((x) => (x.p.sinais || []).includes(canal));
    const sAtual = secaoEscolhida != null ? secaoEscolhida : onde ? gs.indexOf(onde.g) : -1;
    selS.innerHTML = `<option value="">—</option>` + gs.map((g, k) => `<option value="${k}"${k === sAtual ? " selected" : ""}>${escT(g.secao)}</option>`).join("") + `<option value="+">+ nova seção…</option>`;
    const g = gs[sAtual];
    selP.innerHTML = `<option value="">${onde || g ? "—" : "fora de qualquer painel"}</option>` + (g ? g.paineis.map((p, k) => `<option value="${k}"${onde && onde.p === p ? " selected" : ""}>${escT(p.titulo || "(sem título)")}</option>`).join("") + `<option value="+">+ novo painel…</option>` : "");
    selP.disabled = !g || esperando; selS.disabled = esperando;
  };
  const poe = (L, g, painel) => {                       // o sinal só neste painel (sai dos outros)
    for (const x of L.itens) if (!x.secao && Array.isArray(x.sinais)) x.sinais = x.sinais.filter((c) => c !== canal);
    if (!painel.sinais.includes(canal)) painel.sinais.push(canal);
    if (gravaLayoutCircuito(L)) msg(`${canal} vai para o painel “${painel.titulo}” (seção ${g.secao}) no scope`, "ok");
  };
  selS.onchange = async () => {
    if (selS.value === "+") {
      const r = await modal({ titulo: "Nova seção no scope", campos: [{ nome: "secao", rotulo: "Nome da seção", valor: "" }, { nome: "painel", rotulo: "Painel", valor: canal }], ok: "Criar" });
      const s = r && r.secao.trim(), t = (r && r.painel.trim()) || canal;
      if (!s) { desenhaOps(); return; }
      const L = leLayoutCircuito(), painel = { titulo: t, sinais: [], largura: 1 };
      L.itens.push({ secao: s }, painel); poe(L, { secao: s }, painel); desenhaOps(); return;
    }
    desenhaOps(selS.value === "" ? -1 : +selS.value);
  };
  const mudou = () => { msg("o layout do scope mudou: escolha de novo", "erro"); desenhaOps(); };
  selP.onchange = async () => {
    const L = leLayoutCircuito(), gs = gruposDoLayout(L), g = gs[+selS.value];
    if (!g || g.secao !== selS.selectedOptions[0].textContent) return mudou();   // outra janela mexeu no layout no meio
    if (selP.value === "+") {
      const r = await modal({ titulo: `Novo painel em ${g.secao}`, campos: [{ nome: "painel", rotulo: "Título do painel", valor: canal }], ok: "Criar" });
      const t = r && r.painel.trim(); if (!t) { desenhaOps(+selS.value); return; }
      const painel = { titulo: t, sinais: [], largura: 1 };
      const ultimo = g.paineis.length ? g.paineis[g.paineis.length - 1] : g.item;   // no fim da seção
      L.itens.splice(ultimo ? L.itens.indexOf(ultimo) + 1 : L.itens.length, 0, painel);
      poe(L, g, painel); desenhaOps(); return;
    }
    if (selP.value === "") return;
    const painel = g.paineis[+selP.value];
    if (!painel || (painel.titulo || "(sem título)") !== selP.selectedOptions[0].textContent) return mudou();
    poe(L, g, painel); desenhaOps();
  };
  redesenhaNoPainel = () => desenhaOps();
  // enquanto o padrão do circuito vem, as listas esperam (escolher agora gravaria o automático, e o padrão não entraria mais)
  let esperando = true; desenhaOps();
  lePadraoLayout().then(() => { esperando = false; desenhaOps(); });
}
// a tag (scope e controle): um ganho 1 do Gecko (r0 = 1) chamado TAG.k — repassa o sinal ligado na entrada, e o nome da saída é o
// nome do sinal no /maisim/scope e no m[...] do controle (como um medidor). Para levar um sinal para fora de um subcircuito
// (por um Control Terminal) e dar a ele o nome que quiser, ou marcar qualquer ponto de controle
// o sinal deste componente fora do scope e do controle (marcado no painel; vai junto com a aparência do circuito)
const foraDoScope = (e) => !!(dados && dados.fora && e.uid && dados.fora.includes(e.uid));
// componentes cujo sinal vai para o scope e o controle: na folha principal, os blocos de controle com saída; nos SMs, os
// medidores e as tags (sinais_da_rodada, no servidor)
const ehSinal = (e, fid) => fid === "0" ? e.dom === "CONTROL" && !["TERM", "GATE", "SCOPE"].includes(e.tipo) && e.saidas.length > 0
  : MEDIDOR.has(e.tipo) || ehTag(e);
const ehTag = (e) => e.tipo === "GAIN" && /^TAG\.\d+$/.test(e.nome);
const TAG_ITEM = { enum: "MAISIM_TAG", dom: "CONTROL", typ: 7, classe: "ReglerGain", id: "TAG", nome: "Tag (scope e controle)", criar: "GAIN" };
function medicoes(f) {                                 // o que está sendo medido nesta folha: corrente de quem, tensão de que nós
  const I = new Map(), V = new Map();
  for (const e of f.elementos) {
    if (e.tipo === "AMP" && e.mede[0]) I.set(e.mede[0], [canalScope(e), e.nome]);       // [canal, o medidor]
    if (e.tipo === "VOLT") e.mede.forEach((n, k) => n && !V.has(n) && V.set(n, [canalScope(e), k ? "−" : "+", e.nome]));
  }
  return { I, V };
}
// cores das medições (pedido de Marcelo): como no osciloscópio — ponta de prova vermelha (V+) e garra preta (V−), a corrente
// num azul de sensor Hall; a BORDA é a cor do canal (a escolhida, ou o padrão que o servidor dá: amarelo, ciano, magenta,
// verde; corrente azul Hall), a mesma que a rodada leva no meta para o scope
// o seletor de onde fica a ponta (+) ou a garra (−) do voltímetro: os componentes ligados ao nó (o servidor diz quais)
function seletorPonta(e, k) {
  const no_ = e.mede[k]; if (!no_) return "";
  const comps = ((dados.nos_medidos && dados.nos_medidos[folhaAtual]) || {})[no_] || [];
  const atual = ((dados.pontas || {})[canalScope(e)] || {})[k ? "-" : "+"] || "";
  if (!comps.length && !atual) return "";
  const aviso = atual && !comps.some((c) => c.nome === atual) ? " (não está mais no nó)" : "";
  return `<label class="ponta-no"><span>${k ? "garra (−) no" : "ponta (+) no"}</span><input data-ponta="${k ? "-" : "+"}" value="${escT(atual || "automático")}"
    placeholder="procurar componente…" autocomplete="off" title="em que componente do nó ${escT(no_)} fica a ${k ? "garra" : "ponta"}${escT(aviso)}"></label>`;
}
const corCanal = (canal, tipo = "VOLT") => (dados && dados.cores && dados.cores[canal]) || (tipo === "AMP" ? "#0ea5e9" : "#eab308");
// as marcas levam o nome do medidor (data-medidor): clicar nelas abre o medidor (Marcelo, 22/10: "clicar na bolinha do sensor
// e ele abrir os dados")
const marcaDe = (g, medidor, x, y) => no("g", Object.assign({ class: "medido", transform: `translate(${x * G},${y * G})` },
  medidor ? { "data-medidor": medidor, title: `${medidor} — clique: abre o medidor` } : {}), g);
function marcaMedida(g, e, canal, medidor) {           // no componente medido: um "A" (azul Hall) e o nome do sinal no scope
  const [t1, t2] = e.terminais, c = [(t1.x + t2.x) / 2, (t1.y + t2.y) / 2];
  const emCima = txtDe(e).ancora === "middle";                       // deitado com o nome em cima: a marca vai mais à esquerda
  const p = emCima ? [c[0] - 1.9, c[1] - 1.15] : [c[0] - 1.1, c[1] - 1.1], cor = corCanal(canal, "AMP");
  const gg = marcaDe(g, medidor, p[0], p[1]);
  no("circle", { cx: 0, cy: 0, r: 0.42 * G, fill: COR.ampFundo, stroke: cor, "stroke-width": 2 }, gg);
  texto(gg, 0, 0.02, "A", { "text-anchor": "middle", fill: COR.ampTexto, "font-size": 0.5 * G, "font-weight": 700, "dominant-baseline": "middle" });
  texto(gg, -0.6, 0.02, canal, { "text-anchor": "end", fill: COR.texto2, "font-size": 0.48 * G, "dominant-baseline": "middle" });
}
function marcaNo(g, x, y, [canal, sinal, medidor]) {   // num nó medido pelo voltímetro: "V+" (vermelho) / "V−" (preto) e o nome do sinal
  const gg = marcaDe(g, medidor, x, y), cor = corCanal(canal, "VOLT");
  no("rect", { x: -0.15 * G, y: -1.05 * G, width: 1.05 * G, height: 0.62 * G, rx: 0.2 * G, fill: sinal === "+" ? "#dc2626" : "#111827", stroke: cor, "stroke-width": 2 }, gg);
  texto(gg, 0.37, -0.72, "V" + sinal, { "text-anchor": "middle", fill: "#fff", "font-size": 0.42 * G, "font-weight": 700, "dominant-baseline": "middle" });
  texto(gg, 1.05, -0.72, canal, { fill: COR.texto2, "font-size": 0.45 * G, "dominant-baseline": "middle" });
}
function tagScope(g, x, y, canal, tipo, fora = false) {   // ao lado do medidor: o nome do sinal no /maisim/scope, com a borda na cor do canal
  // fora do scope e do controle: apagada e tracejada (o sinal existe no circuito, mas não vira coluna nem m[...])
  const gg = no("g", Object.assign({ class: "tag-scope" + (fora ? " fora" : ""), transform: `translate(${x * G},${y * G})` }, fora ? { opacity: 0.4 } : {}), g), cor = corCanal(canal, tipo);
  const w = 0.95 + 0.33 * canal.length;
  no("rect", Object.assign({ x: 0, y: -0.36 * G, width: w * G, height: 0.72 * G, rx: 0.36 * G, fill: COR.cartao, stroke: cor, "stroke-width": 1.8 }, fora ? { "stroke-dasharray": "3 2" } : {}), gg);
  no("path", { d: `M${0.2 * G} ${0.05 * G}l${0.12 * G} ${-0.2 * G}l${0.14 * G} ${0.3 * G}l${0.14 * G} ${-0.24 * G}`, stroke: cor, "stroke-width": 1.4, fill: "none" }, gg);
  texto(gg, 0.78, 0.02, canal, { fill: COR.texto, "font-size": 0.46 * G, "font-weight": 600, "dominant-baseline": "middle" });
}
// onde vai o nome (e o valor) de um componente de dois pinos: o deslocamento que o Gecko guarda (dxTxt, dyTxt). O padrão
// dele, (2, 2), dado a todo componente criado, joga o texto para baixo e à direita — num componente deitado cai junto do
// vizinho (o L.1 parecia do R.1). Com o padrão, o MaiSim põe o texto colado no corpo: deitado, em cima e centrado; em pé, à
// direita. Um texto posicionado à mão no Gecko fica onde está.
function txtDe(e) {
  const [dx, dy] = e.txt || [0, 0];
  if (!(dx === 2 && dy === 2)) return { dx, dy, ancora: "start" };
  return e.dir === 502 || e.dir === 504 ? { dx: 0, dy: -1.75, ancora: "middle" } : { dx: 1.1, dy: -0.25, ancora: "start" };
}
// sentido positivo da corrente (convenção do Gecko: do terminal 1, o início/+, para o 2, dentro do componente): a seta fica
// ao lado do corpo, do lado oposto ao nome; é o sinal que o amperímetro mede
function setaCorrente(g, e) {
  const [t1, t2] = e.terminais.map((t) => [t.x, t.y]), L = Math.hypot(t2[0] - t1[0], t2[1] - t1[1]) || 1;
  const u = [(t2[0] - t1[0]) / L, (t2[1] - t1[1]) / L], tx = txtDe(e);
  let n = [-u[1], u[0]];
  if (n[0] * (tx.dx || 0) + n[1] * (tx.dy || 0) > 0 || (!tx.dx && !tx.dy && n[0] + n[1] > 0)) n = [-n[0], -n[1]];
  const c = [(t1[0] + t2[0]) / 2 + n[0] * 0.95, (t1[1] + t2[1]) / 2 + n[1] * 0.95];
  const a = [c[0] - u[0] * 0.7, c[1] - u[1] * 0.7], b = [c[0] + u[0] * 0.7, c[1] + u[1] * 0.7];
  const s = 0.28, p1 = [b[0] - u[0] * s + n[0] * s * 0.6, b[1] - u[1] * s + n[1] * s * 0.6], p2 = [b[0] - u[0] * s - n[0] * s * 0.6, b[1] - u[1] * s - n[1] * s * 0.6];
  const at = { class: "seta-i", stroke: COR.seta, "stroke-width": 1.2, fill: "none" };
  no("line", Object.assign({ x1: a[0] * G, y1: a[1] * G, x2: b[0] * G, y2: b[1] * G }, at), g);
  no("polygon", { class: "seta-i", points: [b, p1, p2].map(P).join(" "), fill: COR.seta }, g);
}
function doisPinos(g, e) {
  const [t1, t2] = e.terminais.map((t) => [t.x, t.y]);
  const u = [(t2[0] - t1[0]) / 4, (t2[1] - t1[1]) / 4], n = [-u[1], u[0]], c = [(t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2];
  const a = soma(c, u, -1), b = soma(c, u, 1), linha = (p, q, at = {}) => no("line", Object.assign({ x1: p[0] * G, y1: p[1] * G, x2: q[0] * G, y2: q[1] * G }, at), g);
  const corpo = { class: "corpo", stroke: COR.lk, "stroke-width": 1.6, fill: "none" };
  const poli = (pts, at = {}) => no("polygon", Object.assign({ points: pts.map(P).join(" ") }, corpo, at), g);
  switch (e.tipo) {
    case "R":
      linha(t1, a, corpo); linha(b, t2, corpo);
      poli([soma(a, n, 0.35), soma(b, n, 0.35), soma(b, n, -0.35), soma(a, n, -0.35)], { fill: COR.corpo }); break;
    case "L": {
      linha(t1, a, corpo); linha(b, t2, corpo);
      let d = `M ${P(a)}`; for (let k = 1; k <= 4; k++) d += ` A ${0.25 * G} ${0.25 * G} 0 0 1 ${P(soma(a, u, 0.5 * k))}`;
      no("path", Object.assign({ d }, corpo), g); break;
    }
    case "C": {
      const p1 = soma(c, u, -0.2), p2 = soma(c, u, 0.2);
      linha(t1, p1, corpo); linha(p2, t2, corpo);
      linha(soma(p1, n, 0.6), soma(p1, n, -0.6), Object.assign({}, corpo, { "stroke-width": 2.4 }));
      linha(soma(p2, n, 0.6), soma(p2, n, -0.6), Object.assign({}, corpo, { "stroke-width": 2.4 })); break;
    }
    case "U": case "I": {
      const r = 0.85; linha(t1, soma(c, u, -r), corpo); linha(soma(c, u, r), t2, corpo);
      no("circle", Object.assign({ cx: c[0] * G, cy: c[1] * G, r: r * G }, corpo, { fill: COR.cartao }), g);
      if (e.tipo === "U" && e.par.sourceType === 402) {
        let d = `M ${P(soma(c, n, -0.5))}`; for (let k = 1; k <= 20; k++) { const s = -0.5 + k / 20; d += ` L ${P(soma(soma(c, n, s), u, 0.32 * Math.sin(2 * Math.PI * (s + 0.5))))}`; }
        no("path", Object.assign({ d }, corpo, { "stroke-width": 1.2 }), g);
      } else if (e.tipo === "U") texto(g, c[0], c[1], "=", { "text-anchor": "middle", fill: COR.lk });
      else linha(soma(c, u, 0.5), soma(c, u, -0.5), Object.assign({}, corpo, { "marker-end": "" }));
      const mais = soma(soma(c, u, -1.25), n, 0.55); texto(g, mais[0], mais[1], "+", { "text-anchor": "middle", fill: COR.lk, "font-size": 0.8 * G });
      break;
    }
    case "D": {
      const p1 = soma(c, u, -0.6), p2 = soma(c, u, 0.6);
      linha(t1, p1, corpo); linha(p2, t2, corpo);
      poli([soma(p1, n, 0.6), soma(p1, n, -0.6), p2], { fill: COR.corpo });
      linha(soma(p2, n, 0.6), soma(p2, n, -0.6), Object.assign({}, corpo, { "stroke-width": 2.2 })); break;
    }
    case "IGBT": case "MOSFET": case "THYR": {
      // coletor no 1º terminal, emissor no 2º; canal paralelo ao eixo, porta do lado n
      const k1 = soma(soma(c, u, -0.45), n, 0.35), k2 = soma(soma(c, u, 0.45), n, 0.35);
      linha(t1, a, corpo); linha(b, t2, corpo); linha(a, k1, corpo); linha(b, k2, corpo);
      linha(soma(soma(c, u, -0.65), n, 0.35), soma(soma(c, u, 0.65), n, 0.35), Object.assign({}, corpo, { "stroke-width": 2.4 }));
      linha(soma(soma(c, u, -0.5), n, 0.62), soma(soma(c, u, 0.5), n, 0.62), corpo);
      linha(soma(c, n, 0.62), soma(c, n, 1.2), corpo);
      const pe = soma(b, soma(k2, b, -1), 0.35);         // seta no emissor
      poli([b, soma(pe, n, 0.18), soma(pe, n, -0.18)], { fill: COR.lk }); break;
    }
    case "S": {
      linha(t1, a, corpo); linha(b, t2, corpo);
      linha(a, soma(soma(c, u, 0.85), n, 0.75), Object.assign({}, corpo, { "stroke-width": 2 }));
      for (const p of [a, b]) no("circle", { cx: p[0] * G, cy: p[1] * G, r: 0.14 * G, fill: COR.cartao, stroke: COR.lk }, g); break;
    }
    default:
      linha(t1, a, corpo); linha(b, t2, corpo);
      poli([soma(a, n, 0.5), soma(b, n, 0.5), soma(b, n, -0.5), soma(a, n, -0.5)], { fill: COR.cartao });
      texto(g, c[0], c[1], e.tipo, { "text-anchor": "middle", fill: COR.lk, "font-size": 0.5 * G });
  }
}
function valorPrincipal(e) {
  const p = e.par, v = (k) => (p[k + "_var"] ? `${p[k + "_var"]}= ` : "") + si(p[k], UNID[k]);
  if (e.tipo === "R") return v("resistance");
  if (e.tipo === "L") return v("inductance");
  if (e.tipo === "C") return v("capacitance");
  if ((e.tipo === "U" || e.tipo === "I") && p.sourceType === 400) return `← ${e.mede[0] || "(sem sinal)"}`;
  if (e.tipo === "U") return p.sourceType === 402 ? `${v("amplitude")} · ${si(p.frequency, "Hz")}` : si(p.dcValue, "V");
  return "";
}

// ---------------------------------------------------------------- folha
function desenha() {
  document.body.classList.toggle("sem-circuito", !!(dados && dados.fechado));
  const svg = $("svg"); svg.innerHTML = ""; rotulosFeitos = new Set();
  const f = dados.folhas[folhaAtual];
  no("defs", {}, svg).innerHTML = `<pattern id="grade" width="${G}" height="${G}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="0.9" fill="${COR.grade}"/></pattern>`;
  const [x0, y0, x1, y1] = f.limites;
  no("rect", { x: (x0 - 40) * G, y: (y0 - 40) * G, width: (x1 - x0 + 80) * G, height: (y1 - y0 + 80) * G, fill: "url(#grade)" }, svg);
  if (f.tamanho) no("rect", { class: "borda-sm", x: 0, y: 0, width: (f.tamanho[0] - 1) * G, height: (f.tamanho[1] - 1) * G, fill: "none", stroke: COR.bordaSM, "stroke-width": 1.2, "stroke-dasharray": "8 5", rx: 4 }, svg);
  const camFios = no("g", {}, svg), camEl = no("g", {}, svg), camRot = no("g", {}, svg);
  const clicaveis = ed.ligado;
  const medidos = medicoes(f), nosMarcados = new Set();
  // pontas escolhidas (pedido de Marcelo): a marca do voltímetro vai no terminal do componente escolhido, como a ponteira de
  // verdade; sem escolha, no primeiro ponto do nó (abaixo)
  const pontasFeitas = [];
  if (mostrar.medicoes) for (const e of f.elementos) if (e.tipo === "VOLT") {
    const canal = canalScope(e), pp = (dados.pontas && dados.pontas[canal]) || {}, comps = (dados.nos_medidos && dados.nos_medidos[folhaAtual]) || {};
    e.mede.slice(0, 2).forEach((no_, k) => {
      const t = no_ && pp[k ? "-" : "+"] && (comps[no_] || []).find((c) => c.nome === pp[k ? "-" : "+"]); if (!t) return;
      // a marca fica do lado de fora do componente: acima do terminal de cima, abaixo do de baixo, ao lado se ele está deitado
      const dx = t.x - (t.cx ?? t.x), dy = t.y - (t.cy ?? t.y - 1);
      const [mx, my] = Math.abs(dy) >= Math.abs(dx) ? [t.x, dy > 0 ? t.y + 1.2 : t.y - 0.5] : [dx > 0 ? t.x + 0.45 : t.x - 1.45, t.y + 0.35];
      pontasFeitas.push([mx, my, [canal, k ? "−" : "+", e.nome]]);
      const pv = medidos.V.get(no_); if (pv && pv[0] === canal) nosMarcados.add(no_);   // o automático deste nó era este medidor
    });
  }
  const ptsFio = new Set(f.fios.flatMap((w) => w.pts.map((p) => p.join(","))));   // borne ligado: conexão, rótulo ou outro terminal no mesmo ponto
  const ptsTerm = new Map(); for (const e of f.elementos) for (const t of e.terminais || []) { const k = `${t.x},${t.y}`; ptsTerm.set(k, (ptsTerm.get(k) || 0) + 1); }
  f.fios.forEach((w, k) => {
    if (w.dom === "CONTROL" && !mostrar.controle) return;
    const pts = w.pts.map(P).join(" "), sel = ed.fioSel === chaveFio(w) || ed.multiFios.has(chaveFio(w));
    no("polyline", { "data-fio": k, points: pts, fill: "none", stroke: sel ? "#e8a33d" : w.dom === "LK" ? COR.fioLK : COR.fioCT, "stroke-width": sel ? 3 : 1.4, "stroke-linejoin": "round" }, camFios);
    if (clicaveis) no("polyline", { class: "fio", "data-k": k, points: pts, fill: "none", stroke: "transparent", "stroke-width": 0.6 * G }, camFios);
    if (mostrar.rotulos && w.rotulo) rotulo(camRot, w.pts[0][0] + 0.2, w.pts[0][1] - 0.45, w.rotulo, { fill: COR.rot, "font-size": 0.55 * G });
    if (mostrar.medicoes && w.rotulo && medidos.V.has(w.rotulo) && !nosMarcados.has(w.rotulo)) { nosMarcados.add(w.rotulo); marcaNo(camRot, w.pts[0][0], w.pts[0][1] - 0.5, medidos.V.get(w.rotulo)); }
  });
  desenhaJuncoes(camFios, f);
  for (const e of f.elementos) for (const t of e.terminais || [])           // nó medido só por rótulo de terminal (sem conexão com o rótulo)
    if (mostrar.medicoes && t.rotulo && (t.dom || e.dom) === "LK" && medidos.V.has(t.rotulo) && !nosMarcados.has(t.rotulo)) { nosMarcados.add(t.rotulo); marcaNo(camRot, t.x, t.y - 0.5, medidos.V.get(t.rotulo)); }
  for (const [x, y, m] of pontasFeitas) marcaNo(camRot, x, y, m);
  let n = 0;
  f.elementos.forEach((e, i) => {
    if (e.tipo === "SCOPE") return;                                    // o /maisim/scope faz esse papel
    if (e.dom === "CONTROL" && e.tipo !== "TERM" && !mostrar.controle) return;
    n++;
    const g = no("g", { class: (e.tipo === "SUBCIRCUIT" ? "el sub" : "el") + (ed.sel === e.nome || ed.multi.has(e.nome) ? " sel" : "") + (e.ativo === false ? " desativado" : ""), "data-i": i }, camEl);
    if (e.ativo === false) no("title", {}, g).textContent = `${e.nome}: ${e.curto ? "em curto (o Gecko simula um curto-circuito no lugar)" : "desativado (o Gecko simula como se não existisse)"}`;
    if (e.dom === "LK" && e.tipo !== "TERM" && e.terminais.length === 2) {
      const [a, b] = e.terminais;                                       // área de clique ao longo do elemento
      no("rect", { x: (Math.min(a.x, b.x) - 0.7) * G, y: (Math.min(a.y, b.y) - 0.7) * G, width: (Math.abs(a.x - b.x) + 1.4) * G,
        height: (Math.abs(a.y - b.y) + 1.4) * G, fill: "transparent" }, g);
      doisPinos(g, e);
      if (mostrar.corrente && e.tipo !== "VOLT") setaCorrente(g, e);
      if (mostrar.medicoes && medidos.I.has(e.nome)) marcaMedida(camRot, e, ...medidos.I.get(e.nome));
      const tx = txtDe(e);                                               // o nome junto do corpo (ver txtDe)
      texto(g, e.x + tx.dx, e.y + tx.dy, e.nome, { fill: COR.nome, "font-size": 0.6 * G, "text-anchor": tx.ancora });
      const val = valorPrincipal(e); if (val) texto(g, e.x + tx.dx, e.y + tx.dy + 0.7, val, { fill: COR.par, "font-size": 0.55 * G, "text-anchor": tx.ancora });
      if (mostrar.rotulos) e.terminais.forEach((t, k) => { const r = (k ? e.saidas : e.entradas)[0];
        if (r) rotulo(camRot, t.x + 0.25, t.y - 0.45, r, { fill: COR.rot, "font-size": 0.55 * G }); });
    } else if (e.tipo === "TERM") {
      const cor = e.dom === "LK" ? COR.lk : COR.ct;
      no("rect", { class: "corpo", x: (e.x - 0.4) * G, y: (e.y - 0.4) * G, width: 0.8 * G, height: 0.8 * G, rx: 3, fill: COR.cartao, stroke: cor, "stroke-width": 1.6 }, g);
      texto(g, e.x + 0.7, e.y, e.nome, { fill: cor, "font-size": 0.6 * G, "font-weight": 600 });
      const bl = folhaAtual !== "0" && blocoDaFolha(folhaAtual), pt = bl && bl.terminais.find((u) => u.interno === e.nome);
      if (pt && pt.junto) no("circle", { class: "junto", cx: e.x * G, cy: e.y * G, r: 0.75 * G, fill: "none", stroke: COR.erro, "stroke-width": 1.6, "stroke-dasharray": "3 2" }, g);
    } else if (e.tipo === "SUBCIRCUIT") {
      const [bx, by] = e.tamanho;
      no("rect", { class: "caixa corpo", x: (e.x - 0.5) * G, y: (e.y - 0.5) * G, width: bx * G, height: by * G, fill: COR.subFundo, stroke: COR.sub, "stroke-width": 1.6, rx: 3 }, g);
      // o nome do bloco: no meio, ou na linha livre de nomes de borne mais perto do meio (linha k: y = e.y + k)
      const linhaDe = (t) => t.lado === "e" || t.lado === "d" ? t.y - e.y : t.lado === "c" ? 0 : by - 1;
      const livre = (k) => !e.terminais.some((t) => Math.abs(linhaDe(t) - k) < 0.6), meio = (by - 1) / 2;
      const kTit = livre(meio) ? meio : [...Array(by).keys()].sort((a, c) => Math.abs(a - meio) - Math.abs(c - meio)).find(livre) ?? meio;
      const tTit = texto(g, e.x - 0.5 + bx / 2, e.y + kTit, nomeSub(e.nome), { "text-anchor": "middle", fill: COR.sub, "font-size": 0.7 * G, "font-weight": 700 });
      cortaAte(tTit, bx - 0.4);
      const wTit = tTit.isConnected ? tTit.getComputedTextLength() / G : 0;
      for (const t of e.terminais) {
        const dentro = t.lado === "e" ? [t.x + 0.5, t.y] : t.lado === "d" ? [t.x - 0.5, t.y] : t.lado === "c" ? [t.x, t.y + 0.5] : [t.x, t.y - 0.5];
        no("line", { x1: t.x * G, y1: t.y * G, x2: dentro[0] * G, y2: dentro[1] * G, stroke: t.dom === "LK" ? COR.lk : COR.ct, "stroke-width": 1.6 }, g);
        const ancora = t.lado === "e" ? "start" : t.lado === "d" ? "end" : "middle";
        const pi = t.lado === "e" ? [t.x + 0.7, t.y] : t.lado === "d" ? [t.x - 0.7, t.y] : [t.x, t.y + (t.lado === "c" ? 1 : -1)];
        // o nome de dentro, curto e cortado para caber (medido): dos lados, até o meio se o outro lado tem nome na mesma
        // linha, e sem cobrir o nome do bloco; em cima e embaixo, até o borne vizinho do mesmo lado
        let larg;
        if (t.lado === "e" || t.lado === "d") {
          const oposto = e.terminais.some((u) => u.lado === (t.lado === "e" ? "d" : "e") && u.y === t.y);
          larg = oposto ? bx / 2 - 0.35 : bx - 0.4;
          if (Math.abs(linhaDe(t) - kTit) < 0.6 && wTit) larg = Math.min(larg, bx / 2 - 0.4 - wTit / 2);
        } else larg = Math.min(4, bx, ...e.terminais.filter((u) => u !== t && u.lado === t.lado).map((u) => Math.abs(u.x - t.x))) - 0.2;
        cortaAte(texto(g, pi[0], pi[1], nomeTerm(t.interno), { "text-anchor": ancora, fill: t.dom === "LK" ? COR.lk : COR.ct, "font-size": 0.5 * G }), larg);
        if (t.junto) no("circle", { class: "junto", cx: t.x * G, cy: t.y * G, r: 0.45 * G, fill: "none", stroke: COR.erro, "stroke-width": 1.6, "stroke-dasharray": "3 2" }, g);
        if (mostrar.rotulos && t.rotulo) {
          const po = t.lado === "e" ? [t.x - 0.3, t.y - 0.45] : [t.x + 0.3, t.y - 0.45];
          rotulo(camRot, po[0], po[1], t.rotulo, { "text-anchor": t.lado === "e" ? "end" : "start", fill: COR.rot, "font-size": 0.55 * G });
        }
      }
    } else if (e.dom !== "CONTROL") {                                   // tipo sem símbolo próprio: caixa com o nome curto
      no("rect", { class: "corpo", x: (e.x - 1) * G, y: (e.y - 1) * G, width: 2 * G, height: 2 * G, fill: COR.cartao, stroke: COR.lk, "stroke-width": 1.4, rx: 3 }, g);
      texto(g, e.x, e.y, e.id_gecko || e.tipo, { "text-anchor": "middle", fill: COR.lk, "font-size": 0.45 * G });
      texto(g, e.x - 1, e.y - 1.5, e.nome, { fill: COR.nome, "font-size": 0.55 * G });
    } else {                                                            // bloco de controle
      const ne = e.entradas.length, ns = e.saidas.length, h = Math.max(ne, ns, 1);
      no("rect", { class: "corpo", x: (e.x - 1) * G, y: (e.y - 0.5) * G, width: 2 * G, height: h * G, fill: COR.ctFundo, stroke: COR.ct, "stroke-width": 1.4, rx: 2 }, g);
      texto(g, e.x, e.y - 0.5 + h / 2, ehTag(e) ? "tag" : SIMBOLO[e.tipo] || e.tipo, { "text-anchor": "middle", fill: COR.ct, "font-size": (ehTag(e) ? 0.55 : 0.7) * G, "font-weight": 700 });
      if (e.tipo === "GATE") texto(g, e.x, e.y - 0.5 + h + 0.55, e.mede[0] ? `→ ${e.mede[0]}` : "(sem chave)", { "text-anchor": "middle", fill: e.mede[0] ? COR.ct : COR.erro, "font-size": 0.45 * G });
      // escrito pelo controle: a etiqueta vai em cima do bloco, como o nome de um componente (Marcelo, 19/10: na saída ela
      // cobria o que se liga ali, como o borne S do SM encostado no CONST)
      const atuador = typeof atuadorDe === "function" ? atuadorDe(e) : null;
      if (atuador) tagAtuador(camRot, e.x, e.y - 1.0, atuador, true);
      for (const t of e.terminais) {
        const borda = t.lado === "e" ? e.x - 1 : e.x + 1;
        if (t.x !== borda) no("line", { x1: t.x * G, y1: t.y * G, x2: borda * G, y2: t.y * G, stroke: COR.ct, "stroke-width": 1.4 }, g);
        if (atuador && t.lado === "s") continue;                                                              // a etiqueta já diz o nome
        if ((MEDIDOR.has(e.tipo) || ehTag(e)) && t.lado === "s") { if (mostrar.medicoes) tagScope(camRot, t.x + 0.35, t.y, canalScope(e), e.tipo, foraDoScope(e)); }   // regra: medidor (e tag) vai para o /maisim/scope
        else if (mostrar.rotulos && t.rotulo) rotulo(camRot, t.lado === "e" ? t.x - 0.2 : t.x + 0.2, t.y - 0.42, t.rotulo,
          { "text-anchor": t.lado === "e" ? "end" : "start", fill: COR.rot, "font-size": 0.5 * G });
      }
    }
    for (const t of e.terminais) {                                      // bornes: cheio se ligado (conexão ou rótulo), vazado se livre
      const cor = (t.dom || e.dom) === "LK" ? COR.lk : COR.ct, k = `${t.x},${t.y}`, livre = !t.rotulo && !ptsFio.has(k) && ptsTerm.get(k) < 2;
      no("circle", { class: "borne", cx: t.x * G, cy: t.y * G, r: (livre ? 0.2 : 0.13) * G, fill: livre ? COR.cartao : cor, stroke: cor, "stroke-width": livre ? 1.4 : 0 }, g);
    }
  });
  $("info").textContent = (ed.ligado ? "editando · " : "") + `${n} elementos · ${f.fios.length} conexões` +
    (folhaAtual === "0" ? ` · encaixe das conexões ${dados.encaixe.pontas - dados.encaixe.soltas.length}/${dados.encaixe.pontas}` : "");
  ed.fantasma = no("g", { "pointer-events": "none", style: "display:none" }, svg);
  no("rect", { x: -1 * G, y: -1 * G, width: 2 * G, height: 2 * G, fill: "rgba(232,163,61,.15)", stroke: "#e8a33d", "stroke-dasharray": "4 3", rx: 3 }, ed.fantasma);
  no("circle", { cx: 0, cy: 0, r: 0.18 * G, fill: "#e8a33d" }, ed.fantasma);
  $("trilha").innerHTML = folhaAtual === "0" ? `<span class="topo" title="folha principal (o topo do circuito)">${ICONE_TOPO}</span>`
    : `<a id="volta" title="voltar para a folha principal (o topo)">${ICONE_TOPO}</a> › ${nomeSub(f.nome)}${nomeSub(f.nome) !== f.nome ? ` (${f.nome})` : ""}`;
  if ($("volta")) $("volta").onclick = () => abre("0");
  previaFio(); faixaSM();
  aplicaVer();
}
function ajusta() {
  if (VISTA_CODIGO) return;                              // a janela do código não mostra o desenho
  const f = dados.folhas[folhaAtual], m = 3, r = $("svg").getBoundingClientRect();
  let [x0, y0, x1, y1] = f.limites;
  if (f.tamanho) { x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, f.tamanho[0]); y1 = Math.max(y1, f.tamanho[1]); }   // SM: a folha inteira (tamanho fixo)
  x1 += f.elementos.some((e) => MEDIDOR.has(e.tipo)) ? 5 : 0;   // o nome no scope, à direita dos medidores
  // nunca menor que 30 × 20 quadrados: uma folha vazia ou de uma peça só não vira um zoom absurdo
  if (x1 - x0 < 30) { const c = (x0 + x1) / 2; x0 = c - 15; x1 = c + 15; }
  if (y1 - y0 < 20) { const c = (y0 + y1) / 2; y0 = c - 10; y1 = c + 10; }
  let w = (x1 - x0 + 2 * m) * G, h = (y1 - y0 + 2 * m) * G;
  if (w / h < r.width / r.height) w = h * r.width / r.height; else h = w * r.height / r.width;
  ver = { x: ((x0 + x1) / 2) * G - w / 2, y: ((y0 + y1) / 2) * G - h / 2, w, h };
  aplicaVer();
}
function aplicaVer() { $("svg").setAttribute("viewBox", `${ver.x} ${ver.y} ${ver.w} ${ver.h}`); }
// a área do desenho mudou de largura (painel recolhido ou expandido): mesma escala e mesmo centro, proporção da área nova
function reajustaAspecto() {
  const r = $("svg").getBoundingClientRect(); if (!r.width || !r.height) return;
  const nw = ver.h * r.width / r.height; ver.x += (ver.w - nw) / 2; ver.w = nw; aplicaVer();
}
// recolher e expandir a paleta e o painel da direita (abinhas nas bordas); lembrado no navegador
const paineis = { paleta: false, props: false };
try { Object.assign(paineis, JSON.parse(localStorage.getItem("maisim-simu-paineis") || "{}")); } catch (e) { /* ok */ }
function aplicaPaineis() {
  document.body.classList.toggle("paleta-fechada", paineis.paleta); document.body.classList.toggle("props-fechado", paineis.props);
  $("aba-paleta").textContent = paineis.paleta ? "›" : "‹"; $("aba-paleta").title = paineis.paleta ? "mostrar a paleta" : "recolher a paleta";
  $("aba-props").textContent = paineis.props ? "‹" : "›";
  $("aba-props").title = paineis.props ? "mostrar o painel da direita (componente e histórico)" : "recolher o painel da direita (componente e histórico)";
  try { localStorage.setItem("maisim-simu-paineis", JSON.stringify(paineis)); } catch (e) { /* ok */ }
  requestAnimationFrame(reajustaAspecto);
}
$("aba-paleta").onclick = () => { paineis.paleta = !paineis.paleta; aplicaPaineis(); };
$("aba-props").onclick = () => { paineis.props = !paineis.props; aplicaPaineis(); };
function mostraPainelProps() { if (paineis.props) { paineis.props = false; aplicaPaineis(); } }   // o painel recolhido volta
aplicaPaineis();
function abre(fid) {                                 // entrar ou sair de uma folha: a seleção (e o painel dela) fica para trás
  folhaAtual = fid; ed.sel = null; ed.fioSel = null; ed.multi.clear(); ed.multiFios.clear(); esconde(); desenha(); ajusta(); if (ed.ligado) mostraProps(); }

// ---------------------------------------------------------------- dica ao passar o mouse
function esconde() { $("dica").style.display = "none"; }
function dica(ev, e) {
  const linhas = [];
  const p = e.par;
  for (const k in p) {
    if (k.endsWith("_var") || k.endsWith("_guardado") || ["terminalLocation", "worksheetSizeX", "worksheetSizeY", "blockSizeX", "blockSizeY", "sourceType", "typQuelle"].includes(k)) continue;
    linhas.push([k + (p[k + "_var"] ? ` (${p[k + "_var"]})` : ""), si(p[k], UNID[k]) +
      (p[k + "_guardado"] != null ? ` <span class="t">(da variável global; no elemento está ${si(p[k + "_guardado"], UNID[k])}, que o Gecko não usa)</span>` : "")]);
  }
  if (e.tipo === "AMP" && e.mede[0]) linhas.unshift(["mede a corrente de", e.mede[0]]);
  if (e.tipo === "VOLT" && e.mede[0]) linhas.unshift(["mede a tensão", `${e.mede[0]} − ${e.mede[1] || "0"}`]);
  if (e.tipo === "GATE" && e.mede[0]) linhas.unshift(["comanda", e.mede[0]]);
  if (e.entradas.filter(Boolean).length) linhas.push([e.dom === "LK" ? "nó do 1º terminal" : "entradas", e.entradas.map((s) => s || "·").join(", ")]);
  if (e.saidas.filter(Boolean).length) linhas.push([e.dom === "LK" ? "nó do 2º terminal" : "saídas", e.saidas.map((s) => s || "·").join(", ")]);
  if (e.tipo === "SUBCIRCUIT") linhas.push(["terminais", e.terminais.map((t) => t.interno + (t.rotulo ? ` → ${t.rotulo}` : "")).join(", ")], ["", "clique para abrir a folha de dentro"]);
  const d = $("dica");
  d.innerHTML = `<b>${e.nome}</b> <span class="t">· ${DESCR[e.tipo] || e.tipo}</span><table>${linhas.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>`;
  d.style.display = "block";
  const x = Math.min(ev.clientX + 14, innerWidth - d.offsetWidth - 8), y = Math.min(ev.clientY + 14, innerHeight - d.offsetHeight - 8);
  d.style.left = `${x}px`; d.style.top = `${y}px`;
}

// ---------------------------------------------------------------- mover e zoom
(() => {
  const svg = $("svg"); let arrasto = null;
  svg.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const r = svg.getBoundingClientRect(), f = ev.deltaY < 0 ? 0.85 : 1 / 0.85;
    const px = ver.x + (ev.clientX - r.left) / r.width * ver.w, py = ver.y + (ev.clientY - r.top) / r.height * ver.h;
    ver = { x: px - (px - ver.x) * f, y: py - (py - ver.y) * f, w: ver.w * f, h: ver.h * f }; aplicaVer();
  }, { passive: false });
  svg.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    const g = ev.target.closest && ev.target.closest(".el");
    const e = g && dados ? dados.folhas[folhaAtual].elementos[+g.dataset.i] : null;
    const livre = ed.ligado && !ed.colocar && !ed.fio.modo && !simulando();
    arrasto = { x: ev.clientX, y: ev.clientY, v: Object.assign({}, ver), moveu: false,
                el: livre && e && !ev.shiftKey ? { e, g } : null, shift: livre && ev.shiftKey,
                ret: livre && ev.shiftKey && !e && !(ev.target.closest && ev.target.closest(".fio")) ? grade(ev) : null,
                grupo: livre && e && !ev.shiftKey && ed.multi.has(e.nome) && tamanhoSel() > 1 };
    if (!arrasto.el && !arrasto.shift) svg.classList.add("arrastando");
  });
  addEventListener("mousemove", (ev) => {
    if (ed.fio.modo && !(arrasto && arrasto.moveu) && ev.target.closest && ev.target.closest("#svg")) { ed.fio.mouse = grade(ev); previaFio(); }
    if (ed.colocar && ed.fantasma) {                                     // fantasma do componente a pôr, na grade
      const [gx, gy] = grade(ev); ed.fantasma.style.display = ""; ed.fantasma.setAttribute("transform", `translate(${gx * G},${gy * G})`);
    }
    if (arrasto) {
      const r = svg.getBoundingClientRect(), dx = (ev.clientX - arrasto.x) / r.width * ver.w, dy = (ev.clientY - arrasto.y) / r.height * ver.h;
      if (Math.abs(ev.clientX - arrasto.x) + Math.abs(ev.clientY - arrasto.y) > 3) arrasto.moveu = true;
      if (arrasto.ret) {                                                  // Shift + arrastar no vazio: o retângulo da seleção
        retanguloSel(arrasto.ret, grade(ev)); esconde(); return;
      }
      if (arrasto.shift) return;
      if (arrasto.grupo) {                                                // arrastar um dos selecionados: o grupo inteiro anda na grade
        arrasto.dg = [Math.round(dx / G), Math.round(dy / G)];
        const f = dados.folhas[folhaAtual], tr = `translate(${arrasto.dg[0] * G},${arrasto.dg[1] * G})`;
        f.elementos.forEach((x, i) => { if (ed.multi.has(x.nome) && x.tipo !== "TERM") { const gg = svg.querySelector(`.el[data-i="${i}"]`); if (gg) gg.setAttribute("transform", tr); } });
        f.fios.forEach((w, k) => { if (ed.multiFios.has(chaveFio(w))) svg.querySelectorAll(`[data-fio="${k}"]`).forEach((x) => x.setAttribute("transform", tr)); });
        esconde(); return;
      }
      if (arrasto.el) {                                                   // arrastar um elemento: anda na grade
        arrasto.dg = [Math.round(dx / G), Math.round(dy / G)];
        const e = arrasto.el.e, t = dados.folhas[folhaAtual].tamanho;
        if (e.tipo === "TERM" && t) {                                    // o terminal do SM anda encostado na borda (onde vai ficar)
          const x = Math.max(0, Math.min(e.x + arrasto.dg[0], t[0] - 1)), y = Math.max(0, Math.min(e.y + arrasto.dg[1], t[1] - 1));
          const [bx, by] = bordaGecko(x, y, t[0], t[1]); arrasto.dg = [bx - e.x, by - e.y]; arrasto.bruto = [x, y];   // bruto: onde o mouse está
        }
        arrasto.el.g.setAttribute("transform", `translate(${arrasto.dg[0] * G},${arrasto.dg[1] * G})`); esconde(); return;
      }
      ver.x = arrasto.v.x - dx; ver.y = arrasto.v.y - dy; aplicaVer(); esconde(); return;
    }
    const g = ev.target.closest && ev.target.closest(".el");
    if (g && dados) dica(ev, dados.folhas[folhaAtual].elementos[+g.dataset.i]); else esconde();
  });
  addEventListener("mouseup", (ev) => {
    if (!arrasto) return;
    const a = arrasto; arrasto = null; svg.classList.remove("arrastando");
    if (a.ret) { const r = $("ret-sel"); if (r) r.remove(); if (a.moveu) selecionaRetangulo(a.ret, grade(ev)); return; }
    if (a.shift) {                                                       // Shift + clique: põe ou tira da seleção
      const fw = ev.target.closest && ev.target.closest(".fio"), g = ev.target.closest && ev.target.closest(".el");
      if (fw) alternaSel(null, dados.folhas[folhaAtual].fios[+fw.dataset.k]);
      else if (g) alternaSel(dados.folhas[folhaAtual].elementos[+g.dataset.i], null);
      return;
    }
    if (a.grupo) { if (a.moveu && a.dg && (a.dg[0] || a.dg[1])) moveGrupo(a.dg); else if (!a.moveu) { const g = ev.target.closest && ev.target.closest(".el");
      seleciona(g ? dados.folhas[folhaAtual].elementos[+g.dataset.i] : null); } else desenha(); return; }
    if (a.el && a.moveu && a.el.e.tipo === "TERM" && a.bruto) {        // terminal do SM solto num nó, numa conexão ou num terminal: liga
      const dom = pontosDeLigacao().get(a.bruto.join(","));
      if (dom && (a.bruto[0] !== a.el.e.x || a.bruto[1] !== a.el.e.y)) { ligaTerminal(a.el.e, a.bruto, dom); return; }
    }
    if (a.el && a.moveu && a.dg && (a.dg[0] || a.dg[1]) && foraDaFolha([a.el.e.x + a.dg[0], a.el.e.y + a.dg[1]])) { desenha(); return; }
    if (a.el && a.moveu && a.dg && (a.dg[0] || a.dg[1])) { pede("MOVE", [qualificado(a.el.e), a.el.e.x + a.dg[0], a.el.e.y + a.dg[1]], `movido ${a.el.e.nome}`); return; }
    if (a.el && a.moveu) { desenha(); return; }
    if (a.moveu) return;
    if (ed.ligado && ed.fio.modo) { cliqueFio(ev); return; }
    if (ed.ligado && ed.colocar) { coloca(ev); return; }
    const md = ed.ligado && ev.target.closest && ev.target.closest(".medido[data-medidor]");   // a marca de um medidor: abre o medidor
    if (md) { const m = dados.folhas[folhaAtual].elementos.find((x) => x.nome === md.dataset.medidor); if (m) { seleciona(m); return; } }
    const fw = ed.ligado && ev.target.closest && ev.target.closest(".fio");
    if (fw) { const w = dados.folhas[folhaAtual].fios[+fw.dataset.k]; const ja = ed.fioSel === chaveFio(w) && !ed.multiFios.size;
      selecionaFio(w); if (ja) mostraPainelProps(); return; }
    const g = ev.target.closest && ev.target.closest(".el");
    const e = g ? dados.folhas[folhaAtual].elementos[+g.dataset.i] : null;
    const ja = e && ed.sel === e.nome && !ed.multi.size;              // clicar de novo no selecionado: abre o painel da direita
    if (ed.ligado) { seleciona(e); if (ja && !(e.tipo === "SUBCIRCUIT" && ev.detail >= 2)) mostraPainelProps();
      if (!e || e.tipo !== "SUBCIRCUIT") return; if (!ev.detail || ev.detail < 2) return; }   // editando: duplo clique abre o SM
    if (e && e.tipo === "SUBCIRCUIT" && dados.folhas[e.uid]) abre(e.uid);
  });
  svg.addEventListener("mouseleave", esconde);
  addEventListener("mousemove", (ev) => {               // onde o Ctrl+V cola: pela posição na área do desenho (a dica, a faixa do
    const r = svg.getBoundingClientRect();              // SM ou outro quadro por cima não tiram o mouse do desenho)
    ed.mouse = r.width && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom ? grade(ev) : null;
  });
  addEventListener("keydown", (ev) => {
    if (ev.target.closest && ev.target.closest("input, select, textarea, [contenteditable], #ctl-editor")) return;   // digitando (o controle.py também)
    if (document.querySelector(".modal-fundo")) return;
    if (ed.ligado && simulando() && (["w", "W", "r", "R", "Delete", "Backspace"].includes(ev.key) && !ev.ctrlKey && !ev.metaKey
        || (ev.ctrlKey || ev.metaKey) && ["x", "X", "v", "V"].includes(ev.key))) { ev.preventDefault(); avisaTrava(); return; }
    if (ed.ligado && !ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key === "w" || ev.key === "W")) { ev.preventDefault(); modoFio(!ed.fio.modo); return; }
    if (ed.fio.modo && ed.fio.cantos.length) {
      if (ev.key === "Escape") { ed.fio.cantos = []; ed.fio.dom = null; previaFio(); msg("conexão desfeita · W sai do modo conexão"); return; }
      if (ev.key === "Enter" && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); terminaFio(); return; }
      if (ev.key === "Backspace") { ev.preventDefault(); ed.fio.cantos.pop(); if (!ed.fio.cantos.length) ed.fio.dom = null; previaFio(); return; }
    }
    if (ed.fio.modo && ev.key === "Escape") { modoFio(false); return; }
    const w = fioSelecionado();
    if (w && (ev.key === "Delete" || ev.key === "Backspace")) { ev.preventDefault(); apagaFio(w); return; }
    if (w && ev.key === "Escape") { selecionaFio(null); return; }
    if (tamanhoSel() && ev.key === "Escape") { seleciona(null); return; }        // tira a seleção de vários (não sai do SM)
    if (ev.key === "Escape") { if (ed.colocar) { escolhe(null); return; } if (ed.sel) { seleciona(null); return; } if (folhaAtual !== "0") abre("0"); }
    // copiar, recortar e colar: Ctrl+C e Ctrl+X no componente selecionado (sem componente, o navegador copia o texto marcado);
    // Ctrl+V cola onde está o mouse
    const tecla = (ev.key || "").toLowerCase();
    if (ed.ligado && !VISTA_CODIGO && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && ["c", "x", "v"].includes(tecla)) {
      if (tecla === "v") { ev.preventDefault(); cola(); return; }
      if (tamanhoSel()) { ev.preventDefault(); copiaGrupo(tecla === "x"); return; }
      const sel = selecionado(); if (sel) { ev.preventDefault(); copia(sel, tecla === "x"); return; }
    }
    if (ed.ligado && tamanhoSel() && (ev.key === "Delete" || ev.key === "Backspace")) { ev.preventDefault(); apagaGrupo(); return; }

    if (ev.key === "0") ajusta();
    const e = selecionado();
    if (ed.ligado && e && (ev.key === "r" || ev.key === "R") && !ev.ctrlKey && !ev.metaKey) {
      if (podeGirar(e)) pede("ROTATE", [qualificado(e)], `girado ${e.nome}`); else if (naoGira(e)) msg(NAO_GIRA);
    }
    if (ed.ligado && e && (ev.key === "Delete" || ev.key === "Backspace")) apaga(e);
  });
  addEventListener("resize", () => dados && ajusta());
})();

// ---------------------------------------------------------------- editor: o Gecko do MaiSim aplica cada mudança e o desenho vem do estado dele
const ed = { ligado: false, sel: null, colocar: null, catalogo: null, aba: 0, fantasma: null, fioSel: null, todos: true, lib: [], sujo: false,
  multi: new Set(), multiFios: new Set(),        // a seleção de vários (Shift): nomes dos componentes e chaves das conexões
             fio: { modo: false, cantos: [], dom: null, mouse: null } };
function msg(t, tipo = "") { $("msg").textContent = t; $("msg").className = tipo; if (tipo) anota(t, tipo);
  if (VISTA_CODIGO && tipo === "erro" && typeof poeEstado === "function") poeEstado(t, "erro"); }   // sem o cabeçalho: o erro vai para a linha do editor
// histórico: as últimas 20 mudanças e avisos (o que passa em verde ou vermelho no topo), embaixo do painel da direita
const HIST_N = 20;
let historico = [];
try { historico = JSON.parse(sessionStorage.getItem("maisim-simu-hist") || "[]"); } catch (e) { /* ok */ }
function anota(t, tipo) {
  historico.unshift({ t, tipo, h: new Date().toLocaleTimeString("pt-BR") }); historico = historico.slice(0, HIST_N);
  try { sessionStorage.setItem("maisim-simu-hist", JSON.stringify(historico)); } catch (e) { /* ok */ }
  const h = document.getElementById("hist"); if (h) h.outerHTML = caixaHist();
}
const escT = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const caixaHist = () => `<div id="hist"><h4>histórico <small>(últimas ${HIST_N})</small>${botaoDesfazer()}</h4>${historico.length
  ? `<ol>${historico.map((x) => `<li class="${x.tipo}"><time>${x.h}</time>${escT(x.t)}</li>`).join("")}</ol>` : `<div class="t">nada ainda nesta sessão</div>`}</div>`;
const grade = (ev) => { const r = $("svg").getBoundingClientRect();
  return [Math.round((ver.x + (ev.clientX - r.left) / r.width * ver.w) / G), Math.round((ver.y + (ev.clientY - r.top) / r.height * ver.h) / G)]; };
const naFolhaPrincipal = () => folhaAtual === "0";
const podeGirar = (e) => e.tipo !== "TERM" && !naoGira(e);   // o terminal do SM não gira: a borda da folha diz o lado do borne
// o Gecko não gira bloco de controle nem subcircuito: RegelBlock.rotiereSymbol() é vazio ("control components cannot be
// rotated at the moment!") e os dois forçam a orientação para baixo em setComponentDirection (conferido em 19/10)
const naoGira = (e) => e.dom === "CONTROL" || e.tipo === "SUBCIRCUIT";
const NAO_GIRA = "o Gecko não gira bloco de controle nem subcircuito; para ligar sem fio, dê o mesmo rótulo aos dois terminais";
// terminal de subcircuito (regra do Gecko, TerminalToWrap): levado a (x, y), encosta na borda mais próxima da folha (as
// diagonais dividem os lados), e essa borda é o lado do borne no bloco. O servidor confere e escolhe um borne livre.
function bordaGecko(x, y, sx, sy) {
  x = Math.min(x, sx - 1); y = Math.min(y, sy - 1);
  if (y > x * sy / sx) return y < sy - x * sy / sx ? [1, y] : [x, sy - 1];
  return y < sy - x * sy / sx ? [x, 2] : [sx - 1, y];
}
const blocoDaFolha = (fid) => Object.values(dados.folhas).flatMap((f) => f.elementos).find((x) => x.tipo === "SUBCIRCUIT" && x.uid === fid);
// nome curto no bloco: o padrão do Gecko CIRCUIT_TERMINAL.k / CONTROL_TERMINAL.k vira Circuit.k / Control.k (como na paleta)
const nomeTerm = (n) => String(n).replace(/^([A-Z]+)_TERMINAL\.(\d+)$/, (_, a, k) => a[0] + a.slice(1).toLowerCase() + "." + k);
const LADO_TXT = { e: "à esquerda", d: "à direita", c: "em cima", b: "embaixo" };
function resumoBornes(b) {                              // quantos bornes em cada lado (cabe um por quadrado) e os que caíram juntos
  const [bx, by] = b.tamanho, n = (l) => b.terminais.filter((t) => t.lado === l).length;
  const juntos = [...new Set(b.terminais.filter((t) => t.junto).map((t) => [t.interno, ...t.junto].sort().join(" e ")))];
  return `bornes: ${n("e")} de ${by} à esquerda · ${n("d")} de ${by} à direita · ${n("c")} de ${bx} em cima · ${n("b")} de ${bx} embaixo. `
    + "Cada terminal de dentro é um borne, e a borda da folha em que ele fica é o lado do borne."
    + (juntos.length ? ` <b style="color:${COR.erro}">No mesmo borne: ${juntos.map(escT).join("; ")}</b> — entre no subcircuito e arraste um deles para outro ponto da borda.` : "");
}
function infoTerminal(e) {                              // o borne deste terminal no bloco
  const b = blocoDaFolha(folhaAtual), t = b && b.terminais.find((x) => x.interno === e.nome);
  if (!t) return "terminal do subcircuito";
  return `borne <b>${LADO_TXT[t.lado]}</b> do bloco ${escT(nomeSub(b.nome))}${t.rotulo ? `, ligado lá fora a <b>${escT(t.rotulo)}</b>` : ""}. `
    + "A borda da folha em que o terminal fica é o lado do borne (como no Gecko): arraste até outra borda para mudar de lado; "
    + "ao longo da borda, o borne acompanha (um por quadrado do bloco). Se o lugar já tem borne, ele vai para o livre mais perto."
    + (t.junto ? ` <b style="color:${COR.erro}">No mesmo borne que ${t.junto.map(escT).join(", ")}</b>: arraste um deles.` : "");
}
// depois de pôr ou mover um terminal de SM: onde o borne ficou (o servidor diz)
const textoTerminal = (t) => ` → borne ${t.lado} do bloco` + (t.deslizou ? " (o ponto pedido já tinha borne: foi para o livre mais perto)"
  : t.pedido[0] !== t.ponto[0] || t.pedido[1] !== t.ponto[1] ? ` (encostado na borda, em (${t.ponto}), como no Gecko)` : "");
// o nome para o Gecko: dentro de um SM, SUBCIRCUIT.k#nome — pela folha onde o componente ESTÁ (não pela aberta: um painel
// que ficou de outra folha mandaria SUBCIRCUIT.1#SUBCIRCUIT.1); procura pelo identificador, que sobrevive a um estado novo
function folhaDe(e) {
  for (const [k, f] of Object.entries(dados.folhas)) if (f.elementos.some((x) => x === e || (e.uid && x.uid === e.uid))) return k;
  return folhaAtual;
}
const qualificado = (e) => { const f = folhaDe(e); return f === "0" ? e.nome : `${dados.folhas[f].nome}#${e.nome}`; };
const selecionado = () => dados && ed.sel ? dados.folhas[folhaAtual].elementos.find((e) => e.nome === ed.sel) : null;
// a conexão com o servidor pode cair no caminho (a ponte Windows ↔ WSL deixa uma conexão morta, sem rastro): o pedido é
// repetido uma vez. A mudança (POST) vai com uma etiqueta única (X-MaiSim-Pedido): se o primeiro chegou e só a resposta se
// perdeu, o servidor devolve a mesma resposta sem fazer a mudança de novo. Sem conexão, a faixa "sem conexão" aparece
const etiqueta = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12));
async function api(rota, corpo) {
  const id = corpo ? etiqueta() : null;
  let r;
  for (let tentativa = 0; ; tentativa++) {
    try { r = await fetch(rota, corpo ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim-Pedido": id }, body: JSON.stringify(corpo) } : {}); break; }
    catch (e) {
      if (tentativa === 0) { await new Promise((ok) => setTimeout(ok, corpo ? 600 : 400)); continue; }
      avisoRede(true);
      throw new Error(corpo ? "a conexão com o servidor do simu caiu no caminho (o pedido pode não ter chegado): confira o desenho e tente de novo"
        : "sem resposta do servidor do simu (a conexão caiu no caminho): tente de novo");
    }
  }
  avisoRede(false);
  let j; try { j = await r.json(); } catch (e) { throw new Error(`resposta inválida do servidor do simu (${r.status}): tente de novo`); }
  if (!r.ok) { const er = new Error(j.erro || r.statusText); er.dados = j; throw er; }   // dados: o resto da resposta (ex.: conflito)
  if (j && j.aviso_gecko) setTimeout(() => msg(j.aviso_gecko, "erro"), 80);   // a vigia fechou uma janela de erro do Gecko: depois do "ok"
  return j;
}
// a faixa "sem conexão com o MaiSim": aparece quando um pedido não passa nem repetido; "testar de novo" (e a cada 5 s, sozinha)
// pergunta ao servidor; com resposta, some
let redeTimer = 0;
function avisoRede(fora) {
  let f = document.getElementById("rede-aviso");
  if (!fora) { if (f && f.style.display !== "none") { f.style.display = "none"; clearInterval(redeTimer); redeTimer = 0; msg("conexão com o servidor do simu de volta", "ok"); } return; }
  if (!f) {
    f = document.createElement("div"); f.id = "rede-aviso"; f.setAttribute("role", "alert");
    f.innerHTML = `<b>sem conexão com o servidor do MaiSim</b> <span>— a ponte Windows ↔ WSL pode ter derrubado a conexão</span>
      <button type="button">Testar de novo</button><small></small>`;
    document.body.appendChild(f);
    f.querySelector("button").onclick = () => testaRede(true);
  }
  f.style.display = ""; f.querySelector("small").textContent = "";
  if (!redeTimer) redeTimer = setInterval(() => testaRede(false), 5000);
}
async function testaRede(clicou) {
  const f = document.getElementById("rede-aviso"); if (!f) return;
  try { const r = await fetch("editor/rodada", { cache: "no-store" }); if (!r.ok) throw new Error(r.status); avisoRede(false); }
  catch (e) { if (clicou) f.querySelector("small").innerHTML = "ainda sem resposta. Se não voltar em alguns segundos: feche e abra o MaiSim; se continuar, " +
    "no PowerShell do Windows <code>wsl --shutdown</code> e, no WSL, <code>npm run maisim</code> (salve antes, se der)."; }
}
// desfazer (Ctrl+Z): o servidor guarda o estado de antes de cada mudança (até 20) e o Gecko reabre o último
function botaoDesfazer() {
  const d = dados && dados.desfazer, n = d ? d.n : 0;
  return `<button id="bt-desfazer" ${n ? "" : "disabled"} title="${n ? `desfaz: ${escT(d.ultimo)} (Ctrl+Z) · ${n} passo(s) guardado(s)` : "nada para desfazer"}">↶ desfazer</button>`;
}
async function desfazer() {
  if (!ed.ligado || !(dados && dados.desfazer && dados.desfazer.n)) { if (ed.ligado) msg("nada para desfazer"); return; }
  if (ed.fio.modo && ed.fio.cantos.length) { ed.fio.cantos = []; ed.fio.dom = null; previaFio(); return; }
  msg("desfazendo…");
  try { const j = await api("editor/desfazer", {}); ed.sel = null; ed.fioSel = null; novoEstado(j); msg(`desfeito: ${j.desfeito}`, "ok"); }
  catch (e) { msg(e.message, "erro"); }
}
document.addEventListener("click", (ev) => { if (ev.target.closest && ev.target.closest("#bt-desfazer")) desfazer(); });
function novoEstado(j) { const fol = folhaAtual; dados = j; if (!dados.folhas[fol]) folhaAtual = "0"; marcaSujo(true); desenha(); mostraProps(); avisa("circuito", { arq: ed.abertoSel, sujo: true });
  if (typeof ligacoesMudaram === "function") ligacoesMudaram();
  if (j.renomeados && j.renomeados.length) setTimeout(() => perguntaRenomes(j.renomeados), 120); }   // depois do "ok" de quem pediu
// um sinal que o controle usa mudou de nome (Marcelo, 19/10: "quando a gente muda uma variável de nome e ela está sendo usada
// em algum código, tem como mudar todos os lugares? ou pelo menos alertar num modal e confirmar"): o servidor diz quais e
// onde; renomear no controle também (o nome entre aspas no código, os cartões, as atuações, os acionamentos), deixar como
// está, ou desfazer a mudança do circuito
let perguntandoRenomes = false;
async function perguntaRenomes(ren) {
  if (perguntandoRenomes) return;
  perguntandoRenomes = true;
  try {
    const MAX = 8, onde = (u) => [...new Set(u.map((x) => x.onde))], n = ren.length, nUsos = ren.reduce((s_, r_) => s_ + r_.usos.length, 0);
    const lista = ren.slice(0, MAX).map((r_) => `<li><code>${escT(r_.de)}</code> → <code>${escT(r_.para)}</code> <small>${onde(r_.usos).map(escT).join(", ")}</small></li>`).join("")
      + (n > MAX ? `<li>… e mais ${n - MAX}</li>` : "");
    const r = await modal({ titulo: n === 1 ? "O controle usa o nome antigo" : `O controle usa ${n} nomes antigos`,
      texto: `Mudou o nome de ${n === 1 ? "um sinal" : `${n} sinais`} que o controle usa (${nUsos} ${nUsos === 1 ? "lugar" : "lugares"}):`,
      html: `<ul class="m-renomes">${lista}</ul><p class="m-dica">Renomear troca o nome entre aspas no código (m["…"], return {"…": …}),
        nos cartões dos controladores, nas atuações marcadas e nos acionamentos. Comentários ficam como estão.</p>`,
      ok: "Renomear no controle também", cancelar: "Deixar como está", extra: [{ rotulo: "Desfazer a mudança", valor: "desfazer" }], largo: true });
    if (r && r._botao === "desfazer") { await desfazer(); return; }
    if (!r) { msg(`o controle ficou com ${n === 1 ? "o nome antigo" : "os nomes antigos"} (${ren.map((x) => x.de).slice(0, 3).join(", ")}${n > 3 ? "…" : ""}): veja os avisos do controle`, "erro"); return; }
    if (typeof guardaControle === "function" && ctl.carregado) await guardaControle();   // o que está no editor de código vai antes
    const j = await api("editor/controle/renomeia", { pares: ren.map((x) => [x.de, x.para]) });
    if (typeof recarregaControle === "function") await recarregaControle();
    msg(`renomeado no controle: ${ren.slice(0, 3).map((x) => `${x.de} → ${x.para}`).join(", ")}${n > 3 ? ` e mais ${n - 3}` : ""} (${j.trocas} ${j.trocas === 1 ? "troca" : "trocas"})`, "ok");
  } catch (e) { msg(e.message, "erro"); }
  finally { perguntandoRenomes = false; }
}
async function pede(op, args, ok) {
  msg("aplicando…");
  const fs = op === "SETG" ? [folhaAtual] : alvos();            // dentro de um subcircuito: ele só, ou todos os iguais
  ok += nosSMs(fs);
  try {
    let j;
    if (fs.length > 1) {
      const pre = dados.folhas[folhaAtual].nome + "#", troca = (k, a, i) => i === 0 && String(a).startsWith(pre) ? dados.folhas[k].nome + "#" + String(a).slice(pre.length) : a;
      j = await api("editor/cmds", { cmds: fs.map((k) => ({ op, args: args.map((a, i) => troca(k, a, i)) })), descr: ok });
    } else j = await api("editor/cmd", { op, args, descr: ok });
    novoEstado(j); ok += abriuEspaco(j);
    if (j.terminal) ok += textoTerminal(j.terminal);
    if (j.terminal && !j.terminal.ok) msg(`${ok} — ${j.terminal.aviso}`, "erro"); else msg(ok, "ok");
    if (op === "DELETE") seleciona(null); if (op === "RENAME") { ed.sel = args[1]; desenha(); mostraProps(); }
  } catch (e) {
    msg(e.message, "erro");
    if (fs.length > 1) try { novoEstado(await api("editor/estado")); } catch (_) { /* fica o desenho de antes */ }
    desenha();
  }
}
// ---------------------------------------------------------------- SMs iguais: no Gecko cada SM é uma cópia independente; dentro de
// um SM, o editor aplica a mesma mudança em todos os SMs com a mesma estrutura (elementos: nome, tipo, posição, orientação;
// conexões), ou só neste, se você desmarcar. As variáveis $ valem para todos os componentes que as usam, em qualquer caso.
function foraDaFolha(p) {                            // a folha de um SM tem tamanho fixo: fora dela, o Gecko encostaria na borda
  const t = dados.folhas[folhaAtual].tamanho;
  if (!t || (p[0] >= 1 && p[1] >= 1 && p[0] <= t[0] - 1 && p[1] <= t[1] - 1)) return false;   // o Gecko põe em 1 o que vier menor
  msg(`(${p}) fica fora da folha do ${nomeSM(folhaAtual)} (1…${t[0] - 1} × 1…${t[1] - 1}, a borda tracejada)`, "erro"); return true;
}
function assinaturaFolha(f) {
  return JSON.stringify([f.elementos.map((e) => JSON.stringify([e.nome, e.tipo, e.x, e.y, e.dir])).sort(), f.fios.map((w) => JSON.stringify([w.dom, w.pts])).sort()]);
}
function iguaisA(f) {                                  // a folha f primeiro, depois as iguais a ela (em ordem de número)
  const a = assinaturaFolha(dados.folhas[f]), num = (k) => +(dados.folhas[k].nome.match(/\d+$/) || [0])[0];
  return [f].concat(Object.keys(dados.folhas).filter((k) => k !== "0" && k !== f && assinaturaFolha(dados.folhas[k]) === a).sort((x, y) => num(x) - num(y)));
}
const smsIguais = () => naFolhaPrincipal() ? ["0"] : iguaisA(folhaAtual);
const alvos = () => naFolhaPrincipal() || !ed.todos ? [folhaAtual] : smsIguais();
// o tamanho do bloco e da folha (Marcelo, 19/10: "se eles são iguais, tem que respeitar o tamanho quando muda"): fica na folha de
// cima, no bloco; com "mudar os N juntos", vale para todos os iguais, num passo do desfazer. "Igualar a este" acerta os que
// ficaram diferentes antes disso
const TAMANHO = { BlockSizeX: (b) => b.tamanho[0], BlockSizeY: (b) => b.tamanho[1],
  SheetSizeX: (b) => dados.folhas[b.uid].tamanho[0], SheetSizeY: (b) => dados.folhas[b.uid].tamanho[1] };
const iguaisDoBloco = (e) => e.tipo === "SUBCIRCUIT" && dados.folhas[e.uid] ? iguaisA(e.uid).map(blocoDaFolha).filter(Boolean) : [e];
const txtTamanho = (b) => `bloco ${b.tamanho[0]} × ${b.tamanho[1]}, folha ${dados.folhas[b.uid].tamanho.join(" × ")}`;
async function mudaTamanho(e, mudas, descr, todos = ed.todos) {       // mudas: [[parâmetro, valor], …]
  const bs = todos ? iguaisDoBloco(e) : [e];
  const setp = (p) => p.replace(/^Block/, "block");       // blockSizeX: o nome que o servidor confere (bornes) e reabre
  const cmds = bs.flatMap((b) => mudas.filter(([p, v]) => TAMANHO[p](b) !== v).map(([p, v]) => ({ op: "SETP", args: [qualificado(b), setp(p), v] })));
  if (!cmds.length) { msg(`${descr}: já está assim`, "ok"); mostraProps(); return; }
  if (bs.length > 1) descr += ` (nos ${bs.length} subcircuitos iguais)`;
  msg("aplicando…");
  try { novoEstado(await api(cmds.length > 1 ? "editor/cmds" : "editor/cmd", cmds.length > 1 ? { cmds, descr } : Object.assign({ descr }, cmds[0]))); msg(descr, "ok"); }
  catch (err) { msg(err.message, "erro"); try { novoEstado(await api("editor/estado")); } catch (_) { mostraProps(); } }
}
function caixaIguais(e) {                              // no painel do bloco, na folha de cima
  const bs = iguaisDoBloco(e);
  if (bs.length < 2) return "";
  const dif = bs.slice(1).filter((b) => txtTamanho(b) !== txtTamanho(e));
  return `<label class="p-juntos" title="o mesmo &quot;mudar os N juntos&quot; de dentro do subcircuito"><input type="checkbox" id="p-juntos" ${ed.todos ? "checked" : ""}> Mudar os ${bs.length} iguais juntos</label>
    <div class="aviso">${ed.todos ? `o tamanho do bloco e da folha vale para os ${bs.length} subcircuitos iguais (${bs.map((b) => escT(nomeSub(b.nome))).join(", ")})` : `só o ${escT(nomeSub(e.nome))} muda de tamanho`}${dif.length
      ? `<div class="p-dif">${dif.map((b) => `${escT(nomeSub(b.nome))} está com ${txtTamanho(b)}`).join("; ")} <button id="p-iguala" title="o tamanho deste (${txtTamanho(e)}) nos ${bs.length} iguais">Igualar a este</button></div>` : ""}</div>`;
}
const nomeSM = (k) => nomeSub(dados.folhas[k].nome);
const nosSMs = (fs) => fs.length > 1 ? ` (nos ${fs.length} subcircuitos iguais)` : (naFolhaPrincipal() ? "" : ` (só no ${nomeSM(folhaAtual)})`);
function textoAlvos() {
  const n = smsIguais().length, sm = nomeSM(folhaAtual);
  if (n === 1) return `${sm} é único (diferente dos outros subcircuitos): as mudanças valem só para ele.`;
  return ed.todos ? `cada mudança vale para os <b>${n} subcircuitos iguais</b> (${sm} e outros ${n - 1}); no Gecko cada subcircuito é uma cópia, e o editor muda todas.`
                  : `só o <b>${sm}</b> muda; ele deixa de ser igual aos outros ${n - 1}.`;
}
function faixaSM() {                                   // a faixa no alto da folha de um SM, em edição
  const fx = $("faixa-sm");
  if (!ed.ligado || naFolhaPrincipal() || !dados) { fx.style.display = "none"; return; }
  const n = smsIguais().length, sm = nomeSM(folhaAtual);
  fx.style.display = "block";
  fx.innerHTML = n > 1
    ? `<b>${sm}</b> é igual a outros ${n - 1} subcircuitos. <label><input type="checkbox" id="ck-todos" ${ed.todos ? "checked" : ""}> Mudar os ${n} juntos</label>
       <span class="sub-faixa">${ed.todos ? "no Gecko cada SM é uma cópia; o editor aplica a mesma mudança em todas" : `só o ${sm} muda (deixa de ser igual aos outros)`} · variáveis $ valem para todos que as usam</span>`
    : `<b>${sm}</b> é único (diferente dos outros subcircuitos): as mudanças valem só para ele <span class="sub-faixa">variáveis $ valem para todos que as usam</span>`;
  const b = blocoDaFolha(folhaAtual), juntos = b ? [...new Set(b.terminais.filter((t) => t.junto).map((t) => [t.interno, ...t.junto].sort().join(" e ")))] : [];
  if (juntos.length) fx.innerHTML += `<span class="sub-faixa" style="color:${COR.erro}">no mesmo borne do bloco: ${juntos.map(escT).join("; ")} — arraste um deles para outro ponto da borda</span>`;
  const ck = $("ck-todos"); if (ck) ck.onchange = () => { ed.todos = ck.checked; faixaSM(); mostraProps(); };
}
// mudanças não salvas (o servidor diz o quê: circuito, controle, cores): pergunta o que fazer. Devolve o modo para repetir o
// pedido ("manter", "salvar", "descartar"), "salvou" (salvar como… já gravou: repetir sem modo) ou null (cancelado).
// O foco começa na opção que guarda (nunca em descartar): Enter não joga trabalho fora.
async function perguntaNaoSalvo(e, acao) {
  const c = e.dados && e.dados.conflito ? e.dados : null; if (!c) throw e;
  const nome = escT((c.aberto || "").split("/").pop() || "o circuito novo");
  const extra = c.mesmo ? [{ rotulo: "Manter as mudanças", valor: "manter", classe: "primario" }]
    : c.salvavel ? [{ rotulo: `Salvar ${nome} e ${acao}`, valor: "salvar", classe: "primario" }]
    : [{ rotulo: `Salvar como… e ${acao}`, valor: "salvar_como", classe: "primario" }];
  const r = await modal({ titulo: c.mesmo ? "O Gecko tem mudanças que o editor não viu" : "Há mudanças não salvas",
    texto: `${escT(e.message)}.${c.mesmo ? "<br><b>manter</b>: o editor mostra o que está no Gecko (continua sem salvar) · <b>descartar</b>: volta ao arquivo." : ""}`,
    ok: c.mesmo ? "Descartar" : `Descartar e ${acao}`, perigo: true, extra, largo: true, foco: ".m-extra" });
  if (!r) return null;
  if (r._botao === "salvar_como") return (await salvarComo()) ? "salvou" : null;
  return r._botao || "descartar";
}
// o cadeado (aberto: editando, o padrão; fechado: só ver) — a escolha fica no navegador
const TITULO_CADEADO = { true: "editando (cadeado aberto): cada mudança é aplicada no circuito · clique para travar (só ver)", false: "travado: só ver · clique para editar" };
function poeCadeado(on) { $("bt-editar").classList.toggle("ativo", on); $("bt-editar").title = TITULO_CADEADO[!!on]; }
async function liga(on) {
  ed.ligado = on; document.body.classList.toggle("editando", on); poeCadeado(on);
  if (ed.fio.modo) modoFio(false);
  seleciona(null); escolhe(null);
  if (!on) {
    if (ed.novo && !(await confirma("Circuito novo não salvo", `Sair da edição descarta <b>${ed.novo}</b>, que não foi salvo. Para guardar: salvar como (o disquete com lápis).`, "Sair sem salvar", true))) {
      ed.ligado = true; document.body.classList.add("editando"); poeCadeado(true); return; }
    if (ed.novo) { ed.novo = null; await recarregaModelos(); }
    msg(""); if (!$("sel-modelo").value) { desenha(); return; }   // fechado: nada a ler
    return carrega($("sel-modelo").value);
  }
  if (!ed.catalogo) { ed.catalogo = await (await fetch("static/catalogo.json")).json();
    const med = ed.catalogo.abas.find((a) => a.aba === "Measure"); if (med) med.itens.unshift(TAG_ITEM);   // a tag do MaiSim, junto dos medidores
    desenhaPaleta(); carregaBiblioteca(); }
  if ($("sel-modelo").value === NOVO || !$("sel-modelo").value) return;   // novo, ou fechado: nada a abrir
  msg("abrindo…");
  try {
    let j; const alvo = $("sel-modelo").value;
    try { j = await api("editor/abrir", { arq: alvo }); }
    catch (e) {
      const modo = await perguntaNaoSalvo(e, "abrir");
      if (!modo) {                                       // cancelou: tudo fica como estava (o Gecko e a lista no modelo aberto)
        if (ed.abertoSel && ed.abertoSel !== alvo) { $("sel-modelo").value = ed.abertoSel; mostraModelo(); }
        if (ed.abertoSel && dados && dados.editor) { msg("abrir cancelado: continua o que está aberto", ""); return; }
        throw new Error("abrir cancelado");
      }
      if (modo === "salvou") { $("sel-modelo").value = alvo; mostraModelo(); }
      j = await api("editor/abrir", modo === "salvou" ? { arq: alvo } : { arq: alvo, modo });
    }
    ed.abertoSel = alvo;
    folhaAtual = "0"; dados = j; marcaSujo(!!j.mantido); desenha(); ajusta();
    const sm = usaSimulacaoDoArquivo(j);
    msg(`aberto: ${j.arq}` + (sm ? ` · ${sm}` : ""), "ok");
    if (typeof recarregaControle === "function") recarregaControle();
    avisa("circuito", { arq: alvo, outro: true, sujo: ed.sujo });
  }
  catch (e) { msg(e.message, "erro"); ed.ligado = false; document.body.classList.remove("editando"); poeCadeado(false); }
  setTimeout(() => dados && ajusta(), 50);
}
// o Δt e o tempo final do arquivo aberto (o Gecko guarda os da última rodada) passam a ser os da simulação quando o modelo
// muda: um modelo feito para Δt = 1 µs não roda com o Δt que sobrou de outro. Reabrir o mesmo modelo (entrar na edição de
// novo) não mexe no que o usuário escolheu em Parâmetros da simulação.
function usaSimulacaoDoArquivo(j) {
  const s = j && j.simulacao;
  if (!s || !(s.dt > 0) || !(s.tfim > 0) || sim.par.modelo === j.arq) return "";
  sim.par.dt = String(s.dt); sim.par.tfim = String(s.tfim); sim.par.modelo = j.arq;
  try { localStorage.setItem("maisim-simu-sim", JSON.stringify(sim.par)); } catch (e) { /* ok */ }
  return `Δt = ${si(s.dt, "s")}, tempo final ${si(s.tfim, "s")} (do arquivo; mude na ⚙ ao lado do ▶)`;
}
function desenhaPaleta() {
  const c = { abas: ed.catalogo.abas.concat([{ aba: "Biblioteca", itens: ed.lib }]) }, q = $("busca").value.trim().toLowerCase();
  $("abas").innerHTML = c.abas.map((a, k) => `<button data-k="${k}" class="${k === ed.aba && !q ? "ativo" : ""}">${a.aba}</button>`).join("");
  $("abas").querySelectorAll("button").forEach((b) => b.onclick = () => { ed.aba = +b.dataset.k; $("busca").value = ""; desenhaPaleta(); });
  const itens = (q ? c.abas.flatMap((a) => a.itens.map((i) => Object.assign({ aba: a.aba }, i))).filter((i) => `${i.nome} ${i.id}`.toLowerCase().includes(q))
                    : c.abas[ed.aba].itens).filter((i) => i.id !== "SCOPE");      // regra do MaiSim: medidor vai para o /maisim/scope
  $("itens").innerHTML = itens.map((i) => `<div class="item${ed.colocar && ed.colocar.id === i.id ? " ativo" : ""}${i.lib ? " lib" : ""}" data-id="${i.id}" draggable="true"
    title="${i.lib ? `${i.nome} · subcircuito da biblioteca · ${i.info} · clique ou arraste para a folha` : `${i.nome} · tipo ${i.typ} · ${i.dom} · clique ou arraste para a folha`}">
    ${icone(i)}<span>${i.nome}</span>${i.lib ? `<small>${i.info}</small>` : ""}</div>`).join("") ||
    (ed.aba === c.abas.length - 1 && !q ? `<div class="dica-paleta">a biblioteca está vazia: selecione um subcircuito e use “salvar na biblioteca…”</div>` : "<i>nada</i>");
  const acha = (id) => c.abas.flatMap((a) => a.itens).find((i) => i.id === id);
  $("itens").querySelectorAll(".item").forEach((d) => {
    d.onclick = () => { const it = acha(d.dataset.id); escolhe(ed.colocar && ed.colocar.id === it.id ? null : it); };
    // arrastar: só marca o item (redesenhar a paleta aqui tiraria da página o item que está sendo arrastado e cancelaria o gesto)
    d.addEventListener("dragstart", (ev) => { const it = acha(d.dataset.id); if (ed.fio.modo) modoFio(false);
      ed.colocar = it; document.body.classList.add("colocando"); d.classList.add("ativo");
      ev.dataTransfer.setData("text/plain", it.id); ev.dataTransfer.effectAllowed = "copy"; });
    d.addEventListener("dragend", (ev) => { if (ev.dataTransfer.dropEffect === "none" && ed.colocar) escolhe(null); });
  });
}
// arrastar da paleta para a folha (o mesmo que clicar no item e depois na folha)
$("svg").addEventListener("dragover", (ev) => { if (!ed.ligado || !ed.colocar) return; ev.preventDefault(); ev.dataTransfer.dropEffect = "copy";
  if (ed.fantasma) { const [gx, gy] = grade(ev); ed.fantasma.style.display = ""; ed.fantasma.setAttribute("transform", `translate(${gx * G},${gy * G})`); } });
$("svg").addEventListener("drop", (ev) => { if (!ed.ligado || !ed.colocar) return; ev.preventDefault(); coloca(ev); });
// a biblioteca de subcircuitos (simu/gecko/subcircuitos/): itens da aba "Biblioteca"
async function carregaBiblioteca() {
  try {
    const lst = await (await fetch("biblioteca")).json();
    ed.lib = lst.filter((b) => !b.erro).map((b) => ({ id: "LIB:" + b.nome, nome: b.nome, lib: true, arq: b.arq, typ: "subcircuito", dom: "biblioteca",
      info: `${b.elementos} elem. · ${b.terminais.length} terminais` }));
  } catch (e) { ed.lib = []; }
  if (ed.catalogo) desenhaPaleta();
}
function escolhe(item) {
  if (item && simulando()) { avisaTrava(); return; }
  if (item && ed.fio.modo) modoFio(false);
  ed.colocar = item; document.body.classList.toggle("colocando", !!item);
  if (ed.fantasma) ed.fantasma.style.display = "none";
  if (ed.catalogo) desenhaPaleta();
  if (item) msg(`clique na folha para pôr ${item.nome} · Esc cancela`); 
}
async function coloca(ev) {
  const [x, y] = grade(ev), base = (ed.colocar.id || "X").replace(/[^A-Za-z0-9_]/g, "_");
  if (foraDaFolha([x, y])) return;
  if (ed.colocar.lib) {                                 // subcircuito da biblioteca: o servidor copia para o circuito aberto
    const it = ed.colocar; escolhe(null); msg(`trazendo ${it.nome} da biblioteca…`);
    const descr = `${it.nome} (biblioteca) em (${x}, ${y})` + (naFolhaPrincipal() ? "" : ` (só no ${nomeSM(folhaAtual)})`);
    try { const j = await api("editor/biblioteca", { acao: "inserir", nome_lib: it.nome, x, y, folha: folhaAtual, descr });
      ed.sel = j.inserido; novoEstado(j);
      msg(`${descr}: ${nomeSub(j.inserido)}` + (j.globais_novas.length ? ` · variáveis novas: ${j.globais_novas.join(" ")}` : ""), "ok"); }
    catch (e) { msg(e.message, "erro"); }
    return;
  }
  const usados = new Set(Object.values(dados.folhas).flatMap((f) => f.elementos.map((e) => e.nome)));
  let k = 1; while (usados.has(`${base}.${k}`)) k++;
  const nome = `${base}.${k}`, item = ed.colocar;
  escolhe(null); ed.sel = nome;
  if (item.id === "TAG") {
    const q = naFolhaPrincipal() ? nome : `${dados.folhas[folhaAtual].nome}#${nome}`, descr = `tag criada: ${nome} em (${x}, ${y}) (scope: tag_${k})`;
    try { novoEstado(await api("editor/cmds", { cmds: [{ op: "CREATE", args: [q, x, y, "GAIN"] }, { op: "SETP", args: [q, "r0", 1] }, { op: "OUTNODE", args: [q, 0, `tag_${k}`] }], descr }));
      msg(descr + " · ligue a entrada a um ponto de controle", "ok"); } catch (er) { msg(er.message, "erro"); }
    return;
  }
  await pede("CREATE", [naFolhaPrincipal() ? nome : `${dados.folhas[folhaAtual].nome}#${nome}`, x, y, item.id], `${item.nome} criado: ${nome} em (${x}, ${y})`);
}
function seleciona(e) { ed.sel = e ? e.nome : null; ed.fioSel = null; ed.multi.clear(); ed.multiFios.clear(); desenha(); mostraProps(); }
// simulando, o circuito fica só para ver (Marcelo, 22/10: "o bloqueio de edição quando tiver rodando"): o servidor já recusava
// as mudanças (ocupado()), mas a tela deixava mexer e só depois dava o erro. Agora: clicar seleciona e mostra os dados; arrastar,
// ligar fio, pôr componente, os atalhos que mudam e o painel do componente ficam travados, com o aviso; o ⚙ só mostra
const simulando = () => ["preparando", "rodando", "pausada"].includes(sim.estado);
const AVISO_TRAVA = "simulação rodando: o circuito fica só para ver até ela parar (a rodada usa o circuito do início)";
function avisaTrava() {                                // fica 4 s (a barra de progresso não o cobre) e não se repete no histórico
  if (sim.avisoAte > Date.now()) return;
  sim.avisoAte = Date.now() + 4000; msg(AVISO_TRAVA, "erro");
}
function travaCircuito(on) {
  const mudou = document.body.classList.contains("circ-travado") !== on;
  document.body.classList.toggle("circ-travado", on);
  for (const id of ["bt-modelo", "bt-novo", "bt-salvar", "bt-salvar-como", "bt-fio"]) if ($(id)) $(id).disabled = on;
  if (on) { if (ed.fio.modo) modoFio(false); if (ed.colocar) escolhe(null); }
  if (mudou && ed.ligado) mostraProps();
}
async function mostraProps() {
  await montaProps();
  const P = $("props"); if (!ed.ligado || !simulando() || !P.firstChild) return;
  P.querySelectorAll("input, select, textarea, button").forEach((x) => { x.disabled = true; });
  if (!P.querySelector(".trava-circ")) P.insertAdjacentHTML("afterbegin", `<div class="trava-circ">${AVISO_TRAVA}</div>`);
}
async function montaProps() {
  const P = $("props"); if (!ed.ligado) return;
  if (tamanhoSel()) {                                   // vários selecionados: o resumo e o que dá para fazer com eles
    const sel = selecaoGrupo();
    P.innerHTML = `<h3>seleção</h3><div class="t">${sel.nomes.length} componente(s) e ${sel.fios.length} conexão(ões)</div>
      ${sel.nomes.length ? `<div class="t"><small>${sel.nomes.map(escT).join(", ")}</small></div>` : ""}
      <div class="botoes"><button id="p-sel-apaga" class="perigo">Apagar</button></div>
      <div class="aviso">arraste um deles para mover todos (as conexões de dentro vão junto) · Delete apaga · Ctrl+C / Ctrl+X copiam ou recortam ·
        Ctrl+V cola onde está o mouse · Shift + clique põe ou tira · Shift + arrastar no vazio acrescenta · Esc tira a seleção</div>${caixaHist()}`;
    P.querySelector("#p-sel-apaga").onclick = apagaGrupo; return;
  }
  const w = fioSelecionado();
  if (w) {
    const a = w.pts[0], b = w.pts[w.pts.length - 1];
    P.innerHTML = `<h3>conexão</h3><div class="t">conexão ${NOME_DOM[w.dom] || w.dom} · ${w.pts.length} pontos · (${a}) → (${b})</div>
      <label><span>rótulo do nó</span><input id="f-rot" value="${w.rotulo}" placeholder="(sem rótulo)"></label>
      <div class="aviso">conexões e terminais com o mesmo rótulo ficam no mesmo nó; o voltímetro mede pelos rótulos</div>
      <div class="botoes"><button id="f-apaga" class="perigo">Apagar (Delete)</button></div>${caixaHist()}`;
    P.querySelector("#f-rot").onchange = (ev) => mudaFio(w, { acao: "rotulo", rotulo: ev.target.value.trim() }, `conexão (${a}) → (${b}): rótulo ${ev.target.value.trim() || "(nenhum)"}`);
    P.querySelector("#f-apaga").onclick = () => apagaFio(w);
    return;
  }
  const e = selecionado();
  if (!e) { P.innerHTML = `<div class="t">Clique num componente para ver e mudar os parâmetros. Arrastar move; R gira; Delete apaga.<br><br>
    Cada mudança é aplicada na hora, e o desenho mostra o resultado. <b>Salvar como</b> (o disquete com lápis) grava nos seus circuitos.</div>${caixaHist()}`; return; }
  const vars = Object.keys(e.par).filter((k) => k.endsWith("_var")).map((k) => e.par[k]);
  P.innerHTML = `<h3>${e.nome}</h3><div class="t">${ehTag(e) ? "tag (scope e controle)" : e.nome_tipo || DESCR[e.tipo] || e.tipo} · (${e.x}, ${e.y})</div>
    <label><span>nome</span><input id="p-nome" value="${e.nome}"></label>
    <label><span>posição x, y</span><input id="p-pos" value="${e.x}, ${e.y}"></label>
    <div class="botoes">${podeGirar(e) ? `<button id="p-gira">Girar (R)</button>` : naoGira(e) ? `<button id="p-nao-gira" class="nao-gira" title="${NAO_GIRA}">Girar</button>` : ""}<button id="p-apaga" class="perigo">Apagar</button></div>
    ${e.tipo !== "TERM" ? `<label class="p-desat" title="fica no circuito, mas o Gecko simula como se não existisse (enabled = 0 no Gecko); o desenho fica cinza${e.tipo === "SUBCIRCUIT" ? "; vale para tudo o que está dentro" : ""}"><input type="checkbox" id="p-desat" ${e.ativo === false ? "checked" : ""}> Desativado${e.curto ? " <small>(em curto, no Gecko)</small>" : ""}</label>` : ""}
    ${e.tipo === "SUBCIRCUIT" ? `<div class="botoes"><button id="p-lib" title="grava este subcircuito (e o que tem dentro) em simu/gecko/subcircuitos/, para usar em outros circuitos">Salvar na biblioteca…</button></div>
      <h4>bloco</h4><label><span>largura × altura</span><input id="p-bloco" value="${e.tamanho[0]} × ${e.tamanho[1]}" title="em quadrados da grade (2 a 40): cabe um borne por quadrado em cada lado"></label>
      <div class="aviso">${resumoBornes(e)}</div>
      ${naFolhaPrincipal() ? caixaIguais(e) : ""}
      ${naFolhaPrincipal() && e.terminais.length ? `<h4>rótulos dos bornes <small>(o nó de fora)</small></h4>
      ${e.terminais.map((t) => `<label class="p-borne"><span title="borne ${escT(t.interno || "")}">${escT(nomeTerm(t.interno || ""))}</span><input data-borne="${escT(t.interno || "")}" value="${escT(t.rotulo || "")}" placeholder="sem rótulo" spellcheck="false"></label>`).join("")}
      <div class="aviso">mesmo rótulo, mesmo nó (como no Gecko): apagar o rótulo solta o borne; escrever um nome liga sem fio. Vale só para este ${escT(nomeSub(e.nome))}</div>` : ""}` : ""}
    ${e.tipo === "TERM" && !naFolhaPrincipal() ? `<div class="aviso">${infoTerminal(e)}</div>` : ""}
    ${naFolhaPrincipal() ? "" : `<div class="aviso">${textoAlvos()}</div>`}
    <h4>parâmetros</h4><div id="p-params"><i>lendo…</i></div>
    ${vars.length ? `<h4>variáveis globais que ele usa</h4>${vars.map((v) => `<label><span>${v}</span><input data-g="${v}" value="${dados.globais[v]}"></label>`).join("")}
      <div class="aviso">mudar uma variável muda todos os componentes que a usam</div>` : ""}
    ${e.dom === "LK" && e.terminais.length === 2 ? `<h4>ligações (rótulo do nó de cada terminal)</h4>
      <label><span>terminal 1 ${e.tipo === "U" ? "(+)" : "(início)"}</span><input data-in="0" value="${e.entradas[0] || ""}"></label>
      <label><span>terminal 2 ${e.tipo === "U" ? "(−)" : "(fim)"}</span><input data-out="0" value="${e.saidas[0] || ""}"></label>
      <div class="aviso">terminais com o mesmo rótulo ficam no mesmo nó</div>` : ""}
    ${(e.tipo === "U" || e.tipo === "I") && e.dom === "LK" && e.par.sourceType === 400 ? `<h4>sinal de controle</h4>
      <label><span>valor vem de</span><input id="p-sinal" value="${e.mede[0] || ""}" placeholder="rótulo do sinal" autocomplete="off"></label>
      <div class="aviso">a fonte vale ganho × o sinal de controle com este rótulo (ex.: a saída de um CONST que o controle escreve)</div>` : ""}
    ${e.tipo === "VOLT" ? `<h4>o que ele mede</h4><label><span>tensão do nó</span><input id="m-n1" value="${e.mede[0] || ""}"></label>
      ${seletorPonta(e, 0)}
      <label><span>menos o nó</span><input id="m-n2" value="${e.mede[1] || ""}"></label>
      ${seletorPonta(e, 1)}` : ""}
    ${e.tipo === "GATE" ? `<h4>chave que ele comanda</h4><label><span>chave</span><input id="m-chave" value="${e.mede[0] || ""}" placeholder="procurar chave…" autocomplete="off"></label>
      <div class="aviso">entrada &gt; 0,5 liga a chave; ≤ 0,5 desliga (tiristor: &gt; 0,5 dispara, e ele só bloqueia quando a corrente zera). Ex.: um CONST que o controle escreve, 0 ou 1</div>` : ""}
    ${e.tipo === "AMP" ? `<h4>o que ele mede</h4><label><span>corrente de</span><input id="m-comp" value="${e.mede[0] || ""}" placeholder="procurar componente…" autocomplete="off"></label>` : ""}
    ${ehTag(e) ? `<h4>o que ela marca</h4><label><span>entrada (rótulo)</span><input data-in="0" value="${e.entradas[0] || ""}" placeholder="ou ligue por conexão"></label>
      <div class="aviso">o sinal ligado na entrada (por conexão ou pelo rótulo) vai para o /maisim/scope e para o m[…] do controle com o nome abaixo</div>` : ""}
    ${ehSinal(e, folhaDe(e)) ? `<label class="no-scope" title="desmarcado: o sinal continua no circuito (sai por um terminal, alimenta blocos), mas não vira coluna no /maisim/scope nem m[…] no controle"><input type="checkbox" id="p-noscope" ${foraDoScope(e) ? "" : "checked"}> No scope e no controle</label>` : ""}
    ${MEDIDOR.has(e.tipo) || ehTag(e) ? `<h4>nome no scope</h4><label><span>sinal</span><input data-out="0" value="${e.saidas[0] || ""}" placeholder="${canalScope(e)}"></label>
      <div class="cor-canal" data-canal="${escT(canalScope(e))}"><span>cor do canal</span>${(e.tipo === "AMP" ? ["#0ea5e9", "#eab308", "#06b6d4", "#d946ef", "#22c55e", "#f97316"]
        : ["#eab308", "#06b6d4", "#d946ef", "#22c55e", "#0ea5e9", "#f97316"]).map((c) => `<button class="amostra${corCanal(canalScope(e), e.tipo) === c ? " ativo" : ""}" data-cor="${c}" style="--c:${c}" title="${c}"></button>`).join("")}
        <input type="color" value="${corCanal(canalScope(e), e.tipo)}" title="outra cor"><button class="padrao" title="voltar à cor padrão">Padrão</button></div>
      ${circuitoDoLayout() ? `<div class="no-painel" data-canal="${escT(canalScope(e))}"><label><span>seção no scope</span><select id="p-secao"></select></label>
        <label><span>painel</span><select id="p-painel"></select></label></div>` : ""}
      <div class="aviso">é com este nome que o sinal aparece no /maisim/scope (todo medidor vai para lá; sem nome, ${canalScope(e)})</div>` : ""}
    ${e.dom === "CONTROL" && e.tipo !== "TERM" && !MEDIDOR.has(e.tipo) && !ehTag(e) ? `<h4>rótulos dos terminais</h4>${e.entradas.map((r, i) => `<label><span>entrada ${i + 1}</span><input data-in="${i}" value="${r}"></label>`).join("")}
      ${e.saidas.map((r, i) => `<label><span>saída ${i + 1}</span><input data-out="${i}" value="${r}"></label>`).join("")}` : ""}
    ${caixaHist()}`;
  const v = (id) => P.querySelector(id);
  if (v("#p-nome")) v("#p-nome").onchange = (ev) => pede("RENAME", [qualificado(e), ev.target.value.trim()], `${e.nome} renomeado para ${ev.target.value.trim()}`);
  if (v("#p-pos")) v("#p-pos").onchange = (ev) => { const [x, y] = ev.target.value.split(/[ ,;]+/).map(Number); if (isFinite(x) && isFinite(y)) pede("MOVE", [qualificado(e), x, y], `movido ${e.nome}`); };
  if (v("#p-gira")) v("#p-gira").onclick = () => pede("ROTATE", [qualificado(e)], `girado ${e.nome}`);
  if (v("#p-nao-gira")) v("#p-nao-gira").onclick = () => msg(NAO_GIRA);
  // desativar (Marcelo, 19/10: "um check: preparado no circuito, mas desabilitado, na cor cinza"): o enabled do Gecko
  if (v("#p-desat")) v("#p-desat").onchange = (ev) => pede("SETP", [qualificado(e), "enabled", ev.target.checked ? 0 : 1], `${e.nome} ${ev.target.checked ? "desativado" : "ativado de novo"}`);
  if (v("#p-apaga")) v("#p-apaga").onclick = () => apaga(e);
  if (v("#p-lib")) v("#p-lib").onclick = () => salvaNaBiblioteca(e);
  // o rótulo de fora de cada borne do subcircuito (Marcelo, 19/10: um "+Vcc" ficou preso no borne depois de apagar o fio — era
  // a ligação por rótulo, que a tela não deixava tirar): o Gecko guarda no terminal de dentro (OUTNODE no SM#terminal)
  P.querySelectorAll("[data-borne]").forEach((inp) => inp.onchange = () => {
    const r = inp.value.trim();
    if (r && !/^[A-Za-z0-9_.+\-]+$/.test(r)) { msg(`rótulo inválido: ${r} (letras, números, _ . + -)`, "erro"); inp.value = ""; return; }
    pede("OUTNODE", [`${e.nome}#${inp.dataset.borne}`, 0, r], `${e.nome}: borne ${nomeTerm(inp.dataset.borne)} ${r ? `ligado ao nó ${r}` : "solto (sem rótulo)"}`);
  });
  if (v("#p-noscope")) v("#p-noscope").onchange = async (ev) => {
    const fora = !ev.target.checked;
    try { novoEstado(await api("editor/fora", { uid: e.uid, fora })); if (typeof ligacoesMudaram === "function") ligacoesMudaram();
      msg(fora ? `${e.nome} fora do scope e do controle (o sinal continua no circuito)` : `${e.nome} de volta ao scope e ao controle`, "ok"); }
    catch (er) { msg(er.message, "erro"); ev.target.checked = !ev.target.checked; }
  };
  if (v("#p-bloco")) v("#p-bloco").onchange = async (ev) => {          // os bornes acompanham (posição proporcional ao tamanho)
    const m = ev.target.value.match(/^\s*(\d+)\s*(?:[x×*,;]|\s)\s*(\d+)\s*$/i);
    if (!m) { msg("tamanho do bloco: largura × altura, em quadrados (ex.: 8 × 5)", "erro"); return; }
    await mudaTamanho(e, [["BlockSizeX", +m[1]], ["BlockSizeY", +m[2]]], `bloco ${nomeSub(e.nome)}: ${+m[1]} × ${+m[2]}`);
  };
  if (v("#p-juntos")) v("#p-juntos").onchange = (ev) => { ed.todos = ev.target.checked; mostraProps(); };
  if (v("#p-iguala")) v("#p-iguala").onclick = () => mudaTamanho(e, Object.keys(TAMANHO).map((p) => [p, TAMANHO[p](e)]), `tamanho do ${nomeSub(e.nome)} (${txtTamanho(e)})`, true);
  P.querySelectorAll("[data-g]").forEach((i) => i.onchange = () => pede("SETG", [i.dataset.g, i.value], `${i.dataset.g} = ${i.value}`));
  let ultimoMedido = null;
  const mede = async (corpo, ok, nomeAuto) => {
    msg("aplicando…");
    const fs = alvos(); ok += nosSMs(fs);                       // dentro de um subcircuito: ele só, ou todos os iguais
    try { novoEstado(await api("editor/mede", Object.assign({ nome: e.nome, descr: ok, folhas: fs }, corpo))); msg(ok, "ok"); }
    catch (err) { msg(err.message, "erro"); return; }
    // nome no scope automático (i_R_1, v_a_gnd) enquanto o nome for vazio ou o automático de antes; um nome seu não muda
    const san = (x) => x.replace(/[^A-Za-z0-9_]/g, "_"), antes = san(e.tipo === "AMP" ? `i_${e.mede[0] || ""}` : `v_${e.mede[0] || ""}${e.mede[1] ? "_" + e.mede[1] : ""}`);
    if (nomeAuto && (!e.saidas[0] || e.saidas[0] === antes) && e.saidas[0] !== san(nomeAuto))
      await pede("OUTNODE", [qualificado(e), 0, san(nomeAuto)], `${e.nome} no scope como ${san(nomeAuto)}`);
  };
  if (v("#m-n1")) v("#m-n1").onchange = v("#m-n2").onchange = () => (`${v("#m-n1").value.trim()}|${v("#m-n2").value.trim()}` === ultimoMedido ||
    `${v("#m-n1").value.trim()}|${v("#m-n2").value.trim()}` === `${e.mede[0] || ""}|${e.mede[1] || ""}`) ? null : (ultimoMedido = `${v("#m-n1").value.trim()}|${v("#m-n2").value.trim()}`, mede({ tipo: "V", no1: v("#m-n1").value.trim(), no2: v("#m-n2").value.trim() }, `${e.nome} mede ${v("#m-n1").value} − ${v("#m-n2").value || "0"}`, `v_${v("#m-n1").value.trim()}${v("#m-n2").value.trim() ? "_" + v("#m-n2").value.trim() : ""}`));
  const comps = dados.folhas[folhaAtual].elementos.filter((x) => x.dom === "LK" && x.terminais.length === 2 && x.tipo !== "VOLT" && x.tipo !== "AMP");
  if (v("#m-comp")) {
    comBusca(v("#m-comp"), comps.map((x) => ({ v: x.nome, d: x.nome_tipo || DESCR[x.tipo] || x.tipo })));
    v("#m-comp").onchange = () => { const c = v("#m-comp").value.trim();
      if (!c || c === (e.mede[0] || "") || c === ultimoMedido) return;   // a busca e o navegador disparam "change": uma vez só
      ultimoMedido = c;
      if (!comps.some((x) => x.nome === c)) { msg(`não há componente ${c} nesta folha`, "erro"); return; }
      mede({ tipo: "I", componente: c }, `${e.nome} mede a corrente de ${c}`, `i_${c}`); };
  }
  if (v("#m-chave")) {                                   // GATE: a chave que ele comanda (desta folha)
    const chaves = dados.folhas[folhaAtual].elementos.filter((x) => ["S", "IGBT", "MOSFET", "THYR"].includes(x.tipo));
    comBusca(v("#m-chave"), chaves.map((x) => ({ v: x.nome, d: x.nome_tipo || DESCR[x.tipo] || x.tipo })));
    v("#m-chave").onchange = () => { const c = v("#m-chave").value.trim();
      if (!c || c === (e.mede[0] || "") || c === ultimoMedido) return;
      ultimoMedido = c;
      if (!chaves.some((x) => x.nome === c)) { msg(`não há chave ${c} nesta folha`, "erro"); return; }
      mede({ tipo: "G", componente: c }, `${e.nome} comanda ${c}`); };
  }
  if (v("#p-sinal")) {                                   // rótulos de saída dos blocos de controle desta folha
    const fl = dados.folhas[folhaAtual], sinais = [...new Set(fl.elementos.filter((x) => x.dom === "CONTROL").flatMap((x) => x.saidas).concat(
      fl.fios.filter((w) => w.dom === "CONTROL").map((w) => w.rotulo)).filter(Boolean))].sort();
    comBusca(v("#p-sinal"), sinais.map((r) => ({ v: r, d: "sinal de controle" })));
    let feito = e.mede[0] || "";
    v("#p-sinal").onchange = async () => { const s = v("#p-sinal").value.trim(); if (!s || s === feito) return; feito = s;
      const fs = alvos(), ok = `${e.nome} controlada por ${s}` + nosSMs(fs); msg("aplicando…");
      try { novoEstado(await api("editor/fonte_sinal", { nome: e.nome, sinal: s, folhas: fs, descr: ok })); msg(ok, "ok"); } catch (er) { msg(er.message, "erro"); } };
  }
  if (v("#m-n1")) { const nos = nosDaFolha(); for (const id of ["#m-n1", "#m-n2"]) comBusca(v(id), nos.map((r) => ({ v: r, d: "nó" }))); }
  // o histórico diz qual rótulo mudou (Marcelo, 22/10: só "rótulo mudado" não dizia de quem): o bloco, o campo e de quê para quê
  const rotMudou = (i, velho) => { const campo = ((i.closest("label") || {}).querySelector || (() => null)).call(i.closest("label"), "span"), novo = i.value.trim();
    return `${e.nome}: ${campo ? campo.textContent.trim() : "rótulo"} ${velho ? `“${velho}”` : "(vazio)"} → ${novo ? `“${novo}”` : "(vazio)"}`; };
  P.querySelectorAll("[data-in]").forEach((i) => i.onchange = () => pede("INNODE", [qualificado(e), +i.dataset.in, i.value.trim()], rotMudou(i, e.entradas[+i.dataset.in] || "")));
  P.querySelectorAll("[data-out]").forEach((i) => i.onchange = () => pede("OUTNODE", [qualificado(e), +i.dataset.out, i.value.trim()], rotMudou(i, e.saidas[+i.dataset.out] || "")));
  P.querySelectorAll("[data-ponta]").forEach((inp) => {   // onde fica a ponta (+) ou a garra (−): o campo com busca (5 sugestões; digitar filtra)
    const k = inp.dataset.ponta === "-" ? 1 : 0, no_ = e.mede[k], fl = dados.folhas[folhaAtual];
    const comps = (((dados.nos_medidos || {})[folhaAtual] || {})[no_] || []).map((c) => {
      const el = fl.elementos.find((x) => x.nome === c.nome); return { v: c.nome, d: el ? (el.nome_tipo || DESCR[el.tipo] || el.tipo) : "" }; });
    comBusca(inp, [{ v: "automático", d: "o primeiro ponto do nó" }, ...comps], { limite: 5, tudoAoFocar: true });
    const atual = ((dados.pontas || {})[canalScope(e)] || {})[inp.dataset.ponta] || "";
    inp.onchange = async () => {
      const v = inp.value.trim(), comp = v === "automático" || v === "" ? "" : v;
      if ((comp || "") === atual) return;
      if (comp && !comps.some((c) => c.v === comp)) { msg(`${comp} não está no nó ${no_}`, "erro"); inp.value = atual || "automático"; return; }
      try { const j = await api("editor/ponta", { canal: canalScope(e), sinal: inp.dataset.ponta, componente: comp }); novoEstado(j);
        msg(comp ? `${k ? "garra" : "ponta"} de ${canalScope(e)} em ${comp}` : `${canalScope(e)}: ${k ? "garra" : "ponta"} automática`, "ok"); }
      catch (er) { msg(er.message, "erro"); } };
  });
  const cc = P.querySelector(".cor-canal");
  if (cc) {                                              // a cor do canal: guardada ao lado do circuito (<nome>.cores.json) e no meta da rodada
    const muda = async (cor) => { try { const j = await api("editor/cor", { canal: cc.dataset.canal, cor }); novoEstado(j);
      msg(cor ? `cor de ${cc.dataset.canal}: ${cor}` : `${cc.dataset.canal} volta à cor padrão`, "ok"); } catch (er) { msg(er.message, "erro"); } };
    cc.querySelectorAll("[data-cor]").forEach((b) => { b.onclick = () => muda(b.dataset.cor); });
    cc.querySelector("input[type=color]").onchange = (ev) => muda(ev.target.value);
    cc.querySelector(".padrao").onclick = () => muda("");
  }
  const np = P.querySelector(".no-painel");
  if (np) ligaNoPainel(np);
  if (ehTag(e)) { v("#p-params").innerHTML = "<i>repassa o sinal (ganho 1 do Gecko)</i>"; return; }
  try {
    const lst = await api(`editor/params?nome=${encodeURIComponent(qualificado(e))}&dom=${encodeURIComponent(e.dom)}&typ=${e.typ}`);   // dom/typ: o identificador no arquivo (para o $)
    if (ed.sel !== e.nome) return;
    const FONTE = [[401, "CC (constante)"], [402, "senoidal"], [400, "controlada por sinal"]];
    const ligada = (q) => (q.id && e.par[q.id + "_var"]) || "";          // a variável $ que dá o valor (como no Gecko)
    v("#p-params").innerHTML = lst.map((q) => `<label title="${q.descricao}${q.pode_var ? " · escreva $nome para usar uma variável global" : ""}"><span>${q.nome}${q.unidade ? ` [${q.unidade}]` : ""}</span>
      ${q.erro ? `<i>${q.erro}</i>` : (q.nome === "type" && (e.tipo === "U" || e.tipo === "I"))
        ? `<select data-p="type">${FONTE.map(([c, r]) => `<option value="${c}" ${c === q.valor || (q.valor === 0 && c === 401) || (q.valor === 1 && c === 402) ? "selected" : ""}>${r}</option>`).join("")}</select>`
        : ligada(q) ? `<span class="com-var"><input data-p="${q.nome}" value="${escT(ligada(q))}" class="var"><small title="o valor de ${escT(ligada(q))} (⚙ › variáveis globais); escreva um número para desligar">= ${si(q.valor, q.unidade)}</small></span>`
        : `<input data-p="${q.nome}" value="${q.valor}">`}</label>`).join("") || "<i>sem parâmetros numéricos</i>";
    P.querySelectorAll("[data-p]").forEach((i) => i.onchange = async () => {
      const q = lst.find((x) => x.nome === i.dataset.p), txt = i.value.trim(), fs = alvos(), onde = nosSMs(fs);
      if (txt.startsWith("$") && q && q.pode_var) {                    // $nome: liga à variável (a que não existe é criada com o valor de agora)
        if (!NOME_VAR.test(txt)) { msg("nome da variável: $ seguido de letras, números ou _ (ex.: $Vp, $f_rede)", "erro"); i.value = ligada(q) || q.valor; return; }
        const nova = !(txt in (dados.globais || {}));
        await mudaGlobal({ acao: "liga", componente: e.nome, parametro: q.nome, nome: txt, valor: q.valor, folhas: fs },
          `${e.nome}: ${q.nome} ← ${txt}` + (nova ? ` (variável nova, ${si(q.valor, q.unidade)})` : ` = ${si(dados.globais[txt], q.unidade)}`) + onde);
        mostraProps(); return;
      }
      if (txt.startsWith("$")) { msg(`${q ? q.nome : i.dataset.p}: este parâmetro não pode vir de uma variável`, "erro"); i.value = q ? q.valor : ""; return; }
      if (q && ligada(q)) {                                              // número no lugar da variável: desliga e fica com o número
        if (txt === "" || !isFinite(Number(txt))) { msg(`${q.nome}: um número, ou $nome para uma variável global`, "erro"); i.value = ligada(q); return; }
        await mudaGlobal({ acao: "desliga", componente: e.nome, parametro: q.nome, valor: Number(txt), folhas: fs }, `${e.nome}: ${q.nome} = ${txt} (sem ${ligada(q)})` + onde);
        mostraProps(); return;
      }
      if (e.tipo === "SUBCIRCUIT" && TAMANHO[i.dataset.p]) {            // o tamanho: nos iguais também, com "mudar os N juntos"
        if (!/^\d+$/.test(txt)) { msg(`${i.dataset.p}: um número inteiro de quadrados`, "erro"); i.value = q ? q.valor : ""; return; }
        await mudaTamanho(e, [[i.dataset.p, +txt]], `${e.nome}: ${i.dataset.p} = ${+txt}`); return;
      }
      pede("SETP", [qualificado(e), i.dataset.p, i.value], `${e.nome}: ${i.dataset.p} = ${i.value}`);
    });
  } catch (err) { v("#p-params").innerHTML = `<i>${err.message}</i>`; }
}
$("bt-editar").onclick = async () => {
  await liga(!ed.ligado);
  try { localStorage.setItem("maisim-simu-travado", ed.ligado ? "0" : "1"); } catch (e) { /* vale até recarregar */ }
};
(async () => { try { const j = await api("editor/rodada"); sim.ultimo = j.arquivo || j.ultimo || null;
  if (j.estado === "rodando" || j.estado === "pausada") acompanha(j); } catch (e) { /* sem rodada */ } })();
async function novoCircuito() {
  const usados = new Set([...document.querySelectorAll("#sel-modelo option")].map((o) => o.textContent.replace(/\.ipes$/, "").split("/").pop()));
  let k = 1; while (usados.has(`circuito_${k}`)) k++;
  const r = await modal({ titulo: "Novo circuito", texto: "Uma folha em branco. O nome vale para salvar depois (salvar como: o disquete com lápis).", ok: "Criar",
    campos: [{ nome: "nome", rotulo: "Nome do circuito", valor: `circuito_${k}`, dica: "letras, números, _ e -" }] });
  const nome = r && r.nome.trim(); if (!nome) return;
  if (!/^[A-Za-z0-9_\-]{1,60}$/.test(nome)) { msg("nome do circuito: letras, números, _ e -, até 60", "erro"); return; }
  try { let j;
    try { j = await api("editor/novo", {}); }
    catch (e) {                                          // mudanças não salvas: salvar e criar, salvar como… e criar, ou descartar e criar
      const modo = await perguntaNaoSalvo(e, "criar"); if (!modo) { msg("circuito novo cancelado", ""); return; }
      j = await api("editor/novo", modo === "salvou" ? {} : { modo }); }
    ed.novo = nome; ed.abertoSel = NOVO; dados = Object.assign(j, { arq: nome });
    folhaAtual = "0"; seleciona(null); novoEstado(j); ver = { x: 0, y: 0, w: 70 * G, h: 44 * G }; aplicaVer();
    if (typeof recarregaControle === "function") recarregaControle();
    preencheModelos(null, NOVO);
    const q = new URLSearchParams(location.search); q.delete("modelo"); history.replaceState(null, "", q.toString() ? "?" + q : location.pathname);
    msg(`${nome}: folha em branco, escolha componentes na paleta`, "ok");
  } catch (e) { msg(e.message, "erro"); }
};
// tela dividida: o /maisim/scope ao lado (dividida na vertical) ou embaixo. Abre na última rodada (ao vivo enquanto simula), com
// ?so=rodada: só a seção e os sinais da rodada, sem os painéis do MMC
const tela = { lado: "lado", w: null, h: null };
try { Object.assign(tela, JSON.parse(localStorage.getItem("maisim-simu-tela") || "{}")); } catch (e) { /* ok */ }
const urlScope = (arq, so = true) => `/maisim/scope/?${so ? "so=rodada" : ""}${arq ? `${so ? "&" : ""}a=${encodeURIComponent(arq)}` : ""}`.replace(/\?$/, "");
function guardaTela() { try { localStorage.setItem("maisim-simu-tela", JSON.stringify(tela)); } catch (e) { /* ok */ } }
function posicionaScope(lado) {
  tela.lado = lado; guardaTela();
  const b = document.body.classList; b.toggle("scope-lado", lado === "lado"); b.toggle("scope-baixo", lado === "baixo");
  $("bt-lado").classList.toggle("ativo", lado === "lado"); $("bt-baixo").classList.toggle("ativo", lado === "baixo");
  $("divisoria").title = lado === "lado" ? "arraste para mudar a largura" : "arraste para mudar a altura";
  setTimeout(() => dados && ajusta(), 60);
}
// a doca (tela dividida) tem duas abas: o scope e o painel Controle (controle.js)
let abaDoca = "scope";
function marcaDoca() {
  const aberta = document.body.classList.contains("com-scope");
  $("bt-scope").classList.toggle("ativo", aberta && abaDoca === "scope"); $("bt-ctl").classList.toggle("ativo", aberta && abaDoca === "controle");
  document.querySelectorAll("#abas-doca button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === abaDoca));
  $("if-scope").classList.toggle("oculto", abaDoca !== "scope"); $("painel-controle").classList.toggle("oculto", abaDoca !== "controle");
  document.body.classList.toggle("doca-controle", abaDoca === "controle");   // com o código na outra janela, a coluna vira faixa (CSS)
  document.body.classList.toggle("doca-scope", abaDoca === "scope");         // e com o scope na janela dele, a aba scope também
}
function mostraDoca(aba) {
  if (VISTA_CODIGO) aba = "controle";
  abaDoca = aba; document.body.classList.add("com-scope");
  if (aba === "scope" && !$("if-scope").getAttribute("src")) $("if-scope").src = urlScope(sim.ultimo);
  if (aba === "controle" && typeof abreControle === "function") abreControle();
  marcaDoca(); setTimeout(() => dados && ajusta(), 60);
}
function mostraScope(on, url) {
  if (VISTA_CODIGO) { abaDoca = "controle"; document.body.classList.add("com-scope"); marcaDoca(); return; }   // aqui, só o controle
  document.body.classList.toggle("com-scope", on);
  const f = $("if-scope");
  if (on) { abaDoca = "scope"; if (url) f.src = url; else if (!f.getAttribute("src")) f.src = urlScope(sim.ultimo); }
  marcaDoca(); setTimeout(() => dados && ajusta(), 60);
}
const alternaDoca = (aba) => document.body.classList.contains("com-scope") && abaDoca === aba ? mostraScope(false) : mostraDoca(aba);
$("bt-scope").onclick = () => alternaDoca("scope");
$("bt-ctl").onclick = () => alternaDoca("controle");
document.querySelectorAll("#abas-doca button").forEach((b) => b.onclick = () => mostraDoca(b.dataset.aba));
for (const lado of ["lado", "baixo"]) $(`bt-${lado}`).onclick = () => { posicionaScope(lado); mostraDoca(abaDoca); };
(() => {
  if (tela.w) document.body.style.setProperty("--w-escolhida", `${tela.w}px`);
  if (tela.h) document.body.style.setProperty("--h-escolhida", `${tela.h}px`);
  posicionaScope(tela.lado === "baixo" ? "baixo" : "lado");
  let ini = null;
  $("divisoria").addEventListener("mousedown", (ev) => { const r = $("painel-scope").getBoundingClientRect();
    ini = { x: ev.clientX, y: ev.clientY, w: r.width, h: r.height }; document.body.classList.add("redimensionando"); ev.preventDefault(); });
  addEventListener("mousemove", (ev) => {
    if (!ini) return;
    if (tela.lado === "lado") { tela.w = Math.round(Math.max(320, Math.min(innerWidth - 360, ini.w + ini.x - ev.clientX))); document.body.style.setProperty("--w-escolhida", `${tela.w}px`); }
    else { tela.h = Math.round(Math.max(120, Math.min(innerHeight - 160, ini.h + ini.y - ev.clientY))); document.body.style.setProperty("--h-escolhida", `${tela.h}px`); }
  });
  addEventListener("mouseup", () => { if (!ini) return; ini = null; document.body.classList.remove("redimensionando"); guardaTela(); dados && ajusta(); });
})();

$("busca").oninput = () => ed.catalogo && desenhaPaleta();
async function salvaNaBiblioteca(e) {
  const r = await modal({ titulo: "Salvar na biblioteca", texto: `O subcircuito <b>${nomeSub(e.nome)}</b> e tudo o que tem dentro vão para
    <b>simu/gecko/subcircuitos/</b>, com as variáveis $. Depois ele aparece na aba “Biblioteca” da paleta, para clicar ou arrastar em qualquer circuito.`,
    campos: [{ nome: "nome", rotulo: "Nome na biblioteca", valor: "", dica: "letras, números, _ e -" }], ok: "Salvar" });
  const nome = r && r.nome.trim(); if (!nome) return;
  const corpo = { acao: "salvar", nome: e.nome, folha: folhaAtual, nome_lib: nome };
  msg("salvando na biblioteca…");
  try { let j;
    try { j = await api("editor/biblioteca", corpo); }
    catch (er) { if (!/confirme/.test(er.message) || !(await confirma("Sobrescrever?", er.message.replace(/; confirme.*$/, "."), "sobrescrever", true))) throw er;
      j = await api("editor/biblioteca", Object.assign(corpo, { sobrescrever: true })); }
    const s = ed.sujo; novoEstado(j); marcaSujo(s); msg(`${nomeSub(e.nome)} salvo na biblioteca: ${j.salvo}`, "ok");
    await carregaBiblioteca(); recarregaModelos($("sel-modelo").value);
  } catch (er) { msg(er.message, "erro"); }
}
// Salvar (Ctrl+S, disquete): por cima do arquivo aberto, se ele é seu (os seus circuitos ou a biblioteca); senão, Salvar como
function marcaSujo(s) { ed.sujo = !!s; $("bt-salvar").classList.toggle("sujo", ed.sujo); $("bt-salvar").title = ed.sujo ? "salvar (Ctrl+S) · há mudanças não salvas" : "salvar (Ctrl+S)"; }
async function salvar() {
  if (dados && dados.fechado) { msg("nenhum circuito aberto: não há o que salvar", "erro"); return; }
  if (!(await garanteEdicao())) return;
  // o servidor diz se o arquivo aberto é seu; se ele não souber (reiniciado), vale o da lista que a página mostra
  const it = listaModelos.find((o) => o.arq === $("sel-modelo").value && o.pasta);
  const d = (dados && dados.dono) || (it && { pasta: it.pasta, nome: it.nome.replace(/\.ipes$/, "") }), m = d && [null, d.pasta, d.nome];
  if (ed.novo || !m) return salvarComo();
  msg("salvando…");
  try { const j = await api("editor/salvar", { nome: m[2], pasta: m[1], sobrescrever: true }); novoEstado(j); marcaSujo(false); msg(`salvo: ${j.salvo}`, "ok");
    if (m[1] === "subcircuitos") carregaBiblioteca(); }
  catch (e) { msg(e.message, "erro"); }
}
async function salvarComo() {
  if (dados && dados.fechado) { msg("nenhum circuito aberto: não há o que salvar", "erro"); return false; }
  const r = await modal({ titulo: "Salvar como", texto: "O circuito é gravado nos seus circuitos (a pasta de dados do MaiSim) e aparece na lista.",
    campos: [{ nome: "nome", rotulo: "Nome do arquivo", valor: ed.novo || ((dados.arq || "circuito").split("/").pop().replace(/\.ipes$/, "").replace(/^\(.*\)$/, "circuito") + "_copia") }], ok: "Salvar" });
  const nome = r && r.nome.trim(); if (!nome) return false;
  const layoutAntes = circuitoDoLayout();
  try { let j;
    try { j = await api("editor/salvar", { nome }); }
    catch (e) { if (!/confirme/.test(e.message) || !(await confirma("Sobrescrever?", e.message.replace(/; confirme.*$/, "."), "sobrescrever", true))) throw e;
      j = await api("editor/salvar", { nome, sobrescrever: true }); }
    novoEstado(j); marcaSujo(false); msg(`salvo em ${j.salvo}`, "ok"); levaLayout(layoutAntes, circuitoDoLayout());
    const lst = await api("modelos");                   // leitura: repete uma vez se a conexão cair
    ed.novo = null; ed.abertoSel = j.salvo; preencheModelos(lst, j.salvo);
    const q = new URLSearchParams(location.search); q.set("modelo", j.salvo); history.replaceState(null, "", "?" + q.toString());
    if (typeof cc !== "undefined" && cc.aberto) atualizaChat();   // a conversa com o Claude segue o circuito (nome novo)
    return true;
  } catch (e) { msg(e.message, "erro"); return false; }
};

// ---------------------------------------------------------------- campo com busca: até 10 sugestões, filtradas enquanto digita
// (nome igual > começa com > contém > as letras na ordem); setas e Enter escolhem, Esc fecha; escolher dispara "change"
function pontua(q, s) {
  const a = s.toLowerCase(); q = q.toLowerCase();
  if (!q) return 1;
  if (a === q) return 1000;
  if (a.startsWith(q)) return 500 - a.length;
  const i = a.indexOf(q); if (i >= 0) return 300 - i - a.length / 100;
  let k = 0; for (const ch of a) if (ch === q[k]) k++;
  return k === q.length ? 100 - a.length : -1;
}
// limite: quantas sugestões mostrar; tudoAoFocar: ao entrar no campo mostra todas (as primeiras), e digitar filtra
function comBusca(inp, opcoes, { limite = 10, tudoAoFocar = false } = {}) {
  const caixa = document.createElement("div"); caixa.className = "sugestoes"; inp.parentElement.style.position = "relative"; inp.after(caixa);
  let lista = [], i = -1, recemFocado = false;
  const fecha = () => { caixa.style.display = "none"; i = -1; };
  const mostra = () => {
    const q = tudoAoFocar && recemFocado ? "" : inp.value.trim();
    lista = opcoes.map((o) => [pontua(q, o.v), o]).filter(([p]) => p >= 0).sort((a, b) => b[0] - a[0]).slice(0, limite).map(([, o]) => o);
    const total = opcoes.filter((o) => pontua(q, o.v) >= 0).length;
    caixa.innerHTML = lista.map((o, k) => `<div class="sug${k === i ? " atual" : ""}" data-k="${k}"><b>${escT(o.v)}</b><small>${escT(o.d || "")}</small></div>`).join("") +
      (total > lista.length ? `<div class="mais">+${total - lista.length}: digite mais para filtrar</div>` : "") + (lista.length ? "" : `<div class="mais">nada com “${escT(q)}”</div>`);
    caixa.style.display = "";
  };
  const escolhe = (o) => { inp.value = o.v; fecha(); inp.dispatchEvent(new Event("change")); };
  inp.addEventListener("focus", () => { inp.select(); recemFocado = true; mostra(); });
  inp.addEventListener("input", () => { i = -1; recemFocado = false; mostra(); });
  inp.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); if (caixa.style.display === "none") mostra();
      i = Math.max(0, Math.min(lista.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1))); mostra(); }
    else if (ev.key === "Enter" && i >= 0 && lista[i]) { ev.preventDefault(); escolhe(lista[i]); }
    else if (ev.key === "Escape") { ev.stopPropagation(); fecha(); }
  });
  caixa.addEventListener("mousedown", (ev) => { const d = ev.target.closest(".sug"); if (d) { ev.preventDefault(); escolhe(lista[+d.dataset.k]); } });
  inp.addEventListener("blur", () => setTimeout(fecha, 120));
  fecha();
}
function nosDaFolha() {                              // rótulos de nó da folha aberta (conexões e terminais), para o voltímetro
  const f = dados.folhas[folhaAtual], s = new Set(f.fios.map((w) => w.rotulo).filter(Boolean));
  for (const e of f.elementos) if (e.dom === "LK") for (const r of [...e.entradas, ...e.saidas]) if (r) s.add(r);
  return [...s].sort((a, b) => a.localeCompare(b, "pt", { numeric: true }));
}

// ---------------------------------------------------------------- fios: W liga e desliga o modo fio (como no Gecko)
// Clique num terminal (ou num ponto da grade) começa; cada clique põe um canto, e o trecho até o mouse vai em L; clicar
// num terminal ou noutro fio termina (duplo clique e Enter também); Backspace tira o último canto; Esc desfaz o fio.
// Quem liga é o Gecko: o servidor escreve o fio no arquivo e ele reabre (ver servidor.py, fio_novo).
// LK = Leistungskreis (o circuito de potência, no Gecko)
const NOME_DOM = { LK: "de potência", CONTROL: "de controle", THERM: "térmica" }, LADO_DOM = { LK: "no lado de potência", CONTROL: "no lado de controle", THERM: "no lado térmico" };
const chaveFio = (w) => JSON.stringify(w.pts);
const fioSelecionado = () => (dados && ed.fioSel && dados.folhas[folhaAtual].fios.find((w) => chaveFio(w) === ed.fioSel)) || null;
function selecionaFio(w) { ed.sel = null; ed.fioSel = w ? chaveFio(w) : null; ed.multi.clear(); ed.multiFios.clear(); desenha(); mostraProps(); }
let cacheLig = { f: null, m: null };
function pontosDeLigacao() {                       // "x,y" → domínio: terminais e pontos de fio da folha
  const f = dados.folhas[folhaAtual];
  if (cacheLig.f === f) return cacheLig.m;
  const m = new Map();
  for (const w of f.fios) for (const p of w.pts) m.set(p.join(","), w.dom);
  for (const e of f.elementos) for (const t of e.terminais || []) m.set(`${t.x},${t.y}`, t.dom || (e.dom === "CONTROL" || e.dom === "THERM" ? e.dom : "LK"));
  cacheLig = { f, m }; return m;
}
// os pontos de uma conexão, um por passo da grade (como o servidor grava: expande)
function expandeCantos(c) {
  const pts = [c[0]];
  for (let i = 1; i < c.length; i++) { const [x0, y0] = c[i - 1], [x1, y1] = c[i], sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    for (let k = 1; k <= Math.abs(x1 - x0) + Math.abs(y1 - y0); k++) pts.push([x0 + sx * k, y0 + sy * k]); }
  return pts;
}
// terminal do SM solto num ponto de ligação (o gesto natural de "ligar ao nó"): o terminal fica onde está (na borda: o
// lado do borne no bloco não muda) e o MaiSim desenha a conexão dele até o ponto, em L — horizontal primeiro ou vertical
// primeiro, o que não passar por um terminal ou ponta de conexão (no Gecko, ponta em cima de conexão liga: seria uma
// ligação que ninguém pediu). Os dois passam: não liga e diz onde
async function ligaTerminal(e, alvo, domAlvo) {
  const domT = e.dom === "CONTROL" ? "CONTROL" : "LK";
  desenha();                                             // o terminal volta ao lugar dele (a prévia do arrasto sai)
  if (domAlvo !== domT) { msg(`${e.nome} é ${NOME_DOM[domT]} e o ponto (${alvo}) é ${NOME_DOM[domAlvo]}: não liga`, "erro"); return; }
  const P = [e.x, e.y], f = dados.folhas[folhaAtual];
  const pontas = new Set(f.fios.flatMap((w) => [w.pts[0], w.pts[w.pts.length - 1]].map((q) => q.join(","))));
  for (const x of f.elementos) for (const q of x.terminais || []) pontas.add(`${q.x},${q.y}`);
  const reto = P[0] === alvo[0] || P[1] === alvo[1];
  const caminhos = reto ? [[P, alvo]] : [[P, [alvo[0], P[1]], alvo], [P, [P[0], alvo[1]], alvo]];
  const bloqueio = (c) => expandeCantos(c).slice(1, -1).find((q) => pontas.has(q.join(",")));
  const cantos = caminhos.find((c) => !bloqueio(c));
  if (!cantos) { msg(`não liguei ${e.nome} até (${alvo}): os caminhos passariam por (${caminhos.map(bloqueio).join(") e (")}), que ligariam junto. Ligue pela conexão (W), com os cantos`, "erro"); return; }
  const fs = alvos(), descr = `${e.nome} ligado a (${alvo})` + nosSMs(fs);
  msg("ligando…");
  try { novoEstado(await api("editor/fio", { cantos, dom: domT, folhas: fs, descr })); msg(`${descr} por uma conexão (o terminal fica na borda, como no Gecko)`, "ok"); }
  catch (er) { msg(er.message, "erro"); }
}
function modoFio(on) {
  if (on && simulando()) { avisaTrava(); return; }
  if (on) { escolhe(null); ed.sel = null; ed.fioSel = null; mostraProps(); }
  Object.assign(ed.fio, { modo: on, cantos: [], dom: null });
  document.body.classList.toggle("modo-fio", on); $("bt-fio").classList.toggle("ativo", on);
  msg(on ? "modo conexão: clique num terminal para começar · W sai" : "");
  desenha();
}
function emL(a, b, ant) {                          // a → b: o canto do L (horizontal primeiro, ou vertical se o trecho anterior era horizontal)
  if (a[0] === b[0] || a[1] === b[1]) return [b];
  return [ant && ant[1] === a[1] && ant[0] !== a[0] ? [a[0], b[1]] : [b[0], a[1]], b];
}
async function cliqueFio(ev) {
  const F = ed.fio, p = grade(ev), d = pontosDeLigacao().get(p.join(","));
  if (!F.cantos.length) {
    F.cantos = [p]; F.dom = d || null; previaFio();
    msg("conexão: clique para pôr cantos; num terminal ou noutra conexão, termina · Enter termina · Backspace desfaz · Esc desiste"); return;
  }
  const a = F.cantos[F.cantos.length - 1];
  if (a[0] !== p[0] || a[1] !== p[1]) F.cantos.push(...emL(a, p, F.cantos[F.cantos.length - 2]));
  const inicio = F.cantos[0];
  if ((d && (p[0] !== inicio[0] || p[1] !== inicio[1])) || ev.detail >= 2) await terminaFio(); else previaFio();
}
async function terminaFio() {
  const F = ed.fio, c = F.cantos;
  if (c.length < 2) { F.cantos = []; F.dom = null; previaFio(); return; }
  const fim = pontosDeLigacao().get(c[c.length - 1].join(","));
  if (F.dom && fim && F.dom !== fim) { msg(`uma conexão ${NOME_DOM[F.dom]} não termina ${LADO_DOM[fim]}: Backspace desfaz o último canto`, "erro"); return; }
  const dom = F.dom || fim || "LK";
  F.cantos = []; F.dom = null; previaFio();
  msg("ligando…");
  if (c.some(foraDaFolha)) return;
  const fs = alvos(), descr = `conexão ${NOME_DOM[dom]}: (${c[0]}) → (${c[c.length - 1]})` + nosSMs(fs);
  try { novoEstado(await api("editor/fio", { cantos: c, dom, folhas: fs, descr })); msg(descr, "ok"); }
  catch (e) { msg(e.message, "erro"); }
}
async function mudaFio(w, corpo, ok) {
  msg("aplicando…"); const fs = alvos(); ok += nosSMs(fs);
  try { novoEstado(await api("editor/fio", Object.assign({ cantos: w.pts, folhas: fs, descr: ok }, corpo))); msg(ok, "ok"); }
  catch (e) { msg(e.message, "erro"); }
}
async function apagaFio(w) {
  const a = w.pts[0], b = w.pts[w.pts.length - 1];
  if (await confirma("Apagar conexão", `Apagar a conexão de (${a}) a (${b})${w.rotulo ? ` (nó <b>${w.rotulo}</b>)` : ""}?`, "Apagar", true)) {
    ed.fioSel = null; await mudaFio(w, { acao: "apagar" }, `conexão apagada: (${a}) → (${b})`); }
}
function previaFio() {                             // o fio sendo desenhado e o ponto da grade sob o mouse (verde onde liga)
  const velho = document.getElementById("previa-fio"); if (velho) velho.remove();
  if (!ed.fio.modo || !dados) return;
  const F = ed.fio, m = F.mouse, g = no("g", { id: "previa-fio", "pointer-events": "none" }, $("svg"));
  const cor = F.dom === "CONTROL" ? COR.fioCT : COR.fioLK;
  if (F.cantos.length) {
    const pts = F.cantos.slice(), a = pts[pts.length - 1];
    if (m && (a[0] !== m[0] || a[1] !== m[1])) pts.push(...emL(a, m, pts[pts.length - 2]));
    no("polyline", { points: pts.map(P).join(" "), fill: "none", stroke: cor, "stroke-width": 2.2, "stroke-dasharray": "6 4", "stroke-linejoin": "round" }, g);
    no("circle", { cx: F.cantos[0][0] * G, cy: F.cantos[0][1] * G, r: 0.22 * G, fill: cor }, g);
  }
  if (m) {
    const liga = pontosDeLigacao().has(m.join(","));
    no("circle", { cx: m[0] * G, cy: m[1] * G, r: (liga ? 0.4 : 0.2) * G, fill: liga ? "rgba(27,127,42,.22)" : "none", stroke: liga ? COR.liga : COR.fraco, "stroke-width": 1.2 }, g);
  }
}
$("bt-fio").onclick = () => ed.ligado && modoFio(!ed.fio.modo);

// ---------------------------------------------------------------- modal (no lugar dos avisos do navegador)
function modal({ titulo, texto = "", campos = [], html = "", ok = "OK", cancelar = "Cancelar", perigo = false, largo = false, extra = [], foco = null, monta = null }) {
  return new Promise((res) => {
    const fundo = document.createElement("div"); fundo.className = "modal-fundo";
    fundo.innerHTML = `<div class="modal${largo ? " largo" : ""}" role="dialog" aria-modal="true"><h3>${titulo}</h3>${texto ? `<p>${texto}</p>` : ""}${html}
      ${campos.map((c) => `<label><span>${c.rotulo}</span><input name="${c.nome}" value="${c.valor ?? ""}" ${c.dica ? `title="${c.dica}"` : ""}></label>`).join("")}
      <div class="modal-botoes">${cancelar ? `<button class="m-cancela">${cancelar}</button>` : ""}${extra.map((b, i) => `<button class="m-extra ${b.classe || ""}" data-i="${i}">${b.rotulo}</button>`).join("")}<button class="m-ok ${perigo ? "perigo" : "primario"}">${ok}</button></div></div>`;
    document.body.appendChild(fundo);
    const valores = () => Object.fromEntries([...fundo.querySelectorAll("input[name]")].map((i) => [i.name, i.value]));
    const fecha = (v) => { fundo.remove(); removeEventListener("keydown", tecla, true); res(v); };
    // Enter: num botão, aciona ESSE botão (num modal de conflito, Enter em "manter" não pode descartar); num campo, confirma
    const tecla = (e) => { const ca = document.activeElement;
      if (e.key === "Enter" && ca && ca.dataset && ca.dataset.enter === "proprio" && fundo.contains(ca)) return;   // o campo trata o Enter
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); fecha(null); }
      else if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); const a = document.activeElement;
        if (a && a.tagName === "BUTTON" && fundo.contains(a)) a.click(); else fecha(valores()); } else e.stopPropagation(); };
    addEventListener("keydown", tecla, true);
    fundo.querySelector(".m-ok").onclick = () => fecha(valores());
    fundo.querySelectorAll(".m-extra").forEach((b) => { b.onclick = () => fecha({ _botao: extra[+b.dataset.i].valor }); });   // botões a mais: {_botao: valor}
    const c = fundo.querySelector(".m-cancela"); if (c) c.onclick = () => fecha(null);
    fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) fecha(null); });
    if (monta) monta(fundo, fecha);                    // quem chamou liga o que for dele (abas, botões que não fecham)
    setTimeout(() => ((foco && fundo.querySelector(foco)) || fundo.querySelector("input") || fundo.querySelector(".m-ok")).focus(), 0);
  });
}
const confirma = async (titulo, texto, ok = "OK", perigo = false) => !!(await modal({ titulo, texto, ok, perigo }));
// ---------------------------------------------------------------- seleção de vários (Shift): retângulo, clique, mover, apagar,
// copiar. As operações vão ao servidor de uma vez (um passo só no desfazer); as conexões de dentro do grupo andam junto
const tamanhoSel = () => ed.multi.size + ed.multiFios.size;
function selecaoGrupo() {
  const f = dados.folhas[folhaAtual];
  return { nomes: f.elementos.filter((e) => ed.multi.has(e.nome)).map((e) => e.nome), fios: f.fios.filter((w) => ed.multiFios.has(chaveFio(w))).map((w) => w.pts) };
}
function retanguloSel(a, b) {                          // o retângulo enquanto se arrasta (na grade)
  let r = $("ret-sel"); if (!r) r = no("rect", { id: "ret-sel", fill: "rgba(232,163,61,.08)", stroke: "#e8a33d", "stroke-dasharray": "5 3", "stroke-width": 1.2, "pointer-events": "none" }, $("svg"));
  const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
  r.setAttribute("x", (x0 - 0.5) * G); r.setAttribute("y", (y0 - 0.5) * G);
  r.setAttribute("width", (Math.abs(b[0] - a[0]) + 1) * G); r.setAttribute("height", (Math.abs(b[1] - a[1]) + 1) * G);
}
function selecionaRetangulo(a, b) {                    // dentro: o componente pela posição dele; a conexão com todos os pontos dentro
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]), f = dados.folhas[folhaAtual];
  const dentro = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (ed.sel) { ed.multi.add(ed.sel); ed.sel = null; } if (ed.fioSel) { ed.multiFios.add(ed.fioSel); ed.fioSel = null; }
  for (const e of f.elementos) if (e.tipo !== "SCOPE" && dentro(e.x, e.y)) ed.multi.add(e.nome);
  for (const w of f.fios) if (w.pts.every(([x, y]) => dentro(x, y))) ed.multiFios.add(chaveFio(w));
  desenha(); mostraProps();
}
function alternaSel(e, w) {                            // Shift + clique: põe ou tira (o selecionado sozinho entra na seleção)
  if (ed.sel) { ed.multi.add(ed.sel); ed.sel = null; } if (ed.fioSel) { ed.multiFios.add(ed.fioSel); ed.fioSel = null; }
  if (e) { if (ed.multi.has(e.nome)) ed.multi.delete(e.nome); else ed.multi.add(e.nome); }
  if (w) { const k = chaveFio(w); if (ed.multiFios.has(k)) ed.multiFios.delete(k); else ed.multiFios.add(k); }
  desenha(); mostraProps();
}
// o Gecko não aceita x nem y menor que 1 (põe em 1, sem avisar); na folha principal, soltar além da beira de cima ou da
// esquerda faz o servidor andar o circuito todo o que faltar (j.deslocado): a vista anda junto e nada pula na tela
function abriuEspaco(j) {
  if (!j || !j.deslocado) return "";
  const [sx, sy] = j.deslocado; ver.x += sx * G; ver.y += sy * G; aplicaVer();
  return ` · a folha do Gecko começa em (1, 1): o circuito andou ${[sx && `${sx} para a direita`, sy && `${sy} para baixo`].filter(Boolean).join(" e ")} para caber`;
}
async function moveGrupo(dg) {
  const sel = selecaoGrupo(), f = dados.folhas[folhaAtual];
  const terms = sel.nomes.filter((n) => (f.elementos.find((e) => e.nome === n) || {}).tipo === "TERM");   // terminal do SM: fica na borda
  sel.nomes = sel.nomes.filter((n) => !terms.includes(n));
  const pos = f.elementos.filter((e) => sel.nomes.includes(e.nome)).map((e) => [e.x + dg[0], e.y + dg[1]]).concat(sel.fios.flat().map(([x, y]) => [x + dg[0], y + dg[1]]));
  if (pos.some(foraDaFolha)) { desenha(); return; }
  const descr = `grupo movido (${sel.nomes.length} componente(s), ${sel.fios.length} conexão(ões)) em (${dg})` + nosSMs([folhaAtual]);
  msg("movendo…");
  try {
    const j = await api("editor/grupo", { acao: "mover", nomes: sel.nomes, fios: sel.fios, dx: dg[0], dy: dg[1], folha: folhaAtual, descr });
    const [sx, sy] = j.deslocado || [0, 0];
    ed.multiFios = new Set(sel.fios.map((pts) => JSON.stringify(pts.map(([x, y]) => [x + dg[0] + sx, y + dg[1] + sy]))));   // as conexões andaram
    novoEstado(j); msg(descr + abriuEspaco(j) + (terms.length ? ` · os terminais do subcircuito (${terms.join(", ")}) ficam na borda` : ""), "ok");
  } catch (er) { msg(er.message, "erro"); desenha(); }
}
async function apagaGrupo() {
  const sel = selecaoGrupo();
  if (!(await confirma("Apagar a seleção", `Apagar <b>${sel.nomes.length}</b> componente(s) e <b>${sel.fios.length}</b> conexão(ões)?` +
    (sel.nomes.length ? `<br><small>${sel.nomes.map(escT).join(", ")}</small>` : ""), "Apagar", true))) return;
  msg("apagando…");
  try { const j = await api("editor/grupo", { acao: "apagar", nomes: sel.nomes, fios: sel.fios, folha: folhaAtual, descr: `apagados ${sel.nomes.length} componente(s) e ${sel.fios.length} conexão(ões)` });
    ed.multi.clear(); ed.multiFios.clear(); novoEstado(j); msg(`apagados ${sel.nomes.length} componente(s) e ${sel.fios.length} conexão(ões)`, "ok"); }
  catch (er) { msg(er.message, "erro"); }
}
async function copiaGrupo(recortar) {
  const sel = selecaoGrupo();
  try {
    const j = await api("editor/grupo", { acao: "copiar", nomes: sel.nomes, fios: sel.fios, folha: folhaAtual });
    const f = dados.folhas[folhaAtual], xs = f.elementos.filter((e) => sel.nomes.includes(e.nome)).map((e) => [e.x, e.y]).concat(sel.fios.flat());
    ed.copia = { nome: `${sel.nomes.length} componente(s)`, x: Math.min(...xs.map((p) => p[0])), y: Math.min(...xs.map((p) => p[1])), vezes: 0 };
    const txt = `${sel.nomes.length} componente(s) e ${sel.fios.length} conexão(ões)` + (j.dentro ? ` (com os ${j.dentro} de dentro dos subcircuitos)` : "");
    if (recortar) { await api("editor/grupo", { acao: "apagar", nomes: sel.nomes, fios: sel.fios, folha: folhaAtual, descr: `recortados ${txt}` }).then((r) => { ed.multi.clear(); ed.multiFios.clear(); novoEstado(r); });
      msg(`recortados ${txt} · Ctrl+V cola onde está o mouse`, "ok"); }
    else msg(`copiados ${txt} · Ctrl+V cola onde está o mouse (o canto de cima à esquerda)`, "ok");
  } catch (er) { msg(er.message, "erro"); }
}
// copiar e recortar: o servidor guarda o bloco (de um subcircuito, com o que tem dentro); recortar apaga em seguida (Ctrl+Z
// volta). Colar: onde está o mouse, ou ao lado do original (3 quadrados a cada Ctrl+V) com o mouse fora do desenho
async function copia(e, recortar) {
  try {
    const j = await api("editor/copiar", { nome: e.nome, folha: folhaAtual });
    ed.copia = { nome: e.nome, tipo: e.tipo, x: e.x, y: e.y, vezes: 0 };
    const dentro = j.dentro ? ` (com os ${j.dentro} componentes de dentro)` : "";
    if (recortar) await pede("DELETE", [qualificado(e)], `recortado ${e.nome}${dentro} · Ctrl+V cola onde está o mouse`);
    else msg(`copiado ${e.nome}${dentro} · Ctrl+V cola onde está o mouse`, "ok");
  } catch (er) { msg(er.message, "erro"); }
}
async function cola() {
  const c = ed.copia;
  let p = ed.mouse;
  if (!p) { const k = c ? ++c.vezes : 0; p = c ? [c.x + 3 * k, c.y + 3 * k] : [Math.round((ver.x + ver.w / 2) / G), Math.round((ver.y + ver.h / 2) / G)]; }
  if (foraDaFolha(p)) return;
  msg("colando…");
  try {
    const fs = alvos();                                   // dentro de um SM com iguais ("mudar os N juntos"): cola em todos
    const j = await api("editor/colar", { x: p[0], y: p[1], folha: folhaAtual, ...(fs.length > 1 ? { folhas: fs } : {}), descr: `colado em (${p})${nosSMs(fs)}` });
    const colados = [].concat(j.colado), fios = j.fios_colados || [];
    if (colados.length + fios.length > 1) { ed.sel = null; ed.multi = new Set(colados); ed.multiFios = new Set(fios.map((pts) => JSON.stringify(pts))); }
    else { ed.sel = colados[0]; ed.multi.clear(); ed.multiFios.clear(); }
    novoEstado(j);
    msg(`colado ${colados.join(", ")}${fios.length ? ` e ${fios.length} conexão(ões)` : ""} em (${p})${nosSMs(fs)}` + (j.globais_novas && j.globais_novas.length ? ` · variáveis novas: ${j.globais_novas.join(" ")}` : ""), "ok");
    const novo = colados.length === 1 && !fios.length && dados.folhas[folhaAtual].elementos.find((x) => x.nome === colados[0]);
    if (novo && novo.tipo === "TERM" && !naFolhaPrincipal()) await pede("MOVE", [qualificado(novo), p[0], p[1]], `colado ${colados[0]}`);   // terminal: na borda, num borne livre
  } catch (er) { msg(er.message, "erro"); }
}
async function apaga(e) {
  const txt = e.tipo === "TERM" ? `Apagar <b>${e.nome}</b>? O borne dele some do bloco, e a ligação de fora com ele também.` : `Apagar <b>${e.nome}</b>? As ligações por rótulo dele somem junto.`;
  if (await confirma("Apagar componente", txt, "Apagar", true)) pede("DELETE", [qualificado(e)], `apagado ${e.nome}`);
}

// ---------------------------------------------------------------- menus Arquivo e Simulação
document.querySelectorAll(".menu-sup > button").forEach((b) => b.onclick = (ev) => {
  ev.stopPropagation(); const m = b.parentElement, aberto = m.classList.contains("aberto");
  document.querySelectorAll(".menu-sup").forEach((x) => x.classList.remove("aberto"));
  if (!aberto) { m.classList.add("aberto"); estadoMenus(); }
});
addEventListener("mousedown", (ev) => { if (!ev.target.closest(".menu-sup")) document.querySelectorAll(".menu-sup").forEach((x) => x.classList.remove("aberto")); });
// fechar o circuito (Marcelo, 22/10: "para não ficar sempre um aberto"): o Gecko vazio, nada selecionado na lista; o
// arquivo fica como foi salvo (com mudanças não salvas, pergunta como ao abrir outro)
async function fechaCircuito() {
  if (simulando()) { msg("simulando: pare a simulação para fechar o circuito", "erro"); return; }
  try { let j;
    try { j = await api("editor/fechar", {}); }
    catch (e) { const modo = await perguntaNaoSalvo(e, "fechar"); if (!modo) { msg("fechar cancelado", ""); return; }
      j = await api("editor/fechar", modo === "salvou" ? {} : { modo }); }
    mostraFechado(j); msg("circuito fechado", "ok");
    avisa("circuito", { arq: null, outro: true, sujo: false });
  } catch (e) { msg(e.message, "erro"); }
}
function mostraFechado(j) {
  ed.novo = null; ed.abertoSel = null; $("sel-modelo").value = ""; mostraModelo();
  dados = j; folhaAtual = "0"; seleciona(null); marcaSujo(false); desenha(); ver = { x: 0, y: 0, w: 70 * G, h: 44 * G }; aplicaVer();
  try { localStorage.removeItem("maisim-simu-modelo"); } catch (e) { /* ok */ }
  const q = new URLSearchParams(location.search); q.delete("modelo"); history.replaceState(null, "", q.toString() ? "?" + q : location.pathname);
  if (typeof recarregaControle === "function") recarregaControle();
  tituloCodigo();
}
$("vz-novo").onclick = () => ACOES.novo();
$("vz-abrir").onclick = () => ACOES.abrir();
const ACOES = { abrir: () => abrirModelo(), fechar: fechaCircuito, salvar1: () => salvar(), novo: () => garanteEdicao().then((ok) => ok && novoCircuito()), salvar: () => garanteEdicao().then((ok) => ok && salvarComo()),
  editar: () => liga(!ed.ligado), parametros: parametrosSim, globais: variaveisGlobais, iniciar: iniciaSim,
  pausar: () => controlaSim("pausar"), continuar: () => controlaSim("continuar"), parar: () => controlaSim("parar") };
document.querySelectorAll(".suspenso button[data-acao]").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".menu-sup").forEach((x) => x.classList.remove("aberto")); ACOES[b.dataset.acao](); });
function estadoMenus() { }                             // (os menus Arquivo e Simulação saíram: tudo virou botão no cabeçalho)
$("bt-param").onclick = () => parametrosSim();
$("bt-novo").onclick = ACOES.novo;
$("bt-fechar").onclick = ACOES.fechar;
$("bt-salvar-como").onclick = ACOES.salvar;
$("bt-globais").onclick = () => variaveisGlobais();
async function garanteEdicao() { if (!ed.ligado) await liga(true); return ed.ligado; }

// ---------------------------------------------------------------- simulação: parâmetros, iniciar, pausar, continuar, parar, progresso
const sim = { estado: "parada", timer: null, par: { dt: "1e-6", tfim: "0.04", nome: "rodada", amostras: "4000", por_cima: "1" } };   // por_cima: a nova substitui a anterior de mesmo nome
try { Object.assign(sim.par, JSON.parse(localStorage.getItem("maisim-simu-sim") || "{}")); } catch (e) { /* ok */ }
// ⚙ Parâmetros da simulação, em duas abas: "simulação" (Δt, tempo final… — valem ao iniciar) e "variáveis globais ($)", como
// o Tools > Parameters do Gecko: criar, mudar, apagar (cada mudança vale na hora; Ctrl+Z desfaz). O $x abre na segunda aba
// o nome da próxima depois de guardar uma rodada: rodada_teste → rodada_teste_2 → rodada_teste_3
const proximoNome = (n) => (/_(\d+)$/.test(n) ? n.replace(/_(\d+)$/, (_, k) => `_${+k + 1}`) : `${n}_2`).slice(0, 40);
async function parametrosSim(aba = "sim", op = {}) {
  const SIM = [{ nome: "dt", rotulo: "Passo de tempo Δt (s)", valor: sim.par.dt }, { nome: "tfim", rotulo: "Tempo final (s)", valor: sim.par.tfim },
               { nome: "nome", rotulo: "Nome da rodada", valor: sim.par.nome, dica: "letras, números, _ e -" },
               { nome: "amostras", rotulo: "Amostras guardadas (até)", valor: sim.par.amostras, dica: "o scope recebe uma amostra a cada tfim/amostras" }];
  const comVars = !!(dados && dados.editor);
  // simulando: só para ver (Marcelo, 22/10) — as variáveis mexem no circuito na hora, e a rodada usa o do início; os
  // parâmetros da simulação travam junto (valeriam só para a próxima). Copiar o nome de uma variável continua
  const roda = sim.estado === "rodando" || sim.estado === "pausada";
  let porCima = sim.par.por_cima !== "0";
  if (op.nome) SIM.find((c) => c.nome === "nome").valor = op.nome;   // depois de guardar uma rodada: o nome da próxima
  const r = await modal({ titulo: "Parâmetros da simulação", foco: op.nome ? 'input[name="nome"]' : null, ok: roda ? "Fechar" : "Guardar", cancelar: roda ? "" : "Cancelar", largo: comVars,
    html: `${roda ? `<p class="m-trava">simulação rodando: só para ver — os parâmetros e as variáveis ficam travados até ela parar (a rodada usa o circuito do início)</p>` : ""}${comVars ? `<div class="m-abas" role="tablist"><button type="button" data-aba="sim">Simulação</button><button type="button" data-aba="vars">Variáveis globais ($)</button></div>` : ""}
      <div class="m-aba" data-aba="sim"><p>Valem para a próxima vez que você iniciar (Ctrl+Enter).</p>
        ${op.aviso ? `<p class="m-guardada">${escT(op.aviso)}</p>` : ""}
        ${SIM.map((c) => `<label><span>${c.rotulo}</span><input name="${c.nome}" value="${escT(c.valor ?? "")}" ${c.dica ? `title="${c.dica}"` : ""}${roda ? " disabled" : ""}></label>`).join("")}
        <label title="substituir: a rodada nova, depois de terminar bem, tira a anterior com o mesmo nome deste circuito (as guardadas ficam) — o disco não enche; criar outra: guarda as duas"><span>a rodada nova</span><select class="m-porcima"${roda ? " disabled" : ""}>
          <option value="1"${porCima ? " selected" : ""}>Substitui a anterior de mesmo nome</option><option value="0"${porCima ? "" : " selected"}>Cria outra (guarda as duas)</option></select></label></div>
      ${comVars ? `<div class="m-aba" data-aba="vars"><p>Como no Gecko: num parâmetro de componente, escreva <b>$nome</b> no lugar do número.
        Mudar o valor aqui muda todos os componentes que a usam. Cada mudança vale na hora (Ctrl+Z desfaz).</p><div id="gv"></div></div>` : ""}`,
    monta: (fundo) => {
      const mostra = (a) => { fundo.querySelectorAll(".m-abas button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === a));
        fundo.querySelectorAll(".m-aba").forEach((d) => d.style.display = d.dataset.aba === a ? "" : "none");
        fundo.querySelector(".m-ok").textContent = a === "sim" && !roda ? "Guardar" : "Fechar";
        const f = fundo.querySelector(`.m-aba[data-aba="${a}"] input`); if (f) setTimeout(() => f.focus(), 0); };
      fundo.querySelectorAll(".m-abas button").forEach((b) => b.onclick = () => mostra(b.dataset.aba));
      fundo.querySelector(".m-porcima").onchange = (ev) => { porCima = ev.target.value === "1"; };
      if (comVars) listaGlobais(fundo.querySelector("#gv"), roda);
      mostra(comVars ? aba : "sim");
    } });
  if (!r) return false;
  if (roda) return true;
  r.por_cima = porCima ? "1" : "0";
  if (["dt", "tfim", "nome", "amostras", "por_cima"].every((k) => r[k] === undefined || String(r[k]) === String(sim.par[k]))) return true;   // fechou sem mudar a simulação
  Object.assign(sim.par, r); try { localStorage.setItem("maisim-simu-sim", JSON.stringify(sim.par)); } catch (e) { /* ok */ }
  if (typeof infoTs === "function" && $("ctl-ts")) { infoTs(); infoAtraso(); }   // Ts = n × Δt no painel do controle
  msg(`simulação: Δt ${r.dt} s, até ${r.tfim} s`, "ok"); return true;
}
async function iniciaSim() {
  if (VISTA_CODIGO) { msg("o ▶ fica na janela do circuito (é ela que roda e chama os controladores)", "erro"); return; }
  if (sim.iniciando || sim.estado === "rodando" || sim.estado === "pausada") return;    // um clique só
  sim.iniciando = true; $("bt-play").disabled = true;
  try {
    if (!(await garanteEdicao())) return;
    if (typeof guardaControle === "function" && !(await guardaControle())) {            // o que está no editor é o que roda
      msg("o controle não foi gravado (veja o painel Controle): a simulação não começou", "erro"); mostraDoca("controle"); return; }
    msg("iniciando…");
    if (!document.body.classList.contains("com-scope") || /[?&]a=/.test($("if-scope").src)) mostraScope(true, urlScope(null));   // ao vivo
    try { const j = await api("editor/rodar", sim.par); acompanha(j); }
    catch (e) { msg(e.message, "erro"); }
  } finally { sim.iniciando = false; estadoBotoesSim(); }
}
async function controlaSim(acao) { try { acompanha(await api(`editor/${acao}`, {})); } catch (e) { msg(e.message, "erro"); } }
// botões ▶ ⏸ ⏹ da barra: ▶ inicia (ou continua, se pausada); ⏸ pausa; ⏹ para
function estadoBotoesSim() {
  const st = sim.estado, roda = st === "rodando", pausa = st === "pausada";
  $("bt-play").disabled = roda; $("bt-pausa").disabled = !roda; $("bt-parar").disabled = !(roda || pausa);
  $("bt-globais").disabled = roda || pausa;            // as variáveis globais mexem no circuito: não no meio da rodada
  travaCircuito(simulando());
  $("bt-play").classList.toggle("ativo", roda);
  $("bt-play").title = pausa ? "continuar (Espaço)" : roda ? "simulando…" : "iniciar a simulação (Ctrl+Enter)";
}
$("bt-play").onclick = () => sim.estado === "pausada" ? controlaSim("continuar") : iniciaSim();
$("bt-pausa").onclick = () => controlaSim("pausar");
$("bt-guardar").onclick = () => guardaRodada(sim.guardarJ);
$("bt-parar").onclick = () => controlaSim("parar");
function acompanha(j) {
  sim.estado = j.estado; estadoBotoesSim(); const pg = $("progresso");
  if (typeof travaControle === "function") travaControle(j.estado === "rodando" || j.estado === "pausada" || j.estado === "preparando");
  if (j.avisos && j.avisos.length) {
    let vistos = {}; try { vistos = JSON.parse(sessionStorage.getItem("maisim-simu-avisos") || "{}"); } catch (e) { /* ok */ }
    const chave = `${j.nome}|${j.inicio}`, ja = vistos[chave] || 0;
    for (const a of j.avisos.slice(ja)) anota(a, "erro");
    if (j.avisos.length > ja) { vistos = { [chave]: j.avisos.length }; try { sessionStorage.setItem("maisim-simu-avisos", JSON.stringify(vistos)); } catch (e) { /* ok */ } }
  }
  const vivo = j.estado === "rodando" || j.estado === "pausada" || j.estado === "preparando", estavaViva = sim.vivoAntes; sim.vivoAntes = vivo;
  if (vivo && !estavaViva) { $("bt-guardar").hidden = true; sim.guardarDe = null; }   // uma rodada nova: o "guardar" é da próxima
  if (vivo && !sim.avisou) { sim.avisou = true; avisa("rodada"); } else if (!vivo) sim.avisou = false;   // a outra janela acompanha
  pg.classList.toggle("ativo", vivo); pg.classList.toggle("pausada", j.estado === "pausada");
  const dd = pg.querySelector(".sim-diodo");              // o diodo animado (claude.js), o "carregando" do MaiSim
  if (vivo && !dd.firstChild && typeof diodoIA === "function") dd.innerHTML = diodoIA(18);
  if (j.tfim) { pg.querySelector("i").style.width = `${Math.min(100, 100 * (j.t || 0) / j.tfim)}%`;
    pg.querySelector(".sim-t").textContent = `${j.estado === "pausada" ? "⏸" : "▶"} ${si(j.t || 0, "s")} / ${si(j.tfim, "s")}`; }
  if (vivo) { if (!(sim.avisoAte > Date.now())) msg(j.estado === "pausada" ? "simulação pausada (Espaço continua)" : `simulando ${j.nome}…`); clearTimeout(sim.timer);
    sim.timer = setTimeout(async () => {
      try { const r = await api("editor/rodada"); sim.falhas = 0; acompanha(r); }
      catch (e) {
        sim.falhas = (sim.falhas || 0) + 1;
        if (sim.falhas <= 10) { msg(`sem resposta da simulação (${e.message}); tentando de novo…`, "erro"); sim.timer = setTimeout(() => acompanha(j), 500 * sim.falhas); }
        else { msg("perdi o contato com a simulação: recarregue a página para ver o estado", "erro"); sim.estado = "desconhecido"; estadoBotoesSim();
          $("progresso").classList.remove("ativo"); if (typeof travaControle === "function") travaControle(false); }
      }
    }, 400); return; }
  if ((j.estado === "fim" || j.estado === "parada") && estavaViva && typeof atualizaVistas === "function") atualizaVistas();   // o que foi nas mensagens
  if (j.estado === "fim" || j.estado === "parada") {
    const subst = (j.substituidas || []).reduce((a, x) => a + x.tamanho, 0);
    // curta: com dezenas de sinais (o MMC), a lista empurrava "abrir em nova aba" e "guardar" para depois do corte (…)
    const sn = j.sinais || [];
    $("msg").innerHTML = `<span title="${escT(sn.join(", "))}">${j.estado === "fim" ? "rodada" : "rodada parada"} ${escT(j.nome)}: ${j.amostras} amostras de ${sn.length > 3 ? `${sn.length} sinais` : sn.map(escT).join(", ")} em ${j.segundos} s</span>` +
      ` · <a href="${urlScope(j.arquivo, false)}" target="_blank">abrir em nova aba</a>${(j.substituidas || []).length ? ` · substituiu a anterior (${(subst / 1e6).toFixed(1)} MB)` : ""}`;
    // "guardar esta rodada": um botão do cabeçalho (na mensagem, ele ficava depois do corte "…" quando a linha é curta)
    if (j.arquivo && sim.guardarDe !== j.arquivo) { sim.guardarDe = j.arquivo; sim.guardarJ = j; $("bt-guardar").hidden = false; $("bt-guardar").classList.remove("ativo"); }
    $("msg").className = "ok"; anota(`${j.estado === "fim" ? "rodada" : "rodada parada"} ${j.nome}: ${j.amostras} amostras em ${j.segundos} s`, "ok");
    if (j.arquivo) { sim.ultimo = j.arquivo; mostraScope(true, urlScope(j.arquivo)); }
  } else if (j.estado === "erro") { msg(`a simulação não rodou: ${j.erro}`, "erro"); if (j.erro_controle && typeof mostraErroControle === "function") mostraErroControle(j); }
  if ((j.estado === "fim" || j.estado === "parada") && j.saida_controle !== undefined && typeof saidaControle === "function") saidaControle(j.saida_controle || "");
}
// guardar a rodada (Marcelo, 22/10: "caso queira comparar ou salvar um resultado"): a pasta dela ganha .guardada e a ⚙ abre
// com o nome da próxima (rodada_teste → rodada_teste_2), para a próxima não cair por cima desta
async function guardaRodada(j) {
  if (!j) return;
  try { await api("editor/rodada/guardar", { arq: j.arquivo }); } catch (e) { msg(`não deu para guardar: ${e.message}`, "erro"); return; }
  $("bt-guardar").classList.add("ativo"); $("bt-guardar").title = `“${j.nome}” guardada`;
  msg(`rodada ${j.nome} guardada: “por cima” não a substitui (o scope e a página inicial mostram o selo)`, "ok");
  await parametrosSim("sim", { nome: proximoNome(j.nome), aviso: `“${j.nome}” está guardada. A próxima com outro nome (ou o mesmo: ela continua guardada).` });
}
async function variaveisGlobais() { if (await garanteEdicao()) return parametrosSim("vars"); }
const NOME_VAR = /^\$[A-Za-z_][A-Za-z0-9_]{0,39}$/;
function usosGlobal(v) {                               // "U.1.uMAX" de cada parâmetro ligado à variável, em todas as folhas
  const u = [];
  for (const [fid, f] of Object.entries(dados.folhas)) for (const e of f.elementos) for (const [k, x] of Object.entries(e.par))
    if (k.endsWith("_var") && x === v) u.push(`${fid === "0" ? "" : (f.nome || "SM") + " › "}${e.nome}.${k.slice(0, -4)}`);
  return u;
}
async function mudaGlobal(corpo, ok) {                 // nova / apaga / liga / desliga (o servidor escreve no arquivo e o Gecko reabre)
  msg("aplicando…");
  try { const j = await api("editor/variavel", Object.assign({ descr: ok }, corpo)); novoEstado(j); msg(ok, "ok"); return true; }
  catch (e) { msg(e.message, "erro"); return false; }
}
function listaGlobais(caixa, travada = false) {       // a aba "variáveis globais ($)": a lista, criar, apagar (travada: simulando, só ver e copiar)
  const g = Object.entries(dados.globais || {}).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const sem = g.filter(([k]) => !usosGlobal(k).length).map(([k]) => k);
  caixa.innerHTML = `<div class="gv-lista">${g.map(([k, v]) => { const u = usosGlobal(k);
      return `<div class="gv"><span class="gv-nome"><code>${escT(k)}</code><button type="button" class="gv-copia" data-copia="${escT(k)}" title="copiar ${escT(k)} (cole no parâmetro de um componente)" aria-label="copiar ${escT(k)}"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3.5 10.5h-1v-8h8v1"/></svg></button></span><input data-g="${escT(k)}" value="${v}" data-enter="proprio" aria-label="valor de ${escT(k)}">
        <small title="${escT(u.join("\n") || "nenhum componente usa")}">${u.length ? `${u.length} uso${u.length > 1 ? "s" : ""}` : "sem uso"}</small>
        <button type="button" class="gv-apaga" data-apaga="${escT(k)}" data-usos="${u.length}" title="apagar ${escT(k)}${u.length ? ` (os ${u.length} parâmetros que a usam ficam com o valor dela)` : ""}">×</button></div>`; }).join("")
      || `<div class="t">nenhuma variável neste circuito</div>`}</div>
    <div class="gv nova"><input id="gv-nome" placeholder="$nome" data-enter="proprio" autocomplete="off" aria-label="nome da variável nova">
      <input id="gv-valor" placeholder="valor" data-enter="proprio" aria-label="valor da variável nova"><button type="button" id="gv-cria">Criar</button></div>
    ${sem.length ? `<button type="button" id="gv-limpa" class="gv-limpa" title="${escT(sem.join(", "))}">Apagar as ${sem.length} que nenhum componente usa</button>` : ""}`;
  const relista = () => listaGlobais(caixa, travada);
  if (travada) caixa.querySelectorAll("input, button:not([data-copia])").forEach((x) => { x.disabled = true; });
  caixa.querySelectorAll("input[data-g]").forEach((i) => {
    const vale = async () => { const k = i.dataset.g, v = i.value.trim(); if (v === "" || Number(v) === dados.globais[k]) return;
      if (!isFinite(Number(v))) { msg(`${k}: o valor é um número (ex.: 325, 50, 1e-3)`, "erro"); return; }
      await pede("SETG", [k, v], `${k} = ${v}`); };
    i.onchange = vale; i.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); i.blur(); } };
  });
  // copiar o nome (Marcelo, 19/10): um clique e é só colar no parâmetro do componente; sem a área de transferência do
  // navegador (fora de localhost/https), o jeito antigo (selecionar e copiar)
  caixa.querySelectorAll("[data-copia]").forEach((b) => b.onclick = async () => {
    const k = b.dataset.copia; let ok = false;
    try { await navigator.clipboard.writeText(k); ok = true; }
    catch (e) { const ta = document.createElement("textarea"); ta.value = k; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } ta.remove(); }
    b.classList.toggle("copiado", ok); setTimeout(() => b.classList.remove("copiado"), 1200);
    msg(ok ? `${k} copiado: cole no parâmetro de um componente` : `não deu para copiar ${k}: selecione o nome e copie`, ok ? "ok" : "erro");
  });
  caixa.querySelectorAll("[data-apaga]").forEach((b) => b.onclick = async () => {
    const k = b.dataset.apaga, n = +b.dataset.usos;
    if (n && !b.classList.contains("confirma")) { b.classList.add("confirma"); b.textContent = "apagar?"; b.title = `os ${n} parâmetros que usam ${k} ficam com o valor dela (${dados.globais[k]})`; return; }
    if (await mudaGlobal({ acao: "apaga", nome: k }, `variável ${k} apagada` + (n ? ` (os ${n} parâmetros ficam com ${dados.globais[k]})` : ""))) relista();
  });
  const cria = async () => {
    let k = caixa.querySelector("#gv-nome").value.trim(); const v = caixa.querySelector("#gv-valor").value.trim();
    if (k && !k.startsWith("$")) k = "$" + k;
    if (!NOME_VAR.test(k)) { msg("nome da variável: $ seguido de letras, números ou _ (ex.: $Vp, $f_rede)", "erro"); caixa.querySelector("#gv-nome").focus(); return; }
    if (v === "" || !isFinite(Number(v))) { msg(`${k}: o valor é um número (ex.: 325, 50, 1e-3)`, "erro"); caixa.querySelector("#gv-valor").focus(); return; }
    if (await mudaGlobal({ acao: "nova", nome: k, valor: Number(v) }, `variável ${k} = ${v} criada`)) { relista(); caixa.querySelector("#gv-nome").focus(); }
  };
  caixa.querySelector("#gv-cria").onclick = cria;
  caixa.querySelector("#gv-nome").onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); caixa.querySelector("#gv-valor").focus(); } };
  caixa.querySelector("#gv-valor").onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); cria(); } };
  const lp = caixa.querySelector("#gv-limpa");
  if (lp) lp.onclick = async () => { if (await mudaGlobal({ acao: "apaga", nomes: sem }, `${sem.length} variáveis sem uso apagadas`)) relista(); };
}
addEventListener("keydown", (ev) => {      // atalhos que o navegador não usa: Ctrl+Enter inicia; Espaço pausa e continua
  if (document.querySelector(".modal-fundo") || (ev.target.closest && ev.target.closest("input, select, textarea, [contenteditable], #ctl-editor"))) return;
  if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); iniciaSim(); }
  else if (((ev.key === "s" || ev.key === "S") || (ev.key === "z" || ev.key === "Z") && ed.ligado) && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && simulando()) { ev.preventDefault(); avisaTrava(); }
  else if ((ev.key === "s" || ev.key === "S") && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey) { ev.preventDefault(); if (ed.ligado) salvar(); }
  else if ((ev.key === "z" || ev.key === "Z") && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ed.ligado) { ev.preventDefault(); desfazer(); }
  else if (ev.key === " " && (sim.estado === "rodando" || sim.estado === "pausada")) {
    ev.preventDefault(); controlaSim(sim.estado === "rodando" ? "pausar" : "continuar"); }
});

// ---------------------------------------------------------------- símbolos da paleta (mini SVG; os outros, caixa com a sigla)
const IC = {
  R: '<path d="M1 9h7"/><rect x="8" y="5" width="14" height="8" rx="1"/><path d="M22 9h7"/>',
  L: '<path d="M1 9h5"/><path d="M6 9a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0"/><path d="M24 9h5"/>',
  C: '<path d="M1 9h12M17 9h12M13 3v12M17 3v12"/>',
  U: '<path d="M1 9h8M21 9h8"/><circle cx="15" cy="9" r="6"/><path d="M11 9q2-4 4 0t4 0"/>',
  I: '<path d="M1 9h8M21 9h8"/><circle cx="15" cy="9" r="6"/><path d="M12 9h6M16 7l2 2-2 2"/>',
  S: '<path d="M1 12h8M21 12h8"/><circle cx="9" cy="12" r="1.3"/><circle cx="21" cy="12" r="1.3"/><path d="M9 12l11-7"/>',
  D: '<path d="M1 9h10M19 9h10"/><path d="M11 4v10l8-5z"/><path d="M19 4v10"/>',
  THYR: '<path d="M1 9h10M19 9h10"/><path d="M11 4v10l8-5z"/><path d="M19 4v10M19 12l4 5"/>',
  IGBT: '<path d="M1 9h8M9 4v10M12 3v12M12 6l6-4M12 12l6 4M18 16l-2 0M18 2v-1M18 16v1"/><path d="M15 15l3 1-1-3"/>',
  MOSFET: '<path d="M1 9h8M9 4v10M12 3v3M12 8v2M12 12v3M12 4h6M12 14h6M12 9h6M18 9v5"/>',
  BJT: '<path d="M1 9h8M9 3v12M9 7l8-5M9 11l8 5"/><path d="M14 13l3 3-4 0"/>',
  "OP-AMP": '<path d="M8 2v14l14-7z"/><path d="M2 6h6M2 12h6M22 9h6"/>',
  Trans: '<path d="M4 3a3 3 0 0 1 0 6a3 3 0 0 1 0 6M14 3v12M16 3v12M26 3a3 3 0 0 0 0 6a3 3 0 0 0 0 6"/>',
  Lc: '<path d="M1 9h5"/><path d="M6 9a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0"/><path d="M24 9h5M8 14h14"/>',
  K: '<path d="M2 6a3 3 0 0 1 6 0a3 3 0 0 1 6 0M16 12a3 3 0 0 1 6 0a3 3 0 0 1 6 0M14 9h2"/>',
  VOLT: '<circle cx="15" cy="9" r="7"/><text x="15" y="12.5" text-anchor="middle" font-size="9" fill="currentColor" stroke="none" font-weight="700">V</text>',
  AMP: '<circle cx="15" cy="9" r="7"/><text x="15" y="12.5" text-anchor="middle" font-size="9" fill="currentColor" stroke="none" font-weight="700">A</text>',
  SCOPE: '<rect x="4" y="2" width="22" height="14" rx="2"/><path d="M6 11l4-5 4 7 4-6 4 4"/>',
  SUBCIRCUIT: '<rect x="6" y="3" width="18" height="12" rx="2"/><path d="M2 7h4M2 11h4M24 7h4M24 11h4"/>',
  SIGNAL: '<rect x="4" y="3" width="22" height="12" rx="2"/><path d="M7 9q2-5 4 0t4 0t4 0t4 0"/>',
};
const SIGLA = { GAIN: "K", PT1: "PT1", PT2: "PT2", INT: "∫", PI: "PI", PD: "PD", HYS: "⊐", LIMIT: "⊓", ADD: "+", SUB: "−", MUL: "×", DIV: "÷",
  MIN: "min", MAX: "max", SIGN: "sgn", TF: "H(s)", NOT: "¬", AND: "&", OR: "≥1", XOR: "=1", DELAY: "Δt", "S-H": "S/H", COUNTER: "#", GE: "≥", GT: ">",
  EQ: "=", NE: "≠", ABS: "|x|", ROUND: "rnd", SQR: "x²", SQRT: "√", POW: "xʸ", EXP: "eˣ", LN: "ln", SIN: "sin", COS: "cos", TAN: "tan",
  ASIN: "asin", ACOS: "acos", ATAN: "atan", SDFT: "DFT", CONST: "k", GATE: "G", SWITCH: "⇄", ABCDQ: "dq", DQABC: "abc", TIME: "t" };
function icone(it) {
  // a cor própria (SM roxo, controle verde) vai em --ic e o desenho usa currentColor: segue o tema e fica branca no item selecionado
  if (it.lib) return `<svg viewBox="0 0 30 18" fill="none" stroke="currentColor" style="--ic:${COR.sub}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${IC.SUBCIRCUIT}<circle cx="15" cy="9" r="1.6" fill="currentColor"/></svg>`;
  if (it.id === "TAG") return `<svg viewBox="0 0 30 18" fill="none" stroke="currentColor" style="--ic:${COR.ct}" stroke-width="1.4" stroke-linejoin="round"><path d="M1 9h4"/><path d="M5 3.5h15.5L27 9l-6.5 5.5H5z"/><circle cx="20.5" cy="9" r="1.5" fill="currentColor"/></svg>`;
  if (IC[it.id]) return `<svg viewBox="0 0 30 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${IC[it.id]}</svg>`;
  const s = SIGLA[it.id] || (it.id || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 4);
  const ic = it.dom === "CONTROL" ? ` style="--ic:${COR.ct}"` : "";
  return `<svg viewBox="0 0 30 18" fill="none" stroke="currentColor"${ic} stroke-width="1.3"><rect x="3" y="2" width="24" height="14" rx="3"/>` +
    `<text x="15" y="12.5" text-anchor="middle" font-size="${s.length > 3 ? 6.5 : 8.5}" fill="currentColor" stroke="none" font-weight="700">${s}</text></svg>`;
}

// ---------------------------------------------------------------- carregar
async function carrega(arq) {
  $("erro").textContent = ""; $("svg").innerHTML = ""; $("info").textContent = "lendo o modelo…";
  let j; try { j = await api("circuito?arq=" + encodeURIComponent(arq)); }   // leitura: repete uma vez se a conexão cair
  catch (e) { $("erro").textContent = e.message || "erro ao ler o modelo"; $("info").textContent = ""; return; }
  dados = j; folhaAtual = "0"; desenha(); ajusta();
  try { localStorage.setItem("maisim-simu-modelo", arq); } catch (e) { /* ok */ }
  const q = new URLSearchParams(location.search); q.set("modelo", arq); history.replaceState(null, "", "?" + q.toString());
}
$("bt-ajustar").onclick = ajusta;
// o que se vê: um botão por camada e o olho, que mostra tudo (se algo está escondido) ou esconde tudo
const CAMADAS = [["bt-controle", "controle"], ["bt-rotulos", "rotulos"], ["bt-corrente", "corrente"], ["bt-medicoes", "medicoes"]];
function estadoVer() {
  for (const [id, k] of CAMADAS) $(id).classList.toggle("ativo", mostrar[k]);
  const n = CAMADAS.filter(([, k]) => mostrar[k]).length, o = $("bt-tudo");
  o.classList.toggle("ativo", n === CAMADAS.length); o.classList.toggle("fechado", n === 0); o.classList.toggle("misto", n > 0 && n < CAMADAS.length);
  o.title = n === CAMADAS.length ? "esconder tudo: controle, rótulos, medições e corrente" : "mostrar tudo: controle, rótulos, medições e corrente";
}
for (const [id, k] of CAMADAS) $(id).onclick = () => { mostrar[k] = !mostrar[k]; estadoVer(); desenha(); };
$("bt-tudo").onclick = () => { const todas = CAMADAS.every(([, k]) => mostrar[k]); for (const [, k] of CAMADAS) mostrar[k] = !todas; estadoVer(); desenha(); };
estadoVer();
// o cabeçalho quebra em linhas quando não cabe (os grupos inteiros): a tela embaixo acompanha a altura dele
let cabAtual = 0;
new ResizeObserver(() => { const h = document.querySelector("header").offsetHeight; if (h === cabAtual) return;
  cabAtual = h; document.documentElement.style.setProperty("--cab", `${h}px`);
  if (dados) requestAnimationFrame(reajustaAspecto);    // o desenho muda de altura: a proporção (e o clique → grade) acompanha
}).observe(document.querySelector("header"));
const NOVO = "__novo__";
let listaModelos = [];                           // a última lista do servidor: {arq, nome, grupo, apagavel, pasta}, já em grupos
function preencheModelos(lst, valor) {          // grupos: o circuito novo (se houver) e os do servidor, na ordem dele
  if (lst) listaModelos = lst;
  const grupos = [...new Set(listaModelos.map((o) => o.grupo))];
  $("sel-modelo").innerHTML = (ed.novo ? `<optgroup label="novo"><option value="${NOVO}">✱ ${ed.novo} (novo, não salvo)</option></optgroup>` : "") +
    grupos.map((g) => `<optgroup label="${escT(g)}">${listaModelos.filter((o) => o.grupo === g).map((o) => `<option value="${escT(o.arq)}">${escT(o.nome)}</option>`).join("")}</optgroup>`).join("");
  if (valor) $("sel-modelo").value = valor;
  mostraModelo();
}
// o modelo aberto, num botão: clicar abre a lista com busca. O <select> escondido guarda a escolha.
function mostraModelo() {
  const o = $("sel-modelo").selectedOptions[0];
  $("bt-modelo").querySelector("span").textContent = o ? o.textContent : "nenhum circuito aberto";
}
async function abrirModelo() {
  let lst; try { lst = await api("modelos"); } catch (e) { msg(`não consegui listar os modelos: ${e.message}`, "erro"); return; }
  const itens = (ed.novo ? [{ v: NOVO, t: `✱ ${ed.novo} (novo, não salvo)`, g: "novo" }] : []).concat(
    lst.map((o) => ({ v: o.arq, t: o.nome, apagavel: o.apagavel, g: o.grupo, bib: o.pasta === "subcircuitos" })));
  const atual = $("sel-modelo").value;
  const fundo = document.createElement("div"); fundo.className = "modal-fundo";
  fundo.innerHTML = `<div class="modal largo abrir" role="dialog" aria-modal="true"><h3>Abrir</h3>
    <p>Os <b>exemplos</b> vêm com o MaiSim; os <b>seus circuitos</b> (o que você salva) e a <b>biblioteca</b> ficam na pasta de dados; outras pastas entram pela configuração (MAISIM_PASTAS_CIRCUITOS).</p>
    <input class="busca-abrir" placeholder="procurar circuito…" autocomplete="off"><div class="lista-abrir"></div>
    <div class="modal-botoes"><button class="m-cancela">Cancelar</button></div></div>`;
  document.body.appendChild(fundo);
  const inp = fundo.querySelector(".busca-abrir"), caixa = fundo.querySelector(".lista-abrir");
  let vis = [], i = 0;
  const desenhaLista = () => {
    const q = inp.value.trim();
    vis = q ? itens.map((o) => [Math.max(pontua(q, o.t), pontua(q, o.t.split("/").pop())), o]).filter(([p]) => p >= 0).sort((a, b) => b[0] - a[0]).map(([, o]) => o) : itens;
    i = Math.max(0, Math.min(i, vis.length - 1));
    let g = null;
    caixa.innerHTML = vis.map((o, k) => (!q && o.g !== g ? `<div class="grupo">${(g = o.g)}</div>` : "") +
      `<div class="op${k === i ? " atual" : ""}${o.v === atual ? " aberto" : ""}" data-k="${k}">${escT(o.t)}${o.v === atual ? " <small>aberto</small>" : ""}` +
      (o.apagavel ? `<button class="apaga-arq" data-k="${k}" title="apagar (vai para a .lixeira da pasta)">🗑</button>` : "") + `</div>`).join("") ||
      `<div class="vazio">nada com “${escT(q)}”</div>`;
    const a = caixa.querySelector(".op.atual"); if (a) a.scrollIntoView({ block: "nearest" });
  };
  const fecha = (o) => {
    fundo.remove(); removeEventListener("keydown", tecla, true);
    if (o && o.v !== atual) { $("sel-modelo").value = o.v; mostraModelo(); $("sel-modelo").dispatchEvent(new Event("change")); }
  };
  const tecla = (e) => {
    if (e.key === "Escape") { e.preventDefault(); fecha(null); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); i += e.key === "ArrowDown" ? 1 : -1; desenhaLista(); }
    else if (e.key === "Enter") { e.preventDefault(); fecha(vis[i]); }
    e.stopPropagation();
  };
  addEventListener("keydown", tecla, true);
  inp.addEventListener("input", () => { i = 0; desenhaLista(); });
  caixa.addEventListener("click", async (e) => {
    const ap = e.target.closest(".apaga-arq");
    if (ap) {                                          // apagar: confirma num modal por cima e vai para a .lixeira
      e.stopPropagation(); const o = vis[+ap.dataset.k];
      removeEventListener("keydown", tecla, true);
      const sim = await confirma("Apagar arquivo", `Apagar <b>${escT(o.t)}</b>? Ele vai para a .lixeira da pasta (dá para recuperar).`, "Apagar", true);
      addEventListener("keydown", tecla, true);
      if (!sim) return;
      try { const j = await api("editor/apagar_arquivo", { arq: o.v }); itens.splice(itens.indexOf(o), 1); desenhaLista();
        msg(`apagado: ${j.apagado} (na lixeira: ${j.lixeira})`, "ok"); if (o.bib) carregaBiblioteca(); recarregaModelos($("sel-modelo").value); }
      catch (er) { msg(er.message, "erro"); }
      return;
    }
    const d = e.target.closest(".op"); if (d) fecha(vis[+d.dataset.k]);
  });
  fundo.querySelector(".m-cancela").onclick = () => fecha(null);
  fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) fecha(null); });
  i = Math.max(0, itens.findIndex((o) => o.v === atual)); desenhaLista(); setTimeout(() => inp.focus(), 0);
}
$("bt-modelo").onclick = abrirModelo;
$("bt-salvar").onclick = () => salvar();
async function recarregaModelos(valor) { preencheModelos(await api("modelos"), valor); }
$("sel-modelo").onchange = async (e) => {
  if (e.target.value === NOVO) return;
  if (ed.novo && !(await confirma("Circuito novo não salvo", `O circuito <b>${ed.novo}</b> não foi salvo. Abrir outro modelo o descarta.`, "Descartar", true))) {
    e.target.value = NOVO; mostraModelo(); return; }
  ed.novo = null; await recarregaModelos(e.target.value);
  ed.ligado ? liga(true) : carrega(e.target.value);
};
(async () => {
  const lst = await api("modelos");
  const sel = $("sel-modelo");
  preencheModelos(lst);
  let quer = new URLSearchParams(location.search).get("modelo");
  const arqs = lst.map((o) => o.arq);
  // a janela do código e o "+ Novo circuito" (?novo=1) partem do que o servidor tem aberto: o novo pergunta uma vez só
  // pelas mudanças não salvas (abrir o último deste navegador, se for outro, perguntaria antes)
  // Um circuito novo sem nome aberto no servidor: o "+ Novo" não abre nada antes (abrir perguntaria): mostra aquele
  const pedeNovo = !VISTA_CODIGO && new URLSearchParams(location.search).has("novo");
  let semNome = null;
  if (VISTA_CODIGO || pedeNovo) {
    try { const e = await api("editor/estado"); if (e && arqs.includes(e.arq)) quer = e.arq; else if (pedeNovo && e && !e.fechado && /^\(/.test(e.arq || "")) semNome = e; }
    catch (e) { /* o último deste navegador */ } }
  try { quer = quer || localStorage.getItem("maisim-simu-modelo"); } catch (e) { /* ok */ }
  let fechado = false;                                   // fechado no editor e nada pedido no endereço: começa vazio
  if (!new URLSearchParams(location.search).get("modelo")) try { fechado = (await api("editor/aberto")).fechado; } catch (e) { /* o de sempre */ }
  const arq = fechado || semNome ? null : arqs.includes(quer) ? quer : (arqs.find((a) => a.endsWith("exemplo_controle_pwm.ipes")) || arqs[0]);   // a 1ª vez: o buck com PWM
  if (arq) { sel.value = arq; mostraModelo(); await carrega(arq); }
  else if (fechado) { try { mostraFechado(await api("editor/estado")); } catch (e) { /* ok */ } }
  else if (semNome) {                                   // o que está no servidor, como um circuito novo (sem abrir nada: o novo pergunta)
    ed.novo = "circuito_sem_nome"; ed.abertoSel = NOVO; dados = Object.assign(semNome, { arq: ed.novo }); folhaAtual = "0";
    preencheModelos(null, NOVO); desenha(); ajusta(); marcaSujo(true);
  }
  // o cadeado começa aberto (editando), a não ser que tenha sido fechado neste navegador: assim o servidor conhece o circuito
  // (as medidas e atuações do controle) sem precisar lembrar de abrir a edição
  let travado = false; try { travado = localStorage.getItem("maisim-simu-travado") === "1"; } catch (e) { /* ok */ }
  if ((arq || fechado) && (VISTA_CODIGO || !travado) && !ed.ligado) await liga(true);
  if (!VISTA_CODIGO && new URLSearchParams(location.search).has("contas")) {   // a IA do trilho, de outra página: as contas abertas
    const q = new URLSearchParams(location.search); q.delete("contas"); history.replaceState(null, "", q.toString() ? "?" + q : location.pathname);
    if (typeof abreJanelaClaude === "function") abreJanelaClaude();
  }
  if (pedeNovo) {                                       // "+ Novo circuito" na página inicial (Marcelo, 22/10)
    const q = new URLSearchParams(location.search); q.delete("novo"); history.replaceState(null, "", q.toString() ? "?" + q : location.pathname);
    await ACOES.novo();
  }
  if (VISTA_CODIGO) {                                    // a janela do código: o painel do controle e o aviso de que está aberta
    $("titulo-pagina").textContent = "código"; tituloCodigo();
    mostraDoca("controle");
    // o nome da janela: o "ir para lá" do simu acha esta (aberta pelo trilho); se ela for a outra página, ele a traz de volta
    let saiu = false;                                    // fechando, o "escondida" (que vem depois) não a traz de volta
    const ola = () => { if (!saiu) avisa("codigo", { oculto: document.hidden }); };   // escondida, o navegador atrasa o aviso (até 1 por minuto)
    window.name = "maisim-codigo"; addEventListener("pageshow", (e) => { window.name = "maisim-codigo"; if (e.persisted) { saiu = false; ola(); } });
    ola(); setInterval(ola, 3000); document.addEventListener("visibilitychange", ola);
    addEventListener("pagehide", () => { saiu = true; avisa("codigo-fechado"); });   // o nome fica (o "ir para lá" a traz de volta)
  }
})();
// o título da janela do código: o circuito a que ela está ligada (sem o cabeçalho, é onde aparece)
function tituloCodigo() { if (VISTA_CODIGO) document.title = `código · ${($("sel-modelo").value || "").split("/").pop() || "sem circuito"}`; }
// o que vem da outra janela
// as janelas à parte (o código, o scope) avisam a cada 3 s e, ao fechar, dizem; cada uma conta por si (duas abertas, fechar
// uma não devolve a coluna). Sem notícia, a janela fechou: 8 s, ou 2,5 min se ela está escondida (o navegador atrasa os avisos
// de uma aba escondida, até 1 por minuto; senão a faixa ia e voltava)
const fora = { codigo: new Map(), scope: new Map() };
function marcaFora(tipo, de, on, oculto) {
  if (VISTA_CODIGO) return;
  const m = fora[tipo], cls = `${tipo}-fora`; clearTimeout(m.get(de));
  if (on) m.set(de, setTimeout(() => marcaFora(tipo, de, false), oculto ? 150000 : 8000)); else m.delete(de);
  const antes = document.body.classList.contains(cls); document.body.classList.toggle(cls, m.size > 0);
  if (antes !== m.size > 0) requestAnimationFrame(() => { if (dados) reajustaAspecto(); });   // a coluna virou faixa (ou voltou): o desenho acompanha
}
// "ir para lá": a janela com aquele nome para a frente (a mesma, sem recarregar); já em outra página, volta para lá. O navegador
// só acha pelo nome as janelas abertas daqui (pelo trilho): uma aberta à parte (outra aba) não; aí, em vez de abrir outra, diz
function irPara(tipo, nome, url, eLa) {
  const w = window.open("", nome); if (!w) return;
  let vazia = true, la = false; try { vazia = w.location.href === "about:blank"; la = !vazia && eLa(w.location); } catch (e) { vazia = false; }
  if (vazia && fora[tipo].size) { w.close(); msg(`${tipo === "scope" ? "o scope" : "o código"} está aberto em outra aba do navegador: vá até ela`, "ok"); return; }
  if (!la) w.location.href = url;
  w.focus();
}
$("scope-fora-bt").onclick = () => { document.body.classList.add("scope-aqui"); requestAnimationFrame(() => { if (dados) reajustaAspecto(); }); };
$("scope-fora-ir").onclick = () => irPara("scope", "maisim-scope", "/maisim/scope/?janela=1", (l) => l.pathname.startsWith("/maisim/scope"));
async function circuitoMudou(m) {                       // a outra janela mudou o circuito (ou abriu outro): o desenho e o controle acompanham
  try {
    const j = await api("editor/estado"), outro = !!(m.outro && m.arq && m.arq !== ed.abertoSel);   // a mesma janela reabrindo o mesmo: nada a refazer
    if (j.fechado) { mostraFechado(j); return; }                                        // a outra janela fechou o circuito
    if (outro && m.arq !== $("sel-modelo").value && [...$("sel-modelo").options].some((o) => o.value === m.arq)) { $("sel-modelo").value = m.arq; mostraModelo(); }
    if (m.arq) ed.abertoSel = m.arq;
    const fol = folhaAtual; dados = j; if (!dados.folhas[fol]) folhaAtual = "0";
    if (m.sujo !== undefined) marcaSujo(m.sujo);
    desenha(); mostraProps(); if (outro) ajusta();
    if (outro && typeof recarregaControle === "function") recarregaControle(); else if (typeof ligacoesMudaram === "function") ligacoesMudaram();
    if (outro) tituloCodigo();
  } catch (e) { /* fica o de antes */ }
}
if (canal) canal.onmessage = async (ev) => {
  const m = ev.data || {}; if (m.de === EU) return;
  if (m.tipo === "controle" && typeof sincronizaControle === "function") sincronizaControle();
  else if (m.tipo === "circuito") circuitoMudou(m);
  else if (m.tipo === "rodada") { if (sim.estado !== "rodando" && sim.estado !== "pausada") try { acompanha(await api("editor/rodada")); } catch (e) { /* ok */ } }
  else if (m.tipo === "codigo" || m.tipo === "codigo-fechado") marcaFora("codigo", m.de, m.tipo === "codigo", m.oculto);
  else if (m.tipo === "scope" || m.tipo === "scope-fechado") marcaFora("scope", m.de, m.tipo === "scope" && m.vivo !== false, m.oculto);   // em Comparar, ela não mostra o ao vivo
};
addEventListener("storage", (ev) => {                   // Δt e tempo final mudados na outra janela (o Ts do controle depende deles)
  if (ev.key !== "maisim-simu-sim") return;
  try { Object.assign(sim.par, JSON.parse(ev.newValue || "{}")); } catch (e) { /* ok */ }
  if (typeof infoTs === "function" && $("ctl-ts")) { infoTs(); infoAtraso(); }
});
