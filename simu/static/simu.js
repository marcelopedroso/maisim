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
    atuFundo: "#fff7e6", atuBorda: "#d97706", atuIcone: "#b45309", atuTexto: "#92400e", th: "#c2410c", fioTH: "#ea580c", thFundo: "#fff1e6" },
  escuro: { lk: "#8fa2ff", fioLK: "#6d86ff", ct: "#4fc56c", fioCT: "#4fc56c", rot: "#6ee7a0", par: "#f08ae0", nome: "#e6e8ec", sub: "#b39dff",
    cartao: "#171a21", corpo: "#1c2240", ctFundo: "#13261a", subFundo: "#221d38", bordaSM: "#5b4a9c", grade: "#2a303a", seta: "#fb923c",
    texto: "#e6e8ec", texto2: "#cbd5e1", ampFundo: "#0c2a3a", ampTexto: "#7dd3fc", erro: "#f87171", fraco: "#6b7480", liga: "#4ade80",
    atuFundo: "#33280f", atuBorda: "#d97706", atuIcone: "#fbbf24", atuTexto: "#fcd34d", th: "#fb923c", fioTH: "#f97316", thFundo: "#2e1a0c" } };
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
// o nome de cada tipo, no idioma da página (simu.descr.<tipo> no dicionário, lido na hora de mostrar); tipo sem nome: ""
const descrTipo = (t) => { const k = "simu.descr." + t; return maisimI18n.tem(k) ? tr(k) : ""; };
// os blocos com useExternal (Marcelo, 24/10): com a caixinha marcada, o Gecko tira estes parâmetros das entradas, a partir da
// entrada de índice `de`, nesta ordem, e ignora o que está no painel. cx: o nome da caixinha no Gecko (no HYS, "external");
// par: o nome curto do parâmetro; simb: o nome junto do borne (não se traduz; o LIMIT e o HYS como o Gecko os escreve)
// SIGNAL (SignalCalculatorExternalWrapper: AMPLITUDE_INDEX 0 … DUTY_INDEX 4): as 5 entradas, amplitude, f, offset, fase e d;
// LIMIT (LimitCalculatorExternal): a entrada 1 é o sinal, a 2 o mínimo e a 3 o máximo; HYS (HysteresisCalculatorExternal):
// a 1 é o sinal e a 2 o h
const EXTERNA = {
  SIGNAL: { cx: "useExternal", de: 0, pars: [{ par: "amplMAX", simb: "Â", k: "simu.ext_amplitude" }, { par: "f", simb: "f", k: "simu.ext_freq" },   // i18n-ok (símbolo)
    { par: "offset", simb: "off", k: "simu.ext_offset" }, { par: "phase", simb: "φ", k: "simu.ext_fase" }, { par: "d", simb: "d", k: "simu.ext_duty" }] },
  LIMIT: { cx: "useExternal", de: 1, pars: [{ par: "min", simb: "min", k: "simu.ext_min" }, { par: "max", simb: "max", k: "simu.ext_max" }] },
  HYS: { cx: "external", de: 1, pars: [{ par: "h", simb: "h", k: "simu.ext_h" }] },
};
// o bloco com as entradas externas (tem todas as entradas: o Gecko já o expandiu): a linha da tabela; senão null
const externaDe = (e) => { const x = EXTERNA[e.tipo]; return x && e.entradas.length === x.de + x.pars.length ? x : null; };
// os bornes das entradas externas, na ordem de pars (os de antes, como o sinal do LIMIT, ficam de fora); sem elas, null
const bornesExternos = (e) => { const x = EXTERNA[e.tipo], t = x && e.terminais.filter((u) => u.lado === "e");
  return t && t.length === x.de + x.pars.length ? t.slice(x.de) : null; };
const SIMBOLO = { LIMIT: "LIM", CONST: "C", SIGNAL: "∿", GATE: "G", GAIN: "K", ADD: "+", SUB: "−", NOT: "¬", AND: "&", DELAY: "Δt", GE: "≥", VOLT: "V", AMP: "A" };
const UNID = { resistance: "Ω", inductance: "H", capacitance: "F", amplitude: "V", dcValue: "V", frequency: "Hz", onResistance: "Ω",
  offResistance: "Ω", frequenz: "Hz", phaseDegrees: "°", phase: "°", initialCurrent: "A" };
// a rede térmica (aba Térmica): Rth, Cth, DT e HEAT-SOURCE com dois terminais, desenhados como R, C, fonte de tensão e de
// corrente (o Gecko os modela assim: temperatura ~ tensão, calor ~ corrente); o Pv (a perda de um componente vira calor no
// nó da saída dele) e o TREF (a referência: o zero térmico) com um só (ipes.py, TERMICOS)
const FORMA_TERMICA = { Rth: "R", Cth: "C", DT: "U", "HEAT-SOURCE": "I" };
const UNID_TERMICA = { Rth: ["resistance", "K/W"], Cth: ["capacitance", "J/K"], DT: ["dcValue", "°C"], "HEAT-SOURCE": ["dcValue", "W"] };
const COM_PERDA = ["S", "IGBT", "MOSFET", "THYR", "D"];      // o que um Pv pode aquecer (os semicondutores do Gecko)
const CAMPOS_PERDA = ["uF", "rON", "k_on", "k_off", "uK"];  // o modo simples de perdas do Gecko (LossCalculationSimple)
const PERDAS_FLOW = ["total", "conduction", "switching"];  // o que o FLOW lê do Pv (losscomp no .ipes)
const PREFIXO_FLOW = { total: "Pv", conduction: "Pcond", switching: "Psw" };
const pvsDe = (f, nome) => f.elementos.filter((x) => x.tipo === "Pv" && x.mede[0] === nome);   // os Pv que aquecem o componente
const semPonto = (n) => String(n || "").replace(/\./g, "").replace(/[^A-Za-z0-9_]/g, "_");     // IGBT.1 → IGBT1 (nomes de sinal)
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
// os nomes dos sinais em notação matemática, como no scope (Marcelo, 24/10: "mostrar no circuito as notações, o v_o"):
// v_o → v itálico com o "o" subscrito, i_Lf_a → i com "Lf,a"; a letra (uma só) em itálico, na fonte do LaTeX, o subscrito em pé
const RE_MAT = /(^|[^\p{L}\p{N}_])([A-Za-z]{1,4})_([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)(?![\p{L}\p{N}_])/gu;   // a mesma regra do scope
function partesMat(texto) {                            // [{txt}] ou [{base, sub}] na ordem do texto
  const s = String(texto), out = []; let i = 0, m; RE_MAT.lastIndex = 0;
  while ((m = RE_MAT.exec(s))) {
    const ini = m.index + m[1].length;
    if (ini > i) out.push({ txt: s.slice(i, ini) });
    out.push({ base: m[2], sub: m[3].split("_").join(",") }); i = RE_MAT.lastIndex;
  }
  if (i < s.length) out.push({ txt: s.slice(i) });
  return out;
}
const MAT = "KaTeX_Main, 'Latin Modern Roman', 'Times New Roman', serif";
function textoMat(pai, x, y, s, at = {}) {             // como texto(), com o nome em notação (o original no data-txt)
  const t = texto(pai, x, y, "", at); poeMat(t, s, parseFloat(at["font-size"]) || 0.62 * G); return t;
}
function poeMat(t, s, fs) {                            // enche um <text> já feito com o nome em notação (tamanho fs, px); o original no data-txt
  t.textContent = ""; t.setAttribute("data-txt", s);
  for (const q of partesMat(s)) {
    if (q.txt != null) { no("tspan", {}, t).textContent = q.txt; continue; }
    no("tspan", q.base.length === 1 ? { "font-family": `KaTeX_Math, ${MAT}`, "font-style": "italic", "font-size": fs * 1.18, "font-weight": 400 }
      : { "font-family": MAT, "font-size": fs * 1.1, "font-weight": 400 }, t).textContent = q.base;
    no("tspan", { "font-family": MAT, "font-size": fs * 0.82, "font-weight": 400, dy: fs * 0.3 }, t).textContent = q.sub;
    no("tspan", { "font-size": fs * 0.01, dy: -fs * 0.3 }, t).textContent = "\u200b";   // volta à linha de base
  }
  return t;
}
// o mesmo nome em HTML (a lista de painéis do sinal; Marcelo, 24/10: "no seletor de painel trazer a notação também"): a
// letra em itálico na fonte do LaTeX, o subscrito em pé; o resto do texto escapado
function htmlMat(s) {
  return partesMat(s).map((q) => q.txt != null ? escT(q.txt)
    : `<span class="mat"><span class="${q.base.length === 1 ? "mat-l" : "mat-b"}">${escT(q.base)}</span><sub>${escT(q.sub)}</sub></span>`).join("");
}
const largMat = (s) => partesMat(s).reduce((n, q) => n + (q.txt != null ? q.txt.length : q.base.length * 1.1 + q.sub.length * 0.8), 0);   // em caracteres
function texto(pai, x, y, s, at = {}) { const t = no("text", Object.assign({ x: x * G, y: y * G, "font-size": 0.62 * G, "dominant-baseline": "middle" }, at), pai); t.textContent = s; return t; }
const P = (p) => `${p[0] * G},${p[1] * G}`;
const ICONE_TOPO = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 1.8 14 5 8 8.2 2 5z" fill="currentColor" fill-opacity=".85"/><path d="M2 8l6 3.2L14 8" opacity=".6"/><path d="M2 11l6 3.2 6-3.2" opacity=".35"/></svg>`;
const soma = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1]];

// ---------------------------------------------------------------- símbolos dos elementos de dois pinos
// bolinhas de junção. Regra do Gecko (PotentialArea.geometricOnSamePotential): há ligação onde uma PONTA (de conexão ou
// terminal de componente) cai em qualquer ponto de outra conexão; cruzamento sem ponta não liga. Bolinha onde três ou mais
// ramos se encontram e há uma ponta: conexão que passa pelo ponto conta 2 ramos; ponta ou terminal, 1. Potência e controle à parte.
const domTerm = (e, t) => t.dom || (e.dom === "CONTROL" || e.dom === "THERM" ? e.dom : "LK");
const corFio = (d) => d === "CONTROL" ? COR.fioCT : d === "THERM" ? COR.fioTH : COR.fioLK;   // a conexão térmica em laranja
const corDom = (d) => d === "LK" ? COR.lk : d === "THERM" ? COR.th : COR.ct;                // e os terminais
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
    no("circle", { class: "juncao", cx: x * G, cy: y * G, r: 0.24 * G, fill: corFio(d) }, g);
  }
}
// medidores: o nome com que o sinal vai para o /maisim/scope (o rótulo da saída, ou o nome do bloco, como em rodar() no servidor)
// dentro de um subcircuito, o nome leva o SM na frente (SM_1_vCSm), como em rodar() no servidor
// o nome que o servidor dá (dados.canais: com o desempate de dois rótulos que viram o mesmo nome, v-o e v+o → v_o e v_o_);
// sem ele (um componente fora dos dois destinos), o nome montado aqui, como antes
// um bloco com várias saídas (abc>>dq, DEMUX, Java…) dá um canal por saída (dados.canais_saidas); o canal dele é o da 1ª
const canaisDe = (e, fid = folhaAtual) => (fid === "0" && dados && dados.canais_saidas && dados.canais_saidas[e.nome]) || [canalScope(e, fid)];
const canalScope = (e, fid = folhaAtual) => {
  const el = fid === "0" ? e.nome : `${dados.folhas[fid].nome}#${e.nome}`;
  if (fid === "0" && dados && dados.canais_saidas && dados.canais_saidas[el]) return dados.canais_saidas[el][0];
  if (dados && dados.canais && dados.canais[el]) return dados.canais[el];
  const c = (e.saidas[0] || e.nome).replace(/[^A-Za-z0-9_]/g, "_");
  return fid === "0" ? c : `${prefixoSub(dados.folhas[fid].nome)}_${c}`; };
const MEDIDOR = new Set(["VOLT", "AMP", "TEMP", "FLOW"]);     // TEMP e FLOW: a temperatura e a perda (aba Measure, térmicos)
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
    for (const e of f.elementos) if ((MEDIDOR.has(e.tipo) || ehTag(e) || ehSinal(e, fid)) && noScope(e)) out.push(...canaisDe(e, fid));   // só os gravados (→ Scope)
  return [...new Set(out)].sort();
}
function leLayoutCircuito() {                          // o guardado (v5; o de antes, v4, pelo nome), o padrão ou o automático
  const c = circuitoDoLayout(); if (!c) return null;
  // o título fica em português: vai guardado no layout (o mesmo que o scope.js monta e compara); o scope mostra no idioma
  const auto = () => ({ colunas: 2, itens: [{ secao: nomeDoLayout() }, { titulo: "Sinais da rodada", sinais: canaisDoCircuito().slice(0, 8), largura: 1 }] });   // o automático do scope · i18n-ok: protocolo
  let j = null; try { j = JSON.parse(localStorage.getItem(`maisim-scope-layout-v5:${c}`) || "null"); } catch (e) { /* o próximo */ }
  if (j && Array.isArray(j.itens)) return j.itens.length ? j : auto();   // guardado vazio: o automático (como no scope)
  if (!/^novo[: ]/.test(c)) try { j = JSON.parse(localStorage.getItem(`maisim-scope-layout-v4:${nomeDoLayout()}`) || "null");
    if (j && Array.isArray(j.itens) && j.itens.length) return j; } catch (e) { /* o próximo */ }
  if (padraoLayout.chave === c && padraoLayout.L) return JSON.parse(JSON.stringify(padraoLayout.L));
  return auto();
}
function gravaLayoutCircuito(L) {
  try { localStorage.setItem(`maisim-scope-layout-v5:${circuitoDoLayout()}`, JSON.stringify(L)); return true; } catch (e) { msg(tr("simu.layout_nao_guardou"), "erro"); return false; }
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
function gruposDoLayout(L) {                             // [{secao, paineis: [item]}]; os painéis antes da 1ª seção ficam em "(sem seção)"; os XY (os sinais vêm do modo deles) não
  const gs = []; let g = null;                            // (secao "": o nome mostrado é o do idioma, nomeSecao)
  for (const x of L.itens) { if (x.secao) { g = { secao: x.secao, item: x, paineis: [] }; gs.push(g); } else if (!x.xy) { if (!g) { g = { secao: "", item: null, paineis: [] }; gs.push(g); } g.paineis.push(x); } }
  return gs;
}
const nomeSecao = (g) => g.secao || tr("simu.sem_secao");
// a cor escolhida aqui vale também no scope (Marcelo, 24/10: "a cor quando seleciona pelo circuito tb ir pra lá"): a cor do
// sinal no scope fica no navegador (maisim-scope-cores, a mesma de "cor, espessura e traço" lá); "Padrão" tira a de lá também.
// O scope aberto (noutra janela ou aqui dentro) ouve o storage e redesenha
// ao abrir um circuito (ou quando as cores dele mudam por outro caminho), as cores escolhidas nele vão para o scope também;
// só quando mudam (o desenho se refaz muito) e sem apagar as do scope que este circuito não escolheu
let coresSincronizadas = null;
function sincronizaCores() {
  const c = (dados && dados.cores_escolhidas) || {}, k = JSON.stringify(c);
  if (k === coresSincronizadas) return; coresSincronizadas = k;
  try { const s = JSON.parse(localStorage.getItem("maisim-scope-cores") || "{}") || {}; let mudou = false;
    for (const [canal, cor] of Object.entries(c)) if (cor && s[canal] !== cor) { s[canal] = cor; mudou = true; }
    if (mudou) localStorage.setItem("maisim-scope-cores", JSON.stringify(s)); } catch (e) { /* sem o navegador guardar: só no circuito */ }
}
function corNoScope(canal, cor) {
  try { const c = JSON.parse(localStorage.getItem("maisim-scope-cores") || "{}") || {};
    if (cor) c[canal] = cor; else delete c[canal];
    localStorage.setItem("maisim-scope-cores", JSON.stringify(c)); } catch (e) { /* sem o navegador guardar: só no circuito */ }
}
// os painéis do scope de um sinal (Marcelo, 24/10: um sinal em vários painéis): a seção numa lista; os painéis dela, um
// quadradinho cada (marcar põe o sinal naquele painel, desmarcar tira só dele; nos de outras seções ele fica, e a linha
// "também em" diz onde); "+ novo painel…" cria um painel na seção já com o sinal, e o ✕ apaga painéis da seção
function ligaNoPainel(np) {
  const canal = np.dataset.canal, selS = np.querySelector("#p-secao"), lista = np.querySelector("#p-paineis");
  const btNovo = np.querySelector("#p-painel-novo"), btApaga = np.querySelector("#p-painel-apaga"), tambem = np.querySelector("#p-tambem");
  const tituloDe = (p) => p.titulo || tr("simu.sem_titulo"), tem = (p) => Array.isArray(p.sinais) && p.sinais.includes(canal);
  // a impressão de um painel: dois sem título (ou de mesmo título) na mesma posição não passam um pelo outro se algo mudou
  const impressao = (p) => JSON.stringify({ titulo: p.titulo, sinais: p.sinais, largura: p.largura });
  const kDaSecao = (nome) => gruposDoLayout(leLayoutCircuito()).findIndex((g) => g.secao === nome);
  // enquanto o padrão do circuito vem, tudo espera (marcar agora gravaria o automático, e o padrão não entraria mais)
  let esperando = true;
  // a seção mostrada: a escolhida (a posição dela na lista; -1: nenhuma), ou a 1ª em que o sinal está
  const desenhaOps = (secaoEscolhida) => {
    if (!np.isConnected) { if (redesenhaNoPainel === redesenha) redesenhaNoPainel = null; return; }   // o painel de propriedades já é outro
    const gs = gruposDoLayout(leLayoutCircuito());
    const sAtual = secaoEscolhida === -1 ? -1 : gs[secaoEscolhida] ? secaoEscolhida : gs.findIndex((g) => g.paineis.some(tem));
    // data-secao, data-titulo: o nome de verdade (a conferência abaixo não depende do texto mostrado, que muda com o idioma)
    selS.innerHTML = `<option value="">—</option>` + gs.map((g, k) => `<option value="${k}" data-secao="${escT(g.secao)}"${k === sAtual ? " selected" : ""}>${escT(nomeSecao(g))}</option>`).join("") + `<option value="+">${escT(tr("simu.op_nova_secao"))}</option>`;
    const g = gs[sAtual], trava = esperando ? " disabled" : "";
    lista.innerHTML = !g ? `<i>${escT(tr(gs.some((x) => x.paineis.some(tem)) ? "simu.escolha_secao" : "simu.op_fora_painel"))}</i>`
      : !g.paineis.length ? `<i>${escT(tr("simu.sem_paineis"))}</i>`
      : g.paineis.map((p, k) => `<label><input type="checkbox" data-k="${k}" data-titulo="${escT(p.titulo || "")}" data-impressao="${escT(impressao(p))}"${tem(p) ? " checked" : ""}${trava}><span title="${escT(tituloDe(p))}">${htmlMat(tituloDe(p))}</span></label>`).join("");
    const fora = gs.flatMap((x, k) => (k === sAtual ? [] : x.paineis.filter(tem).map((p) => `${nomeSecao(x)} › ${tituloDe(p)}`)));
    tambem.textContent = fora.length ? tr("simu.tambem_em", { onde: fora.join(" · ") }) : ""; tambem.hidden = !fora.length;
    selS.disabled = esperando; btNovo.disabled = !g || esperando; btApaga.disabled = !g || !g.paineis.length || esperando;
  };
  const mudou = () => { msg(tr("simu.layout_mudou"), "erro"); desenhaOps(); };
  // a seção da lista no layout L, conferida pelo nome: outra janela pode ter mexido no layout (as posições seriam outras)
  const secaoDaLista = (L) => { const o = selS.selectedOptions[0];
    const g = o && o.dataset.secao != null ? gruposDoLayout(L)[+selS.value] : null; return g && g.secao === o.dataset.secao ? g : null; };
  selS.onchange = async () => {
    if (selS.value === "+") {
      const r = await modal({ titulo: escT(tr("simu.m_nova_secao")), campos: [{ nome: "secao", rotulo: escT(tr("simu.m_nome_secao")), valor: "" }, { nome: "painel", rotulo: escT(tr("simu.m_painel")), valor: escT(canal) }], ok: escT(tr("simu.criar")) });
      const s = r && r.secao.trim(), t = (r && r.painel.trim()) || canal;
      if (!s) { desenhaOps(); return; }
      const L = leLayoutCircuito();
      L.itens.push({ secao: s }, { titulo: t, sinais: [canal], largura: 1 });
      if (gravaLayoutCircuito(L)) msg(tr("simu.entra_no_painel", { canal, titulo: t, secao: s }), "ok");
      desenhaOps(gruposDoLayout(L).length - 1); return;   // a seção nova é a última
    }
    desenhaOps(selS.value === "" ? -1 : +selS.value);
  };
  lista.onchange = (ev) => {                             // um quadradinho: o sinal entra ou sai SÓ deste painel
    const cx = ev.target; if (!cx.matches("input[data-k]")) return;
    const L = leLayoutCircuito(), g = secaoDaLista(L), painel = g && g.paineis[+cx.dataset.k];
    if (!painel || impressao(painel) !== cx.dataset.impressao) return mudou();
    const sinais = Array.isArray(painel.sinais) ? painel.sinais.filter((c) => c !== canal) : [];
    painel.sinais = cx.checked ? [...sinais, canal] : sinais;
    if (gravaLayoutCircuito(L)) msg(tr(cx.checked ? "simu.entra_no_painel" : "simu.sai_do_painel", { canal, titulo: tituloDe(painel), secao: nomeSecao(g) }), "ok");
    desenhaOps(+selS.value);
  };
  btNovo.onclick = async () => {                         // um painel novo no fim da seção, já com o sinal
    const g = secaoDaLista(leLayoutCircuito()); if (!g) return mudou();
    const r = await modal({ titulo: escT(tr("simu.m_novo_painel", { secao: nomeSecao(g) })), campos: [{ nome: "painel", rotulo: escT(tr("simu.m_titulo_painel")), valor: escT(canal) }], ok: escT(tr("simu.criar")) });
    const t = r && r.painel.trim(); if (!t) return;
    const L = leLayoutCircuito(), g2 = secaoDaLista(L); if (!g2 || g2.secao !== g.secao) return mudou();
    const ultimo = g2.paineis.length ? g2.paineis[g2.paineis.length - 1] : g2.item;
    L.itens.splice(ultimo ? L.itens.indexOf(ultimo) + 1 : L.itens.length, 0, { titulo: t, sinais: [canal], largura: 1 });
    if (gravaLayoutCircuito(L)) msg(tr("simu.entra_no_painel", { canal, titulo: t, secao: nomeSecao(g2) }), "ok");
    desenhaOps(+selS.value);
  };
  // ✕: apagar painéis da seção (um criado por engano polui a lista; Marcelo, 24/10) — escolhe numa janela, com quantos sinais
  // cada um tem; os sinais só saem do layout do scope (a gravação não muda), e o scope aberto acompanha
  btApaga.onclick = async () => {
    const g = secaoDaLista(leLayoutCircuito());
    if (!g || !g.paineis.length) return mudou();
    let caixa = null; const marcas = g.paineis.map(impressao);   // como estavam ao abrir a janela
    const html = `<div class="apaga-paineis">${g.paineis.map((p, k) => `<label><input type="checkbox" data-k="${k}"> ${escT(tituloDe(p))}
      <small>${escT(tr("simu.n_sinais_painel", { n: (p.sinais || []).length }))}</small></label>`).join("")}</div>`;
    const r = await modal({ titulo: escT(tr("simu.m_apagar_paineis", { secao: nomeSecao(g) })), texto: escT(tr("simu.m_apagar_paineis_txt")), html,
      ok: escT(tr("simu.apagar")), perigo: true, monta: (f) => { caixa = f; } });
    if (!r || !caixa) return;
    const ks = [...caixa.querySelectorAll("input[data-k]:checked")].map((i) => +i.dataset.k);
    if (!ks.length) return;
    const L = leLayoutCircuito(), g2 = secaoDaLista(L);
    if (!g2 || g2.secao !== g.secao || ks.some((k) => !g2.paineis[k] || impressao(g2.paineis[k]) !== marcas[k])) return mudou();
    const tira = new Set(ks.map((k) => g2.paineis[k])), resto = L.itens.filter((x) => !tira.has(x));
    if (!resto.some((x) => !x.secao)) { msg(tr("simu.nao_apaga_tudo"), "erro"); return; }   // sem nenhum painel (só seções), o scope voltaria ao automático
    L.itens = resto;
    if (gravaLayoutCircuito(L)) msg(tr("simu.paineis_apagados", { n: tira.size, secao: nomeSecao(g2) }), "ok");
    const k = kDaSecao(g2.secao); desenhaOps(k >= 0 ? k : undefined);   // pela seção (o nome; as posições mudaram)
  };
  // o layout mudou noutra janela (o scope): refaz, na mesma seção se ela ainda existe (pelo nome); com "—", fica em "—"
  const redesenha = () => { const o = selS.selectedOptions[0], nome = o && o.dataset.secao;
    if (nome == null) return desenhaOps(o && o.value === "" ? -1 : undefined);
    const k = kDaSecao(nome); desenhaOps(k >= 0 ? k : undefined); };
  redesenhaNoPainel = redesenha;
  desenhaOps();
  lePadraoLayout().then(() => { esperando = false; desenhaOps(); });
}
// a tag (scope e controle): um ganho 1 do Gecko (r0 = 1) chamado TAG.k — repassa o sinal ligado na entrada, e o nome da saída é o
// nome do sinal no /maisim/scope e no m[...] do controle (como um medidor). Para levar um sinal para fora de um subcircuito
// (por um Control Terminal) e dar a ele o nome que quiser, ou marcar qualquer ponto de controle
// para onde vai o sinal deste componente (Marcelo, 24/10: as duas caixinhas do painel, "→ Scope" e "→ Controle"; vai junto
// com a aparência do circuito): no scope, vira coluna gravada na rodada; no controle, fica no m[...]. O servidor diz quem está
// fora de cada um (fora_scope, fora_controle; um servidor de antes, só "fora": fora dos dois)
const foraDe = (e, k) => !!(dados && e.uid && (dados[`fora_${k}`] || dados.fora || []).includes(e.uid));
const noScope = (e) => !foraDe(e, "scope"), noControle = (e) => !foraDe(e, "controle");
const destinoDe = (e) => noScope(e) ? (noControle(e) ? "ambos" : "scope") : noControle(e) ? "controle" : "fora";
// componentes cujo sinal vai para o scope e o controle: na folha principal, os blocos de controle com saída; nos SMs, os
// medidores e as tags (sinais_da_rodada, no servidor)
const ehSinal = (e, fid) => fid === "0" ? e.dom === "CONTROL" && !["TERM", "GATE", "SCOPE"].includes(e.tipo) && e.saidas.length > 0
  : MEDIDOR.has(e.tipo) || ehTag(e);
const ehTag = (e) => e.tipo === "GAIN" && /^TAG\.\d+$/.test(e.nome);
const TAG_ITEM = { enum: "MAISIM_TAG", dom: "CONTROL", typ: 7, classe: "ReglerGain", id: "TAG", get nome() { return tr("simu.tag_item"); }, criar: "GAIN" };
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
  const saiu = atual && !comps.some((c) => c.nome === atual);   // a escolhida não está mais no nó
  const tit = tr(`simu.t_onde_${k ? "garra" : "ponta"}${saiu ? "_saiu" : ""}`, { no: no_ });
  return `<label class="ponta-no"><span>${escT(tr(k ? "simu.garra_no" : "simu.ponta_no"))}</span><input data-ponta="${k ? "-" : "+"}" value="${escT(atual || tr("simu.automatico"))}"
    placeholder="${escT(tr("simu.ph_busca"))}" autocomplete="off" title="${escT(tit)}"></label>`;
}
const corCanal = (canal, tipo = "VOLT") => (dados && dados.cores && dados.cores[canal]) || (tipo === "AMP" ? "#0ea5e9" : tipo === "TEMP" || tipo === "FLOW" ? "#f97316" : "#eab308");
// as marcas levam o nome do medidor (data-medidor): clicar nelas abre o medidor (Marcelo, 22/10: "clicar na bolinha do sensor
// e ele abrir os dados")
const marcaDe = (g, medidor, x, y) => no("g", Object.assign({ class: "medido", transform: `translate(${x * G},${y * G})` },
  medidor ? { "data-medidor": medidor, title: tr("simu.t_marca", { medidor }) } : {}), g);
function marcaMedida(g, e, canal, medidor) {           // no componente medido: um "A" (azul Hall) e o nome do sinal no scope
  const [t1, t2] = e.terminais, c = [(t1.x + t2.x) / 2, (t1.y + t2.y) / 2];
  const emCima = txtDe(e).ancora === "middle";                       // deitado com o nome em cima: a marca vai mais à esquerda
  const p = emCima ? [c[0] - 1.9, c[1] - 1.15] : [c[0] - 1.1, c[1] - 1.1], cor = corCanal(canal, "AMP");
  const gg = marcaDe(g, medidor, p[0], p[1]);
  no("circle", { cx: 0, cy: 0, r: 0.42 * G, fill: COR.ampFundo, stroke: cor, "stroke-width": 2 }, gg);
  texto(gg, 0, 0.02, "A", { "text-anchor": "middle", fill: COR.ampTexto, "font-size": 0.5 * G, "font-weight": 700, "dominant-baseline": "middle" });
  textoMat(gg, -0.6, 0.02, canal, { "text-anchor": "end", fill: COR.texto2, "font-size": 0.48 * G, "dominant-baseline": "middle" });
}
function marcaNo(g, x, y, [canal, sinal, medidor]) {   // num nó medido pelo voltímetro: "V+" (vermelho) / "V−" (preto) e o nome do sinal
  const gg = marcaDe(g, medidor, x, y), cor = corCanal(canal, "VOLT");
  no("rect", { x: -0.15 * G, y: -1.05 * G, width: 1.05 * G, height: 0.62 * G, rx: 0.2 * G, fill: sinal === "+" ? "#dc2626" : "#111827", stroke: cor, "stroke-width": 2 }, gg);
  texto(gg, 0.37, -0.72, "V" + sinal, { "text-anchor": "middle", fill: "#fff", "font-size": 0.42 * G, "font-weight": 700, "dominant-baseline": "middle" });
  textoMat(gg, 1.05, -0.72, canal, { fill: COR.texto2, "font-size": 0.45 * G, "dominant-baseline": "middle" });
}
// a cor da etiqueta de um sinal: a do canal (a escolhida, ou a padrão dos medidores); um bloco ou uma tag sem cor escolhida
// fica com a cor do controle (o scope dá a da paleta dele)
const corSinal = (canal, e) => MEDIDOR.has(e.tipo) ? corCanal(canal, e.tipo) : (dados && dados.cores && dados.cores[canal]) || COR.ct;
// no painel: a cor do canal e a seção e o painel do scope de um sinal que vai para o scope (medidor, tag ou saída de bloco).
// Um bloco com várias saídas (abc>>dq, DEMUX, PMSM…) tem um canal por saída: em cima, uma escolha de qual (pelo nome do
// canal, em notação), e a cor, a seção e os painéis valem para a escolhida — que fica ao refazer o painel (saidaNoPainel)
let saidaNoPainel = { nome: null, k: 0 };
const saidaEscolhida = (e, cs) => (saidaNoPainel.nome === e.nome && saidaNoPainel.k < cs.length ? saidaNoPainel.k : 0);
function caixaScope(e) {
  const cs = canaisDe(e), k = saidaEscolhida(e, cs);
  const canal = cs[k], cor = corSinal(canal, e), escolhida = !!(dados.cores_escolhidas && dados.cores_escolhidas[canal]);
  const amostras = e.tipo === "AMP" ? ["#0ea5e9", "#eab308", "#06b6d4", "#d946ef", "#22c55e", "#f97316"] : ["#eab308", "#06b6d4", "#d946ef", "#22c55e", "#0ea5e9", "#f97316"];
  const ativa = (c) => cor === c && (MEDIDOR.has(e.tipo) || escolhida);   // um bloco sem cor escolhida: nenhuma (a do scope)
  const saidas = cs.length > 1 ? `<div class="saida-canal" role="group" aria-label="${escT(tr("simu.saida_canal"))}"><span>${escT(tr("simu.saida_canal"))}</span>${cs.map((c, i) =>
    `<button type="button" data-k="${i}" data-canal="${escT(c)}" class="${i === k ? "ativo" : ""}" aria-pressed="${i === k}" title="${escT(tr("simu.t_saida_canal", { canal: c, n: i + 1 }))}"><i style="--c:${escT(corSinal(c, e))}"></i>${htmlMat(c)}</button>`).join("")}</div>` : "";
  return `<div class="caixa-scope">${saidas}<div class="cor-canal" data-canal="${escT(canal)}"><span>${escT(tr("simu.cor_canal"))}</span>${amostras.map((c) => `<button class="amostra${ativa(c) ? " ativo" : ""}" data-cor="${c}" style="--c:${c}" title="${c}"></button>`).join("")}
      <input type="color" value="${/^#[0-9a-f]{6}$/i.test(cor) ? cor : "#888888"}" title="${escT(tr("simu.t_outra_cor"))}"><button class="padrao" title="${escT(tr("simu.t_cor_padrao"))}">${escT(tr("simu.cor_padrao"))}</button></div>
    ${circuitoDoLayout() ? `<div class="no-painel" data-canal="${escT(canal)}"><label><span>${escT(tr("simu.secao_scope"))}</span><select id="p-secao"></select></label>
      <div class="np-linha"><span>${escT(tr("simu.paineis_sinal"))}</span><div><div id="p-paineis" title="${escT(tr("simu.t_paineis"))}"></div>
        <div class="np-acoes"><button type="button" id="p-painel-novo">${escT(tr("simu.op_novo_painel"))}</button><button type="button" id="p-painel-apaga" class="p-painel-apaga" title="${escT(tr("simu.t_apagar_paineis"))}" aria-label="${escT(tr("simu.t_apagar_paineis"))}">✕</button></div>
        <div id="p-tambem" class="np-tambem" hidden></div></div></div></div>` : ""}</div>`;
}
// liga a caixa do scope no painel (a cor do canal, a seção e os painéis; num bloco de várias saídas, a escolha da saída)
function ligaCaixaScope(P, e) {
  const caixa = P.querySelector(".caixa-scope"); if (!caixa) return;
  caixa.querySelectorAll(".saida-canal [data-k]").forEach((b) => { b.onclick = () => {   // outra saída: a caixa se refaz para ela
    saidaNoPainel = { nome: e.nome, k: +b.dataset.k };                     // (simulando, o painel inteiro fica travado: nem chega aqui)
    caixa.outerHTML = caixaScope(e); ligaCaixaScope(P, e);
  }; });
  const cc = caixa.querySelector(".cor-canal");
  if (cc) {                                              // a cor do canal: guardada ao lado do circuito (<nome>.cores.json) e no meta da rodada
    const muda = async (cor) => { try { const j = await api("editor/cor", { canal: cc.dataset.canal, cor }); novoEstado(j); corNoScope(cc.dataset.canal, cor);
      msg(tr(cor ? "simu.d_cor" : "simu.d_cor_padrao", { canal: cc.dataset.canal, cor }), "ok"); } catch (er) { msg(er.message, "erro"); } };
    cc.querySelectorAll("[data-cor]").forEach((b) => { b.onclick = () => muda(b.dataset.cor); });
    cc.querySelector("input[type=color]").onchange = (ev) => muda(ev.target.value);
    cc.querySelector(".padrao").onclick = () => muda("");
  }
  const np = caixa.querySelector(".no-painel");
  if (np) ligaNoPainel(np);
}
// a etiqueta do scope (ao lado do medidor, ou na saída de um bloco): o nome do sinal no /maisim/scope, com a borda na cor do
// canal. destino: "ambos" e "scope" — cheia (gravada na rodada); "controle" — tracejada, com "m" no lugar da onda (só no
// m[...] do controle, não gravada); "fora" — apagada e tracejada (o sinal existe no circuito, mas não vira coluna nem m[...]).
// larg: a largura máxima (o nome longo é cortado com "…", como os outros rótulos; a dica tem o nome inteiro); fim: x é a
// ponta direita da etiqueta (a saída de um bloco espelhado, à esquerda dele)
function tagScope(g, x, y, canal, cor, destino = "ambos", { larg = Infinity, fim = false } = {}) {
  const fora = destino === "fora", soCtl = destino === "controle";
  const gg = no("g", Object.assign({ class: "tag-scope" + (fora ? " fora" : soCtl ? " so-controle" : destino === "scope" ? " so-scope" : ""),
    transform: `translate(${x * G},${y * G})` }, fora ? { opacity: 0.4 } : soCtl ? { opacity: 0.8 } : {}), g);
  no("title", {}, gg).textContent = tr(`simu.t_tag_${destino}`, { canal });
  const r = no("rect", Object.assign({ x: 0, y: -0.36 * G, width: 0, height: 0.72 * G, rx: 0.36 * G, fill: COR.cartao, stroke: cor, "stroke-width": 1.8 }, fora || soCtl ? { "stroke-dasharray": "3 2" } : {}), gg);
  if (soCtl) texto(gg, 0.47, 0.02, "m", { "text-anchor": "middle", fill: cor, "font-size": 0.46 * G, "font-weight": 700, "dominant-baseline": "middle" });
  else no("path", { d: `M${0.2 * G} ${0.05 * G}l${0.12 * G} ${-0.2 * G}l${0.14 * G} ${0.3 * G}l${0.14 * G} ${-0.24 * G}`, stroke: cor, "stroke-width": 1.4, fill: "none" }, gg);
  const t = textoMat(gg, 0.78, 0.02, canal, { fill: COR.texto, "font-size": 0.46 * G, "font-weight": 600, "dominant-baseline": "middle" });
  let w = 0.95 + 0.33 * largMat(canal);
  if (w > larg) { cortaAte(t, larg - 0.95); w = t.isConnected ? Math.min(w, 0.98 + t.getComputedTextLength() / G) : 0.78; }
  r.setAttribute("width", w * G);
  if (fim) gg.setAttribute("transform", `translate(${(x - w) * G},${y * G})`);
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
// ao lado do corpo, do lado oposto ao nome; é o sinal que o amperímetro mede. A fonte de tensão é gerador: a seta sai pelo +
// (do 2 para o 1), e a rodada troca o sinal da corrente dela (sentido_gerador, no servidor)
function setaCorrente(g, e) {
  const [t1, t2] = e.terminais.map((t) => [t.x, t.y])[e.tipo === "U" ? "reverse" : "slice"](), L = Math.hypot(t2[0] - t1[0], t2[1] - t1[1]) || 1;
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
  const th = e.dom === "THERM", cl = th ? COR.th : COR.lk;            // a rede térmica: o símbolo elétrico equivalente, em laranja
  const corpo = { class: "corpo", stroke: cl, "stroke-width": 1.6, fill: "none" };
  const poli = (pts, at = {}) => no("polygon", Object.assign({ points: pts.map(P).join(" ") }, corpo, at), g);
  const forma = th ? FORMA_TERMICA[e.tipo] || e.tipo : e.tipo;
  switch (forma) {
    case "R":
      linha(t1, a, corpo); linha(b, t2, corpo);
      poli([soma(a, n, 0.35), soma(b, n, 0.35), soma(b, n, -0.35), soma(a, n, -0.35)], { fill: th ? COR.thFundo : COR.corpo }); break;
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
      if (forma === "U" && e.par.sourceType === 402) {
        let d = `M ${P(soma(c, n, -0.5))}`; for (let k = 1; k <= 20; k++) { const s = -0.5 + k / 20; d += ` L ${P(soma(soma(c, n, s), u, 0.32 * Math.sin(2 * Math.PI * (s + 0.5))))}`; }
        no("path", Object.assign({ d }, corpo, { "stroke-width": 1.2 }), g);
      } else if (forma === "U") texto(g, c[0], c[1], th ? "T" : "=", { "text-anchor": "middle", fill: cl });   // DT: a temperatura definida
      else {                                     // fonte de corrente: a seta do Gecko, do terminal 1 para o 2 (ela empurra a corrente para fora pelo 2)
        linha(soma(c, u, -0.5), soma(c, u, 0.3), corpo);
        poli([soma(c, u, 0.55), soma(soma(c, u, 0.2), n, 0.24), soma(soma(c, u, 0.2), n, -0.24)], { fill: cl, "stroke-width": 0.8 });
      }
      if (forma === "U") { const mais = soma(soma(c, u, -1.25), n, 0.55); texto(g, mais[0], mais[1], "+", { "text-anchor": "middle", fill: cl, "font-size": 0.8 * G }); }
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
  if (e.dom === "THERM") {                             // K/W, J/K, °C e W sem prefixo (0,5 K/W, não 500 mK/W)
    const [k, u] = UNID_TERMICA[e.tipo] || []; if (!k || p[k] == null) return "";
    return (p[k + "_var"] ? `${p[k + "_var"]}= ` : "") + `${+Number(p[k]).toPrecision(3)} ${u}`;
  }
  if (e.tipo === "R") return v("resistance");
  if (e.tipo === "L") return v("inductance");
  if (e.tipo === "C") return v("capacitance");
  if ((e.tipo === "U" || e.tipo === "I") && p.sourceType === 400) return `← ${e.mede[0] || tr("simu.sem_sinal")}`;
  if (e.tipo === "U") return p.sourceType === 402 ? `${v("amplitude")} · ${si(p.frequency, "Hz")}` : si(p.dcValue, "V");
  return "";
}

// ---------------------------------------------------------------- folha
function desenha() {
  sincronizaCores();                                   // as cores escolhidas deste circuito também no scope (ao abrir)
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
  const marcas = [];                                   // [x, y, [canal, sinal, medidor]]: desenhadas no fim, sem uma cobrir a outra
  if (mostrar.medicoes) for (const e of f.elementos) if (e.tipo === "VOLT") {
    const canal = canalScope(e), pp = (dados.pontas && dados.pontas[canal]) || {}, comps = (dados.nos_medidos && dados.nos_medidos[folhaAtual]) || {};
    e.mede.slice(0, 2).forEach((no_, k) => {
      const t = no_ && pp[k ? "-" : "+"] && (comps[no_] || []).find((c) => c.nome === pp[k ? "-" : "+"]); if (!t) return;
      // a marca fica do lado de fora do componente: acima do terminal de cima, abaixo do de baixo, ao lado se ele está deitado
      const dx = t.x - (t.cx ?? t.x), dy = t.y - (t.cy ?? t.y - 1);
      const [mx, my] = Math.abs(dy) >= Math.abs(dx) ? [t.x, dy > 0 ? t.y + 1.2 : t.y - 0.5] : [dx > 0 ? t.x + 0.45 : t.x - 1.45, t.y + 0.35];
      marcas.push([mx, my, [canal, k ? "−" : "+", e.nome]]);
      const pv = medidos.V.get(no_); if (pv && pv[0] === canal) nosMarcados.add(no_);   // o automático deste nó era este medidor
    });
  }
  const ptsFio = new Set(f.fios.flatMap((w) => w.pts.map((p) => p.join(","))));   // borne ligado: conexão, rótulo ou outro terminal no mesmo ponto
  const ptsTerm = new Map(); for (const e of f.elementos) for (const t of e.terminais || []) { const k = `${t.x},${t.y}`; ptsTerm.set(k, (ptsTerm.get(k) || 0) + 1); }
  f.fios.forEach((w, k) => {
    if (w.dom === "CONTROL" && !mostrar.controle) return;
    const pts = w.pts.map(P).join(" "), sel = ed.fioSel === chaveFio(w) || ed.multiFios.has(chaveFio(w));
    no("polyline", { "data-fio": k, points: pts, fill: "none", stroke: sel ? "#e8a33d" : corFio(w.dom), "stroke-width": sel ? 3 : 1.4, "stroke-linejoin": "round" }, camFios);
    if (clicaveis) no("polyline", { class: "fio", "data-k": k, points: pts, fill: "none", stroke: "transparent", "stroke-width": 0.6 * G }, camFios);
    if (mostrar.rotulos && w.rotulo) rotulo(camRot, w.pts[0][0] + 0.2, w.pts[0][1] - 0.45, w.rotulo, { fill: COR.rot, "font-size": 0.55 * G });
    if (mostrar.medicoes && w.rotulo && medidos.V.has(w.rotulo) && !nosMarcados.has(w.rotulo)) { nosMarcados.add(w.rotulo); marcas.push([w.pts[0][0], w.pts[0][1] - 0.5, medidos.V.get(w.rotulo)]); }
  });
  desenhaJuncoes(camFios, f);
  for (const e of f.elementos) for (const t of e.terminais || [])           // nó medido só por rótulo de terminal (sem conexão com o rótulo)
    if (mostrar.medicoes && t.rotulo && (t.dom || e.dom) === "LK" && medidos.V.has(t.rotulo) && !nosMarcados.has(t.rotulo)) { nosMarcados.add(t.rotulo); marcas.push([t.x, t.y - 0.5, medidos.V.get(t.rotulo)]); }
  // as marcas dos voltímetros, as das pontas escolhidas e as automáticas dos nós, desenhadas juntas no fim (Marcelo, 24/10:
  // "uma ponteira de sinal ficou por baixo da outra" — o − embaixo de um resistor e o + em cima do seguinte, no mesmo nó): de
  // cima para baixo, uma que cairia sobre outra já posta (a caixa V± e o nome do sinal) desce até ficar livre
  // a caixa de uma marca: o V± (0,62 de altura) e o nome do sinal ao lado, mais alto com o subscrito (0,81)
  const ALT_MARCA = 0.86, caixa = ([x, y, m]) => [x - 0.15, x + 1.05 + largMat(m[0]) * 0.27, y - 1.13, y - 0.32];
  const postas = [];
  for (const mk of marcas.sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    for (;;) {                                         // cada passo desce abaixo de uma já posta: termina (são finitas)
      const [a0, a1, b0, b1] = caixa(mk);
      const bate = postas.find((q) => { const [c0, c1, d0, d1] = caixa(q); return a0 < c1 && c0 < a1 && b0 < d1 + 0.05 && d0 < b1 + 0.05; });
      if (!bate) break;
      mk[1] = bate[1] + ALT_MARCA;
    }
    postas.push(mk); marcaNo(camRot, mk[0], mk[1], mk[2]);
  }
  let n = 0;
  f.elementos.forEach((e, i) => {
    if (e.tipo === "SCOPE") return;                                    // o /maisim/scope faz esse papel
    if (e.dom === "CONTROL" && e.tipo !== "TERM" && !mostrar.controle) return;
    n++;
    const g = no("g", { class: (e.tipo === "SUBCIRCUIT" ? "el sub" : "el") + (ed.sel === e.nome || ed.multi.has(e.nome) ? " sel" : "") + (e.ativo === false ? " desativado" : ""), "data-i": i }, camEl);
    if (e.ativo === false) no("title", {}, g).textContent = tr(e.curto ? "simu.el_curto" : "simu.el_desativado", { nome: e.nome });
    if ((e.dom === "LK" || e.dom === "THERM") && e.tipo !== "TERM" && e.terminais.length === 2) {
      const [a, b] = e.terminais;                                       // área de clique ao longo do elemento
      no("rect", { x: (Math.min(a.x, b.x) - 0.7) * G, y: (Math.min(a.y, b.y) - 0.7) * G, width: (Math.abs(a.x - b.x) + 1.4) * G,
        height: (Math.abs(a.y - b.y) + 1.4) * G, fill: "transparent" }, g);
      doisPinos(g, e);
      if (mostrar.corrente && e.dom === "LK" && e.tipo !== "VOLT") setaCorrente(g, e);
      if (mostrar.medicoes && medidos.I.has(e.nome)) marcaMedida(camRot, e, ...medidos.I.get(e.nome));
      const tx = txtDe(e);                                               // o nome junto do corpo (ver txtDe)
      texto(g, e.x + tx.dx, e.y + tx.dy, e.nome, { fill: COR.nome, "font-size": 0.6 * G, "text-anchor": tx.ancora });
      const val = valorPrincipal(e); if (val) texto(g, e.x + tx.dx, e.y + tx.dy + 0.7, val, { fill: COR.par, "font-size": 0.55 * G, "text-anchor": tx.ancora });
      if (mostrar.rotulos) e.terminais.forEach((t, k) => { const r = (k ? e.saidas : e.entradas)[0];
        if (r) rotulo(camRot, t.x + 0.25, t.y - 0.45, r, { fill: COR.rot, "font-size": 0.55 * G }); });
    } else if (e.dom === "THERM" && (e.tipo === "Pv" || e.tipo === "TREF") && e.terminais.length === 1) {
      // um terminal só (o outro lado é o zero térmico, invisível): o Pv, uma fonte de calor com a seta para a saída (à
      // direita), e embaixo a peça que ele aquece ("♨ IGBT.1"; sem ela, em vermelho: a perda não é calculada); o TREF, o
      // terra térmico, abaixo do terminal
      const t = e.terminais[0], cl = COR.th, at = { class: "corpo", stroke: cl, "stroke-width": 1.6, fill: "none" };
      const linha = (x1, y1, x2, y2, o = {}) => no("line", Object.assign({ x1: x1 * G, y1: y1 * G, x2: x2 * G, y2: y2 * G }, at, o), g);
      no("rect", { x: (Math.min(e.x, t.x) - 1) * G, y: (Math.min(e.y, t.y) - 1) * G, width: (Math.abs(e.x - t.x) + 2) * G, height: (Math.abs(e.y - t.y) + 2) * G, fill: "transparent" }, g);
      if (e.tipo === "Pv") {
        no("circle", Object.assign({ cx: e.x * G, cy: e.y * G, r: 0.85 * G }, at, { fill: COR.thFundo }), g);
        linha(e.x - 0.45, e.y, e.x + 0.3, e.y);
        no("polygon", { class: "corpo", points: [[e.x + 0.6, e.y], [e.x + 0.25, e.y - 0.25], [e.x + 0.25, e.y + 0.25]].map(P).join(" "), fill: cl }, g);
        linha(e.x + 0.85, e.y, t.x, t.y);
        texto(g, e.x - 1, e.y - 1.5, e.nome, { fill: COR.nome, "font-size": 0.55 * G });
        texto(g, e.x, e.y + 1.5, e.mede[0] ? `♨ ${e.mede[0]}` : tr("simu.sem_peca"), { class: "pv-alvo", "text-anchor": "middle", fill: e.mede[0] ? cl : COR.erro, "font-size": 0.45 * G });
      } else {
        linha(t.x, t.y, e.x, e.y);
        [[0.7, 0], [0.45, 0.25], [0.2, 0.5]].forEach(([w, dy]) => linha(e.x - w, e.y + dy, e.x + w, e.y + dy, { "stroke-width": 1.8 }));
        texto(g, e.x + 1, e.y + 0.2, e.nome, { fill: COR.nome, "font-size": 0.55 * G });
      }
      if (mostrar.rotulos && t.rotulo) rotulo(camRot, t.x + 0.25, t.y - 0.45, t.rotulo, { fill: COR.rot, "font-size": 0.55 * G });
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
      // a caixa cobre as linhas dos bornes, onde o Gecko os põe (Marcelo, 24/10: com useExternal, o SIGNAL ganha 5 entradas em
      // y + 2 … y + 6, abaixo da saída, o LIMIT 2 em y + 2, y + 3 e o HYS 1 em y + 2 — ver EXTERNAS no ipes.py); sem bornes, uma linha
      const ys = [e.y, ...e.terminais.map((t) => t.y)], topo = Math.min(...ys) - 0.5, h = Math.max(...ys) - Math.min(...ys) + 1;
      const ext = bornesExternos(e), pars = ext && EXTERNA[e.tipo].pars;
      no("rect", { class: "corpo", x: (e.x - 1) * G, y: topo * G, width: 2 * G, height: h * G, fill: COR.ctFundo, stroke: COR.ct, "stroke-width": 1.4, rx: 2 }, g);
      // o símbolo no meio; com as entradas externas, no meio da faixa de cima (a da saída, livre dos nomes das entradas)
      const ySimb = ext ? (topo + Math.min(...ext.map((t) => t.y)) - 0.5) / 2 : topo + h / 2;
      texto(g, e.x, ySimb, ehTag(e) ? "tag" : SIMBOLO[e.tipo] || e.tipo, { class: "simbolo", "text-anchor": "middle", fill: COR.ct, "font-size": (ehTag(e) ? 0.55 : 0.7) * G, "font-weight": 700 });
      // e o que cada entrada externa dá, junto do borne, por dentro (símbolos: não se traduzem)
      if (ext) ext.forEach((t, k) => { const esq = t.x < e.x;
        texto(g, t.x + (esq ? 0.32 : -0.32), t.y, pars[k].simb, { class: "pino-ext", "text-anchor": esq ? "start" : "end", fill: COR.ct,
          "font-size": 0.42 * G, "font-family": MAT, "font-style": pars[k].simb.length === 1 ? "italic" : "normal" }); });
      if (e.tipo === "GATE") texto(g, e.x, topo + h + 0.55, e.mede[0] ? `→ ${e.mede[0]}` : tr("simu.sem_chave"), { "text-anchor": "middle", fill: e.mede[0] ? COR.ct : COR.erro, "font-size": 0.45 * G });
      // escrito pelo controle: a etiqueta vai em cima do bloco, como o nome de um componente (Marcelo, 19/10: na saída ela
      // cobria o que se liga ali, como o borne S do SM encostado no CONST)
      const atuador = typeof atuadorDe === "function" ? atuadorDe(e) : null;
      if (atuador) tagAtuador(camRot, e.x, e.y - 1.0, atuador, true);
      // a saída de um bloco da folha principal que vai para o scope ou para o controle (Marcelo, 24/10: "o desenho mostra tudo
      // o que vai para o scope"): a etiqueta no borne da 1ª saída, em cima da conexão (embaixo, se o bloco é um atuador: a
      // etiqueta dele já está em cima), no lugar do rótulo (é o mesmo nome); com várias saídas, uma em cada borne
      const dest = folhaAtual === "0" && !MEDIDOR.has(e.tipo) && !ehTag(e) && ehSinal(e, "0") ? destinoDe(e) : "fora";
      // (espelhado, a saída fica à esquerda: a etiqueta vai para a esquerda dela, sem cobrir o bloco; até 4,5 quadrados)
      const cs = dest !== "fora" ? canaisDe(e, "0") : [];
      const saiScope = mostrar.medicoes ? e.terminais.filter((t) => t.lado === "s").slice(0, cs.length) : [];
      saiScope.forEach((t, i) => { const esq = t.x < e.x;
        tagScope(camRot, t.x + (esq ? -0.25 : 0.25), t.y + (atuador ? 0.62 : -0.62), cs[i], corSinal(cs[i], e), dest, { larg: 4.5, fim: esq }); });
      for (const t of e.terminais) {
        const borda = t.lado === "e" ? e.x - 1 : e.x + 1;
        if (t.x !== borda) no("line", { x1: t.x * G, y1: t.y * G, x2: borda * G, y2: t.y * G, stroke: COR.ct, "stroke-width": 1.4 }, g);
        if (atuador && t.lado === "s") continue;                                                              // a etiqueta já diz o nome
        if ((MEDIDOR.has(e.tipo) || ehTag(e)) && t.lado === "s") { if (mostrar.medicoes) tagScope(camRot, t.x + 0.35, t.y, canalScope(e), corSinal(canalScope(e), e), destinoDe(e)); }   // regra: medidor (e tag) vai para o /maisim/scope
        else if (mostrar.rotulos && t.rotulo && !saiScope.includes(t)) rotulo(camRot, t.lado === "e" ? t.x - 0.2 : t.x + 0.2, t.y - 0.42, t.rotulo,
          { "text-anchor": t.lado === "e" ? "end" : "start", fill: COR.rot, "font-size": 0.5 * G });
      }
    }
    for (const t of e.terminais) {                                      // bornes: cheio se ligado (conexão ou rótulo), vazado se livre
      const cor = corDom(t.dom || e.dom), k = `${t.x},${t.y}`, livre = !t.rotulo && !ptsFio.has(k) && ptsTerm.get(k) < 2;
      no("circle", { class: "borne", cx: t.x * G, cy: t.y * G, r: (livre ? 0.2 : 0.13) * G, fill: livre ? COR.cartao : cor, stroke: cor, "stroke-width": livre ? 1.4 : 0 }, g);
    }
  });
  $("info").textContent = [ed.ligado && tr("simu.info_editando"), tr("simu.info_elementos", { n }), tr("simu.info_conexoes", { n: f.fios.length }),
    folhaAtual === "0" && tr("simu.info_encaixe", { a: dados.encaixe.pontas - dados.encaixe.soltas.length, b: dados.encaixe.pontas })].filter(Boolean).join(" · ");
  ed.fantasma = no("g", { "pointer-events": "none", style: "display:none" }, svg);
  no("rect", { x: -1 * G, y: -1 * G, width: 2 * G, height: 2 * G, fill: "rgba(232,163,61,.15)", stroke: "#e8a33d", "stroke-dasharray": "4 3", rx: 3 }, ed.fantasma);
  no("circle", { cx: 0, cy: 0, r: 0.18 * G, fill: "#e8a33d" }, ed.fantasma);
  $("trilha").innerHTML = folhaAtual === "0" ? `<span class="topo" title="${escT(tr("simu.t_topo"))}">${ICONE_TOPO}</span>`
    : `<a id="volta" title="${escT(tr("simu.t_volta"))}">${ICONE_TOPO}</a> › ${nomeSub(f.nome)}${nomeSub(f.nome) !== f.nome ? ` (${f.nome})` : ""}`;
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
  $("aba-paleta").textContent = paineis.paleta ? "›" : "‹"; $("aba-props").textContent = paineis.props ? "‹" : "›";
  titulosPaineis();
  try { localStorage.setItem("maisim-simu-paineis", JSON.stringify(paineis)); } catch (e) { /* ok */ }
  requestAnimationFrame(reajustaAspecto);
}
function titulosPaineis() {
  $("aba-paleta").title = tr(paineis.paleta ? "simu.t_paleta_mostra" : "simu.t_paleta_recolhe");
  $("aba-props").title = tr(paineis.props ? "simu.t_props_mostra" : "simu.t_props_recolhe");
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
      (p[k + "_guardado"] != null ? " " + tr("simu.dica_guardado_html", { v: si(p[k + "_guardado"], UNID[k]) }) : "")]);
  }
  if (e.tipo === "AMP" && e.mede[0]) {
    const alvo = dados.folhas[folhaAtual].elementos.find((x) => x.nome === e.mede[0] && x.dom === "LK");
    if (alvo && alvo.tipo === "U") linhas.unshift(["", tr("simu.dica_gerador")]);
    linhas.unshift([tr("simu.dica_mede_i"), e.mede[0]]);
  }
  if (e.tipo === "VOLT" && e.mede[0]) linhas.unshift([tr("simu.dica_mede_v"), `${e.mede[0]} − ${e.mede[1] || "0"}`]);
  if (e.tipo === "GATE" && e.mede[0]) linhas.unshift([tr("simu.dica_comanda"), e.mede[0]]);
  if (e.tipo === "Pv" && e.dom === "THERM") linhas.unshift([tr("simu.h_aquece"), e.mede[0] || tr("simu.sem_peca")]);
  if (e.tipo === "TEMP" && e.mede[0]) linhas.unshift([tr("simu.h_mede"), `${e.mede[0]} − ${e.mede[1] || "0"}`]);
  if (e.tipo === "FLOW" && e.mede[0]) linhas.unshift([tr("simu.h_mede"), `${e.mede[0]} · ${tr("simu.perda_" + (PERDAS_FLOW.includes(e.losscomp) ? e.losscomp : "total"))}`]);
  if (e.entradas.filter(Boolean).length) linhas.push([tr(e.dom === "LK" ? "simu.dica_no1" : "simu.dica_entradas"), e.entradas.map((s) => s || "·").join(", ")]);
  if (e.saidas.filter(Boolean).length) linhas.push([tr(e.dom === "LK" ? "simu.dica_no2" : "simu.dica_saidas"), e.saidas.map((s) => s || "·").join(", ")]);
  if (e.tipo === "SUBCIRCUIT") linhas.push([tr("simu.dica_terminais"), e.terminais.map((t) => t.interno + (t.rotulo ? ` → ${t.rotulo}` : "")).join(", ")], ["", tr("simu.dica_abre_sm")]);
  const d = $("dica");
  d.innerHTML = `<b>${e.nome}</b> <span class="t">· ${descrTipo(e.tipo) || e.tipo}</span><table>${linhas.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>`;
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
        const f = dados.folhas[folhaAtual], trans = `translate(${arrasto.dg[0] * G},${arrasto.dg[1] * G})`;
        f.elementos.forEach((x, i) => { if (ed.multi.has(x.nome) && x.tipo !== "TERM") { const gg = svg.querySelector(`.el[data-i="${i}"]`); if (gg) gg.setAttribute("transform", trans); } });
        f.fios.forEach((w, k) => { if (ed.multiFios.has(chaveFio(w))) svg.querySelectorAll(`[data-fio="${k}"]`).forEach((x) => x.setAttribute("transform", trans)); });
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
    if (a.el && a.moveu && a.dg && (a.dg[0] || a.dg[1])) { pede("MOVE", [qualificado(a.el.e), a.el.e.x + a.dg[0], a.el.e.y + a.dg[1]], tr("simu.d_movido", { nome: a.el.e.nome })); return; }
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
      if (ev.key === "Escape") { ed.fio.cantos = []; ed.fio.dom = null; previaFio(); msg(tr("simu.fio_desfeito")); return; }
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
      if (podeGirar(e)) pede("ROTATE", [qualificado(e)], tr("simu.d_girado", { nome: e.nome })); else if (naoGira(e)) msg(tr("simu.nao_gira"));
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
  historico.unshift({ t, tipo, h: new Date().toLocaleTimeString(maisimI18n.local()) }); historico = historico.slice(0, HIST_N);
  try { sessionStorage.setItem("maisim-simu-hist", JSON.stringify(historico)); } catch (e) { /* ok */ }
  const h = document.getElementById("hist"); if (h) h.outerHTML = caixaHist();
}
const escT = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// (o que já foi anotado fica no idioma em que aconteceu: o histórico guarda o texto)
const caixaHist = () => `<div id="hist"><h4>${tr("simu.hist_h_html", { n: HIST_N })}${botaoDesfazer()}</h4>${historico.length
  ? `<ol>${historico.map((x) => `<li class="${x.tipo}"><time>${x.h}</time>${escT(x.t)}</li>`).join("")}</ol>` : `<div class="t">${escT(tr("simu.hist_vazio"))}</div>`}</div>`;
const grade = (ev) => { const r = $("svg").getBoundingClientRect();
  return [Math.round((ver.x + (ev.clientX - r.left) / r.width * ver.w) / G), Math.round((ver.y + (ev.clientY - r.top) / r.height * ver.h) / G)]; };
const naFolhaPrincipal = () => folhaAtual === "0";
const podeGirar = (e) => e.tipo !== "TERM" && !naoGira(e);   // o terminal do SM não gira: a borda da folha diz o lado do borne
// o Gecko não gira bloco de controle nem subcircuito: RegelBlock.rotiereSymbol() é vazio ("control components cannot be
// rotated at the moment!") e os dois forçam a orientação para baixo em setComponentDirection (conferido em 19/10)
const naoGira = (e) => e.dom === "CONTROL" || e.tipo === "SUBCIRCUIT";
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
const ladoTxt = (l) => { const k = "simu.lado_" + l; return maisimI18n.tem(k) ? tr(k) : String(l); };   // e, d, c, b
function resumoBornes(b) {                              // quantos bornes em cada lado (cabe um por quadrado) e os que caíram juntos
  const [bx, by] = b.tamanho, n = (l) => b.terminais.filter((t) => t.lado === l).length;
  const juntos = [...new Set(b.terminais.filter((t) => t.junto).map((t) => [t.interno, ...t.junto].sort().join(" e ")))];
  return tr("simu.bornes_resumo", { e: n("e"), d: n("d"), c: n("c"), b: n("b"), bx, by })
    + (juntos.length ? " " + tr("simu.bornes_juntos_html", { cor: COR.erro, lista: juntos.join("; ") }) : "");
}
function infoTerminal(e) {                              // o borne deste terminal no bloco
  const b = blocoDaFolha(folhaAtual), t = b && b.terminais.find((x) => x.interno === e.nome);
  if (!t) return escT(descrTipo("TERM"));
  return tr(t.rotulo ? "simu.term_info_rot_html" : "simu.term_info_html", { lado: ladoTxt(t.lado), bloco: nomeSub(b.nome), rot: t.rotulo || "" })
    + (t.junto ? " " + tr("simu.term_junto_html", { cor: COR.erro, lista: t.junto.join(", ") }) : "");
}
// depois de pôr ou mover um terminal de SM: onde o borne ficou (o servidor diz)
const textoTerminal = (t) => " → " + tr(t.deslizou ? "simu.term_onde_deslizou"
  : t.pedido[0] !== t.ponto[0] || t.pedido[1] !== t.ponto[1] ? "simu.term_onde_encostou" : "simu.term_onde", { lado: t.lado, ponto: t.ponto });
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
// o servidor pede confirmação (sobrescrever): pelo código, não pelo texto (o texto muda com o idioma)
// (um servidor de antes, ainda não reiniciado, manda só o texto: aceita também, até ele reiniciar)
const pedeConfirmar = (e) => !!(e && e.dados && (e.dados.codigo === "confirmar" || /; confirme para sobrescrever/.test(e.message)));   // i18n-ok
const perguntaDe = (e) => (e.dados && e.dados.pergunta) || e.message.replace(/; confirme.*$/, ".");   // i18n-ok: o servidor de antes
async function api(rota, corpo) {
  const id = corpo ? etiqueta() : null;
  let r;
  for (let tentativa = 0; ; tentativa++) {
    try { r = await fetch(rota, corpo ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim-Pedido": id }, body: JSON.stringify(corpo) } : {}); break; }
    catch (e) {
      if (tentativa === 0) { await new Promise((ok) => setTimeout(ok, corpo ? 600 : 400)); continue; }
      avisoRede(true);
      throw new Error(tr(corpo ? "simu.rede_caiu_post" : "simu.rede_caiu_get"));
    }
  }
  avisoRede(false);
  let j; try { j = await r.json(); } catch (e) { throw new Error(tr("simu.resposta_invalida", { status: r.status })); }
  // o Gecko foi reiniciado e o servidor o refez (reabriu o arquivo ou limpou a folha): o pedido não foi feito, e o desenho relê
  // o estado (quem pediu mostra a mensagem do erro, como sempre)
  if (!r.ok && j && j.codigo === "gecko_novo") setTimeout(() => circuitoMudou({ sujo: false }), 0);
  if (!r.ok) { const er = new Error(j.erro || r.statusText); er.dados = j; throw er; }   // dados: o resto da resposta (ex.: conflito)
  if (j && j.aviso_gecko) setTimeout(() => msg(j.aviso_gecko, "erro"), 80);   // a vigia fechou uma janela de erro do Gecko: depois do "ok"
  return j;
}
// a faixa "sem conexão com o MaiSim": aparece quando um pedido não passa nem repetido; "testar de novo" (e a cada 5 s, sozinha)
// pergunta ao servidor; com resposta, some
let redeTimer = 0;
function avisoRede(fora) {
  let f = document.getElementById("rede-aviso");
  if (!fora) { if (f && f.style.display !== "none") { f.style.display = "none"; clearInterval(redeTimer); redeTimer = 0; msg(tr("simu.rede_voltou"), "ok"); } return; }
  if (!f) {
    f = document.createElement("div"); f.id = "rede-aviso"; f.setAttribute("role", "alert");
    f.innerHTML = `<b>${escT(tr("simu.rede_sem"))}</b> <span>${escT(tr("simu.rede_ponte"))}</span>
      <button type="button">${escT(tr("simu.rede_testar"))}</button><small></small>`;
    document.body.appendChild(f);
    f.querySelector("button").onclick = () => testaRede(true);
  }
  f.style.display = ""; f.querySelector("small").textContent = "";
  if (!redeTimer) redeTimer = setInterval(() => testaRede(false), 5000);
}
async function testaRede(clicou) {
  const f = document.getElementById("rede-aviso"); if (!f) return;
  try { const r = await fetch("editor/rodada", { cache: "no-store" }); if (!r.ok) throw new Error(r.status); avisoRede(false); }
  catch (e) { if (clicou) f.querySelector("small").innerHTML = tr("simu.rede_ainda_html"); }
}
function textosRede() {                                // o idioma mudou com a faixa aberta (o "ainda sem resposta" sai: vem no próximo clique)
  const f = document.getElementById("rede-aviso"); if (!f) return;
  f.querySelector("b").textContent = tr("simu.rede_sem"); f.querySelector("span").textContent = tr("simu.rede_ponte");
  f.querySelector("button").textContent = tr("simu.rede_testar"); f.querySelector("small").textContent = "";
}
// desfazer (Ctrl+Z): o servidor guarda o estado de antes de cada mudança (até 20) e o Gecko reabre o último
function botaoDesfazer() {
  const d = dados && dados.desfazer, n = d ? d.n : 0;
  return `<button id="bt-desfazer" ${n ? "" : "disabled"} title="${escT(n ? tr("simu.t_desfaz", { ultimo: d.ultimo, n }) : tr("simu.nada_desfazer"))}">${escT(tr("simu.bt_desfazer"))}</button>`;
}
async function desfazer() {
  if (!ed.ligado || !(dados && dados.desfazer && dados.desfazer.n)) { if (ed.ligado) msg(tr("simu.nada_desfazer")); return; }
  if (ed.fio.modo && ed.fio.cantos.length) { ed.fio.cantos = []; ed.fio.dom = null; previaFio(); return; }
  msg(tr("simu.desfazendo"));
  try { const j = await api("editor/desfazer", {}); ed.sel = null; ed.fioSel = null; novoEstado(j); msg(tr("simu.desfeito", { o: j.desfeito }), "ok"); }
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
      + (n > MAX ? `<li>${escT(tr("simu.ren_mais", { n: n - MAX }))}</li>` : "");
    const r = await modal({ titulo: escT(tr("simu.ren_titulo", { n })),
      texto: escT(tr("simu.ren_texto", { n, lugares: tr("simu.ren_lugares", { n: nUsos }) })),
      html: `<ul class="m-renomes">${lista}</ul><p class="m-dica">${tr("simu.ren_dica_html")}</p>`,
      ok: escT(tr("simu.ren_ok")), cancelar: escT(tr("simu.ren_deixar")), extra: [{ rotulo: escT(tr("simu.ren_desfazer")), valor: "desfazer" }], largo: true });
    if (r && r._botao === "desfazer") { await desfazer(); return; }
    if (!r) { msg(tr("simu.ren_ficou", { n, lista: ren.map((x) => x.de).slice(0, 3).join(", ") + (n > 3 ? "…" : "") }), "erro"); return; }
    if (typeof guardaControle === "function" && ctl.carregado) await guardaControle();   // o que está no editor de código vai antes
    const j = await api("editor/controle/renomeia", { pares: ren.map((x) => [x.de, x.para]) });
    if (typeof recarregaControle === "function") await recarregaControle();
    msg(tr(n > 3 ? "simu.ren_feito_mais" : "simu.ren_feito", { pares: ren.slice(0, 3).map((x) => `${x.de} → ${x.para}`).join(", "), mais: n - 3,
      trocas: tr("simu.n_trocas", { n: j.trocas }) }), "ok");
  } catch (e) { msg(e.message, "erro"); }
  finally { perguntandoRenomes = false; }
}
async function pede(op, args, ok) {
  msg(tr("simu.aplicando"));
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
  msg(tr("simu.fora_folha", { p, sm: nomeSM(folhaAtual), x: t[0] - 1, y: t[1] - 1 }), "erro"); return true;
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
const txtTamanho = (b) => tr("simu.txt_tamanho", { bx: b.tamanho[0], by: b.tamanho[1], f: dados.folhas[b.uid].tamanho.join(" × ") });
async function mudaTamanho(e, mudas, descr, todos = ed.todos) {       // mudas: [[parâmetro, valor], …]
  const bs = todos ? iguaisDoBloco(e) : [e];
  const setp = (p) => p.replace(/^Block/, "block");       // blockSizeX: o nome que o servidor confere (bornes) e reabre
  const cmds = bs.flatMap((b) => mudas.filter(([p, v]) => TAMANHO[p](b) !== v).map(([p, v]) => ({ op: "SETP", args: [qualificado(b), setp(p), v] })));
  if (!cmds.length) { msg(tr("simu.ja_esta", { descr }), "ok"); mostraProps(); return; }
  if (bs.length > 1) descr += " " + tr("simu.nos_iguais", { n: bs.length });
  msg(tr("simu.aplicando"));
  try { novoEstado(await api(cmds.length > 1 ? "editor/cmds" : "editor/cmd", cmds.length > 1 ? { cmds, descr } : Object.assign({ descr }, cmds[0]))); msg(descr, "ok"); }
  catch (err) { msg(err.message, "erro"); try { novoEstado(await api("editor/estado")); } catch (_) { mostraProps(); } }
}
function caixaIguais(e) {                              // no painel do bloco, na folha de cima
  const bs = iguaisDoBloco(e);
  if (bs.length < 2) return "";
  const dif = bs.slice(1).filter((b) => txtTamanho(b) !== txtTamanho(e));
  return `<label class="p-juntos" title="${escT(tr("simu.t_juntos_bloco"))}"><input type="checkbox" id="p-juntos" ${ed.todos ? "checked" : ""}> ${escT(tr("simu.mudar_iguais", { n: bs.length }))}</label>
    <div class="aviso">${escT(ed.todos ? tr("simu.tam_vale", { n: bs.length, lista: bs.map((b) => nomeSub(b.nome)).join(", ") }) : tr("simu.tam_so", { nome: nomeSub(e.nome) }))}${dif.length
      ? `<div class="p-dif">${dif.map((b) => escT(tr("simu.esta_com", { nome: nomeSub(b.nome), tam: txtTamanho(b) }))).join("; ")} <button id="p-iguala" title="${escT(tr("simu.t_iguala", { tam: txtTamanho(e), n: bs.length }))}">${escT(tr("simu.iguala"))}</button></div>` : ""}</div>`;
}
const nomeSM = (k) => nomeSub(dados.folhas[k].nome);
const nosSMs = (fs) => fs.length > 1 ? " " + tr("simu.nos_iguais", { n: fs.length }) : (naFolhaPrincipal() ? "" : " " + tr("simu.so_no", { sm: nomeSM(folhaAtual) }));
function textoAlvos() {
  const n = smsIguais().length, sm = nomeSM(folhaAtual);
  if (n === 1) return tr("simu.alvo_unico_html", { sm });
  return tr(ed.todos ? "simu.alvo_todos_html" : "simu.alvo_so_html", { n, sm, m: n - 1 });
}
function faixaSM() {                                   // a faixa no alto da folha de um SM, em edição
  const fx = $("faixa-sm");
  if (!ed.ligado || naFolhaPrincipal() || !dados) { fx.style.display = "none"; return; }
  const n = smsIguais().length, sm = nomeSM(folhaAtual);
  fx.style.display = "block";
  fx.innerHTML = n > 1
    ? `${tr("simu.faixa_igual_html", { sm, m: n - 1 })} <label><input type="checkbox" id="ck-todos" ${ed.todos ? "checked" : ""}> ${escT(tr("simu.mudar_n_juntos", { n }))}</label>
       <span class="sub-faixa">${escT(ed.todos ? tr("simu.faixa_copia") : tr("simu.faixa_so", { sm }))} · ${escT(tr("simu.faixa_vars"))}</span>`
    : `${tr("simu.faixa_unico_html", { sm })} <span class="sub-faixa">${escT(tr("simu.faixa_vars"))}</span>`;
  const b = blocoDaFolha(folhaAtual), juntos = b ? [...new Set(b.terminais.filter((t) => t.junto).map((t) => [t.interno, ...t.junto].sort().join(" e ")))] : [];
  if (juntos.length) fx.innerHTML += `<span class="sub-faixa" style="color:${COR.erro}">${escT(tr("simu.faixa_juntos", { lista: juntos.join("; ") }))}</span>`;
  const ck = $("ck-todos"); if (ck) ck.onchange = () => { ed.todos = ck.checked; faixaSM(); mostraProps(); };
}
// mudanças não salvas (o servidor diz o quê: circuito, controle, cores): pergunta o que fazer. Devolve o modo para repetir o
// pedido ("manter", "salvar", "descartar"), "salvou" (salvar como… já gravou: repetir sem modo) ou null (cancelado).
// O foco começa na opção que guarda (nunca em descartar): Enter não joga trabalho fora.
async function perguntaNaoSalvo(e, acao) {
  const c = e.dados && e.dados.conflito ? e.dados : null; if (!c) throw e;
  // acao: "abrir", "criar" ou "fechar" (um texto inteiro por ação: simu.ns_*_abrir…)
  const nome = (c.aberto || "").split("/").pop() || tr("simu.o_circuito_novo");
  const extra = c.mesmo ? [{ rotulo: escT(tr("simu.ns_manter")), valor: "manter", classe: "primario" }]
    : c.salvavel ? [{ rotulo: tr("simu.ns_salvar_" + acao + "_html", { nome }), valor: "salvar", classe: "primario" }]
    : [{ rotulo: escT(tr("simu.ns_salvar_como_" + acao)), valor: "salvar_como", classe: "primario" }];
  const r = await modal({ titulo: escT(tr(c.mesmo ? "simu.ns_titulo_mesmo" : "simu.ns_titulo")),
    texto: `${escT(e.message)}.${c.mesmo ? tr("simu.ns_mesmo_html") : ""}`,
    ok: escT(tr(c.mesmo ? "simu.descartar" : "simu.ns_descartar_" + acao)), perigo: true, extra, largo: true, foco: ".m-extra" });
  if (!r) return null;
  if (r._botao === "salvar_como") return (await salvarComo()) ? "salvou" : null;
  return r._botao || "descartar";
}
// o cadeado (aberto: editando, o padrão; fechado: só ver) — a escolha fica no navegador
function poeCadeado(on) { $("bt-editar").classList.toggle("ativo", on); $("bt-editar").title = tr(on ? "simu.t_cadeado_aberto" : "simu.t_cadeado_fechado"); }
async function liga(on) {
  ed.ligado = on; document.body.classList.toggle("editando", on); poeCadeado(on);
  if (ed.fio.modo) modoFio(false);
  seleciona(null); escolhe(null);
  if (!on) {
    if (ed.novo && !(await confirma(escT(tr("simu.novo_nao_salvo")), tr("simu.sair_descarta_html", { nome: ed.novo }), escT(tr("simu.sair_sem_salvar")), true))) {
      ed.ligado = true; document.body.classList.add("editando"); poeCadeado(true); return; }
    if (ed.novo) { ed.novo = null; await recarregaModelos(); }
    msg(""); if (!$("sel-modelo").value) { desenha(); return; }   // fechado: nada a ler
    return carrega($("sel-modelo").value);
  }
  if (!ed.catalogo) { ed.catalogo = await (await fetch("static/catalogo.json")).json();
    const med = ed.catalogo.abas.find((a) => a.aba === "Measure"); if (med) med.itens.unshift(TAG_ITEM);   // a tag do MaiSim, junto dos medidores
    desenhaPaleta(); carregaBiblioteca(); }
  if ($("sel-modelo").value === NOVO || !$("sel-modelo").value) return;   // novo, ou fechado: nada a abrir
  msg(tr("simu.abrindo"));
  try {
    let j; const alvo = $("sel-modelo").value;
    try { j = await api("editor/abrir", { arq: alvo }); }
    catch (e) {
      const modo = await perguntaNaoSalvo(e, "abrir");
      if (!modo) {                                       // cancelou: tudo fica como estava (o Gecko e a lista no modelo aberto)
        if (ed.abertoSel && ed.abertoSel !== alvo) { $("sel-modelo").value = ed.abertoSel; mostraModelo(); }
        if (ed.abertoSel && dados && dados.editor) { msg(tr("simu.abrir_cancelado_fica"), ""); return; }
        throw new Error(tr("simu.abrir_cancelado"));
      }
      if (modo === "salvou") { $("sel-modelo").value = alvo; mostraModelo(); }
      j = await api("editor/abrir", modo === "salvou" ? { arq: alvo } : { arq: alvo, modo });
    }
    ed.abertoSel = alvo;
    folhaAtual = "0"; dados = j; marcaSujo(!!j.mantido); desenha(); ajusta();
    const sm = usaSimulacaoDoArquivo(j);
    msg(tr("simu.aberto", { arq: j.arq }) + (sm ? ` · ${sm}` : ""), "ok");
    if (typeof recarregaControle === "function") recarregaControle();
    avisa("circuito", { arq: alvo, outro: true, sujo: ed.sujo });
  }
  catch (e) { msg(e.message, "erro"); ed.ligado = false; document.body.classList.remove("editando"); poeCadeado(false); }
  setTimeout(() => dados && ajusta(), 50);
}
// a integração no Gecko (o solverType do .ipes): 0 Euler implícito, 1 trapézio, 2 Gear (BDF2). Vale ao iniciar, como o Δt
// (o servidor reescreve a linha e reabre o circuito se o Gecko estiver com outro); sem escolha, o do arquivo aberto
const SOLVERS = ["0", "1", "2"];
// o Δt e o tempo final do arquivo aberto (o Gecko guarda os da última rodada) passam a ser os da simulação quando o modelo
// muda: um modelo feito para Δt = 1 µs não roda com o Δt que sobrou de outro. Reabrir o mesmo modelo (entrar na edição de
// novo) não mexe no que o usuário escolheu em Parâmetros da simulação. A integração do arquivo vem junto (a mensagem só a
// diz quando não é o Euler implícito, o padrão do Gecko)
function usaSimulacaoDoArquivo(j) {
  const s = j && j.simulacao, comDt = !!s && s.dt > 0 && s.tfim > 0, comSolver = !!s && SOLVERS.includes(String(s.solver));
  if (!s || (!comDt && !comSolver) || sim.par.modelo === j.arq) return "";
  if (comDt) { sim.par.dt = String(s.dt); sim.par.tfim = String(s.tfim); }
  if (comSolver) sim.par.solver = String(s.solver);
  sim.par.modelo = j.arq;
  try { localStorage.setItem("maisim-simu-sim", JSON.stringify(sim.par)); } catch (e) { /* ok */ }
  return [comDt ? tr("simu.sim_do_arquivo", { dt: si(s.dt, "s"), tfim: si(s.tfim, "s") }) : "",
          comSolver && String(s.solver) !== "0" ? tr("simu.solver_do_arquivo", { nome: tr(`simu.solver_${s.solver}`) }) : ""].filter(Boolean).join(" · ");
}
function desenhaPaleta() {
  const c = { abas: ed.catalogo.abas.concat([{ aba: tr("simu.aba_biblioteca"), itens: ed.lib }]) }, q = $("busca").value.trim().toLowerCase();
  $("abas").innerHTML = c.abas.map((a, k) => `<button data-k="${k}" class="${k === ed.aba && !q ? "ativo" : ""}">${a.aba}</button>`).join("");
  $("abas").querySelectorAll("button").forEach((b) => b.onclick = () => { ed.aba = +b.dataset.k; $("busca").value = ""; desenhaPaleta(); });
  const itens = (q ? c.abas.flatMap((a) => a.itens.map((i) => Object.assign({ aba: a.aba }, i))).filter((i) => `${i.nome} ${i.id}`.toLowerCase().includes(q))
                    : c.abas[ed.aba].itens).filter((i) => i.id !== "SCOPE" && !i.oculto);   // regra do MaiSim: medidor vai para o
  // /maisim/scope; "oculto": o que o MaiSim não oferece (catalogo_gecko.py, ESCONDIDOS) — um circuito que já o tem abre e roda
  $("itens").innerHTML = itens.map((i) => `<div class="item${ed.colocar && ed.colocar.id === i.id ? " ativo" : ""}${i.lib ? " lib" : ""}" data-id="${i.id}" draggable="true"
    title="${i.lib ? tr("simu.t_item_lib", { nome: i.nome, info: i.info }) : tr("simu.t_item", { nome: i.nome, typ: i.typ, dom: i.dom })}">
    ${icone(i)}<span>${i.nome}</span>${i.lib ? `<small>${i.info}</small>` : ""}</div>`).join("") ||
    (ed.aba === c.abas.length - 1 && !q ? `<div class="dica-paleta">${escT(tr("simu.lib_vazia"))}</div>` : `<i>${escT(tr("simu.nada"))}</i>`);
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
      get info() { return tr("simu.lib_info", { e: b.elementos, t: b.terminais.length }); } }));
  } catch (e) { ed.lib = []; }
  if (ed.catalogo) desenhaPaleta();
}
function escolhe(item) {
  if (item && simulando()) { avisaTrava(); return; }
  if (item && ed.fio.modo) modoFio(false);
  ed.colocar = item; document.body.classList.toggle("colocando", !!item);
  if (ed.fantasma) ed.fantasma.style.display = "none";
  if (ed.catalogo) desenhaPaleta();
  if (item) msg(tr("simu.clique_por", { nome: item.nome })); 
}
async function coloca(ev) {
  const [x, y] = grade(ev), base = (ed.colocar.id || "X").replace(/[^A-Za-z0-9_]/g, "_");
  if (foraDaFolha([x, y])) return;
  if (ed.colocar.lib) {                                 // subcircuito da biblioteca: o servidor copia para o circuito aberto
    const it = ed.colocar; escolhe(null); msg(tr("simu.trazendo_lib", { nome: it.nome }));
    const descr = tr("simu.d_lib", { nome: it.nome, x, y }) + (naFolhaPrincipal() ? "" : " " + tr("simu.so_no", { sm: nomeSM(folhaAtual) }));
    try { const j = await api("editor/biblioteca", { acao: "inserir", nome_lib: it.nome, x, y, folha: folhaAtual, descr });
      ed.sel = j.inserido; novoEstado(j);
      msg(`${descr}: ${nomeSub(j.inserido)}` + (j.globais_novas.length ? " · " + tr("simu.vars_novas", { lista: j.globais_novas.join(" ") }) : ""), "ok"); }
    catch (e) { msg(e.message, "erro"); }
    return;
  }
  const usados = new Set(Object.values(dados.folhas).flatMap((f) => f.elementos.map((e) => e.nome)));
  let k = 1; while (usados.has(`${base}.${k}`)) k++;
  const nome = `${base}.${k}`, item = ed.colocar;
  escolhe(null); ed.sel = nome;
  if (item.id === "TAG") {
    const q = naFolhaPrincipal() ? nome : `${dados.folhas[folhaAtual].nome}#${nome}`, descr = tr("simu.d_tag", { nome, x, y, tag: `tag_${k}` });
    try { novoEstado(await api("editor/cmds", { cmds: [{ op: "CREATE", args: [q, x, y, "GAIN"] }, { op: "SETP", args: [q, "r0", 1] }, { op: "OUTNODE", args: [q, 0, `tag_${k}`] }], descr }));
      msg(descr + " · " + tr("simu.tag_ligue"), "ok"); } catch (er) { msg(er.message, "erro"); }
    return;
  }
  await pede("CREATE", [naFolhaPrincipal() ? nome : `${dados.folhas[folhaAtual].nome}#${nome}`, x, y, item.id], tr("simu.d_criado", { item: item.nome, nome, x, y }));
}
function seleciona(e) { ed.sel = e ? e.nome : null; ed.fioSel = null; ed.multi.clear(); ed.multiFios.clear(); desenha(); mostraProps(); }
// simulando, o circuito fica só para ver (Marcelo, 22/10: "o bloqueio de edição quando tiver rodando"): o servidor já recusava
// as mudanças (ocupado()), mas a tela deixava mexer e só depois dava o erro. Agora: clicar seleciona e mostra os dados; arrastar,
// ligar fio, pôr componente, os atalhos que mudam e o painel do componente ficam travados, com o aviso; o ⚙ só mostra
const simulando = () => ["preparando", "rodando", "pausada"].includes(sim.estado);
function avisaTrava() {                                // fica 4 s (a barra de progresso não o cobre) e não se repete no histórico
  if (sim.avisoAte > Date.now()) return;
  sim.avisoAte = Date.now() + 4000; msg(tr("simu.aviso_trava"), "erro");
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
  if (!P.querySelector(".trava-circ")) P.insertAdjacentHTML("afterbegin", `<div class="trava-circ">${escT(tr("simu.aviso_trava"))}</div>`);
}
// o nome da linha da entrada em "rótulos dos terminais": numa entrada externa, o que ela dá ("entrada 1 · amplitude",
// "entrada 2 · mínimo" no LIMIT)
// o Pv cuja saída está no nó térmico de rótulo r (pelo rótulo do terminal ou de uma conexão térmica que passa por ele)
function pvDoNo(f, r) {
  if (!r) return null;
  const naConexao = (t) => f.fios.some((w) => w.dom === "THERM" && w.rotulo === r && w.pts.some((p) => p[0] === t.x && p[1] === t.y));
  return f.elementos.find((x) => x.tipo === "Pv" && x.dom === "THERM" && x.terminais.some((t) => t.rotulo === r || naConexao(t))) || null;
}
// o nome automático no scope de um medidor, pelo que ele mede: i_R_1, v_a_gnd; a temperatura no nó de um Pv, Tj_<a peça>
// (Tj_IGBT1), noutro nó T_<rótulo>; a perda, Pv_ / Pcond_ / Psw_<a peça que o Pv aquece> (Pv_IGBT1)
function nomeAutoDe(tipo, m0, m1, lc) {
  const san = (x) => x.replace(/[^A-Za-z0-9_]/g, "_"), f = dados.folhas[folhaAtual];
  m0 = m0 || ""; m1 = m1 || "";
  if (tipo === "AMP") return san(`i_${m0}`);
  if (tipo === "TEMP") { const pv = pvDoNo(f, m0); return pv && pv.mede[0] ? `Tj_${semPonto(pv.mede[0])}` : san(`T_${m0}${m1 ? "_" + m1 : ""}`); }
  if (tipo === "FLOW") { const pv = f.elementos.find((x) => x.tipo === "Pv" && x.nome === m0); return `${PREFIXO_FLOW[lc] || "Pv"}_${semPonto((pv && pv.mede[0]) || m0)}`; }
  return san(`v_${m0}${m1 ? "_" + m1 : ""}`);
}
const nomeEntrada = (e, i) => { const x = externaDe(e), p = x && x.pars[i - x.de];
  return p ? tr("simu.entrada_ext_n", { n: i + 1, o: tr(p.k) }) : tr("simu.entrada_n", { n: i + 1 }); };
async function montaProps() {
  const P = $("props"); if (!ed.ligado) return;
  if (tamanhoSel()) {                                   // vários selecionados: o resumo e o que dá para fazer com eles
    const sel = selecaoGrupo();
    P.innerHTML = `<h3>${escT(tr("simu.sel_h"))}</h3><div class="t">${escT(nSel(sel.nomes.length, sel.fios.length))}</div>
      ${sel.nomes.length ? `<div class="t"><small>${sel.nomes.map(escT).join(", ")}</small></div>` : ""}
      <div class="botoes"><button id="p-sel-apaga" class="perigo">${escT(tr("simu.apagar"))}</button></div>
      <div class="aviso">${escT(tr("simu.sel_aviso"))}</div>${caixaHist()}`;
    P.querySelector("#p-sel-apaga").onclick = apagaGrupo; return;
  }
  const w = fioSelecionado();
  if (w) {
    const a = w.pts[0], b = w.pts[w.pts.length - 1];
    P.innerHTML = `<h3>${escT(tr("simu.fio"))}</h3><div class="t">${escT(tr("simu.fio_info", { dom: nomeDom(w.dom) || w.dom, n: w.pts.length, a, b }))}</div>
      <label><span>${escT(tr("simu.rotulo_no"))}</span><input id="f-rot" value="${w.rotulo}" placeholder="${escT(tr("simu.sem_rotulo_p"))}"></label>
      <div class="aviso">${escT(tr("simu.fio_aviso"))}</div>
      <div class="botoes"><button id="f-apaga" class="perigo">${escT(tr("simu.apagar_delete"))}</button></div>${caixaHist()}`;
    P.querySelector("#f-rot").onchange = (ev) => mudaFio(w, { acao: "rotulo", rotulo: ev.target.value.trim() }, tr("simu.d_fio_rot", { a, b, r: ev.target.value.trim() || tr("simu.nenhum") }));
    P.querySelector("#f-apaga").onclick = () => apagaFio(w);
    return;
  }
  const e = selecionado();
  if (!e) { P.innerHTML = `<div class="t">${tr("simu.props_vazio_html")}</div>${caixaHist()}`; return; }
  const vars = Object.keys(e.par).filter((k) => k.endsWith("_var")).map((k) => e.par[k]);
  P.innerHTML = `<h3>${e.nome}</h3><div class="t">${ehTag(e) ? escT(tr("simu.tag_descr")) : e.nome_tipo || descrTipo(e.tipo) || e.tipo} · (${e.x}, ${e.y})</div>
    <label><span>${escT(tr("simu.p_nome"))}</span><input id="p-nome" value="${e.nome}"></label>
    <label><span>${escT(tr("simu.p_pos"))}</span><input id="p-pos" value="${e.x}, ${e.y}"></label>
    <div class="botoes">${podeGirar(e) ? `<button id="p-gira">${escT(tr("simu.girar_r"))}</button>` : naoGira(e) ? `<button id="p-nao-gira" class="nao-gira" title="${escT(tr("simu.nao_gira"))}">${escT(tr("simu.girar"))}</button>` : ""}<button id="p-apaga" class="perigo">${escT(tr("simu.apagar"))}</button></div>
    ${e.tipo !== "TERM" ? `<label class="p-desat" title="${escT(tr(e.tipo === "SUBCIRCUIT" ? "simu.t_desat_sub" : "simu.t_desat"))}"><input type="checkbox" id="p-desat" ${e.ativo === false ? "checked" : ""}> ${escT(tr("simu.desativado"))}${e.curto ? ` <small>${escT(tr("simu.curto_gecko"))}</small>` : ""}</label>` : ""}
    ${e.tipo === "SUBCIRCUIT" ? `<div class="botoes"><button id="p-lib" title="${escT(tr("simu.t_p_lib"))}">${escT(tr("simu.p_lib"))}</button></div>
      <h4>${escT(tr("simu.h_bloco"))}</h4><label><span>${escT(tr("simu.p_larg_alt"))}</span><input id="p-bloco" value="${e.tamanho[0]} × ${e.tamanho[1]}" title="${escT(tr("simu.t_p_bloco"))}"></label>
      <div class="aviso">${resumoBornes(e)}</div>
      ${naFolhaPrincipal() ? caixaIguais(e) : ""}
      ${naFolhaPrincipal() && e.terminais.length ? `<h4>${tr("simu.h_rot_bornes_html")}</h4>
      ${e.terminais.map((t) => `<label class="p-borne"><span title="${escT(tr("simu.t_borne", { nome: t.interno || "" }))}">${escT(nomeTerm(t.interno || ""))}</span><input data-borne="${escT(t.interno || "")}" value="${escT(t.rotulo || "")}" placeholder="${escT(tr("simu.sem_rotulo"))}" spellcheck="false"></label>`).join("")}
      <div class="aviso">${escT(tr("simu.bornes_aviso", { nome: nomeSub(e.nome) }))}</div>` : ""}` : ""}
    ${e.tipo === "TERM" && !naFolhaPrincipal() ? `<div class="aviso">${infoTerminal(e)}</div>` : ""}
    ${naFolhaPrincipal() ? "" : `<div class="aviso">${textoAlvos()}</div>`}
    <h4>${escT(tr("simu.h_params"))}</h4><div id="p-params"><i>${escT(tr("simu.lendo"))}</i></div>
    ${vars.length ? `<h4>${escT(tr("simu.h_vars_usa"))}</h4>${vars.map((v) => `<label><span>${v}</span><input data-g="${v}" value="${dados.globais[v]}"></label>`).join("")}
      <div class="aviso">${escT(tr("simu.vars_aviso"))}</div>` : ""}
    ${e.dom === "THERM" && e.terminais.length === 1 ? `<h4>${escT(tr("simu.h_ligacoes"))}</h4>
      <label><span>${escT(tr(e.tipo === "Pv" ? "simu.no_aquecido" : "simu.no_referencia"))}</span><input ${e.tipo === "Pv" ? 'data-out="0"' : 'data-in="0"'} value="${escT((e.tipo === "Pv" ? e.saidas : e.entradas)[0] || "")}"></label>
      <div class="aviso">${escT(tr("simu.termico_ligacoes_aviso"))}</div>` : ""}
    ${(e.dom === "LK" || e.dom === "THERM") && e.terminais.length === 2 ? `<h4>${escT(tr("simu.h_ligacoes"))}</h4>
      <label><span>${escT(tr(e.tipo === "U" ? "simu.term1_mais" : "simu.term1_inicio"))}</span><input data-in="0" value="${e.entradas[0] || ""}"></label>
      <label><span>${escT(tr(e.tipo === "U" ? "simu.term2_menos" : "simu.term2_fim"))}</span><input data-out="0" value="${e.saidas[0] || ""}"></label>
      <div class="aviso">${escT(tr("simu.ligacoes_aviso"))}</div>` : ""}
    ${(e.tipo === "U" || e.tipo === "I") && e.dom === "LK" && e.par.sourceType === 400 ? `<h4>${escT(tr("simu.h_sinal_ctl"))}</h4>
      <label><span>${escT(tr("simu.valor_vem_de"))}</span><input id="p-sinal" value="${e.mede[0] || ""}" placeholder="${escT(tr("simu.ph_rotulo_sinal"))}" autocomplete="off"></label>
      <div class="aviso">${escT(tr("simu.fonte_aviso"))}</div>` : ""}
    ${e.tipo === "VOLT" ? `<h4>${escT(tr("simu.h_mede"))}</h4><label><span>${escT(tr("simu.tensao_no"))}</span><input id="m-n1" value="${e.mede[0] || ""}"></label>
      ${seletorPonta(e, 0)}
      <label><span>${escT(tr("simu.menos_no"))}</span><input id="m-n2" value="${e.mede[1] || ""}"></label>
      ${seletorPonta(e, 1)}` : ""}
    ${e.tipo === "GATE" ? `<h4>${escT(tr("simu.h_chave"))}</h4><label><span>${escT(tr("simu.chave"))}</span><input id="m-chave" value="${e.mede[0] || ""}" placeholder="${escT(tr("simu.ph_chave"))}" autocomplete="off"></label>
      <div class="aviso">${tr("simu.gate_aviso_html")}</div>` : ""}
    ${e.tipo === "AMP" ? `<h4>${escT(tr("simu.h_mede"))}</h4><label><span>${escT(tr("simu.corrente_de"))}</span><input id="m-comp" value="${e.mede[0] || ""}" placeholder="${escT(tr("simu.ph_busca"))}" autocomplete="off"></label>` : ""}
    ${e.tipo === "Pv" && e.dom === "THERM" ? `<h4>${escT(tr("simu.h_aquece"))}</h4><label><span>${escT(tr("simu.peca_aquece"))}</span><input id="m-pv" value="${escT(e.mede[0] || "")}" placeholder="${escT(tr("simu.ph_peca"))}" autocomplete="off"></label>
      <div class="aviso">${escT(tr("simu.pv_aviso"))}</div>` : ""}
    ${e.tipo === "TEMP" ? `<h4>${escT(tr("simu.h_mede"))}</h4><label><span>${escT(tr("simu.temp_no"))}</span><input id="m-t1" value="${escT(e.mede[0] || "")}" autocomplete="off"></label>
      <label><span>${escT(tr("simu.temp_ref"))}</span><input id="m-t2" value="${escT(e.mede[1] || "")}" autocomplete="off"></label>
      <div class="aviso">${escT(tr("simu.temp_aviso"))}</div>` : ""}
    ${e.tipo === "FLOW" ? `<h4>${escT(tr("simu.h_mede"))}</h4><label><span>${escT(tr("simu.perda_de"))}</span><input id="m-flow" value="${escT(e.mede[0] || "")}" placeholder="${escT(tr("simu.ph_pv"))}" autocomplete="off"></label>
      <label><span>${escT(tr("simu.perda_qual"))}</span><select id="m-losscomp">${PERDAS_FLOW.map((k) => `<option value="${k}" ${(e.losscomp || "total") === k ? "selected" : ""}>${escT(tr("simu.perda_" + k))}</option>`).join("")}</select></label>
      <div class="aviso">${escT(tr("simu.flow_aviso"))}</div>` : ""}
    ${ehTag(e) ? `<h4>${escT(tr("simu.h_marca"))}</h4><label><span>${escT(tr("simu.entrada_rotulo"))}</span><input data-in="0" value="${e.entradas[0] || ""}" placeholder="${escT(tr("simu.ph_ou_conexao"))}"></label>
      <div class="aviso">${escT(tr("simu.tag_aviso"))}</div>` : ""}
    ${ehSinal(e, folhaDe(e)) ? `<div class="destino"><label class="no-scope" title="${escT(tr("simu.t_vai_scope"))}"><input type="checkbox" id="p-scope" ${noScope(e) ? "checked" : ""}> ${escT(tr("simu.vai_scope"))}</label>
      <label class="no-scope" title="${escT(tr("simu.t_vai_controle"))}"><input type="checkbox" id="p-controle" ${noControle(e) ? "checked" : ""}> ${escT(tr("simu.vai_controle"))}</label></div>` : ""}
    ${MEDIDOR.has(e.tipo) || ehTag(e) ? `<h4>${escT(tr("simu.h_nome_scope"))}</h4><label><span>${escT(tr("simu.sinal"))}</span><input data-out="0" value="${e.saidas[0] || ""}" placeholder="${canalScope(e)}"></label>
      ${noScope(e) || !ehSinal(e, folhaDe(e)) ? caixaScope(e) : ""}
      <div class="aviso">${tr("simu.nome_scope_aviso_html", { canal: canalScope(e) })}</div>`
      : ehSinal(e, folhaDe(e)) && noScope(e) ? `<h4>${escT(tr("simu.h_no_scope"))}</h4>${caixaScope(e)}` : ""}
    ${e.dom === "CONTROL" && e.tipo !== "TERM" && !MEDIDOR.has(e.tipo) && !ehTag(e) ? `<h4>${escT(tr("simu.h_rot_terminais"))}</h4>${e.entradas.map((r, i) => `<label><span>${escT(nomeEntrada(e, i))}</span><input data-in="${i}" value="${r}"></label>`).join("")}
      ${e.saidas.map((r, i) => `<label><span>${escT(tr("simu.saida_n", { n: i + 1 }))}</span><input data-out="${i}" value="${r}"></label>`).join("")}` : ""}
    ${caixaHist()}`;
  const v = (id) => P.querySelector(id);
  if (v("#p-nome")) v("#p-nome").onchange = (ev) => pede("RENAME", [qualificado(e), ev.target.value.trim()], tr("simu.d_renomeado", { nome: e.nome, novo: ev.target.value.trim() }));
  if (v("#p-pos")) v("#p-pos").onchange = (ev) => { const [x, y] = ev.target.value.split(/[ ,;]+/).map(Number); if (isFinite(x) && isFinite(y)) pede("MOVE", [qualificado(e), x, y], tr("simu.d_movido", { nome: e.nome })); };
  if (v("#p-gira")) v("#p-gira").onclick = () => pede("ROTATE", [qualificado(e)], tr("simu.d_girado", { nome: e.nome }));
  if (v("#p-nao-gira")) v("#p-nao-gira").onclick = () => msg(tr("simu.nao_gira"));
  // desativar (Marcelo, 19/10: "um check: preparado no circuito, mas desabilitado, na cor cinza"): o enabled do Gecko
  if (v("#p-desat")) v("#p-desat").onchange = (ev) => pede("SETP", [qualificado(e), "enabled", ev.target.checked ? 0 : 1], tr(ev.target.checked ? "simu.d_desativado" : "simu.d_ativado", { nome: e.nome }));
  if (v("#p-apaga")) v("#p-apaga").onclick = () => apaga(e);
  if (v("#p-lib")) v("#p-lib").onclick = () => salvaNaBiblioteca(e);
  // o rótulo de fora de cada borne do subcircuito (Marcelo, 19/10: um "+Vcc" ficou preso no borne depois de apagar o fio — era
  // a ligação por rótulo, que a tela não deixava tirar): o Gecko guarda no terminal de dentro (OUTNODE no SM#terminal)
  P.querySelectorAll("[data-borne]").forEach((inp) => inp.onchange = () => {
    const r = inp.value.trim();
    if (r && !/^[A-Za-z0-9_.+\-]+$/.test(r)) { msg(tr("simu.rotulo_invalido", { r }), "erro"); inp.value = ""; return; }
    pede("OUTNODE", [`${e.nome}#${inp.dataset.borne}`, 0, r], tr(r ? "simu.d_borne_ligado" : "simu.d_borne_solto", { nome: e.nome, borne: nomeTerm(inp.dataset.borne), r }));
  });
  // as duas caixinhas: para onde vai o sinal (o painel se refaz com o estado novo: a cor, a seção e o painel do scope
  // aparecem só com "→ Scope")
  if (v("#p-scope")) v("#p-scope").onchange = v("#p-controle").onchange = async (ev) => {
    const scope = v("#p-scope").checked, controle = v("#p-controle").checked;
    try { novoEstado(await api("editor/destino", { uid: e.uid, scope, controle }));
      msg(tr(`simu.d_destino_${scope ? (controle ? "ambos" : "scope") : controle ? "controle" : "fora"}`, { nome: e.nome }), "ok"); }
    catch (er) { msg(er.message, "erro"); ev.target.checked = !ev.target.checked; }
  };
  if (v("#p-bloco")) v("#p-bloco").onchange = async (ev) => {          // os bornes acompanham (posição proporcional ao tamanho)
    const m = ev.target.value.match(/^\s*(\d+)\s*(?:[x×*,;]|\s)\s*(\d+)\s*$/i);
    if (!m) { msg(tr("simu.tam_bloco_erro"), "erro"); return; }
    await mudaTamanho(e, [["BlockSizeX", +m[1]], ["BlockSizeY", +m[2]]], tr("simu.d_bloco", { nome: nomeSub(e.nome), x: +m[1], y: +m[2] }));
  };
  if (v("#p-juntos")) v("#p-juntos").onchange = (ev) => { ed.todos = ev.target.checked; mostraProps(); };
  if (v("#p-iguala")) v("#p-iguala").onclick = () => mudaTamanho(e, Object.keys(TAMANHO).map((p) => [p, TAMANHO[p](e)]), tr("simu.d_tamanho", { nome: nomeSub(e.nome), tam: txtTamanho(e) }), true);
  P.querySelectorAll("[data-g]").forEach((i) => i.onchange = () => pede("SETG", [i.dataset.g, i.value], `${i.dataset.g} = ${i.value}`));
  let ultimoMedido = null;
  const mede = async (corpo, ok, nomeAuto) => {
    msg(tr("simu.aplicando"));
    const fs = alvos(); ok += nosSMs(fs);                       // dentro de um subcircuito: ele só, ou todos os iguais
    try { novoEstado(await api("editor/mede", Object.assign({ nome: e.nome, descr: ok, folhas: fs }, corpo))); msg(ok, "ok"); }
    catch (err) { msg(err.message, "erro"); return; }
    // nome no scope automático (i_R_1, v_a_gnd, Tj_IGBT1, Pv_IGBT1) enquanto o nome for vazio ou o automático de antes; um nome seu não muda
    const san = (x) => x.replace(/[^A-Za-z0-9_]/g, "_"), antes = nomeAutoDe(e.tipo, e.mede[0], e.mede[1], e.losscomp);
    if (nomeAuto && (!e.saidas[0] || e.saidas[0] === antes) && e.saidas[0] !== san(nomeAuto))
      await pede("OUTNODE", [qualificado(e), 0, san(nomeAuto)], tr("simu.d_no_scope_como", { nome: e.nome, canal: san(nomeAuto) }));
  };
  if (v("#m-n1")) v("#m-n1").onchange = v("#m-n2").onchange = () => (`${v("#m-n1").value.trim()}|${v("#m-n2").value.trim()}` === ultimoMedido ||
    `${v("#m-n1").value.trim()}|${v("#m-n2").value.trim()}` === `${e.mede[0] || ""}|${e.mede[1] || ""}`) ? null : (ultimoMedido = `${v("#m-n1").value.trim()}|${v("#m-n2").value.trim()}`, mede({ tipo: "V", no1: v("#m-n1").value.trim(), no2: v("#m-n2").value.trim() }, tr("simu.d_mede_v", { nome: e.nome, a: v("#m-n1").value, b: v("#m-n2").value || "0" }), `v_${v("#m-n1").value.trim()}${v("#m-n2").value.trim() ? "_" + v("#m-n2").value.trim() : ""}`));
  const comps = dados.folhas[folhaAtual].elementos.filter((x) => x.dom === "LK" && x.terminais.length === 2 && x.tipo !== "VOLT" && x.tipo !== "AMP");
  if (v("#m-comp")) {
    comBusca(v("#m-comp"), comps.map((x) => ({ v: x.nome, d: x.nome_tipo || descrTipo(x.tipo) || x.tipo })));
    v("#m-comp").onchange = () => { const c = v("#m-comp").value.trim();
      if (!c || c === (e.mede[0] || "") || c === ultimoMedido) return;   // a busca e o navegador disparam "change": uma vez só
      ultimoMedido = c;
      if (!comps.some((x) => x.nome === c)) { msg(tr("simu.sem_componente", { c }), "erro"); return; }
      mede({ tipo: "I", componente: c }, tr("simu.d_mede_i", { nome: e.nome, c }), `i_${c}`); };
  }
  if (v("#m-chave")) {                                   // GATE: a chave que ele comanda (desta folha)
    const chaves = dados.folhas[folhaAtual].elementos.filter((x) => ["S", "IGBT", "MOSFET", "THYR"].includes(x.tipo));
    comBusca(v("#m-chave"), chaves.map((x) => ({ v: x.nome, d: x.nome_tipo || descrTipo(x.tipo) || x.tipo })));
    v("#m-chave").onchange = () => { const c = v("#m-chave").value.trim();
      if (!c || c === (e.mede[0] || "") || c === ultimoMedido) return;
      ultimoMedido = c;
      if (!chaves.some((x) => x.nome === c)) { msg(tr("simu.sem_chave_folha", { c }), "erro"); return; }
      mede({ tipo: "G", componente: c }, tr("simu.d_comanda", { nome: e.nome, c })); };
  }
  if (v("#m-pv")) {                                      // Pv: a chave ou o diodo que ele aquece (desta folha; o mesmo acoplamento do GATE)
    const pecas = dados.folhas[folhaAtual].elementos.filter((x) => COM_PERDA.includes(x.tipo));
    comBusca(v("#m-pv"), pecas.map((x) => ({ v: x.nome, d: x.nome_tipo || descrTipo(x.tipo) || x.tipo })));
    v("#m-pv").onchange = () => { const c = v("#m-pv").value.trim();
      if (!c || c === (e.mede[0] || "") || c === ultimoMedido) return;
      ultimoMedido = c;
      if (!pecas.some((x) => x.nome === c)) { msg(tr("simu.sem_peca_folha", { c }), "erro"); return; }
      mede({ tipo: "P", componente: c }, tr("simu.d_aquece", { nome: e.nome, c })); };
  }
  if (v("#m-t1")) {                                      // TEMP: dois rótulos térmicos (como o voltímetro)
    const nos = nosTermicos();
    for (const id of ["#m-t1", "#m-t2"]) comBusca(v(id), nos.map((r) => ({ v: r, d: tr("simu.no_termico") })));
    v("#m-t1").onchange = v("#m-t2").onchange = () => { const a = v("#m-t1").value.trim(), b = v("#m-t2").value.trim(), k = `${a}|${b}`;
      if (!a || k === ultimoMedido || k === `${e.mede[0] || ""}|${e.mede[1] || ""}`) return;
      ultimoMedido = k;
      mede({ tipo: "T", no1: a, no2: b }, tr("simu.d_mede_t", { nome: e.nome, a, b: b || "0" }), nomeAutoDe("TEMP", a, b)); };
  }
  if (v("#m-flow")) {                                    // FLOW: o Pv e que perda (total, condução, chaveamento; o losscomp no arquivo)
    const pvs = dados.folhas[folhaAtual].elementos.filter((x) => x.tipo === "Pv" && x.dom === "THERM");
    comBusca(v("#m-flow"), pvs.map((x) => ({ v: x.nome, d: x.mede[0] ? `♨ ${x.mede[0]}` : tr("simu.sem_peca") })));
    v("#m-flow").onchange = v("#m-losscomp").onchange = () => { const c = v("#m-flow").value.trim(), lc = v("#m-losscomp").value, k = `${c}|${lc}`;
      if (!c || k === ultimoMedido || k === `${e.mede[0] || ""}|${e.losscomp || "total"}`) return;
      ultimoMedido = k;
      if (!pvs.some((x) => x.nome === c)) { msg(tr("simu.sem_pv_folha", { c }), "erro"); return; }
      mede({ tipo: "F", componente: c, losscomp: lc }, tr("simu.d_flow", { nome: e.nome, c, perda: tr("simu.perda_" + lc) }), nomeAutoDe("FLOW", c, "", lc)); };
  }
  if (v("#p-sinal")) {                                   // rótulos de saída dos blocos de controle desta folha
    const fl = dados.folhas[folhaAtual], sinais = [...new Set(fl.elementos.filter((x) => x.dom === "CONTROL").flatMap((x) => x.saidas).concat(
      fl.fios.filter((w) => w.dom === "CONTROL").map((w) => w.rotulo)).filter(Boolean))].sort();
    comBusca(v("#p-sinal"), sinais.map((r) => ({ v: r, d: tr("simu.h_sinal_ctl") })));
    let feito = e.mede[0] || "";
    v("#p-sinal").onchange = async () => { const s = v("#p-sinal").value.trim(); if (!s || s === feito) return; feito = s;
      const fs = alvos(), ok = tr("simu.d_controlada", { nome: e.nome, s }) + nosSMs(fs); msg(tr("simu.aplicando"));
      try { novoEstado(await api("editor/fonte_sinal", { nome: e.nome, sinal: s, folhas: fs, descr: ok })); msg(ok, "ok"); } catch (er) { msg(er.message, "erro"); } };
  }
  if (v("#m-n1")) { const nos = nosDaFolha(); for (const id of ["#m-n1", "#m-n2"]) comBusca(v(id), nos.map((r) => ({ v: r, d: tr("simu.no") }))); }
  // o histórico diz qual rótulo mudou (Marcelo, 22/10: só "rótulo mudado" não dizia de quem): o bloco, o campo e de quê para quê
  const rotMudou = (i, velho) => { const campo = ((i.closest("label") || {}).querySelector || (() => null)).call(i.closest("label"), "span"), novo = i.value.trim();
    return `${e.nome}: ${campo ? campo.textContent.trim() : tr("simu.rotulo")} ${velho ? `“${velho}”` : tr("simu.vazio_p")} → ${novo ? `“${novo}”` : tr("simu.vazio_p")}`; };
  P.querySelectorAll("[data-in]").forEach((i) => i.onchange = () => pede("INNODE", [qualificado(e), +i.dataset.in, i.value.trim()], rotMudou(i, e.entradas[+i.dataset.in] || "")));
  P.querySelectorAll("[data-out]").forEach((i) => i.onchange = () => pede("OUTNODE", [qualificado(e), +i.dataset.out, i.value.trim()], rotMudou(i, e.saidas[+i.dataset.out] || "")));
  P.querySelectorAll("[data-ponta]").forEach((inp) => {   // onde fica a ponta (+) ou a garra (−): o campo com busca (5 sugestões; digitar filtra)
    const k = inp.dataset.ponta === "-" ? 1 : 0, no_ = e.mede[k], fl = dados.folhas[folhaAtual];
    const comps = (((dados.nos_medidos || {})[folhaAtual] || {})[no_] || []).map((c) => {
      const el = fl.elementos.find((x) => x.nome === c.nome); return { v: c.nome, d: el ? (el.nome_tipo || descrTipo(el.tipo) || el.tipo) : "" }; });
    const AUTO = tr("simu.automatico");                   // o "automático" do campo (no idioma de quando o painel foi montado)
    comBusca(inp, [{ v: AUTO, d: tr("simu.auto_d") }, ...comps], { limite: 5, tudoAoFocar: true });
    const atual = ((dados.pontas || {})[canalScope(e)] || {})[inp.dataset.ponta] || "";
    inp.onchange = async () => {
      const v = inp.value.trim(), comp = v === AUTO || v === "" ? "" : v;
      if ((comp || "") === atual) return;
      if (comp && !comps.some((c) => c.v === comp)) { msg(tr("simu.nao_esta_no", { comp, no: no_ }), "erro"); inp.value = atual || AUTO; return; }
      try { const j = await api("editor/ponta", { canal: canalScope(e), sinal: inp.dataset.ponta, componente: comp }); novoEstado(j);
        msg(tr(comp ? (k ? "simu.d_garra_em" : "simu.d_ponta_em") : (k ? "simu.d_garra_auto" : "simu.d_ponta_auto"), { canal: canalScope(e), comp }), "ok"); }
      catch (er) { msg(er.message, "erro"); } };
  });
  ligaCaixaScope(P, e);
  if (ehTag(e)) { v("#p-params").innerHTML = `<i>${escT(tr("simu.tag_params"))}</i>`; return; }
  try {
    const lst = await api(`editor/params?nome=${encodeURIComponent(qualificado(e))}&dom=${encodeURIComponent(e.dom)}&typ=${e.typ}`);   // dom/typ: o identificador no arquivo (para o $)
    if (ed.sel !== e.nome) return;
    const ligada = (q) => (q.id && e.par[q.id + "_var"]) || "";          // a variável $ que dá o valor (como no Gecko)
    // enumerações e caixinhas (Marcelo, 24/10: a forma da portadora aparecia como 404): o tipo do parâmetro vem do Gecko
    // (parametros_gecko.json); nenhum desses aceita variável $ (pode_var só em Double e Integer)
    const enumDe = (q) => ENUM_GECKO[q.tipo] || (q.nome === "type" && (e.tipo === "U" || e.tipo === "I") ? ENUM_GECKO.CircuitSourceType : null);
    const campo = (q) => {
      const ops = enumDe(q);
      if (ops) { const atual = ops.find(([c, n]) => c === q.valor || n === q.valor);     // o GETP dá o código antigo (404); o 0–4 também vale
        return `<select data-p="${q.nome}">${ops.map(([c, , k]) => `<option value="${c}" ${atual && atual[0] === c ? "selected" : ""}>${escT(tr(k))}</option>`).join("")}${atual ? "" : `<option value="${q.valor}" selected>${q.valor}</option>`}</select>`; }
      if (q.tipo === "Boolean") return `<input type="checkbox" class="p-bool" data-p="${q.nome}" ${q.valor > 0.5 ? "checked" : ""}>`;
      return ligada(q) ? `<span class="com-var"><input data-p="${q.nome}" value="${escT(ligada(q))}" class="var" autocomplete="off"><small title="${escT(tr("simu.t_valor_var", { v: ligada(q) }))}">= ${si(q.valor, q.unidade)}</small></span>`
        : `<input data-p="${q.nome}" value="${q.valor}"${q.pode_var ? ' autocomplete="off"' : ""}>`;
    };
    const linhaPar = (q) => `<label title="${q.descricao}${q.pode_var ? " · " + escT(tr("simu.t_pode_var")) : ""}"><span>${q.nome}${q.unidade ? ` [${q.unidade}]` : ""}</span>
      ${q.erro ? `<i>${q.erro}</i>` : campo(q)}</label>`;
    // num semicondutor, a seção "Perdas": os campos do modo simples do Gecko juntos (uF e rON também valem no circuito: são a
    // queda e a resistência em condução), a conta que ele faz e se há um Pv que use a perda (sem Pv, ela não é calculada)
    const semi = e.dom === "LK" && COM_PERDA.includes(e.tipo), perdas = semi ? lst.filter((q) => CAMPOS_PERDA.includes(q.nome)) : [];
    const pvs = semi ? pvsDe(dados.folhas[folhaAtual], e.nome) : [];
    v("#p-params").innerHTML = (lst.filter((q) => !perdas.includes(q)).map(linhaPar).join("") || (perdas.length ? "" : `<i>${escT(tr("simu.sem_params"))}</i>`)) +
      (perdas.length ? `<div class="sec-perdas"><h4>${escT(tr("simu.h_perdas"))}</h4><div class="aviso">${escT(tr("simu.perdas_modelo"))}</div>${perdas.map(linhaPar).join("")}
        <div class="aviso ${pvs.length ? "com-pv" : "sem-pv"}"${pvs.length ? "" : ` style="color:${COR.erro}"`}>${escT(pvs.length ? tr("simu.aquecido_por", { pv: pvs.map((x) => x.nome).join(", ") }) : tr("simu.sem_pv"))}</div></div>` : "");
    P.querySelectorAll("#p-params input[data-p]").forEach((i) => { const q = lst.find((x) => x.nome === i.dataset.p); if (q && q.pode_var) comVariaveis(i); });
    // useExternal (SIGNAL, LIMIT, HYS): os parâmetros que vêm das entradas, que o Gecko ignora aqui, ficam cinza, com a entrada
    // que dá cada um, o número dela no bloco (Marcelo, 24/10: pareciam editáveis); a caixinha muda na hora, antes do Gecko
    const tabExt = EXTERNA[e.tipo];
    const marcaExterna = (sim) => {
      tabExt.pars.forEach(({ par }, k) => {
        const i = P.querySelector(`#p-params [data-p="${par}"]`), l = i && i.closest("label"); if (!l) return;
        if (sim) { i.disabled = true; i.dataset.externo = "1"; } else if (i.dataset.externo) { i.disabled = false; delete i.dataset.externo; }
        l.classList.toggle("p-externo", sim);
        const n = l.querySelector(".nota-ext");
        if (sim && !n) l.insertAdjacentHTML("beforeend", `<small class="nota-ext">${escT(tr("simu.vem_entrada_ext", { k: tabExt.de + k + 1 }))}</small>`);
        if (!sim && n) n.remove();
      });
    };
    const cxExt = tabExt && P.querySelector(`#p-params input[data-p="${tabExt.cx}"]`);
    if (cxExt) { marcaExterna(cxExt.checked); cxExt.addEventListener("change", () => marcaExterna(cxExt.checked)); }
    const mudaParam = async (q, i, txt, fs, onde) => {
      if (txt.startsWith("$") && q && q.pode_var) {                    // $nome: liga à variável (a que não existe é criada com o valor de agora)
        if (!NOME_VAR.test(txt)) { msg(tr("simu.nome_var_erro"), "erro"); i.value = ligada(q) || q.valor; return; }
        const nova = !(txt in (dados.globais || {}));
        await mudaGlobal({ acao: "liga", componente: e.nome, parametro: q.nome, nome: txt, valor: q.valor, folhas: fs },
          (nova ? tr("simu.d_liga_nova", { nome: e.nome, par: q.nome, v: txt, val: si(q.valor, q.unidade) }) : `${e.nome}: ${q.nome} ← ${txt} = ${si(dados.globais[txt], q.unidade)}`) + onde);
        mostraProps(); return;
      }
      if (txt.startsWith("$")) { msg(tr("simu.par_sem_var", { p: q ? q.nome : i.dataset.p }), "erro"); i.value = q ? q.valor : ""; return; }
      if (q && ligada(q)) {                                              // número no lugar da variável: desliga e fica com o número
        if (txt === "" || !isFinite(Number(txt))) { msg(tr("simu.par_numero_ou_var", { p: q.nome }), "erro"); i.value = ligada(q); return; }
        await mudaGlobal({ acao: "desliga", componente: e.nome, parametro: q.nome, valor: Number(txt), folhas: fs }, tr("simu.d_desliga_var", { nome: e.nome, par: q.nome, v: txt, var: ligada(q) }) + onde);
        mostraProps(); return;
      }
      if (e.tipo === "SUBCIRCUIT" && TAMANHO[i.dataset.p]) {            // o tamanho: nos iguais também, com "mudar os N juntos"
        if (!/^\d+$/.test(txt)) { msg(tr("simu.par_inteiro", { p: i.dataset.p }), "erro"); i.value = q ? q.valor : ""; return; }
        await mudaTamanho(e, [[i.dataset.p, +txt]], `${e.nome}: ${i.dataset.p} = ${+txt}`); return;
      }
      const rotulo = i.tagName === "SELECT" && i.selectedOptions[0] ? i.selectedOptions[0].textContent : txt;   // a forma pelo nome, no histórico
      await pede("SETP", [qualificado(e), i.dataset.p, txt], `${e.nome}: ${i.dataset.p} = ${rotulo}`);
    };
    P.querySelectorAll("[data-p]").forEach((i) => i.onchange = async () => {
      const q = lst.find((x) => x.nome === i.dataset.p), txt = i.type === "checkbox" ? (i.checked ? "1" : "0") : i.value.trim(), fs = alvos(), onde = nosSMs(fs);
      if (i._enviando === txt) return;                                   // o mesmo valor ainda indo (escolher na lista do $ e sair do campo)
      i._enviando = txt;
      try { await mudaParam(q, i, txt, fs, onde); } finally { i._enviando = null; }
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
  const r = await modal({ titulo: escT(tr("simu.m_novo_circuito")), texto: escT(tr("simu.m_novo_circuito_t")), ok: escT(tr("simu.criar")),
    campos: [{ nome: "nome", rotulo: escT(tr("simu.m_nome_circuito")), valor: `circuito_${k}`, dica: escT(tr("simu.dica_nome")) }] });   // circuito_k: o nome do arquivo
  const nome = r && r.nome.trim(); if (!nome) return;
  if (!/^[A-Za-z0-9_\-]{1,60}$/.test(nome)) { msg(tr("simu.nome_circuito_erro"), "erro"); return; }
  try { let j;
    try { j = await api("editor/novo", {}); }
    catch (e) {                                          // mudanças não salvas: salvar e criar, salvar como… e criar, ou descartar e criar
      const modo = await perguntaNaoSalvo(e, "criar"); if (!modo) { msg(tr("simu.novo_cancelado"), ""); return; }
      j = await api("editor/novo", modo === "salvou" ? {} : { modo }); }
    ed.novo = nome; ed.abertoSel = NOVO; dados = Object.assign(j, { arq: nome });
    folhaAtual = "0"; seleciona(null); novoEstado(j); ver = { x: 0, y: 0, w: 70 * G, h: 44 * G }; aplicaVer();
    if (typeof recarregaControle === "function") recarregaControle();
    preencheModelos(null, NOVO);
    const q = new URLSearchParams(location.search); q.delete("modelo"); history.replaceState(null, "", q.toString() ? "?" + q : location.pathname);
    msg(tr("simu.novo_feito", { nome }), "ok");
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
  tituloDivisoria();
  setTimeout(() => dados && ajusta(), 60);
}
function tituloDivisoria() { $("divisoria").title = tr(tela.lado === "lado" ? "simu.t_div_largura" : "simu.t_div_altura"); }
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
  const r = await modal({ titulo: escT(tr("simu.m_salvar_lib")), texto: tr("simu.m_salvar_lib_t_html", { nome: nomeSub(e.nome) }),
    campos: [{ nome: "nome", rotulo: escT(tr("simu.m_nome_lib")), valor: "", dica: escT(tr("simu.dica_nome")) }], ok: escT(tr("simu.salvar")) });
  const nome = r && r.nome.trim(); if (!nome) return;
  const corpo = { acao: "salvar", nome: e.nome, folha: folhaAtual, nome_lib: nome };
  msg(tr("simu.salvando_lib"));
  try { let j;
    try { j = await api("editor/biblioteca", corpo); }
    catch (er) { if (!pedeConfirmar(er) || !(await confirma(escT(tr("simu.sobrescrever_t")), perguntaDe(er), escT(tr("simu.sobrescrever")), true))) throw er;
      j = await api("editor/biblioteca", Object.assign(corpo, { sobrescrever: true })); }
    const s = ed.sujo; novoEstado(j); marcaSujo(s); msg(tr("simu.salvo_lib", { nome: nomeSub(e.nome), arq: j.salvo }), "ok");
    await carregaBiblioteca(); recarregaModelos($("sel-modelo").value);
  } catch (er) { msg(er.message, "erro"); }
}
// Salvar (Ctrl+S, disquete): por cima do arquivo aberto, se ele é seu (os seus circuitos ou a biblioteca); senão, Salvar como
// fechar a janela do MaiSim com mudanças não salvas, quando fechar desliga o MaiSim (o lançador do "só usar" vigia: o
// maisim-nav.js marca maisimVigiada): o aviso do navegador ("Sair do site?"; o texto é dele, no idioma dele). O circuito não
// se perde (o Gecko fica no ar com ele), mas a pessoa fica sabendo. Não nas trocas de página dentro do MaiSim (o maisim-nav.js marca o clique: o circuito fica no Gecko e a página seguinte o
// retoma) nem na janela à parte do código (a principal continua com o circuito)
addEventListener("beforeunload", (ev) => {
  if (!window.maisimVigiada || !(ed.sujo || ed.novo) || Date.now() - (window.maisimNavegando || 0) < 5000 || new URLSearchParams(location.search).get("janela") === "1") return;
  ev.preventDefault(); ev.returnValue = "";
});
function marcaSujo(s) { ed.sujo = !!s; $("bt-salvar").classList.toggle("sujo", ed.sujo); $("bt-salvar").title = tr(ed.sujo ? "simu.t_salvar_sujo" : "simu.t_salvar"); }
async function salvar() {
  if (dados && dados.fechado) { msg(tr("simu.nada_salvar"), "erro"); return; }
  if (!(await garanteEdicao())) return;
  // o servidor diz se o arquivo aberto é seu; se ele não souber (reiniciado), vale o da lista que a página mostra
  const it = listaModelos.find((o) => o.arq === $("sel-modelo").value && o.pasta);
  const d = (dados && dados.dono) || (it && { pasta: it.pasta, nome: it.nome.replace(/\.ipes$/, "") }), m = d && [null, d.pasta, d.nome];
  if (ed.novo || !m) return salvarComo();
  msg(tr("simu.salvando"));
  try { const j = await api("editor/salvar", { nome: m[2], pasta: m[1], sobrescrever: true }); novoEstado(j); marcaSujo(false); msg(tr("simu.salvo", { arq: j.salvo }), "ok");
    if (m[1] === "subcircuitos") carregaBiblioteca(); }
  catch (e) { msg(e.message, "erro"); }
}
async function salvarComo() {
  if (dados && dados.fechado) { msg(tr("simu.nada_salvar"), "erro"); return false; }
  // o nome sugerido (circuito, _copia) é nome de arquivo: fica como está
  const r = await modal({ titulo: escT(tr("simu.m_salvar_como")), texto: escT(tr("simu.m_salvar_como_t")),
    campos: [{ nome: "nome", rotulo: escT(tr("simu.m_nome_arquivo")), valor: ed.novo || ((dados.arq || "circuito").split("/").pop().replace(/\.ipes$/, "").replace(/^\(.*\)$/, "circuito") + "_copia") }], ok: escT(tr("simu.salvar")) });
  const nome = r && r.nome.trim(); if (!nome) return false;
  const layoutAntes = circuitoDoLayout();
  try { let j;
    try { j = await api("editor/salvar", { nome }); }
    catch (e) { if (!pedeConfirmar(e) || !(await confirma(escT(tr("simu.sobrescrever_t")), perguntaDe(e), escT(tr("simu.sobrescrever")), true))) throw e;
      j = await api("editor/salvar", { nome, sobrescrever: true }); }
    novoEstado(j); marcaSujo(false); msg(tr("simu.salvo_em", { arq: j.salvo }), "ok"); levaLayout(layoutAntes, circuitoDoLayout());
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
      (total > lista.length ? `<div class="mais">${escT(tr("simu.digite_mais", { n: total - lista.length }))}</div>` : "") + (lista.length ? "" : `<div class="mais">${escT(tr("simu.nada_com", { q }))}</div>`);
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
// os parâmetros que são uma enumeração no Gecko: [o código que ele grava e o GETP devolve, o código novo que o SETP também
// aceita, a chave do texto]. ControlSourceType (a forma do SIGNAL, do FILE e do RANDOM): 402–406 (o 0–4 da dica do Gecko
// é o código novo); CircuitSourceType (o tipo das fontes U, I, MMF, HEAT-SOURCE, DT): as três abas do diálogo do Gecko
const ENUM_GECKO = {
  ControlSourceType: [[402, 0, "simu.forma_seno"], [403, 1, "simu.forma_tri"], [404, 2, "simu.forma_ret"], [405, 3, "simu.forma_aleat"], [406, 4, "simu.forma_arq"]],
  CircuitSourceType: [[401, 0, "simu.fonte_cc"], [402, 1, "simu.fonte_seno"], [400, 2, "simu.fonte_sinal"]],
};
// o $ num parâmetro que aceita variável (Marcelo, 24/10): a lista das variáveis globais do circuito ("$Vin = 10") embaixo do
// campo, filtrada pelo que vem depois do $; ↑/↓ marcam, Enter ou Tab escolhem a marcada, Esc fecha, o clique escolhe;
// escolher é como digitar o nome (o "change" do campo liga o parâmetro à variável). Sem nenhuma marcada, Enter e Tab valem o
// que foi digitado (um $nome novo cria a variável, como antes, mesmo com outra parecida na lista)
function comVariaveis(inp) {
  const lbl = inp.closest("label") || inp.parentElement;
  const caixa = document.createElement("div"); caixa.className = "sugestoes sug-vars"; caixa.title = "";   // title vazio: sem a dica do Gecko (a do label) por cima da lista
  lbl.style.position = "relative"; lbl.appendChild(caixa);
  let lista = [], i = -1;
  const aberta = () => caixa.style.display !== "none";
  const fecha = () => { caixa.style.display = "none"; i = -1; };
  const mostra = () => {
    const txt = inp.value.trim();
    if (!txt.startsWith("$")) { fecha(); return; }
    const g = Object.entries((dados && dados.globais) || {});
    lista = g.map(([k, x]) => [pontua(txt.slice(1), k.slice(1)), k, x]).filter(([p]) => p >= 0)
      .sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1], undefined, { sensitivity: "base" })).slice(0, 10);
    caixa.innerHTML = lista.map(([, k, x], n) => `<div class="sug${n === i ? " atual" : ""}" data-k="${n}"><b>${escT(k)}</b><small>= ${escT(x)}</small></div>`).join("")
      || `<div class="mais">${escT(g.length ? tr("simu.nada_com", { q: txt }) : tr("simu.vars_sug_vazio"))}</div>`;
    caixa.style.display = "";
  };
  const escolhe = (n) => { inp.value = lista[n][1]; fecha(); inp.dispatchEvent(new Event("change")); };
  inp.addEventListener("input", () => { i = -1; mostra(); });
  inp.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      if (!inp.value.trim().startsWith("$")) return;
      ev.preventDefault(); if (!aberta()) mostra(); if (!lista.length) return;
      i = i < 0 ? (ev.key === "ArrowDown" ? 0 : lista.length - 1) : Math.max(0, Math.min(lista.length - 1, i + (ev.key === "ArrowDown" ? 1 : -1))); mostra();
    } else if ((ev.key === "Enter" || ev.key === "Tab" && !ev.shiftKey) && aberta() && lista[i]) { ev.preventDefault(); escolhe(i); }
    else if (ev.key === "Escape" && aberta()) { ev.preventDefault(); ev.stopPropagation(); fecha(); }
  });
  caixa.addEventListener("mousedown", (ev) => { ev.preventDefault(); const d = ev.target.closest(".sug"); if (d) escolhe(+d.dataset.k); });   // sem tirar o foco do campo
  inp.addEventListener("blur", () => setTimeout(fecha, 120));
  fecha();
}
function nosDaFolha() {                              // rótulos de nó da folha aberta (conexões e terminais), para o voltímetro
  const f = dados.folhas[folhaAtual], s = new Set(f.fios.map((w) => w.rotulo).filter(Boolean));
  for (const e of f.elementos) if (e.dom === "LK") for (const r of [...e.entradas, ...e.saidas]) if (r) s.add(r);
  return [...s].sort((a, b) => a.localeCompare(b, "pt", { numeric: true }));
}
function nosTermicos() {                             // rótulos térmicos da folha aberta (conexões e terminais da rede térmica), para o TEMP
  const f = dados.folhas[folhaAtual], s = new Set(f.fios.filter((w) => w.dom === "THERM").map((w) => w.rotulo).filter(Boolean));
  for (const e of f.elementos) if (e.dom === "THERM") for (const t of e.terminais) if (t.rotulo) s.add(t.rotulo);
  return [...s].sort((a, b) => a.localeCompare(b, "pt", { numeric: true }));
}

// ---------------------------------------------------------------- fios: W liga e desliga o modo fio (como no Gecko)
// Clique num terminal (ou num ponto da grade) começa; cada clique põe um canto, e o trecho até o mouse vai em L; clicar
// num terminal ou noutro fio termina (duplo clique e Enter também); Backspace tira o último canto; Esc desfaz o fio.
// Quem liga é o Gecko: o servidor escreve o fio no arquivo e ele reabre (ver servidor.py, fio_novo).
// LK = Leistungskreis (o circuito de potência, no Gecko)
// o domínio no texto (no idioma da página): nomeDom "de potência" (conexão de potência), ladoDom "no lado de potência"; outro: ""
const nomeDom = (d) => { const k = "simu.dom_" + d; return maisimI18n.tem(k) ? tr(k) : ""; };
const ladoDom = (d) => { const k = "simu.lado_dom_" + d; return maisimI18n.tem(k) ? tr(k) : ""; };
const nSel = (n, m) => tr("simu.sel_resumo", { comps: tr("simu.n_comps", { n }), fios: tr("simu.n_fios", { n: m }) });   // "2 componente(s) e 1 conexão(ões)"
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
  if (domAlvo !== domT) { msg(tr("simu.dom_nao_liga", { nome: e.nome, d1: nomeDom(domT), p: alvo, d2: nomeDom(domAlvo) }), "erro"); return; }
  const P = [e.x, e.y], f = dados.folhas[folhaAtual];
  const pontas = new Set(f.fios.flatMap((w) => [w.pts[0], w.pts[w.pts.length - 1]].map((q) => q.join(","))));
  for (const x of f.elementos) for (const q of x.terminais || []) pontas.add(`${q.x},${q.y}`);
  const reto = P[0] === alvo[0] || P[1] === alvo[1];
  const caminhos = reto ? [[P, alvo]] : [[P, [alvo[0], P[1]], alvo], [P, [P[0], alvo[1]], alvo]];
  const bloqueio = (c) => expandeCantos(c).slice(1, -1).find((q) => pontas.has(q.join(",")));
  const cantos = caminhos.find((c) => !bloqueio(c));
  if (!cantos) { msg(tr("simu.nao_liguei", { nome: e.nome, alvo, pontos: caminhos.map(bloqueio).join(tr("simu.sep_e")) }), "erro"); return; }
  const fs = alvos(), descr = tr("simu.d_ligado_a", { nome: e.nome, alvo }) + nosSMs(fs);
  msg(tr("simu.ligando"));
  try { novoEstado(await api("editor/fio", { cantos, dom: domT, folhas: fs, descr })); msg(tr("simu.d_ligado_por_fio", { descr }), "ok"); }
  catch (er) { msg(er.message, "erro"); }
}
function modoFio(on) {
  if (on && simulando()) { avisaTrava(); return; }
  if (on) { escolhe(null); ed.sel = null; ed.fioSel = null; mostraProps(); }
  Object.assign(ed.fio, { modo: on, cantos: [], dom: null });
  document.body.classList.toggle("modo-fio", on); $("bt-fio").classList.toggle("ativo", on);
  msg(on ? tr("simu.modo_fio") : "");
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
    msg(tr("simu.fio_comeca")); return;
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
  if (F.dom && fim && F.dom !== fim) { msg(tr("simu.fio_nao_termina", { dom: nomeDom(F.dom), lado: ladoDom(fim) }), "erro"); return; }
  const dom = F.dom || fim || "LK";
  F.cantos = []; F.dom = null; previaFio();
  msg(tr("simu.ligando"));
  if (c.some(foraDaFolha)) return;
  const fs = alvos(), descr = tr("simu.d_fio", { dom: nomeDom(dom), a: c[0], b: c[c.length - 1] }) + nosSMs(fs);
  try { novoEstado(await api("editor/fio", { cantos: c, dom, folhas: fs, descr })); msg(descr, "ok"); }
  catch (e) { msg(e.message, "erro"); }
}
async function mudaFio(w, corpo, ok) {
  msg(tr("simu.aplicando")); const fs = alvos(); ok += nosSMs(fs);
  try { novoEstado(await api("editor/fio", Object.assign({ cantos: w.pts, folhas: fs, descr: ok }, corpo))); msg(ok, "ok"); }
  catch (e) { msg(e.message, "erro"); }
}
async function apagaFio(w) {
  const a = w.pts[0], b = w.pts[w.pts.length - 1];
  if (await confirma(escT(tr("simu.m_apagar_fio")), tr(w.rotulo ? "simu.m_apagar_fio_rot_html" : "simu.m_apagar_fio_html", { a, b, rot: w.rotulo || "" }), escT(tr("simu.apagar")), true)) {
    ed.fioSel = null; await mudaFio(w, { acao: "apagar" }, tr("simu.d_fio_apagado", { a, b })); }
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
// (os textos chegam prontos, em HTML; os botões padrão no idioma de agora: o padrão do parâmetro vale a cada chamada)
function modal({ titulo, texto = "", campos = [], html = "", ok = escT(tr("simu.ok")), cancelar = escT(tr("simu.cancelar")), perigo = false, largo = false, extra = [], foco = null, monta = null }) {
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
const confirma = async (titulo, texto, ok = escT(tr("simu.ok")), perigo = false) => !!(await modal({ titulo, texto, ok, perigo }));
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
  return " · " + tr(sx && sy ? "simu.andou_db" : sx ? "simu.andou_d" : "simu.andou_b", { x: sx, y: sy });
}
async function moveGrupo(dg) {
  const sel = selecaoGrupo(), f = dados.folhas[folhaAtual];
  const terms = sel.nomes.filter((n) => (f.elementos.find((e) => e.nome === n) || {}).tipo === "TERM");   // terminal do SM: fica na borda
  sel.nomes = sel.nomes.filter((n) => !terms.includes(n));
  const pos = f.elementos.filter((e) => sel.nomes.includes(e.nome)).map((e) => [e.x + dg[0], e.y + dg[1]]).concat(sel.fios.flat().map(([x, y]) => [x + dg[0], y + dg[1]]));
  if (pos.some(foraDaFolha)) { desenha(); return; }
  const descr = tr("simu.d_grupo_movido", { comps: tr("simu.n_comps", { n: sel.nomes.length }), fios: tr("simu.n_fios", { n: sel.fios.length }), dg }) + nosSMs([folhaAtual]);
  msg(tr("simu.movendo"));
  try {
    const j = await api("editor/grupo", { acao: "mover", nomes: sel.nomes, fios: sel.fios, dx: dg[0], dy: dg[1], folha: folhaAtual, descr });
    const [sx, sy] = j.deslocado || [0, 0];
    ed.multiFios = new Set(sel.fios.map((pts) => JSON.stringify(pts.map(([x, y]) => [x + dg[0] + sx, y + dg[1] + sy]))));   // as conexões andaram
    novoEstado(j); msg(descr + abriuEspaco(j) + (terms.length ? " · " + tr("simu.terms_borda", { lista: terms.join(", ") }) : ""), "ok");
  } catch (er) { msg(er.message, "erro"); desenha(); }
}
async function apagaGrupo() {
  const sel = selecaoGrupo();
  if (!(await confirma(escT(tr("simu.m_apagar_sel")), tr("simu.m_apagar_sel_html", { n: sel.nomes.length, m: sel.fios.length }) +
    (sel.nomes.length ? `<br><small>${sel.nomes.map(escT).join(", ")}</small>` : ""), escT(tr("simu.apagar")), true))) return;
  msg(tr("simu.apagando"));
  const descr = tr("simu.d_apagados", { sel: nSel(sel.nomes.length, sel.fios.length) });
  try { const j = await api("editor/grupo", { acao: "apagar", nomes: sel.nomes, fios: sel.fios, folha: folhaAtual, descr });
    ed.multi.clear(); ed.multiFios.clear(); novoEstado(j); msg(descr, "ok"); }
  catch (er) { msg(er.message, "erro"); }
}
async function copiaGrupo(recortar) {
  const sel = selecaoGrupo();
  try {
    const j = await api("editor/grupo", { acao: "copiar", nomes: sel.nomes, fios: sel.fios, folha: folhaAtual });
    const f = dados.folhas[folhaAtual], xs = f.elementos.filter((e) => sel.nomes.includes(e.nome)).map((e) => [e.x, e.y]).concat(sel.fios.flat());
    ed.copia = { nome: tr("simu.n_comps", { n: sel.nomes.length }), x: Math.min(...xs.map((p) => p[0])), y: Math.min(...xs.map((p) => p[1])), vezes: 0 };
    const txt = nSel(sel.nomes.length, sel.fios.length) + (j.dentro ? " " + tr("simu.com_dentro_grupo", { n: j.dentro }) : "");
    if (recortar) { await api("editor/grupo", { acao: "apagar", nomes: sel.nomes, fios: sel.fios, folha: folhaAtual, descr: tr("simu.d_recortados", { txt }) }).then((r) => { ed.multi.clear(); ed.multiFios.clear(); novoEstado(r); });
      msg(tr("simu.d_recortados", { txt }) + " · " + tr("simu.ctrlv_cola"), "ok"); }
    else msg(tr("simu.d_copiados", { txt }) + " · " + tr("simu.ctrlv_cola_canto"), "ok");
  } catch (er) { msg(er.message, "erro"); }
}
// copiar e recortar: o servidor guarda o bloco (de um subcircuito, com o que tem dentro); recortar apaga em seguida (Ctrl+Z
// volta). Colar: onde está o mouse, ou ao lado do original (3 quadrados a cada Ctrl+V) com o mouse fora do desenho
async function copia(e, recortar) {
  try {
    const j = await api("editor/copiar", { nome: e.nome, folha: folhaAtual });
    ed.copia = { nome: e.nome, tipo: e.tipo, x: e.x, y: e.y, vezes: 0 };
    const dentro = j.dentro ? " " + tr("simu.com_dentro", { n: j.dentro }) : "";
    if (recortar) await pede("DELETE", [qualificado(e)], tr("simu.d_recortado", { nome: e.nome }) + dentro + " · " + tr("simu.ctrlv_cola"));
    else msg(tr("simu.d_copiado", { nome: e.nome }) + dentro + " · " + tr("simu.ctrlv_cola"), "ok");
  } catch (er) { msg(er.message, "erro"); }
}
async function cola() {
  const c = ed.copia;
  let p = ed.mouse;
  if (!p) { const k = c ? ++c.vezes : 0; p = c ? [c.x + 3 * k, c.y + 3 * k] : [Math.round((ver.x + ver.w / 2) / G), Math.round((ver.y + ver.h / 2) / G)]; }
  if (foraDaFolha(p)) return;
  msg(tr("simu.colando"));
  try {
    const fs = alvos();                                   // dentro de um SM com iguais ("mudar os N juntos"): cola em todos
    const j = await api("editor/colar", { x: p[0], y: p[1], folha: folhaAtual, ...(fs.length > 1 ? { folhas: fs } : {}), descr: tr("simu.d_colado_em", { p }) + nosSMs(fs) });
    const colados = [].concat(j.colado), fios = j.fios_colados || [];
    if (colados.length + fios.length > 1) { ed.sel = null; ed.multi = new Set(colados); ed.multiFios = new Set(fios.map((pts) => JSON.stringify(pts))); }
    else { ed.sel = colados[0]; ed.multi.clear(); ed.multiFios.clear(); }
    novoEstado(j);
    msg(tr(fios.length ? "simu.d_colado_fios" : "simu.d_colado", { lista: colados.join(", "), fios: tr("simu.n_fios", { n: fios.length }), p }) + nosSMs(fs)
      + (j.globais_novas && j.globais_novas.length ? " · " + tr("simu.vars_novas", { lista: j.globais_novas.join(" ") }) : ""), "ok");
    const novo = colados.length === 1 && !fios.length && dados.folhas[folhaAtual].elementos.find((x) => x.nome === colados[0]);
    if (novo && novo.tipo === "TERM" && !naFolhaPrincipal()) await pede("MOVE", [qualificado(novo), p[0], p[1]], tr("simu.d_colado1", { nome: colados[0] }));   // terminal: na borda, num borne livre
  } catch (er) { msg(er.message, "erro"); }
}
async function apaga(e) {
  const txt = tr(e.tipo === "TERM" ? "simu.m_apagar_term_html" : "simu.m_apagar_comp_html", { nome: e.nome });
  if (await confirma(escT(tr("simu.m_apagar_comp")), txt, escT(tr("simu.apagar")), true)) pede("DELETE", [qualificado(e)], tr("simu.d_apagado", { nome: e.nome }));
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
  if (simulando()) { msg(tr("simu.fechar_simulando"), "erro"); return; }
  try { let j;
    try { j = await api("editor/fechar", {}); }
    catch (e) { const modo = await perguntaNaoSalvo(e, "fechar"); if (!modo) { msg(tr("simu.fechar_cancelado"), ""); return; }
      j = await api("editor/fechar", modo === "salvou" ? {} : { modo }); }
    mostraFechado(j); msg(tr("simu.fechado"), "ok");
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
const solverAtual = () => (SOLVERS.includes(String(sim.par.solver)) ? String(sim.par.solver)
  : dados && dados.simulacao && SOLVERS.includes(String(dados.simulacao.solver)) ? String(dados.simulacao.solver) : "0");
const sim = { estado: "parada", timer: null, par: { dt: "1e-6", tfim: "0.04", nome: "rodada", amostras: "4000", por_cima: "1" } };   // por_cima: a nova substitui a anterior de mesmo nome
try { Object.assign(sim.par, JSON.parse(localStorage.getItem("maisim-simu-sim") || "{}")); } catch (e) { /* ok */ }
// ⚙ Parâmetros da simulação, em duas abas: "simulação" (Δt, tempo final… — valem ao iniciar) e "variáveis globais ($)", como
// o Tools > Parameters do Gecko: criar, mudar, apagar (cada mudança vale na hora; Ctrl+Z desfaz). O $x abre na segunda aba
// o nome da próxima depois de guardar uma rodada: rodada_teste → rodada_teste_2 → rodada_teste_3
const proximoNome = (n) => (/_(\d+)$/.test(n) ? n.replace(/_(\d+)$/, (_, k) => `_${+k + 1}`) : `${n}_2`).slice(0, 40);
async function parametrosSim(aba = "sim", op = {}) {
  const SIM = [{ nome: "dt", rotulo: escT(tr("simu.m_dt")), valor: sim.par.dt }, { nome: "tfim", rotulo: escT(tr("simu.m_tfim")), valor: sim.par.tfim },
               { nome: "nome", rotulo: escT(tr("simu.m_nome_rodada")), valor: sim.par.nome, dica: escT(tr("simu.dica_nome")) },
               { nome: "amostras", rotulo: escT(tr("simu.m_amostras")), valor: sim.par.amostras, dica: escT(tr("simu.dica_amostras")) }];
  const comVars = !!(dados && dados.editor);
  // simulando: só para ver (Marcelo, 22/10) — as variáveis mexem no circuito na hora, e a rodada usa o do início; os
  // parâmetros da simulação travam junto (valeriam só para a próxima). Copiar o nome de uma variável continua
  const roda = sim.estado === "rodando" || sim.estado === "pausada";
  let porCima = sim.par.por_cima !== "0", solver = solverAtual();
  if (op.nome) SIM.find((c) => c.nome === "nome").valor = op.nome;   // depois de guardar uma rodada: o nome da próxima
  const r = await modal({ titulo: escT(tr("simu.m_param")), foco: op.nome ? 'input[name="nome"]' : null, ok: escT(tr(roda ? "simu.fechar" : "simu.guardar")), cancelar: roda ? "" : escT(tr("simu.cancelar")), largo: comVars,
    html: `${roda ? `<p class="m-trava">${escT(tr("simu.m_trava"))}</p>` : ""}${comVars ? `<div class="m-abas" role="tablist"><button type="button" data-aba="sim">${escT(tr("simu.m_aba_sim"))}</button><button type="button" data-aba="vars">${escT(tr("simu.m_aba_vars"))}</button></div>` : ""}
      <div class="m-aba" data-aba="sim"><p>${escT(tr("simu.m_valem"))}</p>
        ${op.aviso ? `<p class="m-guardada">${escT(op.aviso)}</p>` : ""}
        ${SIM.map((c) => `<label><span>${c.rotulo}</span><input name="${c.nome}" value="${escT(c.valor ?? "")}" ${c.dica ? `title="${c.dica}"` : ""}${roda ? " disabled" : ""}></label>`).join("")}
        <label><span>${escT(tr("simu.m_solver"))}<span class="ctl-i" tabindex="0" title="${escT(tr("simu.t_solver"))}">i</span></span><select class="m-solver"${roda ? " disabled" : ""}>
          ${SOLVERS.map((k) => `<option value="${k}"${k === solver ? " selected" : ""}>${escT(tr(`simu.solver_${k}`))}</option>`).join("")}</select></label>
        <label><span>${escT(tr("simu.m_rodada_nova"))}<span class="ctl-i" tabindex="0" title="${escT(tr("simu.t_porcima"))}">i</span></span><select class="m-porcima"${roda ? " disabled" : ""}>
          <option value="1"${porCima ? " selected" : ""}>${escT(tr("simu.porcima_sim"))}</option><option value="0"${porCima ? "" : " selected"}>${escT(tr("simu.porcima_nao"))}</option></select></label></div>
      ${comVars ? `<div class="m-aba" data-aba="vars"><p>${tr("simu.m_vars_html")}</p><div id="gv"></div></div>` : ""}`,
    monta: (fundo) => {
      const mostra = (a) => { fundo.querySelectorAll(".m-abas button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === a));
        fundo.querySelectorAll(".m-aba").forEach((d) => d.style.display = d.dataset.aba === a ? "" : "none");
        fundo.querySelector(".m-ok").textContent = tr(a === "sim" && !roda ? "simu.guardar" : "simu.fechar");
        const f = fundo.querySelector(`.m-aba[data-aba="${a}"] input`); if (f) setTimeout(() => f.focus(), 0); };
      fundo.querySelectorAll(".m-abas button").forEach((b) => b.onclick = () => mostra(b.dataset.aba));
      fundo.querySelector(".m-porcima").onchange = (ev) => { porCima = ev.target.value === "1"; };
      fundo.querySelector(".m-solver").onchange = (ev) => { solver = ev.target.value; };
      if (comVars) listaGlobais(fundo.querySelector("#gv"), roda);
      mostra(comVars ? aba : "sim");
    } });
  if (!r) return false;
  if (roda) return true;
  r.por_cima = porCima ? "1" : "0";
  const mudouSolver = solver !== solverAtual();        // o que estava à vista (o do arquivo, sem escolha antes) não conta como mudança
  if (!mudouSolver && ["dt", "tfim", "nome", "amostras", "por_cima"].every((k) => r[k] === undefined || String(r[k]) === String(sim.par[k]))) return true;   // fechou sem mudar a simulação
  if (mudouSolver) r.solver = solver;
  Object.assign(sim.par, r); try { localStorage.setItem("maisim-simu-sim", JSON.stringify(sim.par)); } catch (e) { /* ok */ }
  if (typeof infoTs === "function" && $("ctl-ts")) { infoTs(); infoAtraso(); }   // Ts = n × Δt no painel do controle
  msg(tr("simu.sim_par", { dt: r.dt, tfim: r.tfim }) + (mudouSolver ? ` · ${tr("simu.solver_escolhido", { nome: tr(`simu.solver_${solver}`) })}` : ""), "ok"); return true;
}
async function iniciaSim() {
  if (VISTA_CODIGO) { msg(tr("simu.play_no_circuito"), "erro"); return; }
  if (sim.iniciando || sim.estado === "rodando" || sim.estado === "pausada") return;    // um clique só
  sim.iniciando = true; $("bt-play").disabled = true;
  try {
    if (!(await garanteEdicao())) return;
    if (typeof guardaControle === "function" && !(await guardaControle())) {            // o que está no editor é o que roda
      msg(tr("simu.controle_nao_gravou"), "erro"); mostraDoca("controle"); return; }
    msg(tr("simu.iniciando"));
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
  sim.botoes = true; tituloPlay();
}
function tituloPlay() {                                 // antes do primeiro estado, o título do HTML (que também fala do continuar)
  const st = sim.estado;
  $("bt-play").title = tr(st === "pausada" ? "simu.t_play_continuar" : st === "rodando" ? "simu.t_play_simulando" : sim.botoes ? "simu.t_play" : "simu.t_play_ini");
}
// "guardar esta rodada": o título diz se a desta rodada já foi guardada
function tituloGuardar() {
  const b = $("bt-guardar"), j = sim.guardarJ;
  b.title = b.classList.contains("ativo") && j ? tr("simu.t_guardada", { nome: j.nome }) : tr("simu.t_guardar");
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
  if (vivo && !estavaViva) { $("bt-guardar").hidden = true; $("bt-guardar").classList.remove("ativo"); sim.guardarDe = null; tituloGuardar(); }   // uma rodada nova: o "guardar" é da próxima (o título volta: não é mais a “x” guardada)
  if (vivo && !sim.avisou) { sim.avisou = true; avisa("rodada"); } else if (!vivo) sim.avisou = false;   // a outra janela acompanha
  pg.classList.toggle("ativo", vivo); pg.classList.toggle("pausada", j.estado === "pausada");
  const dd = pg.querySelector(".sim-diodo");              // o diodo animado (claude.js), o "carregando" do MaiSim
  if (vivo && !dd.firstChild && typeof diodoIA === "function") dd.innerHTML = diodoIA(18);
  if (j.tfim) { pg.querySelector("i").style.width = `${Math.min(100, 100 * (j.t || 0) / j.tfim)}%`;
    pg.querySelector(".sim-t").textContent = `${j.estado === "pausada" ? "⏸" : "▶"} ${si(j.t || 0, "s")} / ${si(j.tfim, "s")}`; }
  if (vivo) { if (!(sim.avisoAte > Date.now())) msg(j.estado === "pausada" ? tr("simu.sim_pausada") : tr("simu.simulando", { nome: j.nome })); clearTimeout(sim.timer);
    sim.timer = setTimeout(async () => {
      try { const r = await api("editor/rodada"); sim.falhas = 0; acompanha(r); }
      catch (e) {
        sim.falhas = (sim.falhas || 0) + 1;
        if (sim.falhas <= 10) { msg(tr("simu.sim_sem_resposta", { erro: e.message }), "erro"); sim.timer = setTimeout(() => acompanha(j), 500 * sim.falhas); }
        else { msg(tr("simu.sim_perdi"), "erro"); sim.estado = "desconhecido"; estadoBotoesSim();
          $("progresso").classList.remove("ativo"); if (typeof travaControle === "function") travaControle(false); }
      }
    }, 400); return; }
  if ((j.estado === "fim" || j.estado === "parada") && estavaViva && typeof atualizaVistas === "function") atualizaVistas();   // o que foi nas mensagens
  if (j.estado === "fim" || j.estado === "parada") {
    const subst = (j.substituidas || []).reduce((a, x) => a + x.tamanho, 0);
    // curta: com dezenas de sinais (o MMC), a lista empurrava "abrir em nova aba" e "guardar" para depois do corte (…)
    const sn = j.sinais || [];
    const p = { nome: j.nome, n: j.amostras, sinais: sn.length > 3 ? tr("simu.n_sinais", { n: sn.length }) : sn.join(", "), s: j.segundos };
    $("msg").innerHTML = `<span title="${escT(sn.join(", "))}">${escT(tr(j.estado === "fim" ? "simu.fim_rodada" : "simu.fim_parada", p))}</span>` +
      ` · <a href="${urlScope(j.arquivo, false)}" target="_blank">${escT(tr("simu.nova_aba"))}</a>${(j.substituidas || []).length ? " · " + escT(tr("simu.substituiu", { mb: (subst / 1e6).toFixed(1) })) : ""}`;
    // "guardar esta rodada": um botão do cabeçalho (na mensagem, ele ficava depois do corte "…" quando a linha é curta)
    if (j.arquivo && sim.guardarDe !== j.arquivo) { sim.guardarDe = j.arquivo; sim.guardarJ = j; $("bt-guardar").hidden = false; $("bt-guardar").classList.remove("ativo"); tituloGuardar(); }
    $("msg").className = "ok"; anota(tr(j.estado === "fim" ? "simu.anota_fim" : "simu.anota_parada", p), "ok");
    if (j.arquivo) { sim.ultimo = j.arquivo; mostraScope(true, urlScope(j.arquivo)); }
  } else if (j.estado === "erro") { msg(tr("simu.sim_nao_rodou", { erro: j.erro }), "erro"); if (j.erro_controle && typeof mostraErroControle === "function") mostraErroControle(j); }
  if ((j.estado === "fim" || j.estado === "parada") && j.saida_controle !== undefined && typeof saidaControle === "function") saidaControle(j.saida_controle || "");
}
// guardar a rodada (Marcelo, 22/10: "caso queira comparar ou salvar um resultado"): a pasta dela ganha .guardada e a ⚙ abre
// com o nome da próxima (rodada_teste → rodada_teste_2), para a próxima não cair por cima desta
async function guardaRodada(j) {
  if (!j) return;
  try { await api("editor/rodada/guardar", { arq: j.arquivo }); } catch (e) { msg(tr("simu.nao_guardou", { erro: e.message }), "erro"); return; }
  $("bt-guardar").classList.add("ativo"); $("bt-guardar").title = tr("simu.t_guardada", { nome: j.nome });
  msg(tr("simu.guardada", { nome: j.nome }), "ok");
  await parametrosSim("sim", { nome: proximoNome(j.nome), aviso: tr("simu.guardada_aviso", { nome: j.nome }) });
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
  msg(tr("simu.aplicando"));
  try { const j = await api("editor/variavel", Object.assign({ descr: ok }, corpo)); novoEstado(j); msg(ok, "ok"); return true; }
  catch (e) { msg(e.message, "erro"); return false; }
}
function listaGlobais(caixa, travada = false) {       // a aba "variáveis globais ($)": a lista, criar, apagar (travada: simulando, só ver e copiar)
  const g = Object.entries(dados.globais || {}).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const sem = g.filter(([k]) => !usosGlobal(k).length).map(([k]) => k);
  caixa.innerHTML = `<div class="gv-lista">${g.map(([k, v]) => { const u = usosGlobal(k);
      return `<div class="gv"><span class="gv-nome"><code>${escT(k)}</code><button type="button" class="gv-copia" data-copia="${escT(k)}" title="${escT(tr("simu.t_copiar_var", { k }))}" aria-label="${escT(tr("simu.a_copiar_var", { k }))}"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3.5 10.5h-1v-8h8v1"/></svg></button></span><input data-g="${escT(k)}" value="${v}" data-enter="proprio" aria-label="${escT(tr("simu.a_valor_var", { k }))}">
        <small title="${escT(u.join("\n") || tr("simu.nenhum_usa"))}">${escT(u.length ? tr("simu.n_usos", { n: u.length }) : tr("simu.sem_uso"))}</small>
        <button type="button" class="gv-apaga" data-apaga="${escT(k)}" data-usos="${u.length}" title="${escT(u.length ? tr("simu.t_apagar_var_usos", { k, n: u.length }) : tr("simu.t_apagar_var", { k }))}">×</button></div>`; }).join("")
      || `<div class="t">${escT(tr("simu.sem_vars"))}</div>`}</div>
    <div class="gv nova"><input id="gv-nome" placeholder="${escT(tr("simu.ph_var_nome"))}" data-enter="proprio" autocomplete="off" aria-label="${escT(tr("simu.a_var_nome"))}">
      <input id="gv-valor" placeholder="${escT(tr("simu.ph_var_valor"))}" data-enter="proprio" aria-label="${escT(tr("simu.a_var_valor"))}"><button type="button" id="gv-cria">${escT(tr("simu.criar"))}</button></div>
    ${sem.length ? `<button type="button" id="gv-limpa" class="gv-limpa" title="${escT(sem.join(", "))}">${escT(tr("simu.limpa_vars", { n: sem.length }))}</button>` : ""}`;
  const relista = () => listaGlobais(caixa, travada);
  if (travada) caixa.querySelectorAll("input, button:not([data-copia])").forEach((x) => { x.disabled = true; });
  caixa.querySelectorAll("input[data-g]").forEach((i) => {
    const vale = async () => { const k = i.dataset.g, v = i.value.trim(); if (v === "" || Number(v) === dados.globais[k]) return;
      if (!isFinite(Number(v))) { msg(tr("simu.valor_numero", { k }), "erro"); return; }
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
    msg(tr(ok ? "simu.var_copiada" : "simu.var_nao_copiou", { k }), ok ? "ok" : "erro");
  });
  caixa.querySelectorAll("[data-apaga]").forEach((b) => b.onclick = async () => {
    const k = b.dataset.apaga, n = +b.dataset.usos;
    if (n && !b.classList.contains("confirma")) { b.classList.add("confirma"); b.textContent = tr("simu.apagar_q"); b.title = tr("simu.t_apagar_var_conf", { n, k, v: dados.globais[k] }); return; }
    if (await mudaGlobal({ acao: "apaga", nome: k }, n ? tr("simu.d_var_apagada_usos", { k, n, v: dados.globais[k] }) : tr("simu.d_var_apagada", { k }))) relista();
  });
  const cria = async () => {
    let k = caixa.querySelector("#gv-nome").value.trim(); const v = caixa.querySelector("#gv-valor").value.trim();
    if (k && !k.startsWith("$")) k = "$" + k;
    if (!NOME_VAR.test(k)) { msg(tr("simu.nome_var_erro"), "erro"); caixa.querySelector("#gv-nome").focus(); return; }
    if (v === "" || !isFinite(Number(v))) { msg(tr("simu.valor_numero", { k }), "erro"); caixa.querySelector("#gv-valor").focus(); return; }
    if (await mudaGlobal({ acao: "nova", nome: k, valor: Number(v) }, tr("simu.d_var_criada", { k, v }))) { relista(); caixa.querySelector("#gv-nome").focus(); }
  };
  caixa.querySelector("#gv-cria").onclick = cria;
  caixa.querySelector("#gv-nome").onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); caixa.querySelector("#gv-valor").focus(); } };
  caixa.querySelector("#gv-valor").onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); cria(); } };
  const lp = caixa.querySelector("#gv-limpa");
  if (lp) lp.onclick = async () => { if (await mudaGlobal({ acao: "apaga", nomes: sem }, tr("simu.d_vars_limpas", { n: sem.length }))) relista(); };
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
  $("erro").textContent = ""; $("svg").innerHTML = ""; $("info").textContent = tr("simu.lendo_modelo");
  let j; try { j = await api("circuito?arq=" + encodeURIComponent(arq)); }   // leitura: repete uma vez se a conexão cair
  catch (e) { $("erro").textContent = e.message || tr("simu.erro_ler_modelo"); $("info").textContent = ""; return; }
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
  o.title = tr(n === CAMADAS.length ? "simu.t_esconder_tudo" : "simu.t_mostrar_tudo");
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
  $("sel-modelo").innerHTML = (ed.novo ? `<optgroup label="${escT(tr("simu.grupo_novo"))}"><option value="${NOVO}">${tr("simu.op_novo", { nome: ed.novo })}</option></optgroup>` : "") +
    grupos.map((g) => `<optgroup label="${escT(g)}">${listaModelos.filter((o) => o.grupo === g).map((o) => `<option value="${escT(o.arq)}">${escT(o.nome)}</option>`).join("")}</optgroup>`).join("");
  if (valor) $("sel-modelo").value = valor;
  mostraModelo();
}
// o modelo aberto, num botão: clicar abre a lista com busca. O <select> escondido guarda a escolha.
function mostraModelo() {
  const o = $("sel-modelo").selectedOptions[0];
  $("bt-modelo").querySelector("span").textContent = o ? o.textContent : tr("simu.nenhum_aberto");
}
async function abrirModelo() {
  let lst; try { lst = await api("modelos"); } catch (e) { msg(tr("simu.nao_listou", { erro: e.message }), "erro"); return; }
  const itens = (ed.novo ? [{ v: NOVO, t: tr("simu.op_novo", { nome: ed.novo }), g: tr("simu.grupo_novo") }] : []).concat(
    lst.map((o) => ({ v: o.arq, t: o.nome, apagavel: o.apagavel, g: o.grupo, bib: o.pasta === "subcircuitos" })));
  const atual = $("sel-modelo").value;
  const fundo = document.createElement("div"); fundo.className = "modal-fundo";
  fundo.innerHTML = `<div class="modal largo abrir" role="dialog" aria-modal="true"><h3>${escT(tr("simu.m_abrir"))}</h3>
    <p>${tr("simu.m_abrir_t_html")}</p>
    <input class="busca-abrir" placeholder="${escT(tr("simu.ph_busca_circuito"))}" autocomplete="off"><div class="lista-abrir"></div>
    <div class="modal-botoes"><button class="m-cancela">${escT(tr("simu.cancelar"))}</button></div></div>`;
  document.body.appendChild(fundo);
  const inp = fundo.querySelector(".busca-abrir"), caixa = fundo.querySelector(".lista-abrir");
  let vis = [], i = 0;
  const desenhaLista = () => {
    const q = inp.value.trim();
    vis = q ? itens.map((o) => [Math.max(pontua(q, o.t), pontua(q, o.t.split("/").pop())), o]).filter(([p]) => p >= 0).sort((a, b) => b[0] - a[0]).map(([, o]) => o) : itens;
    i = Math.max(0, Math.min(i, vis.length - 1));
    let g = null;
    caixa.innerHTML = vis.map((o, k) => (!q && o.g !== g ? `<div class="grupo">${(g = o.g)}</div>` : "") +
      `<div class="op${k === i ? " atual" : ""}${o.v === atual ? " aberto" : ""}" data-k="${k}">${escT(o.t)}${o.v === atual ? ` <small>${escT(tr("simu.aberto_marca"))}</small>` : ""}` +
      (o.apagavel ? `<button class="apaga-arq" data-k="${k}" title="${escT(tr("simu.t_apagar_arq"))}">🗑</button>` : "") + `</div>`).join("") ||
      `<div class="vazio">${escT(tr("simu.nada_com", { q }))}</div>`;
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
      const sim = await confirma(escT(tr("simu.m_apagar_arq")), tr("simu.m_apagar_arq_html", { nome: o.t }), escT(tr("simu.apagar")), true);
      addEventListener("keydown", tecla, true);
      if (!sim) return;
      try { const j = await api("editor/apagar_arquivo", { arq: o.v }); itens.splice(itens.indexOf(o), 1); desenhaLista();
        msg(tr("simu.arq_apagado", { arq: j.apagado, lixeira: j.lixeira }), "ok"); if (o.bib) carregaBiblioteca(); recarregaModelos($("sel-modelo").value); }
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
  if (ed.novo && !(await confirma(escT(tr("simu.novo_nao_salvo")), tr("simu.abrir_descarta_html", { nome: ed.novo }), escT(tr("simu.descartar")), true))) {
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
    $("titulo-pagina").textContent = tr("simu.titulo_codigo"); tituloCodigo();
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
function tituloCodigo() { if (VISTA_CODIGO) document.title = tr("simu.titulo_codigo_de", { arq: ($("sel-modelo").value || "").split("/").pop() || tr("simu.sem_circuito") }); }
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
  if (vazia && fora[tipo].size) { w.close(); msg(tr(tipo === "scope" ? "simu.scope_outra_aba" : "simu.codigo_outra_aba"), "ok"); return; }
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
// o idioma mudou (o PT/EN do trilho, nesta janela ou noutra): o que este arquivo escreve na página volta no idioma novo (o HTML
// estático o aplica() já trocou). A linha de mensagens e o histórico ficam como foram escritos
maisimI18n.aoMudar(() => {
  titulosCabecalho(); titulosPaineis(); estadoVer(); textosRede();
  if ($("divisoria").title) tituloDivisoria();            // só a que já tem título (o posicionaScope dá o primeiro)
  const op = $("sel-modelo").querySelector(`option[value="${NOVO}"]`);   // o circuito novo, na lista escondida e no botão do modelo
  if (op && ed.novo) { op.textContent = tr("simu.op_novo", { nome: ed.novo }); if (op.parentElement) op.parentElement.label = tr("simu.grupo_novo"); }
  mostraModelo();
  if (dados) desenha();                                  // o desenho, a linha de informação, a trilha e a faixa do SM
  if (ed.catalogo) desenhaPaleta();
  refazProps();                                         // o painel da direita (e o histórico), sem atrapalhar quem digita
  if (VISTA_CODIGO) { $("titulo-pagina").textContent = tr("simu.titulo_codigo"); tituloCodigo(); }
});
// o painel da direita no idioma novo, mas sem tirar o que está sendo digitado nele (a troca pode vir de outra janela): com o
// foco num campo do painel (um valor pela metade, a lista de sugestões, a escolha de seção ou painel aberta), espera o foco
// sair dele; com um modal aberto (a seção ou o painel novos), espera o modal fechar
let propsEsperando = false;
function refazProps() {
  if (!ed.ligado || propsEsperando) return;
  const P = $("props"), a = document.activeElement;
  if (document.querySelector(".modal-fundo")) {
    propsEsperando = true; const t = setInterval(() => { if (document.querySelector(".modal-fundo")) return;
      clearInterval(t); propsEsperando = false; refazProps(); }, 400); return; }
  if (!(a && a !== document.body && P.contains(a))) { mostraProps(); return; }
  propsEsperando = true;
  const sai = (ev) => { if (ev.relatedTarget && P.contains(ev.relatedTarget)) return;   // de um campo do painel para outro: espera
    P.removeEventListener("focusout", sai); propsEsperando = false; setTimeout(refazProps, 0); };   // depois do "change" do campo
  P.addEventListener("focusout", sai);
}
// os títulos do cabeçalho que este arquivo escreve (o cadeado, o salvar, o ▶, o guardar): já na carga, no idioma da página
// (o HTML traz o português); depois, a cada troca de idioma
function titulosCabecalho() {
  $("bt-editar").title = tr($("bt-editar").classList.contains("ativo") ? "simu.t_cadeado_aberto" : "simu.t_cadeado_fechado");
  $("bt-salvar").title = tr(ed.sujo ? "simu.t_salvar_sujo" : "simu.t_salvar");
  tituloPlay(); tituloGuardar();
}
titulosCabecalho();
