// maisim-scope: painéis configuráveis (uPlot) em seções, cursor sincronizado no tempo, zoom X/Y/área e o enquadrar (ver tudo) em cada painel
// (o tempo é comum aos painéis ligados; um painel solto tem o seu), Ctrl + roda, pulsos de PWM e formas de onda medidas no
// Gecko com a resolução do passo fino no zoom, salvar PNG.
// Modos "Ao vivo" (SSE) e "Comparar" (A em cores; B na cor do mesmo sinal, mais clara e tracejada).
"use strict";
const BRACOS = ["au", "al", "bu", "bl", "cu", "cl"];
const NOME = (b) => tr(`scope.braco.${b}`);              // o nome do braço (sup a, inf a…), no idioma
const PALETA = ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e", "#9467bd", "#8c564b", "#e377c2", "#17becf", "#bcbd22", "#7f7f7f"];
// cores escolhidas pelo usuário, por sinal (vale em todos os painéis; guardadas no navegador); as clássicas, para não
// virar salada, e qualquer #rrggbb. O nome é o da chave do dicionário (scope.cor.vermelho_escuro…), mostrado no idioma
const CLASSICAS = [["vermelho", "#e41a1c"], ["vermelho_escuro", "#8b0000"], ["laranja", "#ff7f0e"], ["marrom", "#8c564b"], ["ouro", "#b8860b"],
  ["verde", "#2ca02c"], ["verde_escuro", "#006400"], ["ciano", "#17becf"], ["azul", "#1f77b4"], ["azul_escuro", "#0b3d91"], ["roxo", "#9467bd"],
  ["magenta", "#d62ab0"], ["cinza", "#7f7f7f"], ["preto", "#111111"]];
let coresSinal = (() => { try { return JSON.parse(localStorage.getItem("maisim-scope-cores") || "{}") || {}; } catch (e) { return {}; } })();
const corValida = (c) => /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : /^#[0-9a-fA-F]{3}$/.test(c) ? ("#" + c.slice(1).split("").map((x) => x + x).join("")).toLowerCase() : null;
function corDoSinal(canal, idx) { return corValida(coresSinal[canal] || "") || PALETA[idx % PALETA.length]; }
function poeCorSinal(canal, cor) {                       // cor null: volta ao padrão (a paleta pela ordem)
  if (cor) coresSinal[canal] = cor; else delete coresSinal[canal];
  try { localStorage.setItem("maisim-scope-cores", JSON.stringify(coresSinal)); } catch (e) { /* só nesta página */ }
  for (const p of paineis()) if (p.sinais.includes(canal)) criaGrafico(p);
}
// a espessura da linha, por sinal, como a cor (Marcelo, 22/10: "além da cor, a espessura dos sinais"); 1.3 é a de sempre
const ESPESSURAS = [0.8, 1.3, 2, 3];
let espessurasSinal = (() => { try { return JSON.parse(localStorage.getItem("maisim-scope-espessuras") || "{}") || {}; } catch (e) { return {}; } })();
const espessuraValida = (w) => ESPESSURAS.includes(+w) ? +w : null;
function espessuraDoSinal(canal) { return espessuraValida(espessurasSinal[canal]) || 1.3; }
function poeEspessuraSinal(canal, w) {
  if (espessuraValida(w) && +w !== 1.3) espessurasSinal[canal] = +w; else delete espessurasSinal[canal];
  try { localStorage.setItem("maisim-scope-espessuras", JSON.stringify(espessurasSinal)); } catch (e) { /* só nesta página */ }
  for (const p of paineis()) if (p.sinais.includes(canal)) criaGrafico(p);
}
// o traço da linha, por sinal, como a espessura (Marcelo, 23/10: "contínuo ou tracejado"): contínua (a de sempre), tracejada
// ou pontilhada; em todos os painéis, no PNG e nas visões exportadas
const TRACOS = { continua: null, tracejada: [8, 5], pontilhada: [2, 4] };
let tracosSinal = (() => { try { return JSON.parse(localStorage.getItem("maisim-scope-tracos") || "{}") || {}; } catch (e) { return {}; } })();
const tracoValido = (t) => (Object.prototype.hasOwnProperty.call(TRACOS, t) ? t : null);
const tracoDoSinal = (canal) => tracoValido(tracosSinal[canal]) || "continua";
function poeTracoSinal(canal, t) {
  if (tracoValido(t) && t !== "continua") tracosSinal[canal] = t; else delete tracosSinal[canal];
  try { localStorage.setItem("maisim-scope-tracos", JSON.stringify(tracosSinal)); } catch (e) { /* só nesta página */ }
  for (const p of paineis()) if (p.sinais.includes(canal)) criaGrafico(p);
}
// B (Comparar): a cor do mesmo sinal, misturada com o branco — dá para saber quem é quem com vários sinais
function corClara(cor, t = 0.5) {
  const n = parseInt(cor.slice(1), 16), mix = (v) => Math.round(v + (255 - v) * t);
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, "0")).join("");
}
// o tema do MaiSim (<html data-tema>, posto pelo index.html antes de pintar): as cores do que é desenhado no canvas (eixos,
// grade, espectro, faixa de medição, acionamentos, PNG); as da página estão no CSS
const COR_TEMA = {
  claro: { eixo: "#3d4550", grade: "rgba(0,0,0,.07)", texto: "#5b6470", textoForte: "#3d4550", textoFraco: "#8a939d", gradeForte: "#dde2e8",
    gradeFraca: "#eef1f4", base: "#9aa3ad", faixa: "rgba(31, 78, 121, 0.09)", faixaBorda: "rgba(31, 78, 121, 0.75)",
    acA: "rgba(217,119,6,.85)", acAtxt: "#92400e", acB: "rgba(55,65,81,.7)", acBtxt: "#374151", fundo: "#fff", titulo: "#1b1f24", soma: "#111827", media: "#7c3aed" },
  escuro: { eixo: "#aab3bf", grade: "rgba(255,255,255,.08)", texto: "#9aa3ae", textoForte: "#cbd5e1", textoFraco: "#6b7480", gradeForte: "#2f3540",
    gradeFraca: "#232831", base: "#5b6470", faixa: "rgba(139, 92, 246, 0.14)", faixaBorda: "rgba(167, 139, 250, 0.85)",
    acA: "rgba(251,146,60,.9)", acAtxt: "#fdba74", acB: "rgba(203,213,225,.7)", acBtxt: "#cbd5e1", fundo: "#171a21", titulo: "#e6e8ec", soma: "#f3f4f6", media: "#c4b5fd" } };
const temaAtual = () => (document.documentElement.dataset.tema === "escuro" ? "escuro" : "claro");
const cores = () => COR_TEMA[temaAtual()];
const LIMITE_FINO_MS = 40;
// o layout é por circuito (Marcelo, 23/10): cada circuito com os seus painéis e seções, editáveis como sempre e guardados
// no navegador com o nome dele; um circuito sem layout começa no automático (os sinais da rodada); sem rodada, nada. O de
// antes era um só para tudo (v3, com o MMC da tese como padrão): na 1ª rodada de um circuito, os painéis dele com sinais
// desta rodada viram o layout do circuito
// A chave é o caminho do circuito (v5; dois circuitos de mesmo nome — o exemplo e a cópia dele — não dividem o layout), ou,
// num circuito novo, o momento em que foi criado: a rodada traz no meta (chave_layout) a mesma que a página do simu usa.
// As de antes: v4 pelo nome do circuito (vira a v5 na 1ª vez) e v3, uma só para tudo
const CHAVE_LAYOUT_ANTIGA = "maisim-scope-layout-v3";
const circuitoDe = (F) => { const m = (F && F.meta) || {}, mod = String(m.modelo || "");
  return mod ? mod.split("/").pop().replace(/\.ipes$/, "") : String(m.planta || ""); };
const donoLayout = (F) => { const m = (F && F.meta) || {}; return String(m.chave_layout || m.modelo || m.planta || ""); };
const chaveLayout = () => { const c = donoLayout(A); return c ? `maisim-scope-layout-v5:${c}` : ""; };
const chaveV4 = () => { const m = (A && A.meta) || {}, c = circuitoDe(A);   // um circuito novo (sem arquivo) não herda o de outro
  return c && !/^novo[: ]/.test(String(m.chave_layout || m.modelo || "")) ? `maisim-scope-layout-v4:${c}` : ""; };
// o layout deste circuito mudou noutra página (o simu, ao escolher a seção e o painel de um sinal; outra janela do scope): remonta
window.addEventListener("storage", (e) => { if (e.key && e.key === chaveLayout()) montaTudo(); });
// medidas no Gecko a cada passo fino. EA … ECA: tensão PWM do conversor calculada das tensões medidas nas pontas das
// cadeias de SMs, e_k = (v_kp + v_kn − V_dc)/2 e e_ab = e_a − e_b. VAB … VCA: tensão nos terminais (depois dos indutores
// de braço), das rodadas gravadas antes de 17/10 11:47
// Os nomes no dicionário (scope.cat.fino_EAB…); os E* já dizem "medida" no nome, os outros ganham o "medida" no rótulo
const MEDIDOS = ["EAB", "EBC", "ECA", "EA", "EB", "EC", "IA", "IB", "IC", "VDC", "VAB", "VBC", "VCA"];
const MEDIDOS_JA = new Set(["EAB", "EBC", "ECA", "EA", "EB", "EC"]);

let modo = "vivo", A = null, B = null;
let itens = [];                   // painéis e títulos de seção, na ordem
let fixar = false, pausado = false;
let xFaixa = null;                // tempo [min, max] em ms dos painéis ligados; null = tudo
let larguraPadrao = 2;            // painéis por linha de um painel novo (e o "Por linha" de todos)
let indice = { aberto: false, unica: false, secao: -1 };   // índice ao lado; secao = ordem da seção mostrada (−1: antes da 1ª)
let sincronizando = false;
let seq = 0;
const $ = (id) => document.getElementById(id);
const paineis = () => itens.filter((x) => x.tipo === "painel");

// ---------------------------------------------------------------- dados
const meta = () => (A && A.meta) || {};
const nSM = () => meta().n_braco || 3;
const nFino = () => meta().n_fino || 20;
const dtFino = () => meta().dt || 1e-6;
const popc = (x) => { let c = 0; x = x | 0; while (x) { x &= x - 1; c++; } return c; };
function nJanelas() {
  let W = A && A.dados.t ? A.dados.t.length : 0;
  if (B && B.dados.t) W = Math.min(W, B.dados.t.length);
  return W;
}
function limpaCaches(F) { if (F) { F.cache = {}; F.cacheFino = {}; } }
// A e B com instantes diferentes (outro intervalo de amostragem — o tempo final ÷ as amostras guardadas — ou outro começo):
// cada uma é desenhada nos SEUS instantes, numa escala de tempo comum (a união dos instantes; spanGaps liga os pontos de
// cada uma), sem inventar valor entre amostras. Achado de Marcelo (19/10): o Comparar casava a amostra k da B com a k da A
// — uma rodada de 200 µs contra uma de 100 µs aparecia no dobro da velocidade, sem aviso
let uniao = null;
const intervalo = (F) => (F && F.meta && F.meta.Ts) || (F && F.dados.t && F.dados.t.length > 1 ? F.dados.t[1] - F.dados.t[0] : 0);
function preparaGrade() {
  uniao = null;
  if (!A || !B || !A.dados.t || !B.dados.t) return;
  const ta = A.dados.t, tb = B.dados.t, n = Math.min(ta.length, tb.length);
  let igual = true; for (let i = 0; i < n; i++) if (Math.abs(ta[i] - tb[i]) > 1e-12) { igual = false; break; }
  if (igual) return;                                   // os mesmos instantes: casar pela amostra está certo (o de sempre)
  const xs = [], iA = [], iB = []; let i = 0, j = 0;
  while (i < ta.length || j < tb.length) {
    const a = i < ta.length ? ta[i] : Infinity, b = j < tb.length ? tb[j] : Infinity;
    if (Math.abs(a - b) <= 1e-12) { xs.push(a); iA.push(i++); iB.push(j++); }
    else if (a < b) { xs.push(a); iA.push(i++); iB.push(-1); }
    else { xs.push(b); iA.push(-1); iB.push(j++); }
  }
  uniao = { x: Float64Array.from(xs, (t) => t * 1e3), iA: Int32Array.from(iA), iB: Int32Array.from(iB) };
}
const avisoGrade = () => uniao ? " · " + tr("scope.aviso_grade", { a: fmtDt(intervalo(A)), b: fmtDt(intervalo(B)) }) : "";

// canal: "f" = tem resolução do passo fino (pulsos, tensões PWM reconstruídas, formas medidas no Gecko)
function tipo(canal) { return /^(s_|varm_|e_[abc]$|fino_)/.test(canal) ? "f" : "c"; }

// valor por janela de controle (média na janela para os canais finos)
function grossa(F, canal) {
  if (!F) return null;
  F.cache = F.cache || {};
  if (canal in F.cache) return F.cache[canal];
  const d = F.dados; const nf = nFino();
  let r = null;
  if (d[canal] && !canal.startsWith("fino_")) r = d[canal];
  else if (canal.startsWith("fino_")) {
    const v = d[canal];
    if (v) { const W = Math.floor(v.length / nf); r = new Float64Array(W);
      for (let w = 0; w < W; w++) { let s = 0, c = 0; for (let i = 0; i < nf; i++) { const x = v[w * nf + i]; if (x != null && x === x) { s += x; c++; } } r[w] = c ? s / c : NaN; } }
  } else if (/^(s_|sig_)/.test(canal)) {
    const [, b, j] = canal.split("_");
    const p = d[`pwm_${b}_${j}`], n = d[`pwmn_${b}_${j}`];
    if (p) { r = new Float64Array(p.length); for (let w = 0; w < p.length; w++) r[w] = (popc(p[w]) - (n ? popc(n[w]) : 0)) / nf; }
  } else if (canal.startsWith("varm_")) {
    const b = canal.slice(5); const vc = [], sg = [];
    for (let j = 1; j <= nSM(); j++) { vc.push(d[`vc_${b}_${j}`]); sg.push(grossa(F, `sig_${b}_${j}`)); }
    if (sg.every(Boolean) && vc.every(Boolean)) {
      const W = sg[0].length; r = new Float64Array(W);
      for (let w = 0; w < W; w++) { let v = 0; for (let j = 0; j < sg.length; j++) v += sg[j][w] * vc[j][w]; r[w] = v; }
    }
  } else if (/^e_[abc]$/.test(canal)) {
    const k = canal[2]; const vu = grossa(F, `varm_${k}u`), vl = grossa(F, `varm_${k}l`);
    if (vu && vl) { r = new Float64Array(vu.length); for (let w = 0; w < vu.length; w++) r[w] = 0.5 * (vl[w] - vu[w]); }
  }
  F.cache[canal] = r;
  return r;
}

// série no passo fino para as janelas w0 … w1 (vetor de (w1 − w0 + 1)·nf amostras); laços só com números
function fina(F, canal, w0, w1, semCache) {
  F.cacheFino = F.cacheFino || {};
  const chave = `${canal}|${w0}|${w1}`;
  if (!semCache && F.cacheFino[chave]) return F.cacheFino[chave];
  const d = F.dados, nf = nFino(), len = (w1 - w0 + 1) * nf;
  const y = new Float64Array(len).fill(NaN);
  if (canal.startsWith("s_")) {
    const [, b, j] = canal.split("_");
    const p = d[`pwm_${b}_${j}`], n = d[`pwmn_${b}_${j}`];
    if (p) for (let w = w0, k = 0; w <= w1; w++) { const mp = p[w] | 0, mn = n ? n[w] | 0 : 0;
      for (let i = 0; i < nf; i++, k++) y[k] = ((mp >> i) & 1) - ((mn >> i) & 1); }
  } else if (canal.startsWith("varm_")) {
    const b = canal.slice(5); y.fill(0);
    for (let j = 1; j <= nSM(); j++) {
      const s = fina(F, `s_${b}_${j}`, w0, w1, semCache), vc = d[`vc_${b}_${j}`];
      if (!vc) continue;
      for (let w = w0, k = 0; w <= w1; w++) { const v = vc[w]; for (let i = 0; i < nf; i++, k++) y[k] += s[k] * v; }
    }
  } else if (/^e_[abc]$/.test(canal)) {
    const k0 = canal[2]; const vu = fina(F, `varm_${k0}u`, w0, w1, semCache), vl = fina(F, `varm_${k0}l`, w0, w1, semCache);
    for (let k = 0; k < len; k++) y[k] = 0.5 * (vl[k] - vu[k]);
  } else if (canal.startsWith("fino_")) {
    const v = d[canal];
    if (v) for (let k = 0, idx = w0 * nf; k < len; k++, idx++) { const x = v[idx]; y[k] = x == null ? NaN : x; }
  } else {
    const g = grossa(F, canal);
    if (g) for (let w = w0, k = 0; w <= w1; w++) { const v = w < g.length ? g[w] : NaN; for (let i = 0; i < nf; i++, k++) y[k] = v; }
  }
  if (!semCache) F.cacheFino[chave] = y;
  return y;
}

function catalogo() {
  const F = A; const lst = [];
  if (!F) return lst;
  // id: o grupo para o código (o nome do grupo é texto, muda com o idioma); braco: o nome do braço, para o rótulo
  const add = (grupo, canal, rotulo, id, braco) => { if (grossa(F, canal)) lst.push({ grupo, canal, rotulo, tipo: tipo(canal), id, braco }); };
  const gCC = tr("scope.cat.g_cc"), gPot = tr("scope.cat.g_potencia"), gRede = tr("scope.cat.g_rede");
  add(gCC, "vdc", "V_dc (V)"); add(gCC, "idc", tr("scope.cat.idc"));
  add(gPot, "P_ref", "P* (W)"); add(gPot, "Q_ref", "Q* (var)");
  for (const k of "abc") { add(gRede, `i${k}`, `i_${k} (A)`); add(gRede, `i${k}_ref`, tr("scope.cat.i_ref", { k })); add(gRede, `v${k}`, tr("scope.cat.v_rede", { k })); }
  for (const n of MEDIDOS) add(tr("scope.cat.g_medidas"), `fino_${n}`, tr(`scope.cat.fino_${n}`), "medidas");
  for (const k of "abc") add(tr("scope.cat.g_pwm"), `e_${k}`, tr("scope.cat.e_perna", { k }));
  for (const b of BRACOS) {
    const g = tr("scope.cat.g_braco", { nome: NOME(b) }), ab = (grupo, canal, rotulo) => add(grupo, canal, rotulo, "braco", NOME(b));
    ab(g, `iarm_${b}`, tr("scope.cat.iarm")); ab(g, `iarm_hat_${b}`, tr("scope.cat.iarm_hat"));
    ab(g, `iarm_ref_${b}`, tr("scope.cat.iarm_ref")); ab(g, `nhat_${b}`, "N̂");
    ab(g, `varm_${b}`, tr("scope.cat.varm"));
    for (let j = 1; j <= nSM(); j++) { ab(g, `vc_${b}_${j}`, `v_c SM${j} (V)`); ab(g, `s_${b}_${j}`, tr("scope.cat.pulso", { j })); ab(g, `sig_${b}_${j}`, tr("scope.cat.sig", { j })); }
  }
  // qualquer outro canal da rodada (ex.: rodadas do /maisim/simu, com os nomes dos rótulos dos medidores)
  const conhecidos = new Set(lst.map((c) => c.canal));
  for (const k of Object.keys(F.dados).sort()) {
    if (k === "t" || conhecidos.has(k) || /^(pwm_|pwmn_|fino_)/.test(k)) continue;
    add(tr("scope.cat.g_rodada"), k, k, "rodada");
  }
  return lst;
}
function rotulo(canal) {
  const c = catalogo().find((x) => x.canal === canal);
  if (!c) return canal;
  if (c.id === "braco") return `${c.braco}: ${c.rotulo}`;
  if (c.id === "medidas") return MEDIDOS_JA.has(c.canal.slice(5)) ? c.rotulo : tr("scope.cat.medida", { rot: c.rotulo });
  return c.rotulo;
}

// ---------------------------------------------------------------- notação matemática (Marcelo, 23/10: "fontes do LaTeX")
// v_o → v itálico com o "o" subscrito, i_L → i com "L", i_Lf_a → i com "Lf,a": na legenda, no título do painel e no PNG.
// A letra do símbolo (uma só) em itálico, como no LaTeX; o subscrito em pé. Sempre assim (Marcelo, 23/10: "sempre marcada,
// mais bonito, mais simples")
const RE_MAT = /(^|[^\p{L}\p{N}_])([A-Za-z]{1,4})_([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)(?![\p{L}\p{N}_])/gu;   // palavras inteiras (saída_x não)
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
const htmlMat = (texto) => partesMat(texto).map((x) => x.txt != null ? escH(x.txt)
  : `<span class="mat"><span class="${x.base.length === 1 ? "mb" : "mr"}">${escH(x.base)}</span><sub>${escH(x.sub)}</sub></span>`).join("");
// no canvas (o PNG): o mesmo, com a fonte do LaTeX (KaTeX) nos nomes com subscrito
function textoMat(g, texto, x, y, px, peso = "") {
  const fam = "system-ui, sans-serif", mat = "KaTeX_Main, 'Latin Modern Roman', 'Times New Roman', serif";
  for (const q of partesMat(texto)) {
    if (q.txt != null) { g.font = `${peso} ${px}px ${fam}`; g.fillText(q.txt, x, y); x += g.measureText(q.txt).width; continue; }
    g.font = q.base.length === 1 ? `italic ${px * 1.15}px KaTeX_Math, ${mat}` : `${px * 1.1}px ${mat}`; g.fillText(q.base, x, y); x += g.measureText(q.base).width + px * 0.05;
    g.font = `${px * 0.8}px ${mat}`; g.fillText(q.sub, x, y + px * 0.3); x += g.measureText(q.sub).width;
  }
}
function legendaMat(p) {                               // os nomes da legenda do uPlot (a 1ª série é o tempo)
  if (!p.u) return;
  p.u.root.querySelectorAll(".u-legend .u-series").forEach((lin, k) => { const l = lin.querySelector(".u-label"), se = p.series[k - 1];
    if (l && se) l.innerHTML = htmlMat(se.rot); });
}
function tituloMat(p) { const t = p.el && p.el.querySelector(".titulo-mat"); if (t) t.innerHTML = htmlMat(p.titulo); }

// ---------------------------------------------------------------- dados de um painel
function seriesDe(p) {
  const out = []; let kp = 0;
  p.sinais.forEach((canal, idx) => {
    const desloc = canal.startsWith("s_") ? 1.3 * kp++ : 0;     // pulsos empilhados, como num analisador lógico
    const ganho = (p.ganhos && p.ganhos[canal]) || 1;            // só no desenho; o cursor mostra o valor real
    const rot = rotulo(canal) + (ganho !== 1 ? ` ×${ganho}` : "") + (desloc ? ` (+${desloc.toFixed(1)})` : "");
    const cor = corDoSinal(canal, idx), w = espessuraDoSinal(canal);
    const traco = TRACOS[tracoDoSinal(canal)];             // B (Comparar) tracejada; só com a A tracejada, B pontilhada
    if (grossa(A, canal)) out.push({ F: A, canal, rot: B ? `${rot} · A` : rot, cor, largura: w, dash: traco || undefined, desloc, ganho, degrau: tipo(canal) === "f" });
    if (B && grossa(B, canal)) out.push({ F: B, canal, rot: `${rot} · B`, cor: corClara(cor), dash: tracoDoSinal(canal) === "tracejada" ? TRACOS.pontilhada : [6, 4], largura: w * 0.92, desloc, ganho, degrau: tipo(canal) === "f" });
  });
  // com o Medir aberto, a curva Σ(t): a soma ponto a ponto dos sinais que estão no Σ da tabela (os mesmos: um clique no
  // nome tira/põe), com os valores reais; o valor no cursor vai para a legenda (Marcelo, 20/10: "a soma tem que ser dos
  // pontos no gráfico também: va(t) + vb(t) + vc(t) = 0"); clicar no Σ da legenda esconde a curva (e a escala volta)
  if (p.med && p.med.aberto) for (const F of B ? [A, B] : [A]) {
    const partes = out.filter((se) => se.F === F && !p.espFora.has(`${se.canal}|${F === A ? "A" : "B"}`)).map((se) => se.canal);
    if (partes.length < 2) continue;
    const suf = B ? (F === A ? " · A" : " · B") : "", comb = p.med.comb || "nenhum";
    for (const [k, rot, div] of [["soma", "Σ", 1], ["media", "x̄", partes.length]])
      if (comb === k || comb === "ambos")
        out.push({ F, soma: partes, comb: k, div, canal: rot, rot: rot + suf, cor: cores()[k], dash: F === B ? [6, 4] : undefined, largura: 2.4,
                   desloc: 0, ganho: 1, degrau: partes.every((c) => tipo(c) === "f") });
  }
  return out;
}
const chaveSe = (se) => `${se.canal}|${se.F === A ? "A" : "B"}`;      // o sinal na tabela, no espectro e no Σ
const seriesMed = (p) => (p.series || []).filter((se) => !se.soma);     // as da tabela da medição (sem a curva Σ)
const assinaturaComb = (ss) => JSON.stringify((ss || []).filter((se) => se.soma).map((se) => [se.comb, se.F === A, se.soma]));
// x̄: a soma dividida pelo número de parcelas (e a escala do resíduo numérico também)
const divide = (se, y) => { if (!(se.div > 1)) return y; se.escala /= se.div; for (let k = 0; k < y.length; k++) if (y[k] != null) y[k] /= se.div; return y; };
// faixa de tempo de um painel: a comum (painel ligado) ou a própria (painel solto); null = tudo
const faixaX = (p) => (p.solto ? p.xZoom : xFaixa) || null;
function modoFino(p) { const f = faixaX(p); return !uniao && p.sinais.some((c) => tipo(c) === "f") && f && (f[1] - f[0]) <= LIMITE_FINO_MS; }

function dadosPainel(p) {
  if (uniao) {                                          // instantes diferentes: cada série nos seus (null nos da outra)
    const n = uniao.x.length;
    return [uniao.x].concat(p.series.map((se) => {
      const idx = se.F === B ? uniao.iB : uniao.iA, y = new Array(n).fill(null);
      if (se.soma) {                                    // Σ: só onde todas as parcelas têm valor
        const gs = se.soma.map((c) => grossa(se.F, c));
        se.escala = gs.reduce((a, g) => a + (g ? g.reduce((m, q) => (q == null || q !== q ? m : Math.max(m, Math.abs(q))), 0) : 0), 0);
        for (let k = 0; k < n; k++) { const w = idx[k]; if (w < 0) continue; let v = 0;
          for (const g of gs) { const q = g && w < g.length ? g[w] : null; if (q == null || q !== q) { v = null; break; } v += q; } y[k] = v; }
        return divide(se, y);
      }
      const g = grossa(se.F, se.canal);
      if (g) for (let k = 0; k < n; k++) { const w = idx[k]; if (w >= 0 && w < g.length && g[w] != null && g[w] === g[w]) y[k] = g[w] * se.ganho + se.desloc; }
      return y;
    }));
  }
  const W = nJanelas(); const t = A.dados.t;
  if (!modoFino(p)) {
    const x = new Float64Array(W);
    for (let w = 0; w < W; w++) x[w] = t[w] * 1e3;
    return [x].concat(p.series.map((se) => {
      if (se.soma) {
        const y = new Float64Array(W); se.escala = 0;
        for (const c of se.soma) { const g = grossa(se.F, c); let e = 0;
          for (let w = 0; w < W; w++) { const v = g && w < g.length ? g[w] : null; y[w] += v == null ? NaN : v; if (v != null && v === v) e = Math.max(e, Math.abs(v)); }
          se.escala += e; }
        return divide(se, y);
      }
      const g = grossa(se.F, se.canal); const y = new Float64Array(W).fill(NaN);
      if (g) for (let w = 0; w < Math.min(W, g.length); w++) { const v = g[w]; y[w] = v == null ? NaN : v * se.ganho + se.desloc; }
      return y;
    }));
  }
  const nf = nFino(), dt = dtFino(), Ts = meta().Ts || nf * dt, fx = faixaX(p);
  const w0 = Math.max(0, Math.floor(fx[0] / (Ts * 1e3)) - 1), w1 = Math.min(W - 1, Math.ceil(fx[1] / (Ts * 1e3)) + 1);
  if (w1 < w0) return [new Float64Array(0)].concat(p.series.map(() => new Float64Array(0)));
  const len = (w1 - w0 + 1) * nf;
  const x = new Float64Array(len);
  for (let w = w0, k = 0; w <= w1; w++) for (let i = 0; i < nf; i++, k++) x[k] = (t[w] + i * dt) * 1e3;
  return [x].concat(p.series.map((se) => {
    if (se.soma) { const y = new Float64Array(len); se.escala = 0;
      for (const c of se.soma) { const f = fina(se.F, c, w0, w1); let e = 0; for (let k = 0; k < len; k++) { y[k] += f[k]; if (f[k] === f[k]) e = Math.max(e, Math.abs(f[k])); } se.escala += e; }
      return divide(se, y); }
    const f = fina(se.F, se.canal, w0, w1);
    if (!se.desloc && se.ganho === 1) return f;
    const y = new Float64Array(len); for (let k = 0; k < len; k++) y[k] = f[k] * se.ganho + se.desloc; return y;
  }));
}

// ---------------------------------------------------------------- escalas
function faixaY(dados, x0, x1, vis) {
  let lo = Infinity, hi = -Infinity; const x = dados[0];
  let k0 = 0; while (k0 < x.length && x[k0] < x0) k0++;
  for (let s = 1; s < dados.length; s++) {
    if (vis && vis[s] === false) continue;           // escondida na legenda
    const y = dados[s];
    for (let k = k0; k < x.length && x[k] <= x1; k++) { const v = y[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  if (!isFinite(lo)) return null;
  if (lo === hi) { lo -= 1; hi += 1; }
  const m = 0.05 * (hi - lo);
  return { min: lo - m, max: hi + m };
}
function atualiza(p) {
  if (!p.u) return;
  const dados = dadosPainel(p);
  const x = dados[0]; if (!x.length) return;
  const f = faixaX(p);
  const fx = f ? { min: f[0], max: f[1] } : (fixar && p.u.scales.x.min != null ? { min: p.u.scales.x.min, max: p.u.scales.x.max } : { min: x[0], max: x[x.length - 1] });
  // vertical: o zoom Y deste painel; senão a escala fixa (Y fixo); senão automática na faixa de tempo visível
  const fy = p.yZoom ? { min: p.yZoom[0], max: p.yZoom[1] } : p.yFixo ? { min: p.yFixo[0], max: p.yFixo[1] }
    : (fixar && p.u.scales.y.min != null ? { min: p.u.scales.y.min, max: p.u.scales.y.max } : faixaY(dados, fx.min, fx.max, p.u.series.map((q) => q.show)));
  sincronizando = true;
  p.u.setData(dados, false);
  p.u.setScale("x", fx);
  if (fy) p.u.setScale("y", fy);
  sincronizando = false;
  if (p.med && p.med.aberto && p.med.fourier) mede(p);   // o Fourier desligado não calcula (ao vivo, seria a cada quadro)
}
let quadroPendente = false;
const pendentes = new Set();
function agenda(lista) {                       // redesenha no próximo quadro (junta vários pedidos)
  for (const p of lista) pendentes.add(p);
  if (quadroPendente) return;
  quadroPendente = true;
  requestAnimationFrame(() => { quadroPendente = false; const ps = [...pendentes]; pendentes.clear(); for (const p of ps) atualiza(p); });
}
// zoom no tempo pedido no painel p: num painel ligado vale para todos os ligados; num painel solto, só para ele
function mudaX(p, faixa) {
  if (p.solto) { p.xZoom = faixa; agenda([p]); return; }
  xFaixa = faixa; agenda(paineis().filter((q) => !q.solto));
}
function reseta(p) { p.yZoom = null; mudaX(p, null); }      // o enquadrar: vertical automática (ou o Y fixo) e o tempo todo

// ---------------------------------------------------------------- medição num intervalo
// Mesmo método de smauto.metrics (window, harmonic_phasors, thd), para os números baterem com os scripts e o artigo:
// janela de n períodos inteiros de f₀ a partir de t₀, com as amostras t₀ − 1 ns ≤ t < t₀ + n/f₀ − 1 ns; DFT de N pontos;
// harmônico h no bin k = h·n, pico = |X_k|·2/N e fase do cosseno = ângulo de X_k (t = 0 no início da janela);
// THD = √(Σ |X_hn|², h = 2 … 50, hn < N/2 + 1) / |X_n|, sobre x − média. Sempre o valor real (sem o ×k nem o
// empilhamento da tela); canais "passo fino" no passo fino (1 µs), os outros a cada janela de controle.
// comb: o que a medição mostra dos sinais juntos — "soma" (Σ), "media" (x̄ = Σ/n, a média instantânea dos n sinais; Marcelo,
// 20/10: "a média da soma no instante, 10 sinais: soma os 10 e divide por 10"), "ambos" ou "nenhum" (o padrão, 23/10); oculta: as
// curvas escondidas na legenda ({soma, media}), guardadas no layout
const MED_PADRAO = { aberto: false, t0: 0, n: 1, f0: 50, hs: "1, 2, 3", comb: "nenhum", oculta: {}, imp: { on: false, ate: 15 }, par: { on: false, ate: 10 },
                     esp: { aberto: false, hmax: 50, log: true, dec: 4 }, cur: { on: false, a: null, b: null, yon: false, ya: null, yb: null }, fourier: true };
const novaMed = (cfg) => { const c = cfg || {}, m = Object.assign({}, MED_PADRAO, c); m.oculta = Object.assign({}, c.oculta || {});
  for (const k of ["imp", "par", "esp", "cur"]) m[k] = Object.assign({}, MED_PADRAO[k], c[k] || {});
  return m; };
// harmônicos da tabela: a lista por vírgulas, mais os ímpares e/ou os pares até o valor marcado (em ordem, sem repetir)
function hsDe(M) {
  const s = new Set(String(M.hs || "").trim() ? leHs(M.hs) || [] : []);
  if (M.imp.on) for (let h = 1; h <= M.imp.ate; h += 2) s.add(h);
  if (M.par.on) for (let h = 2; h <= M.par.ate; h += 2) s.add(h);
  const hs = [...s].sort((a, b) => a - b).slice(0, 100);
  return hs.length ? hs : [1];
}
function amostras(F, canal, t0, t1) {               // t0, t1 em s
  const t = F.dados.t; if (!t || !t.length) return null;
  const a = t0 - 1e-9, b = t1 - 1e-9, xs = []; let faltam = 0, dt;
  if (tipo(canal) === "f") {
    const nf = nFino(); dt = dtFino();
    let w0 = 0; while (w0 < t.length && t[w0] + (nf - 1) * dt < a) w0++;
    if (w0 >= t.length) return { x: new Float64Array(0), dt, faltam };
    let w1 = w0; while (w1 + 1 < t.length && t[w1 + 1] < b) w1++;
    const y = fina(F, canal, w0, w1, true);
    for (let w = w0, k = 0; w <= w1; w++) for (let i = 0; i < nf; i++, k++) {
      const tt = t[w] + i * dt; if (tt >= a && tt < b) { const v = y[k]; if (v !== v) faltam++; xs.push(v); }
    }
  } else {
    const g = grossa(F, canal); if (!g) return null;
    dt = intervalo(F);                                  // o intervalo DESTA rodada (a B pode ter outro: antes usava o da A)
    for (let w = 0, W = Math.min(t.length, g.length); w < W; w++) {
      const tt = t[w]; if (tt >= a && tt < b) { const v = g[w] == null ? NaN : +g[w]; if (v !== v) faltam++; xs.push(v); }
    }
  }
  return { x: Float64Array.from(xs), dt, faltam };
}
function binsDFT(x, ks) {                            // X_k = Σ x[m]·e^(−j2πkm/N); rotação com ressincronia a cada 1024
  const N = x.length;
  return ks.map((k) => {
    const w = -2 * Math.PI * k / N, cw = Math.cos(w), sw = Math.sin(w);
    let re = 0, im = 0, c = 1, s = 0;
    for (let m = 0; m < N; m++) {
      if ((m & 1023) === 0) { const ang = -2 * Math.PI * ((k * m) % N) / N; c = Math.cos(ang); s = Math.sin(ang); }
      re += x[m] * c; im += x[m] * s;
      const c2 = c * cw - s * sw; s = c * sw + s * cw; c = c2;
    }
    return [re, im];
  });
}
// X_{h·n} para cada h, de x com a média já tirada. Com N = n·P (P inteiro), somar os n períodos num só é exato para os
// bins múltiplos de n, e a DFT roda sobre P amostras; senão (f₀ que não divide o passo), DFT direta nos bins h·n.
function binsH(xc, n, hs) {
  const N = xc.length;
  if (N % n) return binsDFT(xc, hs.map((h) => h * n));
  const P = N / n, y = new Float64Array(P);
  for (let m = 0; m < N; m++) y[m % P] += xc[m];
  return binsDFT(y, hs);
}
function leHs(txt) {                                 // "1, 2, 3" ou "1-7" ou "1, 3, 5-9"
  const hs = [];
  for (const parte of String(txt).split(/[,; ]+/).filter(Boolean)) {
    const m = parte.match(/^(\d+)(?:-(\d+))?$/); if (!m) return null;
    const a = +m[1], b = m[2] ? +m[2] : a; if (a < 1 || b < a || b > 500) return null;
    for (let h = a; h <= b; h++) if (!hs.includes(h)) hs.push(h);
  }
  return hs.length && hs.length <= 60 ? hs : null;
}
function mede1(F, canal, M, hs) {
  const T = M.n / M.f0, t0 = M.t0 / 1e3;
  const am = amostras(F, canal, t0, t0 + T);
  if (!am) return { erro: tr("scope.med.e_sem_dados") };
  const N = am.x.length, Nexato = T / am.dt, Nesp = Math.round(Nexato);
  if (!N) return { erro: tr("scope.med.e_sem_amostras") };
  // o passo do scope nem sempre divide o período (ex.: 380 µs e 20 ms: 13 períodos = 684,2 amostras); até uma amostra de
  // diferença é a janela inteira (antes: "janela incompleta: 685 de 684 amostras" e nada medido)
  if (N !== Nesp && Math.abs(N - Nexato) >= 1) return { erro: tr("scope.med.e_incompleta", { N, Nesp }), N, dt: am.dt };
  if (am.faltam) return { erro: tr("scope.med.e_faltam", { k: am.faltam }), N, dt: am.dt };
  return analisa(am.x, am.dt, M, hs);
}
// mínimos quadrados de x[m] ≈ a₀ + Σ a_h cos(h ω m dt) + b_h sin(h ω m dt): [a₀, a_h1, b_h1, a_h2, …] (equações normais,
// eliminação de Gauss com pivô parcial; K ≤ 2·|hh| + 1)
function ajusteLS(x, dt, f0, hh) {
  const N = x.length, K = 2 * hh.length + 1, G = new Float64Array(K * K), y = new Float64Array(K), phi = new Float64Array(K);
  const w = hh.map((h) => 2 * Math.PI * h * f0 * dt);
  phi[0] = 1;
  for (let m = 0; m < N; m++) {
    for (let i = 0; i < hh.length; i++) { const a = w[i] * m; phi[1 + 2 * i] = Math.cos(a); phi[2 + 2 * i] = Math.sin(a); }
    const xm = x[m];
    for (let i = 0; i < K; i++) { const pi = phi[i]; y[i] += pi * xm; const o = i * K; for (let j = i; j < K; j++) G[o + j] += pi * phi[j]; }
  }
  for (let i = 0; i < K; i++) for (let j = 0; j < i; j++) G[i * K + j] = G[j * K + i];
  for (let col = 0; col < K; col++) {
    let piv = col; for (let r = col + 1; r < K; r++) if (Math.abs(G[r * K + col]) > Math.abs(G[piv * K + col])) piv = r;
    if (piv !== col) { for (let j = 0; j < K; j++) { const t = G[col * K + j]; G[col * K + j] = G[piv * K + j]; G[piv * K + j] = t; } const t = y[col]; y[col] = y[piv]; y[piv] = t; }
    const d = G[col * K + col]; if (!(Math.abs(d) > 0)) continue;
    for (let r = col + 1; r < K; r++) { const f = G[r * K + col] / d; if (!f) continue; for (let j = col; j < K; j++) G[r * K + j] -= f * G[col * K + j]; y[r] -= f * y[col]; }
  }
  const th = new Float64Array(K);
  for (let i = K - 1; i >= 0; i--) { let v = y[i]; for (let j = i + 1; j < K; j++) v -= G[i * K + j] * th[j]; const d = G[i * K + i]; th[i] = Math.abs(d) > 0 ? v / d : 0; }
  return th;
}
// média, harmônicos (pico ∠ fase), THD e espectro de x (N amostras de passo dt, cobrindo n períodos de f₀)
function analisa(x, dt, M, hs, escalaRef = 0) {
  const N = x.length, n = M.n;
  const hE = M.esp && M.esp.aberto ? M.esp.hmax : 0;
  const todos = new Set([1]); for (let h = 2; h <= 50; h++) todos.add(h);
  hs.forEach((h) => todos.add(h)); for (let h = 1; h <= hE; h++) todos.add(h);
  const c = {};
  let media;
  // N·dt = n períodos (o de sempre): DFT nos bins h·n. Senão (o passo não divide o período, ex.: 380 µs), a janela tem
  // uma fração de amostra a mais ou a menos e a DFT vaza (h3 com 2 % de erro num teste): ajuste de mínimos quadrados da
  // média e dos harmônicos de f₀ até 80 % da metade da taxa, que não depende de períodos inteiros
  const inteiro = Math.abs(N * dt * M.f0 - n) < 1e-6 * n;
  if (inteiro) {
    let soma = 0; for (let m = 0; m < N; m++) soma += x[m];
    media = soma / N;
    const xc = new Float64Array(N); for (let m = 0; m < N; m++) xc[m] = x[m] - media;
    const lim = Math.floor(N / 2) + 1, cabe = (h) => h * n < lim;     // bins até a metade da taxa (como o rfft)
    const hh = [...todos].filter(cabe), X = binsH(xc, n, hh);
    hh.forEach((h, i) => { c[h] = X[i]; });
  } else {
    const hh = [...todos].filter((h) => h * M.f0 * dt < 0.4).sort((a, b) => a - b), th = ajusteLS(x, dt, M.f0, hh);
    media = th[0];
    hh.forEach((h, i) => { c[h] = [th[1 + 2 * i] * N / 2, -th[2 + 2 * i] * N / 2]; });   // x ≈ a cos + b sin → fasor a − jb
  }
  const pico = (h) => Math.hypot(c[h][0], c[h][1]) * 2 / N, fase = (h) => Math.atan2(c[h][1], c[h][0]) * 180 / Math.PI;
  const fund = c[1] ? Math.hypot(c[1][0], c[1][1]) : 0;
  let s2 = 0; for (let h = 2; h <= 50; h++) if (c[h]) s2 += c[h][0] ** 2 + c[h][1] ** 2;
  // zero numérico (ex.: a fundamental de va + vb + vc): sem fase e sem THD (antes, 4·10¹⁶ % e um ângulo de ruído)
  let escala = escalaRef; for (let m = 0; m < N; m++) escala = Math.max(escala, Math.abs(x[m]));
  if (Math.abs(media) <= 1e-9 * escala) media = 0;
  const zero = (h) => Math.hypot(c[h][0], c[h][1]) * 2 / N <= 1e-9 * escala;
  const thd = fund > 0 && !zero(1) ? 100 * Math.sqrt(s2) / fund : NaN;
  const harm = hs.map((h) => c[h] ? (zero(h) ? [0, NaN] : [pico(h), fase(h)]) : null);
  const espec = hE ? [[Math.abs(media), media < 0 ? 180 : 0]].concat(Array.from({ length: hE }, (_, i) => c[i + 1] ? [pico(i + 1), fase(i + 1)] : null)) : null;
  return { media, harm, thd, espec, N, dt, x, aprox: !inteiro };
}
// Σ: a soma, ponto a ponto, dos sinais de uma rodada que estão na tabela (sem os tirados com um clique no nome), com os
// valores reais (sem o ×k nem o empilhamento do desenho), medida como um sinal (Marcelo, 20/10: "podia ter um somatório";
// ex.: va + vb + vc → a sequência zero; os 3 SMs de um braço → a tensão do braço; as 18 v_c → a energia total)
function medeSoma(lista, M, hs) {
  const ok = lista.filter((x) => !x.r.erro);
  if (ok.length < 2) return { erro: lista.length < 2 ? "" : tr("scope.med.e_soma_min"), parte: ok };
  const dt = ok[0].r.dt, N = ok[0].r.N;
  const outro = ok.find((x) => Math.abs(x.r.dt - dt) > 1e-12 * dt || x.r.N !== N);
  if (outro) return { erro: tr("scope.med.e_soma_passos", { a: ok[0].nome, dta: fmtDt(dt), b: outro.nome, dtb: fmtDt(outro.r.dt) }), parte: ok };
  const soma = new Float64Array(N);
  for (const x of ok) for (let m = 0; m < N; m++) soma[m] += x.r.x[m];
  let escala = 0; for (const x of ok) { let e = 0; for (let m = 0; m < N; m++) e = Math.max(e, Math.abs(x.r.x[m])); escala += e; }
  return Object.assign(analisa(soma, dt, M, hs, escala), { parte: ok });   // zero numérico medido pela escala das parcelas
}
const fmtM = (v) => v == null || !isFinite(v) ? "–" : (Math.abs(v) >= 1000 ? v.toFixed(1) : +v.toPrecision(5));
function divideRes(r, k) {                            // a linha x̄ = a linha Σ ÷ k (média, picos; fases e THD iguais)
  return Object.assign({}, r, { media: r.media / k, harm: r.harm.map((c) => c ? [c[0] / k, c[1]] : c) });
}
function celulasMed(r, hs) {                         // as colunas de uma linha da tabela da medição
  const n = `<td${r.aprox ? ` title="${escH(tr("scope.med.t_aprox"))}"` : ""}>${r.aprox ? "≈ " : ""}${r.N || "–"}${r.dt ? ` <span>· ${fmtDt(r.dt)}</span>` : ""}</td></tr>`;
  if (r.erro) return `<td colspan="${hs.length + 2}" class="erro">${escH(r.erro)}</td>` + n;
  return `<td>${fmtM(r.media)}</td>` + r.harm.map((c) => c ? `<td>${fmtM(c[0])}${isFinite(c[1]) ? ` ∠ ${c[1].toFixed(1)}°` : ""}</td>` : `<td title="${escH(tr("scope.med.t_acima"))}">–</td>`).join("") +
         `<td>${isFinite(r.thd) ? r.thd.toFixed(2) + " %" : "–"}</td>` + n;
}
const fmtDt = (dt) => dt >= 1e-3 ? `${+(dt * 1e3).toPrecision(4)} ms` : `${+(dt * 1e6).toPrecision(4)} µs`;
function mede(p) {
  const M = p.med, box = p.el.querySelector(".medicao");
  if (!box || !M.aberto) return;
  const hs = hsDe(M);
  const chave = JSON.stringify([M.t0, M.n, M.f0, hs, M.esp.aberto && M.esp.hmax, M.comb, seriesMed(p).map((se) => [se.canal, se.F === A ? "A" : "B"]),
                                A && A.dados.t ? A.dados.t.length : 0, B && B.dados.t ? B.dados.t.length : 0, A && A.meta.rotulo, B && B.meta.rotulo,
                                A && A.ger, [...p.espFora].sort()]);   // A.ger: a rodada voltou inteira numa reconexão; espFora: o Σ
  const tab = box.querySelector(".med-tab");
  if (tab.dataset.chave === chave) return;
  tab.dataset.chave = chave;
  const fim = M.t0 + M.n * 1e3 / M.f0;
  box.querySelector(".med-jan").textContent = `= ${+M.t0.toFixed(3)} … ${+fim.toFixed(3)} ms`;
  p.medRes = [];
  if (!seriesMed(p).length) { tab.innerHTML = `<i>${escH(tr("scope.med.sem_sinais"))}</i>`; desenhaEspectro(p); return; }
  let html = `<table><thead><tr><th>${escH(tr("scope.med.sinal"))}</th><th>${escH(tr("scope.med.media"))}</th>${hs.map((h) => `<th>h${h} · ${+(h * M.f0).toPrecision(5)} Hz<br><span>${escH(tr("scope.med.pico_fase"))}</span></th>`).join("")}<th>THD<br><span>h 2–50</span></th><th>N<br><span>${escH(tr("scope.med.passo"))}</span></th></tr></thead><tbody>`;
  for (const se of seriesMed(p)) {
    const r = mede1(se.F, se.canal, M, hs);
    const nome = rotulo(se.canal) + (B ? (se.F === A ? " · A" : " · B") : ""), ch = `${se.canal}|${se.F === A ? "A" : "B"}`;
    p.medRes.push({ se, r, nome, chave: ch });
    html += `<tr data-chave="${ch}" class="${p.espFora.has(ch) ? "fora" : ""}"><td class="nome" title="${escH(tr("scope.med.t_nome"))}"><i style="background:${se.cor}"></i>${htmlMat(nome)}</td>`;
    html += celulasMed(r, hs);
  }
  // Σ de cada rodada (A; e B, no Comparar), com os sinais que não foram tirados
  for (const F of B ? [A, B] : [A]) {
    const lista = p.medRes.filter((x) => x.se.F === F && !p.espFora.has(x.chave));
    if (p.medRes.filter((x) => x.se.F === F).length < 2) continue;
    const r = medeSoma(lista, M, hs), suf = B ? (F === A ? " · A" : " · B") : "", np = (r.parte || []).length;
    const quem = (r.parte || []).map((x) => x.nome).join(" + ") || tr("scope.med.nenhum"), comb = M.comb || "nenhum";   // comb: o valor guardado
    for (const [k, rot, dica] of [["soma", "Σ", tr("scope.med.t_soma", { quem })], ["media", "x̄", tr("scope.med.t_media", { np, quem })]]) {
      if (comb !== k && comb !== "ambos") continue;
      html += `<tr class="soma"><td class="nome-soma" title="${escH(dica)}">${rot}${suf} <span>(${tr("scope.n_sinais", { n: np })})</span></td>`;
      html += r.erro !== undefined ? `<td colspan="${hs.length + 3}" class="erro">${escH(r.erro || tr("scope.med.min2", { rot }))}</td></tr>`
                                   : celulasMed(k === "media" ? divideRes(r, np) : r, hs);
    }
  }
  tab.innerHTML = html + "</tbody></table>";
  tab.querySelectorAll("td.nome").forEach((td) => td.onclick = () => {
    const ch = td.parentElement.dataset.chave;
    if (p.espFora.has(ch)) p.espFora.delete(ch); else p.espFora.add(ch);
    td.parentElement.classList.toggle("fora", p.espFora.has(ch));
    if (p.u) criaGrafico(p); else mede(p);              // a curva dele some/volta e o Σ(t) muda junto (criaGrafico → atualiza → mede)
  });
  desenhaEspectro(p);
}

// ---- espectro: barras dos harmônicos (CC, h = 1 … h máx) de cada sinal da tabela, pico; passar o mouse mostra os valores
function desenhaEspectro(p) {
  const M = p.med, cx = p.el.querySelector(".esp");
  p.el.querySelector(".m-esp").classList.toggle("ativo", M.esp.aberto);
  cx.style.display = M.aberto && M.esp.aberto ? "" : "none";
  if (!M.aberto || !M.esp.aberto) return;
  cx.querySelector(".m-hmax").value = M.esp.hmax; cx.querySelector(".m-log").checked = M.esp.log;
  cx.querySelector(".m-dec").value = M.esp.dec; cx.querySelector(".m-dec").disabled = !M.esp.log;
  const cv = cx.querySelector("canvas"), r = devicePixelRatio || 1, W = Math.max(300, cx.clientWidth), H = 270;
  cv.width = Math.round(W * r); cv.height = Math.round(H * r); cv.style.width = `${W}px`; cv.style.height = `${H}px`;
  const g = cv.getContext("2d"); g.setTransform(r, 0, 0, r, 0, 0); g.clearRect(0, 0, W, H);
  const C = cores();
  g.font = "11px system-ui, sans-serif"; g.fillStyle = C.texto;
  const L = 64, R = 10, T = 10, Bm = 34, pw = W - L - R, ph = H - T - Bm, hmax = M.esp.hmax;
  const ls = (p.medRes || []).filter((x) => x.r.espec && !p.espFora.has(x.chave));
  let ymax = 0; for (const x of ls) for (const v of x.r.espec) if (v && v[0] > ymax) ymax = v[0];
  p.espGeo = null;
  if (!ls.length || !(ymax > 0)) { g.fillText(tr(ls.length ? "scope.esp.sem_valores" : "scope.esp.sem_sinal"), L, T + 16); return; }
  // log: M.esp.dec décadas abaixo do maior; marcas em 1, 2 e 5 de cada década (rótulo em 2 e 5 quando cabe), para que
  // um fator 2 (ex.: 10 A no braço × 20 A na fase) se leia no eixo e não só pela altura da barra
  const log = M.esp.log, lo = log ? Math.log10(ymax) - M.esp.dec : 0, hi = log ? Math.log10(ymax) + 0.12 : ymax * 1.06;
  const yPos = (v) => T + ph * (1 - ((log ? Math.log10(Math.max(v, 10 ** lo)) : v) - lo) / (hi - lo));
  g.lineWidth = 1; g.textAlign = "right"; g.textBaseline = "middle";
  const marcas = [];                                    // [valor, linha principal, rótulo]
  if (log) {
    const rot25 = 0.301 * ph / (hi - lo) >= 13;         // 2 e 5 com rótulo se ficam a 13 px ou mais do vizinho
    for (let k = Math.floor(lo); k <= Math.ceil(hi); k++) for (const m of [1, 2, 5]) {
      const lv = Math.log10(m * 10 ** k); if (lv >= lo - 1e-9 && lv <= hi + 1e-9) marcas.push([m * 10 ** k, m === 1, m === 1 || rot25]);
    }
  } else {
    const passo = (() => { const b = 10 ** Math.floor(Math.log10(hi / 4)); return [1, 2, 5, 10].map((m) => m * b).find((q) => hi / q <= 6); })();
    for (let k = 0; k * passo <= hi; k++) marcas.push([k * passo, true, true]);
  }
  for (const [v, forte, rot] of marcas) {
    const y = Math.round(yPos(v)) + 0.5;
    g.strokeStyle = forte ? C.gradeForte : C.gradeFraca; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
    if (rot) { g.fillStyle = forte ? C.textoForte : C.textoFraco; g.fillText(fmtM(+v.toPrecision(3)), L - 6, y); }
  }
  const slot = pw / (hmax + 1), bw = Math.max(1, slot * 0.8 / ls.length);
  ls.forEach((x, k) => {
    g.fillStyle = x.se.cor;
    for (let h = 0; h <= hmax; h++) { const v = x.r.espec[h]; if (!v || !(v[0] > 0)) continue;
      const y = yPos(v[0]), x0 = L + h * slot + slot * 0.1 + k * bw; if (y < T + ph) g.fillRect(x0, y, bw, T + ph - y); }
  });
  g.strokeStyle = C.base; g.beginPath(); g.moveTo(L, T + ph + 0.5); g.lineTo(L + pw, T + ph + 0.5); g.stroke();
  g.fillStyle = C.texto; g.textAlign = "center"; g.textBaseline = "top";
  const passoH = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => s * slot >= 26) || 1000;
  for (let h = 0; h <= hmax; h += passoH) g.fillText(h ? String(h) : tr("scope.esp.cc"), L + (h + 0.5) * slot, T + ph + 4);
  g.fillText(tr(log ? "scope.esp.eixo_log" : "scope.esp.eixo", { f0: +M.f0 }), L + pw / 2, T + ph + 19);
  p.espGeo = { L, slot, hmax, T, ph, marcas: marcas.filter((m) => m[2]).map((m) => +m[0].toPrecision(3)), yPos };
}
function dicaEspectro(p, e) {
  const dica = p.el.querySelector(".esp-dica"), G = p.espGeo;
  const h = G ? Math.floor((e.offsetX - G.L) / G.slot) : -1;
  if (!G || h < 0 || h > G.hmax || e.offsetY > G.T + G.ph) { dica.style.display = "none"; return; }
  const ls = p.medRes.filter((x) => x.r.espec && !p.espFora.has(x.chave));
  dica.innerHTML = `<b>${h ? `h${h} · ${+(h * p.med.f0).toPrecision(6)} Hz` : escH(tr("scope.esp.cc_media"))}</b>` + ls.map((x) => {
    const v = x.r.espec[h], f1 = x.r.espec[1];
    const val = !v ? escH(tr("scope.esp.acima")) : h ? `${fmtM(v[0])} ∠ ${v[1].toFixed(1)}°${f1 && f1[0] > 0 ? ` · ${escH(tr("scope.esp.pct_h1", { p: fmtM(100 * v[0] / f1[0]) }))}` : ""}` : fmtM(x.r.media);
    return `<div><i style="background:${x.se.cor}"></i>${escH(x.nome)}: ${val}</div>`; }).join("");
  dica.style.display = "block";
  const cw = p.el.querySelector(".esp").clientWidth, dw = dica.offsetWidth;
  dica.style.left = `${Math.min(e.offsetX + 14, cw - dw - 4)}px`; dica.style.top = `${Math.max(0, e.offsetY - 10)}px`;
}
function mudaMed(p, guarda = true) {                   // depois de mudar t₀, n, f₀ ou harmônicos
  const box = p.el.querySelector(".medicao"), M = p.med;
  box.style.display = M.aberto ? "" : "none";
  p.el.querySelector(".b-med").classList.toggle("ativo", M.aberto);
  box.classList.toggle("sem-fourier", !M.fourier);
  box.querySelectorAll(".m-modo").forEach((bt) => bt.classList.toggle("ativo", { fourier: M.fourier, ct: M.cur.on, cy: M.cur.yon }[bt.dataset.k]));
  if (M.aberto) { leituraCur(p); box.querySelector(".m-comb").value = M.comb || "nenhum"; }
  if (M.aberto && M.fourier) {
    box.querySelector(".m-t0").value = +M.t0.toFixed(3); box.querySelector(".m-n").value = M.n;
    box.querySelector(".m-f0").value = M.f0; box.querySelector(".m-hs").value = M.hs;
    for (const k of ["imp", "par"]) { box.querySelector(`.m-${k}`).checked = M[k].on; box.querySelector(`.m-${k}-n`).value = M[k].ate; }
    box.querySelector(".med-tab").dataset.chave = "";
    mede(p);
  }
  if (p.u && assinaturaComb(seriesDe(p)) !== assinaturaComb(p.series)) criaGrafico(p);   // as curvas Σ(t)/x̄(t) entram ou saem
  else if (p.u) p.u.redraw(false, false);
  if (guarda) guardaLayout();                          // não durante a montagem: gravaria o layout pela metade
}
function intervaloMed(p, a, b) {                       // a, b em ms: começa em a, períodos inteiros de f₀ (pelo menos 1)
  const M = p.med; M.aberto = true; M.fourier = true;   // escolher o intervalo é do Fourier: liga se estava desligado
  M.t0 = Math.round(Math.min(a, b) * 1e3) / 1e3;
  M.n = Math.max(1, Math.floor(Math.abs(b - a) * M.f0 / 1e3 + 1e-9));
  mudaMed(p);
}
function visivel(p) {
  if (p.u && p.u.scales.x.min != null) return [p.u.scales.x.min, p.u.scales.x.max];
  const t = A && A.dados.t; return t && t.length ? [t[0] * 1e3, t[t.length - 1] * 1e3] : [0, 1];
}
function caixaMed(p) {
  const box = document.createElement("div"); box.className = "medicao"; box.style.display = "none";
  // os textos que não mudam depois de montados levam data-tr*: o aplica() do maisim-i18n troca na hora, ao mudar o idioma
  box.innerHTML = `<div class="med-topo"><b title="${escH(tr("scope.med.t_titulo"))}" data-tr-title="scope.med.t_titulo" data-tr="scope.med.titulo">${escH(tr("scope.med.titulo"))}</b>
    <span class="med-modos" title="${escH(tr("scope.med.t_modos"))}" data-tr-title="scope.med.t_modos">
      <button class="m-modo" data-k="fourier" title="${escH(tr("scope.med.t_fourier"))}" data-tr-title="scope.med.t_fourier">Fourier</button><button
        class="m-modo" data-k="ct" title="${escH(tr("scope.med.t_ct"))}" data-tr-title="scope.med.t_ct" data-tr="scope.med.cursores">${escH(tr("scope.med.cursores"))} <i>t</i></button><button
        class="m-modo" data-k="cy" title="${escH(tr("scope.med.t_cy"))}" data-tr-title="scope.med.t_cy" data-tr="scope.med.cursores">${escH(tr("scope.med.cursores"))} <i>y</i></button></span>
    <label class="m-comb-l" title="${escH(tr("scope.med.t_combinar"))}" data-tr-title="scope.med.t_combinar" data-tr="scope.med.combinar">${escH(tr("scope.med.combinar"))} <select class="m-comb"><option value="nenhum" data-tr="scope.med.c_nenhum">${escH(tr("scope.med.c_nenhum"))}</option><option value="ambos" data-tr="scope.med.c_ambos">${escH(tr("scope.med.c_ambos"))}</option><option value="soma" data-tr="scope.med.c_soma">${escH(tr("scope.med.c_soma"))}</option><option value="media" data-tr="scope.med.c_media">${escH(tr("scope.med.c_media"))}</option></select></label>
    <span class="med-dica" data-tr="scope.med.dica">${escH(tr("scope.med.dica"))}</span><button class="m-fecha" title="${escH(tr("scope.med.t_fecha"))}" data-tr-title="scope.med.t_fecha">✕</button></div>
    <div class="med-cab">
    <label>t₀ <input type="number" step="any" class="m-t0"> ms</label>
    <label data-tr="scope.med.periodos"><input type="number" step="1" min="1" class="m-n"> ${escH(tr("scope.med.periodos"))}</label>
    <label>f₀ <input type="number" step="any" min="0" class="m-f0"> Hz</label> <span class="med-jan"></span>
    <label data-tr="scope.med.harmonicos">${escH(tr("scope.med.harmonicos"))} <input type="text" class="m-hs" title="${escH(tr("scope.med.t_hs"))}" data-tr-title="scope.med.t_hs"></label>
    <label title="${escH(tr("scope.med.t_imp"))}" data-tr-title="scope.med.t_imp" data-tr="scope.med.imp"><input type="checkbox" class="m-imp"> ${escH(tr("scope.med.imp"))} <input type="number" min="1" max="199" step="1" class="m-imp-n"></label>
    <label title="${escH(tr("scope.med.t_par"))}" data-tr-title="scope.med.t_par" data-tr="scope.med.par"><input type="checkbox" class="m-par"> ${escH(tr("scope.med.par"))} <input type="number" min="2" max="200" step="1" class="m-par-n"></label>
    <button class="m-vis" title="${escH(tr("scope.med.t_vis"))}" data-tr-title="scope.med.t_vis" data-tr="scope.med.vis">${escH(tr("scope.med.vis"))}</button>
    <button class="m-esp" title="${escH(tr("scope.med.t_esp"))}" data-tr-title="scope.med.t_esp" data-tr="scope.med.esp">${escH(tr("scope.med.esp"))}</button>
    </div>
    <div class="med-tab"></div><div class="med-cur"></div>
    <div class="esp" style="display:none"><div class="esp-cab"><label data-tr="scope.med.ate_h">${escH(tr("scope.med.ate_h"))} <input type="number" min="1" max="1000" step="1" class="m-hmax"></label>
      <label title="${escH(tr("scope.med.t_log"))}" data-tr-title="scope.med.t_log"><input type="checkbox" class="m-log"> log</label>
      <label title="${escH(tr("scope.med.t_decadas"))}" data-tr-title="scope.med.t_decadas" data-tr="scope.med.decadas">${escH(tr("scope.med.decadas"))} <input type="number" min="1" max="8" step="1" class="m-dec"></label></div>
      <canvas></canvas><div class="esp-dica"></div></div>`;
  const M = p.med;
  box.querySelector(".m-esp").onclick = () => { M.esp.aberto = !M.esp.aberto; mudaMed(p); };
  box.querySelector(".m-comb").onchange = (e) => { M.comb = e.target.value; mudaMed(p); };
  box.querySelector(".m-hmax").onchange = (e) => { const v = Math.round(+e.target.value); if (v >= 1 && v <= 1000) M.esp.hmax = v; mudaMed(p); };
  box.querySelector(".m-log").onchange = (e) => { M.esp.log = e.target.checked; guardaLayout(); desenhaEspectro(p); };
  box.querySelector(".m-dec").onchange = (e) => { const v = Math.round(+e.target.value); if (v >= 1 && v <= 8) M.esp.dec = v; guardaLayout(); desenhaEspectro(p); };
  const cv = box.querySelector(".esp canvas");
  cv.addEventListener("mousemove", (e) => dicaEspectro(p, e));
  cv.addEventListener("mouseleave", () => { box.querySelector(".esp-dica").style.display = "none"; });
  box.querySelector(".m-t0").onchange = (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) M.t0 = Math.round(v * 1e3) / 1e3; mudaMed(p); };
  box.querySelector(".m-n").onchange = (e) => { const v = Math.round(+e.target.value); if (v >= 1) M.n = v; mudaMed(p); };
  box.querySelector(".m-f0").onchange = (e) => { const v = parseFloat(e.target.value); if (v > 0) M.f0 = v; mudaMed(p); };
  box.querySelector(".m-hs").onchange = (e) => { const v = e.target.value.trim(); if (!v || leHs(v)) M.hs = v; mudaMed(p); };
  for (const k of ["imp", "par"]) {
    box.querySelector(`.m-${k}`).onchange = (e) => { M[k].on = e.target.checked; mudaMed(p); };
    box.querySelector(`.m-${k}-n`).onchange = (e) => { const v = Math.round(+e.target.value); if (v >= 1 && v <= 200) { M[k].ate = v; M[k].on = true; } mudaMed(p); };
  }
  box.querySelector(".m-vis").onclick = () => { const [a, b] = visivel(p); intervaloMed(p, a, b); };
  box.querySelector(".m-fecha").onclick = () => { M.aberto = false; mudaMed(p); };
  // os modos (Marcelo, 23/10: "ora os Δ, ora o Fourier, ora os dois"): cada botão liga e desliga a sua parte
  box.querySelectorAll(".m-modo").forEach((bt) => bt.onclick = () => {
    const k = bt.dataset.k, C = M.cur;
    if (k === "fourier") M.fourier = !M.fourier;
    // ao ligar: se a posição guardada está vazia ou fora do que está à vista (outra rodada, outro zoom), volta ao terço e aos dois terços
    const fora = (v, a, b) => v == null || !isFinite(v) || v < Math.min(a, b) || v > Math.max(a, b);
    if (k === "ct") { C.on = !C.on; const [a, b] = visivel(p); if (C.on && (fora(C.a, a, b) || fora(C.b, a, b))) { C.a = a + (b - a) / 3; C.b = a + 2 * (b - a) / 3; } }
    if (k === "cy") { C.yon = !C.yon; const mn = p.u ? p.u.scales.y.min : null, mx = p.u ? p.u.scales.y.max : null;
      if (C.yon && mn != null && (fora(C.ya, mn, mx) || fora(C.yb, mn, mx))) { C.ya = mn + (mx - mn) / 3; C.yb = mn + 2 * (mx - mn) / 3; } }
    mudaMed(p); });
  return box;
}
function faixaMed(u, p) {                              // gancho draw: faixa sombreada da janela de medição
  const M = p.med; if (!M || !M.aberto || !M.fourier) return;
  const a = u.valToPos(M.t0, "x", true), b = u.valToPos(M.t0 + M.n * 1e3 / M.f0, "x", true);
  const { left, top, width, height } = u.bbox, x0 = Math.max(left, a), x1 = Math.min(left + width, b);
  if (!(x1 > x0)) return;
  const g = u.ctx, r = devicePixelRatio || 1;
  const C = cores();
  g.save(); g.fillStyle = C.faixa; g.fillRect(x0, top, x1 - x0, height);
  g.strokeStyle = C.faixaBorda; g.lineWidth = r; g.setLineDash([4 * r, 3 * r]);
  for (const x of [a, b]) if (x >= left && x <= left + width) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + height); g.stroke(); }
  g.restore();
}

// ---------------------------------------------------------------- cursores A e B (Marcelo, 23/10: "mostrar Δt e Δy, arrastar
// as pontas e medir de um ponto ao outro: tempos, frequências, amplitudes"). Pelo tempo (seguem o zoom), no layout do painel.
// Os valores são os reais: o que está desenhado, sem o ×k e o deslocamento da tela, interpolado entre as amostras
const curLigados = (p) => !!(p.med && p.med.aberto && p.med.cur.on && p.u);
const curYLigados = (p) => !!(p.med && p.med.aberto && p.med.cur.yon && p.u);
function valorEm(p, k, t) {                             // a série k do painel (1…) no instante t (ms), o valor real
  const x = p.u.data[0], y = p.u.data[k], se = p.series[k - 1];
  if (!x || !y || !x.length || !se || t < x[0] || t > x[x.length - 1]) return null;
  let lo = 0, hi = x.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] <= t) lo = m; else hi = m; }
  // no Comparar com instantes diferentes, a série tem vazios nos instantes da outra: a amostra válida mais próxima de cada lado
  const ok = (i) => y[i] != null && isFinite(y[i]);
  while (lo > 0 && !ok(lo)) lo--;
  while (hi < x.length - 1 && !ok(hi)) hi++;
  const y0 = ok(lo) ? y[lo] : null, y1 = ok(hi) ? y[hi] : null;
  // só um lado com amostra (fora do trecho desta gravação no Comparar): nada, a não ser em cima da própria amostra
  const em = (i) => Math.abs(x[i] - t) <= 1e-9 * Math.max(1, Math.abs(t));
  let v = y0 == null ? (y1 != null && em(hi) ? y1 : null) : y1 == null ? (em(lo) ? y0 : null) : x[hi] === x[lo] ? y0
    : se.degrau ? (t >= x[hi] ? y1 : y0)                 // degrau: o valor mantido, como no desenho
    : y0 + (y1 - y0) * (t - x[lo]) / (x[hi] - x[lo]);
  if (v == null) return null;
  v = (v - (se.desloc || 0)) / (se.ganho || 1);
  return se.soma && Math.abs(v) <= 1e-9 * (se.escala || 0) ? 0 : v;   // Σ: o resíduo numérico vira 0 (como na legenda)
}
const fmtT = (ms) => (ms == null || !isFinite(ms) ? "–" : Math.abs(ms) < 1 ? `${+(ms * 1e3).toPrecision(4)} µs` : `${+ms.toPrecision(5)} ms`);
const fmtF = (hz) => (!isFinite(hz) ? "–" : Math.abs(hz) >= 1e3 ? `${+(hz / 1e3).toPrecision(4)} kHz` : `${+hz.toPrecision(4)} Hz`);
function cursoresMed(u, p) {                           // gancho draw: as linhas, as etiquetas e as bolinhas nas curvas
  if (!curLigados(p) && !curYLigados(p)) return;
  const M = p.med.cur, { left, top, width, height } = u.bbox, g = u.ctx, r = devicePixelRatio || 1, C = cores();
  g.save();
  if (curYLigados(p)) for (const [k, v] of [["C", M.ya], ["D", M.yb]]) {      // as horizontais: o nível na escala do gráfico
    if (v == null || !isFinite(v)) continue;
    const y = u.valToPos(v, "y", true); if (!(y >= top && y <= top + height)) continue;
    g.strokeStyle = C.faixaBorda; g.lineWidth = 1.2 * r; g.setLineDash([5 * r, 3 * r]);
    g.beginPath(); g.moveTo(left, y); g.lineTo(left + width, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = C.faixaBorda; g.fillRect(left, y - 7 * r, 16 * r, 14 * r);
    g.fillStyle = "#fff"; g.font = `600 ${10 * r}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(k, left + 8 * r, y);
  }
  if (curLigados(p)) for (const [k, t] of [["A", M.a], ["B", M.b]]) {
    if (t == null || !isFinite(t)) continue;
    const x = u.valToPos(t, "x", true); if (!(x >= left && x <= left + width)) continue;
    g.strokeStyle = C.faixaBorda; g.lineWidth = 1.2 * r; g.setLineDash([5 * r, 3 * r]);
    g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + height); g.stroke(); g.setLineDash([]);
    g.fillStyle = C.faixaBorda; g.fillRect(x - 8 * r, top, 16 * r, 14 * r);
    g.fillStyle = "#fff"; g.font = `600 ${10 * r}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(k, x, top + 7 * r);
    p.series.forEach((se, i) => { if (!u.series[i + 1].show) return; const v = valorEm(p, i + 1, t); if (v == null) return;
      const y = u.valToPos(v * (se.ganho || 1) + (se.desloc || 0), "y", true);
      g.fillStyle = se.cor; g.beginPath(); g.arc(x, y, 3.5 * r, 0, 2 * Math.PI); g.fill(); });
  }
  g.restore();
  leituraCur(p);
}
function leituraCur(p) {                               // embaixo da tabela: t_A, t_B, Δt, 1/Δt e, por sinal, y(A), y(B), Δy, Δy/Δt
  const el = p.el && p.el.querySelector(".med-cur"); if (!el) return;
  const M = p.med.cur;
  const yHtml = curYLigados(p) ? `<div class="cur-dt cur-y"><span><b>C</b> ${fmtM(M.ya)}</span><span><b>D</b> ${fmtM(M.yb)}</span>` +
    `<span>Δ<i>y</i> = <b>${fmtM(M.yb - M.ya)}</b> <span class="sutil">${escH(tr("scope.med.na_escala"))}</span></span></div>` : "";
  const poe = (h) => { if (el._h !== h) { el._h = h; el.innerHTML = h; } };   // só quando muda (ao vivo, dá para selecionar e copiar)
  if (!curLigados(p)) { poe(yHtml); return; }
  const dt = M.b - M.a, mat = (s) => htmlMat(s);
  const linhas = p.series.map((se, i) => { if (!p.u.series[i + 1].show) return "";
    const ya = valorEm(p, i + 1, M.a), yb = valorEm(p, i + 1, M.b), dy = ya != null && yb != null ? yb - ya : null;
    return `<tr><td class="nome"><i style="background:${se.cor}"></i>${mat(se.rot)}</td><td>${fmtM(ya)}</td><td>${fmtM(yb)}</td><td><b>${fmtM(dy)}</b></td>` +
      `<td>${dy != null && dt ? fmtM(dy / dt) + " /ms" : "–"}</td></tr>`; }).join("");
  poe(`<div class="cur-dt"><span><b>A</b> ${fmtT(M.a)}</span><span><b>B</b> ${fmtT(M.b)}</span>` +
    `<span>Δ<i>t</i> = <b>${fmtT(dt)}</b></span><span>1/Δ<i>t</i> = <b>${fmtF(dt ? 1e3 / Math.abs(dt) : NaN)}</b></span></div>` +
    `<table><thead><tr><th>${escH(tr("scope.med.sinal"))}</th><th>y(A)</th><th>y(B)</th><th>Δy</th><th>Δy/Δt</th></tr></thead><tbody>${linhas}</tbody></table>` + yHtml);
}

// ---------------------------------------------------------------- painéis e seções
const MODOS_ZOOM = { x: true, y: true, xy: true };   // os modos (guardados no layout); os rótulos: scope.zm.x, .y, .xy
// ícones de corrente (ligado) e corrente partida (solto), desenhados para não depender de fonte de emoji
const svg = (d) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px">${d}</svg>`;
const ICONE_LIGADO = svg(`<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>`);
const ICONE_SOLTO = svg(`<path d="M18.8 12.3l1.7-1.7a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M5.2 11.7l-1.7 1.7a5 5 0 0 0 7 7l1.7-1.7"/><path d="M8 2v3M2 8h3M16 19v3M19 16h3"/>`);
const ICONE_TUDO = svg(`<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>`);           // ver tudo (os quatro cantos: enquadrar)
const ICONE_SETA = svg(`<path d="M6 9l6 6 6-6"/>`);                                    // recolher (▾) / abrir (▸, girada)
const ICONE_EXPANDE = svg(`<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>`);
const ICONE_VOLTA = svg(`<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>`);
const dragDe = (modo) => ({ x: modo !== "y", y: modo !== "x", setScale: false, dist: 3 });

// acionamentos de uma rodada do /maisim/simu (meta.acionamentos: t em s, alvo, valor): linha vertical tracejada e o rótulo
function marcaAcionamentos(u) {
  const C = cores(), conjuntos = [[A, C.acA, C.acAtxt, ""], [B, C.acB, C.acBtxt, " · B"]];   // A em laranja; B em cinza
  const g = u.ctx, r = devicePixelRatio || 1, topo = u.bbox.top, base = u.bbox.top + u.bbox.height;
  conjuntos.forEach(([R, cor, corTxt, suf], k) => {
    const lst = (R && R.meta && R.meta.acionamentos) || []; if (!lst.length) return;
    g.save(); g.strokeStyle = cor; g.fillStyle = corTxt; g.lineWidth = r; g.setLineDash(k ? [2 * r, 3 * r] : [5 * r, 4 * r]);
    g.font = `${11 * r}px system-ui, sans-serif`; g.textBaseline = "top"; g.textAlign = "left";
    for (const q of lst) {
      const x = u.valToPos(q.t * 1e3, "x", true);
      if (!(x >= u.bbox.left && x <= u.bbox.left + u.bbox.width)) continue;
      g.beginPath(); g.moveTo(x, topo); g.lineTo(x, base); g.stroke();
      const rot = `${q.alvo.replace(/^CONST:/, "").replace(/^p:(.*)$/, 'p["$1"]')} = ${+Number(q.valor).toPrecision(4)}${suf}`;
      g.save(); g.setLineDash([]); g.fillText(rot, x + 3 * r, topo + (2 + 13 * k) * r); g.restore();
    }
    g.restore();
  });
}
// refazer o gráfico (tema, idioma) sem perder o que está na tela: com "Fixar eixos" ou "Pausar", as escalas de agora e,
// pausado, também os dados de agora (senão o gráfico novo pegava a escala automática e os dados mais novos)
function refazGrafico(p) {
  const u = p.u, sc = (k) => (u.scales[k].min != null ? { min: u.scales[k].min, max: u.scales[k].max } : null);
  criaGrafico(p, u && (fixar || pausado) && sc("x") ? { x: sc("x"), y: sc("y"), dados: pausado ? u.data : null } : null);
}
function criaGrafico(p, manter) {
  if (p.u) { p.u.destroy(); p.u = null; }
  p.area.innerHTML = "";
  if (!A || !p.sinais.length) { p.area.innerHTML = `<div class="vazio">${escH(tr(A ? "scope.p.vazio_sinais" : "scope.p.aguardando"))}</div>`; return; }
  p.series = seriesDe(p);
  p.semDados = false;
  if (!p.series.length) {                    // com dados chegando, não adianta remontar: marca para o redesenho não insistir
    p.semDados = !!(A && A.dados && A.dados.t && A.dados.t.length);
    p.area.innerHTML = `<div class="vazio">${escH(tr("scope.p.nao_existem"))}</div>`; return;
  }
  const fmt = (v) => (v == null || isNaN(v)) ? "–" : (Math.abs(v) >= 1000 ? v.toFixed(1) : +v.toPrecision(5));
  const opts = {
    width: Math.max(300, p.el.clientWidth - 14), height: alturaDe(p),
    scales: { x: { time: false } },
    series: [{ label: "t (ms)", value: (u, v) => v == null ? "–" : v.toFixed(4) }].concat(p.series.map((se) => ({
      label: se.rot, stroke: se.cor, width: se.largura || 1.3, dash: se.dash, points: { show: false }, spanGaps: !!uniao,
      // um sinal escondido (na legenda ou com um clique no nome na tabela) fica fora do Σ, da x̄, do espectro e da escala:
      // a soma é a do que está à vista (Marcelo, 20/10: escondidos na legenda, o Σ somava os 20 sinais, os 600 V do V_dc junto)
      show: se.soma ? !(p.med.oculta && p.med.oculta[se.comb]) : !p.espFora.has(chaveSe(se)),
      paths: se.degrau ? uPlot.paths.stepped({ align: 1 }) : undefined,
      // Σ: o resíduo numérico (va + vb + vc ~ 1e-13) é 0, pela escala das parcelas, como na tabela
      value: (u, v) => fmt(v == null || isNaN(v) ? v : se.soma && Math.abs(v) <= 1e-9 * (se.escala || 0) ? 0 : (v - se.desloc) / se.ganho) }))),     // valor real (sem ×k nem empilhamento)
    axes: [{ label: "t (ms)", stroke: cores().eixo, grid: { stroke: cores().grade }, ticks: { stroke: cores().grade } },
           { size: 64, stroke: cores().eixo, grid: { stroke: cores().grade }, ticks: { stroke: cores().grade }, values: (u, vals) => vals.map((v) => v == null ? "" : (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : +v.toFixed(3))) }],
    // a sincronização entre painéis leva só o cursor (sem arrasto nem duplo clique): o zoom de cada painel é decidido aqui,
    // e só o eixo do tempo casa entre painéis (sem o eixo vertical, o arrasto vertical num painel não muda os outros)
    cursor: { sync: { key: "mmc", setSeries: false, scales: ["x", null], filters: { pub: (ev) => ev === "mousemove" || ev === "mouseenter" || ev === "mouseleave" } },
              drag: dragDe(p.modo), bind: { dblclick: () => null } },
    legend: { live: true },
    hooks: {
      setSelect: [(u) => {                   // fim de um arrasto: o retângulo vira a faixa de tempo e/ou a vertical deste painel
        if (p.arrastoMed) {                  // Shift + arrastar: intervalo de medição, sem zoom
          p.arrastoMed = false; const s = u.select, largura = s.width;      // u.select é zerado pelo setSelect abaixo
          const a = u.posToVal(s.left, "x"), b = u.posToVal(s.left + s.width, "x");
          u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
          if (largura > 2) intervaloMed(p, a, b);
          return;
        }
        const s = u.select, fazX = u.cursor.drag.x && s.width > 2, fazY = u.cursor.drag.y && s.height > 2;
        if (!fazX && !fazY) return;
        const xr = fazX ? [u.posToVal(s.left, "x"), u.posToVal(s.left + s.width, "x")] : null;
        const yr = fazY ? [u.posToVal(s.top + s.height, "y"), u.posToVal(s.top, "y")] : null;
        u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
        if (yr) p.yZoom = yr;
        if (xr) mudaX(p, xr); else agenda([p]);
      }],
      draw: [(u) => faixaMed(u, p), (u) => cursoresMed(u, p), marcaAcionamentos],
      setSeries: [(u, i) => {                // clique na legenda: a escala vertical refaz sem a escondida
        const se = i != null && p.series[i - 1];
        if (se && se.soma) { (p.med.oculta = p.med.oculta || {})[se.comb] = !u.series[i].show; guardaLayout(); }
        else if (se) {                       // um sinal: entra ou sai do Σ, da x̄, da tabela e do espectro
          const ch = chaveSe(se), fora = !u.series[i].show;
          if (fora !== p.espFora.has(ch)) {
            if (fora) p.espFora.add(ch); else p.espFora.delete(ch);
            if (p.med && p.med.aberto) { setTimeout(() => { if (p.u === u) criaGrafico(p); }, 0); return; }   // as curvas Σ/x̄ mudam
          }
        }
        if (!sincronizando) agenda([p]);
      }],   // faixa da medição; acionamentos da rodada (MaiSim / simu)
    },
  };
  const iguais = manter && manter.dados && manter.dados.length === p.series.length + 1;   // pausado: os mesmos sinais, os dados de antes
  p.u = new uPlot(opts, iguais ? manter.dados : dadosPainel(p), p.area);
  legendaMat(p);
  p.u.over.addEventListener("wheel", (e) => {          // zoom só com Ctrl: a roda sozinha rola a página
    if (!e.ctrlKey) return;
    e.preventDefault();
    const f = e.deltaY < 0 ? 0.8 : 1.25;
    if (e.shiftKey) {
      const yv = p.u.posToVal(e.offsetY, "y"), mn = p.u.scales.y.min, mx = p.u.scales.y.max;
      p.yZoom = [yv - (yv - mn) * f, yv + (mx - yv) * f]; agenda([p]);
    } else {
      const xv = p.u.posToVal(e.offsetX, "x"), mn = p.u.scales.x.min, mx = p.u.scales.x.max;
      mudaX(p, [xv - (xv - mn) * f, xv + (mx - xv) * f]);
    }
  }, { passive: false });
  p.u.over.addEventListener("dblclick", (e) => { if (!perto(e)) reseta(p); });   // dois arrastos rápidos numa linha não resetam
  // os cursores: arrastar perto de uma linha (±6 px) a move (no lugar do zoom); perto, o ponteiro vira ↔
  const perto = (e) => { if (e.shiftKey) return null; const M = p.med.cur, ds = [];
    if (curLigados(p)) ds.push(["a", Math.abs(p.u.valToPos(M.a, "x") - e.offsetX)], ["b", Math.abs(p.u.valToPos(M.b, "x") - e.offsetX)]);
    if (curYLigados(p)) ds.push(["ya", Math.abs(p.u.valToPos(M.ya, "y") - e.offsetY)], ["yb", Math.abs(p.u.valToPos(M.yb, "y") - e.offsetY)]);
    const m = ds.sort((x, y) => x[1] - y[1])[0]; return m && m[1] <= 6 ? m[0] : null; };
  p.u.over.addEventListener("mousemove", (e) => { if (p.arrastaCur) return; const k = perto(e); p.u.over.style.cursor = !k ? "" : k[0] === "y" ? "ns-resize" : "ew-resize"; });
  p.u.over.addEventListener("mousedown", (e) => {
    const k = e.button === 0 && perto(e); if (!k) return;
    e.preventDefault(); e.stopImmediatePropagation(); p.arrastaCur = k;
    const caixa = p.u.over.getBoundingClientRect();
    const move = (ev) => { if (!p.u) return; p.med.cur[k] = k[0] === "y" ? p.u.posToVal(Math.max(0, Math.min(caixa.height, ev.clientY - caixa.top)), "y")
      : p.u.posToVal(Math.max(0, Math.min(caixa.width, ev.clientX - caixa.left)), "x"); p.u.redraw(false, false); };
    const solta = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", solta); p.arrastaCur = null; guardaLayout(); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", solta);
  }, true);
  p.u.over.addEventListener("mousedown", (e) => {     // Shift: o arrasto escolhe o intervalo de medição (só no tempo)
    if (!e.shiftKey || e.button !== 0) return;
    p.arrastoMed = true; p.u.cursor.drag.x = true; p.u.cursor.drag.y = false;
    window.addEventListener("mouseup", () => setTimeout(() => {
      p.arrastoMed = false; if (p.u) { p.u.cursor.drag.x = p.modo !== "y"; p.u.cursor.drag.y = p.modo !== "x"; }
    }, 0), { once: true });
  }, true);
  if (!manter) { atualiza(p); return; }
  sincronizando = true; p.u.setScale("x", manter.x); if (manter.y) p.u.setScale("y", manter.y); sincronizando = false;
  if (p.med && p.med.aberto && p.med.fourier) mede(p);
}

function montaMenu(p) {
  const menu = document.createElement("div"); menu.className = "menu";
  // em cima: a busca (baixa) e o × que fecha
  const topo = document.createElement("div"); topo.className = "menu-topo";
  const busca = document.createElement("input"); busca.type = "search"; busca.className = "busca"; busca.placeholder = tr("scope.p.busca");
  const fecha = document.createElement("button"); fecha.className = "menu-fecha"; fecha.type = "button"; fecha.title = tr("scope.p.fechar_esc"); fecha.textContent = "×";
  fecha.onclick = () => menu.remove();
  busca.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (busca.value) { busca.value = ""; desenha(); } else menu.remove(); } });
  topo.append(busca, fecha);
  const lista = document.createElement("div");
  menu.append(topo, lista);
  let aberta = null;                                     // o sinal com a paleta de cores aberta
  const paletaHTML = (canal, idx) => { const atual = corDoSinal(canal, idx);
    return `<div class="paleta" data-c="${canal}">${CLASSICAS.map(([n, c]) => `<button class="amostra${c === atual ? " atual" : ""}" data-cor="${c}" style="background:${c}" title="${escH(tr(`scope.cor.${n}`))} ${c}"></button>`).join("")}
      <span class="paleta-hex"><input class="hex" value="${atual}" maxlength="7" spellcheck="false" title="${escH(tr("scope.p.t_hex"))}"><input type="color" class="livre" value="${atual}" title="${escH(tr("scope.p.t_livre"))}">
      <button class="padrao" title="${escH(tr("scope.p.t_padrao"))}">${escH(tr("scope.p.padrao"))}</button></span>
      <span class="espessuras" title="${escH(tr("scope.p.t_espessura"))}">${escH(tr("scope.p.linha"))} ${ESPESSURAS.map((w) => `<button class="espessura${w === espessuraDoSinal(canal) ? " atual" : ""}" data-w="${w}" title="${escH(tr(w === 1.3 ? "scope.p.w_normal" : w < 1.3 ? "scope.p.w_fina" : w < 3 ? "scope.p.w_grossa" : "scope.p.w_mais"))} (${w} px)"><i style="height:${w}px;background:${atual}"></i></button>`).join("")}</span>
      <span class="tracos" title="${escH(tr("scope.p.t_traco"))}">${escH(tr("scope.p.traco"))} ${Object.entries(TRACOS).map(([t, d]) => `<button class="traco${t === tracoDoSinal(canal) ? " atual" : ""}" data-t="${t}" title="${escH(tr(`scope.traco.${t}`))}"><svg viewBox="0 0 24 6" width="24" height="6"><line x1="1" y1="3" x2="23" y2="3" stroke="${atual}" stroke-width="2"${d ? ` stroke-dasharray="${d.map((x) => x * 0.6).join(" ")}"` : ""}/></svg></button>`).join("")}</span></div>`; };
  const desenha = () => {
    const q = busca.value.toLowerCase(); let html = "", grupo = "";
    for (const c of catalogo()) {
      const alvo = `${c.grupo} ${c.rotulo} ${c.canal}`.toLowerCase();   // o nome cru: "v_o" acha; "vo" também (sem o _)
      if (q && !alvo.includes(q) && !alvo.replace(/_/g, "").includes(q.replace(/_/g, ""))) continue;
      if (c.grupo !== grupo) { grupo = c.grupo; html += `<h4>${grupo}</h4>`; }
      const marc = p.sinais.includes(c.canal);
      html += `<div class="item"><label><input type="checkbox" data-c="${c.canal}" ${marc ? "checked" : ""}> ${htmlMat(c.rotulo)}` +
              (c.tipo === "f" ? ` <span class="fino">${escH(tr("scope.p.fino"))}</span>` : "") + "</label>" +
              (marc ? `<button class="cor-sinal" data-c="${c.canal}" style="background:${corDoSinal(c.canal, p.sinais.indexOf(c.canal))}" title="${escH(tr("scope.p.t_cor"))}"></button>` +
                      `<button class="abre-paleta${aberta === c.canal ? " aberta" : ""}" data-c="${c.canal}" title="${escH(tr(aberta === c.canal ? "scope.p.recolher" : "scope.p.t_abre"))}">${ICONE_SETA}</button>` +
                      `<span class="x">×</span><input type="number" step="any" class="ganho" data-c="${c.canal}" value="${(p.ganhos || {})[c.canal] || 1}"
                 title="${escH(tr("scope.p.t_ganho"))}">` : "") + "</div>" +
              (marc && aberta === c.canal ? paletaHTML(c.canal, p.sinais.indexOf(c.canal)) : "");
    }
    lista.innerHTML = html || `<i>${escH(tr("scope.p.nenhum_sinal"))}</i>`;
    lista.querySelectorAll("input[type=checkbox]").forEach((ck) => ck.onchange = () => {
      const c = ck.dataset.c;
      p.sinais = ck.checked ? p.sinais.concat(c) : p.sinais.filter((x) => x !== c);
      if (!ck.checked && p.ganhos) delete p.ganhos[c];
      guardaLayout(); criaGrafico(p); desenha();
    });
    // a bolinha da cor ou a setinha ao lado: abre e recolhe a paleta do sinal (cor, espessura, traço)
    lista.querySelectorAll("button.cor-sinal, button.abre-paleta").forEach((b) => b.onclick = (ev) => { ev.preventDefault(); aberta = aberta === b.dataset.c ? null : b.dataset.c; desenha(); });
    const escolhe = (canal, cor) => { poeCorSinal(canal, cor); desenha(); };
    lista.querySelectorAll(".paleta").forEach((pl) => {
      const canal = pl.dataset.c;
      pl.querySelectorAll("button.amostra").forEach((b) => b.onclick = () => escolhe(canal, b.dataset.cor));
      pl.querySelector("button.padrao").onclick = () => escolhe(canal, null);
      pl.querySelectorAll("button.espessura").forEach((b) => b.onclick = () => { poeEspessuraSinal(canal, +b.dataset.w); desenha(); });
      pl.querySelectorAll("button.traco").forEach((b) => b.onclick = () => { poeTracoSinal(canal, b.dataset.t); desenha(); });
      pl.querySelector("input.livre").onchange = (ev) => escolhe(canal, corValida(ev.target.value));
      const hx = pl.querySelector("input.hex");
      hx.onkeydown = (ev) => { if (ev.key !== "Enter") return; const c = corValida(hx.value.trim()); hx.classList.toggle("ruim", !c); if (c) escolhe(canal, c); };
    });
    lista.querySelectorAll("input.ganho").forEach((gi) => gi.onchange = () => {
      const k = parseFloat(gi.value); p.ganhos = p.ganhos || {};
      if (!isFinite(k) || k === 0 || k === 1) { delete p.ganhos[gi.dataset.c]; gi.value = 1; } else p.ganhos[gi.dataset.c] = k;
      guardaLayout(); criaGrafico(p);
    });
  };
  busca.oninput = desenha; desenha();
  return menu;
}

// ---- arrastar e soltar: a alça ⠿ de um painel leva-o para antes/depois de outro painel ou para o início de uma seção
let arrastando = null;
function reordenaDOM() { const c = $("paineis"); for (const x of itens) c.appendChild(x.el); marcaSecoesVazias(); setTimeout(redimensiona, 0); }
function move(p, alvo, depois) {
  if (p === alvo) return;
  itens = itens.filter((x) => x !== p);
  const k = itens.indexOf(alvo);
  itens.splice(k + (depois ? 1 : 0), 0, p);
  abreSecaoDe(p); reordenaDOM(); guardaLayout();
}
function limpaAlvos() { document.querySelectorAll(".alvo-antes, .alvo-depois, .alvo-fim").forEach((e) => e.classList.remove("alvo-antes", "alvo-depois", "alvo-fim")); }
// a seção pela alça ⠿ (pedido de Marcelo, 19/10): vai com os painéis dela para antes de outra seção, ou para o fim
let arrastandoSecao = null;
function blocoDe(s) { const k = itens.indexOf(s); let f = k + 1; while (f < itens.length && itens[f].tipo === "painel") f++; return itens.slice(k, f); }
function moveSecao(s, antes) {
  const bloco = blocoDe(s);
  if (antes && bloco.includes(antes)) return;
  itens = itens.filter((x) => !bloco.includes(x));
  itens.splice(antes ? itens.indexOf(antes) : itens.length, 0, ...bloco);
  reordenaDOM(); guardaLayout();
}
// onde a seção arrastada cai: antes da primeira seção (à vista) cujo meio está abaixo do mouse; nenhuma = no fim
function secaoAbaixo(y, els) {
  for (const [s, el] of els) { if (s === arrastandoSecao) continue; const r = el.getBoundingClientRect(); if (r.height && y < r.top + r.height / 2) return [s, el]; }
  return null;
}
(() => {
  const c = $("paineis");
  const alvo = (e) => secaoAbaixo(e.clientY, itens.filter((x) => x.tipo === "secao" && !x.el.classList.contains("oculto")).map((x) => [x, x.el]));
  c.addEventListener("dragover", (e) => {
    if (!arrastandoSecao) return; e.preventDefault();
    const a = alvo(e); limpaAlvos(); if (a) a[1].classList.add("alvo-antes"); else c.classList.add("alvo-fim");
  });
  c.addEventListener("dragleave", (e) => { if (arrastandoSecao && !c.contains(e.relatedTarget)) limpaAlvos(); });
  c.addEventListener("drop", (e) => {
    if (!arrastandoSecao) return; e.preventDefault();
    const s = arrastandoSecao, a = alvo(e); limpaAlvos(); moveSecao(s, a ? a[0] : null);
  });
})();
function abreSecaoDe(p) {                    // um painel que chega numa seção recolhida (arrastado, + Painel) a abre
  const g = grupos().find((x) => x.ps.includes(p));
  if (g && g.s && g.s.recolhida) { g.s.recolhida = false; marcaRecolhida(g.s); }
}
function marcaRecolhida(s) {
  s.el.classList.toggle("recolhida", !!s.recolhida);
  const b = s.el.querySelector(".b-rec"); b.title = tr(s.recolhida ? "scope.s.t_abrir" : "scope.s.t_recolher");
  b.setAttribute("aria-expanded", String(!s.recolhida));
}
function marcaRecolhido(p) {
  p.el.classList.toggle("recolhido", !!p.recolhido);
  const b = p.el.querySelector(".cab .b-rec"); b.title = tr(p.recolhido ? "scope.p.t_abrir" : "scope.p.t_recolher");
  b.setAttribute("aria-expanded", String(!p.recolhido));
}
// expandir: o painel ocupa a janela (no simu, a doca do scope); Esc, o botão ou um clique fora volta
let expandido = null;
function alturaDe(p) {
  if (!p.expandido) return p.altura || 220;
  const extra = p.u ? p.u.root.offsetHeight - p.u.height : 48;            // legenda do uPlot
  const med = p.el.querySelector(".medicao"), mh = med && med.offsetParent ? med.offsetHeight : 0;
  return Math.max(220, p.el.clientHeight - p.area.offsetTop - extra - mh - 16);
}
function marcaExpande(p) {
  const b = p.el.querySelector(".b-exp"); b.innerHTML = p.expandido ? ICONE_VOLTA : ICONE_EXPANDE;
  b.title = tr(p.expandido ? "scope.p.t_voltar" : "scope.p.t_expandir");
}
function expande(p, sim) {
  if (sim && expandido && expandido !== p) expande(expandido, false);
  if (!sim && !p.expandido) return;
  p.expandido = !!sim; expandido = sim ? p : null;
  const esq = parseFloat(getComputedStyle(document.body).paddingLeft) || 0;     // o trilho do MaiSim, se houver
  p.el.style.left = sim ? `${esq + 10}px` : "";
  p.el.classList.toggle("expandido", !!sim); document.body.classList.toggle("com-expandido", !!sim);
  $("fundo-exp").hidden = !sim; marcaExpande(p);
  document.querySelectorAll(".menu").forEach((m) => m.remove());
  const ajusta = () => { if (p.u) p.u.setSize({ width: Math.max(300, p.el.clientWidth - 14), height: alturaDe(p) }); if (p.med.aberto && p.med.esp.aberto) desenhaEspectro(p); };
  ajusta(); setTimeout(ajusta, 0);                       // a 2ª vez com a legenda já no tamanho novo
  if (!sim) setTimeout(() => p.el.scrollIntoView({ block: "nearest" }), 0);
}
function alvoDeSoltura(el, item) {
  el.addEventListener("dragover", (e) => {
    if (!arrastando || arrastando === item) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const depois = item.tipo === "secao" || ((item.largura || 1) > 1 ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2);
    limpaAlvos(); el.classList.add(depois ? "alvo-depois" : "alvo-antes");
  });
  el.addEventListener("dragleave", () => el.classList.remove("alvo-antes", "alvo-depois"));
  el.addEventListener("drop", (e) => {
    if (!arrastando) return;
    e.preventDefault();
    const depois = el.classList.contains("alvo-depois");
    limpaAlvos(); move(arrastando, item, depois); arrastando = null;
  });
}
// seção: título editável; "+ Painel" põe um painel no fim dela; ✕ tira só o título (os painéis ficam na seção de cima)
function marcaSecoesVazias() {
  itens.forEach((x, k) => { if (x.tipo === "secao") x.el.classList.toggle("vazia", !(itens[k + 1] && itens[k + 1].tipo === "painel")); });
}
function adicionaSecao(titulo, posicao, recolhida) {
  const s = { tipo: "secao", titulo, recolhida: !!recolhida };
  const el = document.createElement("div"); el.className = "secao";
  el.innerHTML = `<span class="b-arrasta" draggable="true" title="${escH(tr("scope.s.t_arrasta"))}" data-tr-title="scope.s.t_arrasta">⠿</span><button class="b-rec">${ICONE_SETA}</button>
    <input class="titulo-secao" type="text"><span class="n-rec"></span><button class="b-mais" title="${escH(tr("scope.s.t_mais"))}" data-tr-title="scope.s.t_mais" data-tr="scope.h.painel">${escH(tr("scope.h.painel"))}</button>
    <button class="b-rem" title="${escH(tr("scope.s.t_rem"))}" data-tr-title="scope.s.t_rem">✕</button><span class="dica" data-tr="scope.s.dica">${escH(tr("scope.s.dica"))}</span>`;
  s.el = el;
  const tit = el.querySelector(".titulo-secao"); tit.value = titulo;
  tit.onchange = () => { s.titulo = tit.value; s.autoTit = null; guardaLayout(); };
  el.querySelector(".b-mais").onclick = () => {
    let k = itens.indexOf(s) + 1; while (k < itens.length && itens[k].tipo === "painel") k++;
    abreSecaoDe(adicionaPainel({ titulo: tr("scope.novo_painel"), sinais: [] }, k)); guardaLayout();   // o título novo: no idioma de agora (vira do usuário)
  };
  // apagar pede confirmação (Marcelo, 23/10: "sempre bom pedir confirmação"), a não ser numa seção vazia
  el.querySelector(".b-rem").onclick = async () => {
    const k = itens.indexOf(s), dela = []; for (let i = k + 1; i < itens.length && itens[i].tipo !== "secao"; i++) dela.push(itens[i]);
    if (dela.length && !(await pergunta({ titulo: tr("scope.q.apaga_secao", { titulo: s.titulo }), ok: tr("scope.q.apaga_secao_ok"), perigo: true,
      texto: tr("scope.q.apaga_secao_texto", { n: dela.length }) }))) return;
    el.remove(); itens = itens.filter((x) => x !== s); marcaSecoesVazias(); guardaLayout(); };
  el.querySelector(".b-rec").onclick = () => { s.recolhida = !s.recolhida; marcaRecolhida(s); guardaLayout(); };
  const alca = el.querySelector(".b-arrasta");
  alca.addEventListener("dragstart", (e) => { arrastandoSecao = s; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "secao");
    e.dataTransfer.setDragImage(el, 20, 12); blocoDe(s).forEach((x) => x.el.classList.add("arrastando")); });
  alca.addEventListener("dragend", () => { arrastandoSecao = null; document.querySelectorAll(".arrastando").forEach((x) => x.classList.remove("arrastando")); limpaAlvos(); });
  marcaRecolhida(s);
  alvoDeSoltura(el, s);
  if (posicao == null) { $("paineis").appendChild(el); itens.push(s); } else { itens.splice(posicao, 0, s); reordenaDOM(); }
  marcaSecoesVazias();
  return s;
}
function menuY(p) {
  const m = document.createElement("div"); m.className = "menu menu-y";
  const [a, b] = p.yFixo || (p.u && p.u.scales.y.min != null ? [p.u.scales.y.min, p.u.scales.y.max] : [0, 1]);
  m.innerHTML = `<b>${escH(tr("scope.p.y_titulo"))}</b><label>${escH(tr("scope.p.y_max"))} <input type="number" step="any" class="y-max"></label>
    <label>${escH(tr("scope.p.y_min"))} <input type="number" step="any" class="y-min"></label>
    <div><button class="y-ok">${escH(tr("scope.p.y_ok"))}</button> <button class="y-auto">${escH(tr("scope.p.y_auto"))}</button></div>`;
  m.querySelector(".y-max").value = +b.toPrecision(6); m.querySelector(".y-min").value = +a.toPrecision(6);
  m.querySelector(".y-ok").onclick = () => {
    const lo = parseFloat(m.querySelector(".y-min").value), hi = parseFloat(m.querySelector(".y-max").value);
    if (!(hi > lo)) { m.querySelector(".y-max").focus(); return; }
    p.yFixo = [lo, hi]; p.yZoom = null; marcaY(p); guardaLayout(); atualiza(p); m.remove();
  };
  m.querySelector(".y-auto").onclick = () => { p.yFixo = null; p.yZoom = null; marcaY(p); guardaLayout(); atualiza(p); m.remove(); };
  m.addEventListener("keydown", (e) => { if (e.key === "Enter") m.querySelector(".y-ok").click(); });
  return m;
}
function marcaY(p) { const b = p.el.querySelector(".b-y"); b.classList.toggle("ativo", !!p.yFixo); b.title = p.yFixo ? tr("scope.p.t_y_fixo", { min: p.yFixo[0], max: p.yFixo[1] }) : tr("scope.p.t_y"); }
function marcaZoom(p) {
  p.el.querySelectorAll(".b-zm").forEach((b) => b.classList.toggle("ativo", b.dataset.m === p.modo));
  const b = p.el.querySelector(".b-solto");
  b.classList.toggle("solto", !!p.solto);
  b.innerHTML = p.solto ? ICONE_SOLTO : ICONE_LIGADO;
  b.title = tr(p.solto ? "scope.p.t_solto" : "scope.p.t_ligado");
}
const ALTURAS = [[220, "baixa"], [340, "media"], [460, "alta"]];                // o rótulo: scope.p.h_<id>
const LARGURAS = [[1, null], [1.5, "2/3"], [2, "1/2"], [3, "1/3"]];             // null: "linha inteira" (scope.p.l_inteira)
const LARGURAS_OK = [1, 1.2, 1.5, 2, 3];                // 6/largura colunas da grade de 6: inteira, 5/6, 2/3, 1/2, 1/3
const alturaOk = (h) => Number.isFinite(+h) ? Math.round(Math.min(1000, Math.max(140, +h))) : 220;
// esticar o painel pelo canto (Marcelo, 22/10: em vez de só 1, 2 ou 3 por linha): a altura acompanha o mouse; a largura
// anda de coluna em coluna da grade de 6, para os painéis continuarem alinhados; o gráfico se refaz no tamanho ao soltar
function alcaEstica(p) {
  const h = p.el.querySelector(".b-alca");
  h.onpointerdown = (ev) => {
    if (p.expandido || ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation(); h.setPointerCapture(ev.pointerId);
    const grade = $("paineis"), gap = parseFloat(getComputedStyle(grade).columnGap) || 10, col = (grade.clientWidth + gap) / 6;
    const x0 = ev.clientX, y0 = ev.clientY, w0 = p.el.offsetWidth, h0 = alturaDe(p);
    p.el.classList.add("esticando");
    const move = (e) => {
      const span = Math.min(6, Math.max(2, Math.round((w0 + e.clientX - x0 + gap) / col)));
      const larg = 6 / span; if (larg !== p.largura) { p.largura = larg; aplicaLargura(p); }
      p.altura = alturaOk(h0 + e.clientY - y0);
      if (p.u) p.u.setSize({ width: Math.max(300, p.el.clientWidth - 14), height: p.altura });
    };
    const fim = () => { h.onpointermove = h.onpointerup = h.onpointercancel = null; p.el.classList.remove("esticando"); guardaLayout(); setTimeout(redimensiona, 0); };
    h.onpointermove = move; h.onpointerup = fim; h.onpointercancel = fim;
  };
  h.ondblclick = (ev) => { ev.stopPropagation(); p.largura = larguraPadrao; p.altura = 220; aplicaLargura(p); guardaLayout(); criaGrafico(p); setTimeout(redimensiona, 0); };
}
function aplicaLargura(p) { p.el.style.setProperty("--span", String(6 / p.largura)); }
function menuOpc(p) {
  const m = document.createElement("div"); m.className = "menu menu-opc";
  m.innerHTML = `<h4>${escH(tr("scope.p.l_titulo"))}</h4><div class="seg">${LARGURAS.map(([n, r]) => `<button data-l="${n}" class="${p.largura === n ? "ativo" : ""}">${r || escH(tr("scope.p.l_inteira"))}</button>`).join("")}</div>
    <h4>${escH(tr("scope.p.h_titulo"))}</h4><div class="seg">${ALTURAS.map(([h, r]) => `<button data-h="${h}" class="${p.altura === h ? "ativo" : ""}">${escH(tr(`scope.p.h_${r}`))}</button>`).join("")}</div>
    <h4>${escH(tr("scope.p.img"))}</h4><button class="o-png">${escH(tr("scope.p.png"))}</button>`;
  m.querySelectorAll("[data-l]").forEach((b) => b.onclick = () => { p.largura = +b.dataset.l; aplicaLargura(p); guardaLayout(); m.remove(); setTimeout(redimensiona, 0); });
  m.querySelectorAll("[data-h]").forEach((b) => b.onclick = () => { p.altura = +b.dataset.h; guardaLayout(); criaGrafico(p); m.remove(); });
  m.querySelector(".o-png").onclick = () => { baixa(canvasPainel(p), `${nomeArq(p.titulo)}.png`); m.remove(); };
  return m;
}
function adicionaPainel(cfg, posicao) {
  const p = { tipo: "painel", id: ++seq, titulo: cfg.titulo || tr("scope.novo_painel"), sinais: (cfg.sinais || []).slice(), altura: cfg.altura ? alturaOk(cfg.altura) : 220,
              largura: LARGURAS_OK.includes(cfg.largura) ? cfg.largura : larguraPadrao,
              yFixo: cfg.yFixo || null, ganhos: Object.assign({}, cfg.ganhos || {}),
              modo: MODOS_ZOOM[cfg.modo] ? cfg.modo : "x", solto: !!cfg.solto, xZoom: null, yZoom: null,
              med: novaMed(cfg.med), espFora: new Set(), recolhido: !!cfg.recolhido, expandido: false };
  const el = document.createElement("div"); el.className = "cartao";
  // os textos fixos com data-tr* (o aplica() troca ao mudar o idioma); os títulos que mudam (b-rec, b-exp, b-solto, b-y): marca*()
  el.innerHTML = `<div class="cab"><span class="b-arrasta" draggable="true" title="${escH(tr("scope.p.t_arrasta"))}" data-tr-title="scope.p.t_arrasta">⠿</span><button class="b-rec">${ICONE_SETA}</button>
    <input class="titulo" type="text"><span class="titulo-mat" title="${escH(tr("scope.p.t_titulo"))}" data-tr-title="scope.p.t_titulo"></span><div class="ferr"><button class="b-sinais" data-tr="scope.p.sinais">${escH(tr("scope.p.sinais"))}</button>
    <span class="zoom" title="${escH(tr("scope.p.t_zoom"))}" data-tr-title="scope.p.t_zoom"><span class="rot">Zoom</span>${Object.keys(MODOS_ZOOM).map((m) =>
      `<button class="b-zm" data-m="${m}" title="${escH(tr(`scope.zm.t_${m}`))}" data-tr-title="scope.zm.t_${m}" data-tr="scope.zm.${m}">${escH(tr(`scope.zm.${m}`))}</button>`).join("")}<button
      class="b-reset" title="${escH(tr("scope.p.t_reset"))}" data-tr-title="scope.p.t_reset">${ICONE_TUDO}</button></span>
    <button class="b-solto"></button><button class="b-med" title="${escH(tr("scope.p.t_med"))}" data-tr-title="scope.p.t_med" data-tr="scope.p.medir">${escH(tr("scope.p.medir"))}</button><button class="b-y" data-tr="scope.p.y_fixo">${escH(tr("scope.p.y_fixo"))}</button>
    <button class="b-opc" title="${escH(tr("scope.p.t_opc"))}" data-tr-title="scope.p.t_opc">⋯</button></div><button class="b-exp"></button><button class="b-rem" title="${escH(tr("scope.p.t_rem"))}" data-tr-title="scope.p.t_rem">✕</button></div><div class="area"></div>
    <span class="b-alca" title="${escH(tr("scope.p.t_alca"))}" data-tr-title="scope.p.t_alca"></span>`;
  p.el = el; p.area = el.querySelector(".area");
  aplicaLargura(p);
  alcaEstica(p);
  el.appendChild(caixaMed(p));
  const tit = el.querySelector("input.titulo"); tit.value = p.titulo; tit.title = p.titulo;
  tit.onchange = () => { p.titulo = tit.value; p.autoTit = null; tit.title = tit.value; tituloMat(p); guardaLayout(); };
  // o título aparece em notação matemática; o clique abre a caixa de texto para mudar
  el.querySelector(".titulo-mat").onclick = () => { el.querySelector(".cab").classList.add("editando"); tit.focus(); };
  tit.addEventListener("blur", () => el.querySelector(".cab").classList.remove("editando")); tituloMat(p);
  const abre = (botao, fazMenu) => (e) => {
    e.stopPropagation();
    const aberto = el.querySelector(".menu");
    const mesmo = aberto && aberto.dataset.de === botao;
    document.querySelectorAll(".menu").forEach((m) => m.remove());
    if (!mesmo) { const m = fazMenu(p); m.dataset.de = botao; const b = e.currentTarget; m.style.top = `${b.offsetTop + b.offsetHeight + 4}px`;
      el.appendChild(m);                                   // embaixo do botão que o abriu (não no canto, perto do ✕), dentro do cartão
      m.style.left = `${Math.max(6, Math.min(b.offsetLeft, el.clientWidth - m.offsetWidth - 6))}px`; m.style.right = "auto";
      const q = m.querySelector("input.busca"); if (q) q.focus(); }
  };
  el.querySelector(".b-sinais").onclick = abre("sinais", montaMenu);
  el.querySelector(".b-y").onclick = abre("y", menuY);
  el.querySelectorAll(".b-zm").forEach((b) => b.onclick = () => {
    p.modo = b.dataset.m; marcaZoom(p); guardaLayout();
    if (p.u) { p.u.cursor.drag.x = p.modo !== "y"; p.u.cursor.drag.y = p.modo !== "x"; }
  });
  el.querySelector(".b-reset").onclick = () => reseta(p);
  el.querySelector(".b-med").onclick = () => {
    if (p.med.aberto) { p.med.aberto = false; mudaMed(p); return; }
    const [a, b] = visivel(p); intervaloMed(p, a, b);
  };
  el.querySelector(".b-solto").onclick = () => {            // soltar começa da faixa comum; ligar de novo volta a ela
    p.solto = !p.solto; p.xZoom = p.solto ? xFaixa && xFaixa.slice() : null;
    marcaZoom(p); guardaLayout(); criaGrafico(p);
  };
  el.querySelector(".b-opc").onclick = abre("opc", menuOpc);
  el.querySelector(".cab .b-rec").onclick = () => { p.recolhido = !p.recolhido; marcaRecolhido(p); guardaLayout(); if (!p.recolhido) setTimeout(redimensiona, 0); };
  el.querySelector(".b-exp").onclick = () => expande(p, !p.expandido);
  el.querySelector(".b-rem").onclick = async () => {        // com sinais, pergunta antes (o ✕ fica perto dos botões)
    if (p.sinais.length && !(await pergunta({ titulo: tr("scope.q.apaga_painel", { titulo: p.titulo }), ok: tr("scope.q.apaga_painel_ok"), perigo: true,
      texto: tr("scope.q.apaga_painel_texto", { n: p.sinais.length }) }))) return;
    if (p.expandido) expande(p, false); if (p.u) p.u.destroy(); p.u = null; obsLargura.unobserve(el); el.remove(); itens = itens.filter((x) => x !== p); marcaSecoesVazias(); guardaLayout(); };
  const alca = el.querySelector(".b-arrasta");
  alca.addEventListener("dragstart", (e) => { arrastando = p; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(p.id));
    e.dataTransfer.setDragImage(el, 20, 20); el.classList.add("arrastando"); });
  alca.addEventListener("dragend", () => { arrastando = null; el.classList.remove("arrastando"); limpaAlvos(); });
  alvoDeSoltura(el, p);
  if (posicao == null) { $("paineis").appendChild(el); itens.push(p); } else { itens.splice(posicao, 0, p); reordenaDOM(); }
  el._painel = p; obsLargura.observe(el);
  marcaY(p); marcaZoom(p); marcaRecolhido(p); marcaExpande(p); marcaSecoesVazias();
  criaGrafico(p);
  if (p.med.aberto) mudaMed(p, false);
  return p;
}

const layoutAtual = () => ({ colunas: larguraPadrao, indice, itens: itens.map((x) => x.tipo === "secao" ? { secao: x.titulo, recolhida: x.recolhida || undefined } : { titulo: x.titulo, sinais: x.sinais, altura: x.altura, largura: x.largura, yFixo: x.yFixo, ganhos: x.ganhos, modo: x.modo, solto: x.solto, med: x.med, recolhido: x.recolhido || undefined }) });
let padraoPendente = "";                                // a chave cujo padrão está vindo (consultaPadrao)
function guardaLayout() {
  const chave = chaveLayout();                          // sem rodada (sem circuito), nada a guardar
  // enquanto o padrão do circuito vem (a 1ª vez dele neste navegador), o que está na tela é o provisório: não grava (senão o
  // padrão, ao chegar, achava um layout guardado e não entrava — ao vivo, a rodada nova mexe na tela nesse meio-tempo)
  if (chave && chave !== padraoPendente) try { localStorage.setItem(chave, JSON.stringify(layoutAtual())); } catch (e) { /* sem armazenamento */ }
  desenhaIndice(); aplicaVisibilidade();
}
// o padrão do scope de cada circuito (Marcelo, 23/10): ao lado do .ipes (<nome>.scope.json), pelo simu; "Layout ▾" guarda e
// volta a ele; um circuito sem layout neste navegador começa por ele
const padraoVisto = new Set();
const urlPadrao = () => `/maisim/simu/scope/padrao?modelo=${encodeURIComponent((A && A.meta && A.meta.modelo) || "")}`;
async function lePadrao() {
  try { const r = await fetch(urlPadrao()); return r.ok ? ((await r.json()).layout || null) : null; } catch (e) { return null; }   // sem o simu: sem padrão
}
function consultaPadrao(chave) {
  padraoVisto.add(chave); padraoPendente = chave;
  lePadrao().then((L) => {
    if (padraoPendente === chave) padraoPendente = "";
    if (chave !== chaveLayout()) return;                // outra rodada no meio
    let novo = false;
    if (L) try { if (!localStorage.getItem(chave)) { localStorage.setItem(chave, JSON.stringify(L)); novo = true; } } catch (e) { /* ok */ }
    montaTudo();                                         // com o padrão; sem ele, o de antes ou o automático
    if (novo) st("scope.st.padrao_circuito", { c: circuitoDe(A) });
  });
}
function leLayout() {
  const chave = chaveLayout(); if (!chave) return null;
  // guardado (até vazio: "Layout automático", ou tudo apagado) é o deste circuito: não volta ao padrão nem ao de antes
  try { const raw = localStorage.getItem(chave); if (raw !== null) { const j = JSON.parse(raw); if (j && Array.isArray(j.itens)) return j; } } catch (e) { /* idem */ }
  try { const v4 = chaveV4(), raw = v4 && localStorage.getItem(v4);    // o de antes, pelo nome do circuito: passa a ser deste
    if (raw) { const j = JSON.parse(raw); if (j && Array.isArray(j.itens) && j.itens.length) { localStorage.setItem(chave, raw); return j; } } } catch (e) { /* idem */ }
  // um circuito sem layout neste navegador: primeiro o padrão dele (ao lado do .ipes, pelo simu); só sem padrão, o de antes
  if (A && A.meta && A.meta.modelo && !padraoVisto.has(chave)) { consultaPadrao(chave); return null; }
  if (padraoPendente === chave) return null;            // o padrão ainda vem: o de antes (v3) não entra na frente dele
  // a 1ª vez deste circuito: do layout de antes (um só para tudo), os painéis com sinais desta rodada e as seções deles
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_LAYOUT_ANTIGA) || "null");
    if (v && Array.isArray(v.itens) && A && A.dados && Object.keys(A.dados).length > 1) {
      const out = []; let secao = null;
      for (const x of v.itens) {
        if (x.secao) { secao = x; continue; }
        if ((x.sinais || []).some((c) => temSinal(A, c))) { if (secao) { out.push(secao); secao = null; } out.push(x); }
      }
      if (out.some((x) => !x.secao)) { const j = Object.assign({}, v, { itens: out }); localStorage.setItem(chave, JSON.stringify(j)); return j; }
    }
  } catch (e) { /* sem o de antes */ }
  return null;
}
function montaTudo() {
  if (expandido) expande(expandido, false);
  for (const p of paineis()) if (p.u) p.u.destroy();
  obsLargura.disconnect(); itens = []; $("paineis").innerHTML = "";
  const salvo = leLayout();
  larguraPadrao = [1, 2, 3].includes(salvo && salvo.colunas) ? salvo.colunas : 2;    // layouts antigos: as colunas viram a largura
  if (salvo && salvo.indice) indice = Object.assign({ aberto: false, unica: false, secao: -1 }, salvo.indice);
  poePorLinha();
  document.body.classList.toggle("com-indice", indice.aberto); $("ck-unica").checked = indice.unica;
  for (const cfg of (salvo ? salvo.itens : [])) { if (cfg.secao) adicionaSecao(cfg.secao, null, cfg.recolhida); else adicionaPainel(cfg); }
  garantePainelDaRodada();
  desenhaIndice(); aplicaVisibilidade(); medeCab();
}

// ---------------------------------------------------------------- índice ao lado (ir direto a um gráfico; uma seção por vez = abas)
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function grupos() {                                    // seções na ordem, com os seus painéis; k = −1: painéis antes da 1ª seção
  const gs = [{ s: null, k: -1, ps: [] }]; let k = -1;
  for (const x of itens) { if (x.tipo === "secao") gs.push({ s: x, k: ++k, ps: [] }); else gs[gs.length - 1].ps.push(x); }
  return gs[0].ps.length ? gs : gs.slice(1);
}
// só a rodada: numa rodada do /maisim/simu (ou com ?so=rodada, como o simu abre o scope) os painéis sem nenhum sinal dela
// (os do MMC) somem, e as suas seções também, no índice inclusive; o layout guardado não muda
const SO_RODADA = new URLSearchParams(location.search).get("so") === "rodada";
// o scope numa janela à parte (pelo trilho, ou numa aba; não o que vai dentro do simu): avisa o simu a cada 3 s, e ao fechar,
// para a aba scope de lá virar uma faixa estreita (Marcelo, 23/10). Diz se está escondido (o navegador atrasa o aviso) e se
// está ao vivo (em Comparar, o ao vivo não aparece aqui: a aba de lá fica). O nome da janela: o "ir para lá" do simu acha esta
let avisaSimu = () => {};
if (window.top === window.self && typeof BroadcastChannel === "function") {
  const canalSimu = new BroadcastChannel("maisim-simu"), eu = Math.random().toString(36).slice(2);
  let saiu = false;                                    // fechando, o "escondida" (que vem depois) não a traz de volta
  avisaSimu = () => { if (!saiu) try { canalSimu.postMessage({ tipo: "scope", de: eu, oculto: document.hidden, vivo: modo !== "comparar" }); } catch (e) { /* ok */ } };
  window.name = "maisim-scope"; addEventListener("pageshow", () => { window.name = "maisim-scope"; });
  avisaSimu(); setInterval(avisaSimu, 3000); document.addEventListener("visibilitychange", avisaSimu);
  addEventListener("pagehide", () => { saiu = true; try { canalSimu.postMessage({ tipo: "scope-fechado", de: eu }); } catch (e) { /* ok */ } });   // o nome fica: indo a outra página, o "ir para lá" a traz de volta
  addEventListener("pageshow", (e) => { if (e.persisted) { saiu = false; avisaSimu(); } });   // voltou do cache do navegador
}
const DO_SIMU = (m) => !!m && (m.planta === "gecko-maisim" || m.planta === "gecko-pew");   // rodadas do simulador (gecko-pew: as do tempo do PEW)
const soDaRodada = () => SO_RODADA || !!(A && DO_SIMU(A.meta));
// um painel some se nenhum dos sinais dele existe na rodada (pelos dados, não por já ter gráfico: marcar o 1º sinal de um
// painel novo guarda o layout antes de montar o gráfico, e o painel sumia até a próxima mudança — achado de Marcelo, 19/10)
const temSinal = (F, c) => !!(F && F.dados && grossa(F, c));
const mostravel = (p) => !(soDaRodada() && p.sinais.length && !p.u && !p.sinais.some((c) => temSinal(A, c) || temSinal(B, c)));
function gruposMostraveis() {
  return soDaRodada() ? grupos().filter((g) => !g.ps.length || g.ps.some(mostravel)) : grupos();
}
function desenhaIndice() {
  const lista = document.querySelector("#indice .lista"); if (!lista) return;
  lista.innerHTML = gruposMostraveis().map((g) => `<div class="s${indice.unica && g.k === indice.secao ? " atual" : ""}${g.s && g.s.recolhida ? " recolhida" : ""}" data-k="${g.k}"${g.k >= 0 ? ` draggable="true"` : ""}>${escH(g.s ? g.s.titulo : tr("scope.sem_secao"))}</div>` +
    g.ps.filter(mostravel).map((p) => `<div class="p" data-id="${p.id}" title="${escH(p.titulo)}">${escH(p.titulo)}</div>`).join("")).join("");
}
function aplicaVisibilidade() {
  const gs = gruposMostraveis(), ks = new Set(gs.map((g) => g.k)); let mudou = false;
  if (indice.unica && gs.length && !ks.has(indice.secao)) { indice.secao = gs[0].k; desenhaIndice(); }
  for (const g of grupos()) {
    const ver = ks.has(g.k) && (!indice.unica || g.k === indice.secao);
    if (g.s) { const n = g.ps.filter(mostravel).length; g.s.el.querySelector(".n-rec").textContent = g.s.recolhida ? tr("scope.n_paineis", { n }) : ""; }
    for (const [x, v] of (g.s ? [[g.s, ver]] : []).concat(g.ps.map((p) => [p, ver && mostravel(p) && !(g.s && g.s.recolhida)])))
      if (x.el.classList.contains("oculto") === v) { x.el.classList.toggle("oculto", !v); mudou = true; }
  }
  $("so-vazio").hidden = !(soDaRodada() && !paineis().some(mostravel));
  if (mudou) setTimeout(redimensiona, 0);           // painel que estava escondido foi criado com largura errada
}
function vaiPara(el) {
  el.scrollIntoView({ block: "start", behavior: "smooth" });
  if (el.classList.contains("cartao")) { el.classList.add("realce"); setTimeout(() => el.classList.remove("realce"), 1200); }
}
function medeCab() { document.documentElement.style.setProperty("--cab-h", `${document.querySelector("header").offsetHeight}px`); }
(() => {
  const lista = document.querySelector("#indice .lista");
  lista.addEventListener("click", (e) => {
    const s = e.target.closest(".s"), pe = e.target.closest(".p");
    if (s) {
      const g = grupos().find((x) => x.k === +s.dataset.k); if (!g) return;
      if (indice.unica) { indice.secao = g.k; guardaLayout(); window.scrollTo({ top: 0 }); }
      else vaiPara(g.s ? g.s.el : g.ps[0].el);
    } else if (pe) {
      const p = paineis().find((x) => x.id === +pe.dataset.id); if (!p) return;
      const g = grupos().find((x) => x.ps.includes(p));
      if (g && g.s && g.s.recolhida) { abreSecaoDe(p); guardaLayout(); }
      if (indice.unica && g && g.k !== indice.secao) { indice.secao = g.k; guardaLayout(); }
      setTimeout(() => vaiPara(p.el), 30);
    }
  });
  // arrastar uma seção pelo nome no índice: a mesma regra das seções na página (antes da seção abaixo do mouse; nenhuma = fim)
  const secoesIndice = () => [...lista.querySelectorAll(".s")].map((el) => [(grupos().find((g) => g.k === +el.dataset.k) || {}).s, el]).filter(([s]) => s);
  lista.addEventListener("dragstart", (e) => { const el = e.target.closest && e.target.closest(".s"); if (!el) return;
    const g = grupos().find((x) => x.k === +el.dataset.k); if (!g || !g.s) { e.preventDefault(); return; }
    arrastandoSecao = g.s; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "secao"); el.classList.add("arrastando"); });
  lista.addEventListener("dragend", () => { arrastandoSecao = null; lista.querySelectorAll(".arrastando").forEach((x) => x.classList.remove("arrastando")); limpaAlvos(); });
  lista.addEventListener("dragover", (e) => { if (!arrastandoSecao) return; e.preventDefault();
    const a = secaoAbaixo(e.clientY, secoesIndice()); limpaAlvos(); if (a) a[1].classList.add("alvo-antes"); else lista.classList.add("alvo-fim"); });
  lista.addEventListener("drop", (e) => { if (!arrastandoSecao) return; e.preventDefault();
    const s = arrastandoSecao, a = secaoAbaixo(e.clientY, secoesIndice()); arrastandoSecao = null; limpaAlvos(); moveSecao(s, a ? a[0] : null); });
  // soltar um painel (alça ⠿) sobre uma seção do índice: vai para o início dela
  lista.addEventListener("dragover", (e) => { const s = e.target.closest(".s"); if (!arrastando || !s || +s.dataset.k < 0) return; e.preventDefault();
    lista.querySelectorAll(".alvo-depois").forEach((x) => x.classList.remove("alvo-depois")); s.classList.add("alvo-depois"); });
  lista.addEventListener("dragleave", (e) => { const s = e.target.closest(".s"); if (s) s.classList.remove("alvo-depois"); });
  lista.addEventListener("drop", (e) => {
    const s = e.target.closest(".s"); if (!arrastando || !s) return; e.preventDefault();
    const g = grupos().find((x) => x.k === +s.dataset.k); if (g && g.s) move(arrastando, g.s, true);
    arrastando = null;
  });
  $("ck-unica").onchange = (e) => { indice.unica = e.target.checked; guardaLayout(); };
  $("bt-indice").onclick = () => { indice.aberto = !indice.aberto; document.body.classList.toggle("com-indice", indice.aberto); guardaLayout(); setTimeout(redimensiona, 0); };
})();
// o layout automático: nenhum painel mostrando os sinais desta rodada (um circuito sem layout, ou um layout que não serve
// a ela) — uma seção com o nome do circuito e um painel com os sinais da rodada (os 8 primeiros); só grava no layout se você
// mexer em algo. A seção leva o nome do circuito, não o da rodada: rodadas com outros nomes não empilham seções
function garantePainelDaRodada() {
  if (!A || !A.dados) return;
  const todos = catalogo().map((c) => c.canal).filter((c) => temSinal(A, c));
  const gen = catalogo().filter((c) => c.id === "rodada").map((c) => c.canal).filter((c) => temSinal(A, c));
  const usar = gen.length ? gen : todos;
  if (!usar.length || paineis().some((p) => p.sinais.some((c) => temSinal(A, c)))) return;
  // os títulos do automático: no idioma de agora (ninguém compara com eles); autoTit: trocam com o idioma até o usuário mudar
  // o título (os que vêm de um layout guardado nunca têm a marca)
  const rotulo = A.meta.rotulo || "", s = adicionaSecao(circuitoDe(A) || tr("scope.secao_rodada", { rotulo }).trim(), 0);
  if (!circuitoDe(A)) s.autoTit = { chave: "scope.secao_rodada", rotulo };
  const p = adicionaPainel({ titulo: tr("scope.painel_rodada", { rotulo }).trim(), sinais: usar.slice(0, 8), largura: 1 }, 1);
  p.autoTit = { chave: "scope.painel_rodada", rotulo };
}
// o gráfico acompanha a largura do cartão (painel criado com o scope escondido, tela dividida no simu, índice aberto…)
const obsLargura = new ResizeObserver((ents) => {
  for (const e of ents) {
    const p = e.target._painel, w = p && p.el.clientWidth;
    if (!p || !p.u || !w || (Math.abs(p.u.width - Math.max(300, w - 14)) < 2 && Math.abs(p.u.height - alturaDe(p)) < 2)) continue;
    p.u.setSize({ width: Math.max(300, w - 14), height: alturaDe(p) });
    if (p.med.aberto && p.med.esp.aberto) desenhaEspectro(p);
  }
});
function redimensiona() {
  for (const p of paineis()) { if (p.u) p.u.setSize({ width: Math.max(300, p.el.clientWidth - 14), height: alturaDe(p) }); if (p.med.aberto && p.med.esp.aberto) desenhaEspectro(p); }
}

// ---------------------------------------------------------------- PNG
function nomeArq(s) { return (s || "scope").normalize("NFD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 80); }
function canvasPainel(p) {
  const u = p.u;
  if (!u) { const c = document.createElement("canvas"); c.width = 10; c.height = 10; return c; }
  const src = u.ctx.canvas, r = src.width / u.width;
  const larg = src.width, porLinha = Math.max(1, Math.floor(larg / (240 * r)));
  const linhas = Math.ceil(p.series.length / porLinha);
  const c = document.createElement("canvas");
  const comCur = curLigados(p);                       // os cursores: uma linha só deles, embaixo (ao lado do título não cabe sempre)
  c.width = larg; c.height = Math.round(30 * r + src.height + (linhas + (comCur ? 1 : 0)) * 18 * r + 8 * r);
  const g = c.getContext("2d");
  const C = cores();                                  // o PNG sai como está na tela (tema claro: fundo branco)
  g.fillStyle = C.fundo; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = C.titulo; g.textBaseline = "middle";
  textoMat(g, p.titulo, 8 * r, 15 * r, 14 * r, "600");
  g.drawImage(src, 0, 30 * r);
  p.series.forEach((se, k) => {
    const x = 8 * r + (k % porLinha) * (larg / porLinha), y = 30 * r + src.height + (Math.floor(k / porLinha) + 0.6) * 18 * r;
    g.strokeStyle = se.cor; g.lineWidth = Math.max(2, 1.5 * (se.largura || 1.3)) * r; g.setLineDash((se.dash || []).map((d) => d * r));
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18 * r, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = C.titulo; textoMat(g, se.rot, x + 24 * r, y, 12 * r);
  });
  if (comCur) { const M = p.med.cur, dt = M.b - M.a; g.fillStyle = C.titulo; g.font = `${12 * r}px system-ui, sans-serif`;
    g.fillText(`A ${fmtT(M.a)} · B ${fmtT(M.b)} · Δt = ${fmtT(dt)} · 1/Δt = ${fmtF(dt ? 1e3 / Math.abs(dt) : NaN)}`, 8 * r, 30 * r + src.height + (linhas + 0.6) * 18 * r); }
  return c;
}
function salvaTodos() {
  const ps = paineis().filter((p) => p.u && !p.el.classList.contains("oculto"));   // os que estão à vista, nas linhas da tela
  if (!ps.length) return;
  const linhas = []; let topo = null;
  for (const p of ps) { const t = p.el.offsetTop; if (topo === null || Math.abs(t - topo) > 5) { linhas.push([]); topo = t; } linhas[linhas.length - 1].push(canvasPainel(p)); }
  const gap = Math.round(10 * (devicePixelRatio || 1));
  const largL = linhas.map((l) => l.reduce((a, c) => a + c.width, 0) + (l.length - 1) * gap), altL = linhas.map((l) => Math.max(...l.map((c) => c.height)));
  const out = document.createElement("canvas");
  out.width = Math.max(...largL); out.height = altL.reduce((a, b) => a + b, 0) + (linhas.length - 1) * gap;
  const g = out.getContext("2d"); g.fillStyle = cores().fundo; g.fillRect(0, 0, out.width, out.height);
  let y = 0;
  linhas.forEach((l, i) => { let x = 0; for (const c of l) { g.drawImage(c, x, y); x += c.width + gap; } y += altL[i] + gap; });
  baixa(out, `maisim-scope_${nomeArq((A && A.meta && A.meta.planta) || "")}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`);
}
function baixa(canvas, nome) { const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = nome; a.click(); }

// ---------------------------------------------------------------- Ao vivo (SSE)
let fonteEventos = null, redesenhoPendente = false, repeticao = false, timerEscondida = null;
let esperaEscondida = 30000;                 // aba escondida por mais que isto (ms): fecha a conexão ao vivo (ver abaixo)
// a linha de estado: um texto, ou uma função que o faz (st: uma chave do dicionário) — essa é refeita ao mudar o idioma
let ultimoStatus = "";
function status(txt) { ultimoStatus = txt; $("status").textContent = typeof txt === "function" ? txt() : txt; }
const st = (chave, p) => status(() => tr(chave, p));
const nomePlanta = (m) => DO_SIMU(m) ? `MaiSim / simu · ${m.rotulo || ""}` : (m.planta || "");
function redesenha() {
  if (redesenhoPendente || pausado) return;
  redesenhoPendente = true;
  setTimeout(() => {
    redesenhoPendente = false;
    if (!paineis().length || paineis().some((p) => !p.u && p.sinais.length && !p.semDados)) { montaTudo(); return; }
    for (const p of paineis()) atualiza(p);
  }, 400);
}
function conectaVivo() {
  if (fonteEventos) fonteEventos.close();
  // aberto sozinho (pelo trilho: sem ?so=rodada nem ?a=), só a rodada em andamento; sem nenhuma, vazio (Marcelo, 22/10: "se
  // não tiver nada, vir vazio"); no simu (?so=rodada), também a última que terminou
  const q = new URLSearchParams(location.search);
  fonteEventos = new EventSource(q.get("so") || q.get("a") ? "eventos" : "eventos?ativa=1");
  // ao conectar, o servidor repete a rodada em curso ("inicio" e tudo o que já veio): só esse 1º "inicio", com a meta
  // igual (o servidor numera cada rodada), é a mesma rodada; qualquer outro "inicio" é rodada nova
  fonteEventos.onopen = () => { repeticao = true; setTimeout(() => { repeticao = false; }, 3000);
    setTimeout(() => { if (modo === "vivo" && !A) st("scope.st.sem_rodada"); }, 1200); };
  fonteEventos.addEventListener("inicio", (ev) => {
    if (modo !== "vivo") return;
    const meta = JSON.parse(ev.data), rep = repeticao; repeticao = false;
    if (rep && A && JSON.stringify(A.meta) === JSON.stringify(meta)) {   // reconexão na mesma rodada: os dados vêm todos de novo;
      A.dados = {}; A.ger = (A.ger || 0) + 1; limpaCaches(A); return;    // painéis e zoom ficam, a medição recalcula (A.ger)
    }
    A = { meta, dados: {} }; xFaixa = null;
    montaTudo();                             // rodada nova: os painéis deixam de apontar para a anterior
    for (const p of paineis()) { p.xZoom = null; p.yZoom = null; }
    st("scope.st.vivo_aguardando", { nome: nomePlanta(A.meta) });
  });
  fonteEventos.addEventListener("dados", (ev) => {
    if (modo !== "vivo" || !A) return;
    const lote = JSON.parse(ev.data);
    for (const k in lote) { const dst = (A.dados[k] = A.dados[k] || []); for (const v of lote[k]) dst.push(v); }
    limpaCaches(A);
    const t = A.dados.t || [];
    if (t.length) st("scope.st.vivo_t", { nome: nomePlanta(A.meta), t: (t[t.length - 1] * 1e3).toFixed(2), n: t.length });
    redesenha();
  });
  fonteEventos.addEventListener("fim", () => { if (modo === "vivo" && A) st("scope.st.terminou", { nome: nomePlanta(A.meta), n: (A.dados.t || []).length }); });
  fonteEventos.onerror = () => st("scope.st.sem_conexao");
}
// a conexão ao vivo só com a aba à vista: o navegador abre no máximo 6 conexões por endereço (somando as abas, HTTP/1.1)
// e cada EventSource aberto segura uma; com 6 abas do scope (ou do simu com o scope embutido) em segundo plano, a próxima
// página do MaiSim ficava na fila, sem o trilho. Escondida por mais de 30 s, a aba fecha a sua; ao voltar, reconecta e o
// servidor manda a rodada desde o começo (trocar de aba rápido não fecha nada nem reenvia a rodada)
document.addEventListener("visibilitychange", () => {
  clearTimeout(timerEscondida); timerEscondida = null;
  if (modo !== "vivo") return;
  if (document.hidden) timerEscondida = setTimeout(() => {
    timerEscondida = null;
    if (document.hidden && fonteEventos) { fonteEventos.close(); fonteEventos = null; }
  }, esperaEscondida);
  else if (!fonteEventos) conectaVivo();
});

// ---------------------------------------------------------------- Comparar
async function listaRodadas() {
  const r = await fetch("rodadas"); const lst = await r.json();
  for (const sel of [$("sel-a"), $("sel-b")]) {
    const atual = sel.value;
    sel.innerHTML = `<option value="">${escH(tr(sel.id === "sel-b" ? "scope.nenhuma" : "scope.escolha"))}</option>` +
      lst.map((x) => `<option value="${escH(x.arq)}" title="${escH(x.arq)}">${escH(x.rotulo || x.arq)}${x.guardada ? " · " + escH(tr("scope.guardada")) : ""}</option>`).join("");   // guardada: "por cima" não a substitui
    sel.value = atual;
  }
}
// gravação: binário (rodada.bin, valores exatos do .npz, sem interpretar texto) e, se o servidor for antigo, o JSON
const TIPOS_BIN = { f8: Float64Array, f4: Float32Array, i4: Int32Array, u4: Uint32Array, i2: Int16Array, u2: Uint16Array, i1: Int8Array, u1: Uint8Array };
async function carrega(arq) {
  if (!arq) return null;
  try {
    const r = await fetch("rodada.bin?arq=" + encodeURIComponent(arq));
    if (r.ok) {
      const buf = await r.arrayBuffer(), dv = new DataView(buf);
      if (buf.byteLength >= 8 && dv.getUint32(0, false) === 0x4D414953) {          // "MAIS"
        const H = dv.getUint32(4, true), cab = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, H)));
        const base = Math.ceil((8 + H) / 8) * 8, dados = {};
        for (const k of cab.canais) dados[k.nome] = new TIPOS_BIN[k.tipo](buf, base + k.desloc, k.n);
        return { meta: cab.meta, dados };
      }
    }
  } catch (e) { /* servidor antigo ou resposta estranha: cai no JSON */ }
  const r = await fetch("rodada?arq=" + encodeURIComponent(arq));
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.dados) {                    // gravação que não existe mais (apagada) ou ilegível: avisa, sem quebrar a página
    const nome = arq.split("/").pop(), erro = j && j.erro;
    status(() => tr("scope.st.nao_abriu", { arq: nome, erro: erro || tr("scope.st.nao_existe") })); return null;
  }
  return j;
}
function entraComparar() {
  modo = "comparar"; $("bt-comparar").classList.add("ativo"); $("bt-vivo").classList.remove("ativo"); avisaSimu();
  if (fonteEventos) fonteEventos.close();
}
// "A: … | B: …": as escolhidas agora, pelo nome que a lista mostra (refeito no idioma, como o aviso dos intervalos)
function statusAB() {
  const val = (sel) => (sel.selectedIndex < 0 ? null : sel.value), va = val($("sel-a")), vb = val($("sel-b")), comB = !!B;
  const nome = (sel, v) => { const o = v == null ? null : [...sel.options].find((x) => x.value === v); return o ? o.textContent : "—"; };
  status(() => `A: ${nome($("sel-a"), va)}${comB ? " | B: " + nome($("sel-b"), vb) : ""}${A ? avisoGrade() : ""}`);
}
function poePorLinha() { $("bt-porlinha").textContent = tr("scope.por_linha", { n: larguraPadrao }); }

// ---------------------------------------------------------------- barra de ferramentas
$("ck-fixar").onchange = (e) => { fixar = e.target.checked; };
$("ck-pausar").onchange = (e) => { pausado = e.target.checked; if (!pausado) redesenha(); };
$("bt-painel").onclick = () => {                       // só a rodada: no fim da seção dela (o fim do layout é uma seção do MMC, escondida)
  const alvo = soDaRodada() ? grupos().reverse().find((g) => g.ps.some((p) => p.u)) : null;
  if (alvo) { abreSecaoDe(adicionaPainel({ titulo: tr("scope.novo_painel"), sinais: [] }, itens.indexOf(alvo.ps[alvo.ps.length - 1]) + 1)); indice.secao = alvo.k; }
  else { abreSecaoDe(adicionaPainel({ titulo: tr("scope.novo_painel"), sinais: [] })); const gs = grupos(); indice.secao = gs[gs.length - 1].k; }
  guardaLayout();
};
$("bt-secao").onclick = () => { adicionaSecao(tr("scope.nova_secao")); const gs = grupos(); indice.secao = gs[gs.length - 1].k; guardaLayout(); };
$("bt-porlinha").onclick = () => {
  larguraPadrao = larguraPadrao % 3 + 1; poePorLinha();
  for (const p of paineis()) { p.largura = larguraPadrao; aplicaLargura(p); }
  guardaLayout(); setTimeout(redimensiona, 0);
};
$("bt-layout").onclick = (ev) => { ev.stopPropagation(); $("menu-layout").hidden = !$("menu-layout").hidden; };
document.addEventListener("click", (ev) => { if (!ev.target.closest("#menu-layout, #bt-layout")) $("menu-layout").hidden = true; });
$("ml-guardar").onclick = async () => {
  $("menu-layout").hidden = true;
  if (!A || !A.meta || !A.meta.modelo) { st("scope.st.guardar_sem_rodada"); return; }
  try {
    const r = await fetch("/maisim/simu/scope/padrao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelo: A.meta.modelo, layout: layoutAtual() }) });
    const j = await r.json().catch(() => ({}));
    const c = circuitoDe(A);
    if (r.ok) status(() => tr("scope.st.guardou", { c, arq: j.arquivo || tr("scope.st.ao_lado") })); else st("scope.st.guardar_erro", { erro: j.erro || r.statusText });
  } catch (e) { st("scope.st.guardar_sem_simu", { msg: e.message }); }
};
$("ml-padrao").onclick = async () => {
  $("menu-layout").hidden = true;
  const L = A && A.meta && A.meta.modelo ? await lePadrao() : null;
  if (!L) { st("scope.st.sem_padrao", { c: circuitoDe(A) || "" }); return; }
  try { localStorage.setItem(chaveLayout(), JSON.stringify(L)); } catch (e) { /* ok */ }
  montaTudo(); st("scope.st.de_volta", { c: circuitoDe(A) });
};
$("bt-padrao").onclick = () => {
  $("menu-layout").hidden = true; const k = chaveLayout();   // vazio (não apagado): nem o padrão nem o de antes voltam por cima do automático
  if (k) try { localStorage.setItem(k, JSON.stringify({ itens: [] })); } catch (e) { /* ok */ } indice = { aberto: indice.aberto, unica: false, secao: -1 }; montaTudo(); guardaLayout(); };
$("bt-salvar").onclick = salvaTodos;
// ---- as visões (os painéis, as seções e as cores dos sinais) num arquivo: levar para outro MaiSim, mandar a um colega,
// ou trazer as do PEW (o mesmo formato "scope-visoes")
$("bt-exportar").onclick = () => {
  guardaLayout();
  let layout = null; try { layout = JSON.parse(localStorage.getItem(chaveLayout()) || "null"); } catch (e) { /* sem layout guardado */ }
  const v = { formato: "scope-visoes", versao: 1, de: "MaiSim", circuito: circuitoDe(A), exportado: new Date().toISOString(), layout, cores: coresSinal, espessuras: espessurasSinal, tracos: tracosSinal };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(v, null, 1)], { type: "application/json" }));
  a.download = `visoes_scope_${(circuitoDe(A) || "scope").replace(/[^\w.-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  st("scope.st.exportadas", { n: ((layout && layout.itens) || []).length, cores: Object.keys(coresSinal).length });
};
$("bt-importar").onclick = () => $("arq-visoes").click();
$("arq-visoes").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  let v; try { v = JSON.parse(await f.text()); } catch (er) { st("scope.st.imp_nao_json", { arq: f.name }); return; }
  const itensV = v && v.formato === "scope-visoes" && v.layout && Array.isArray(v.layout.itens) ? v.layout.itens : null;
  if (!itensV || !itensV.length || itensV.length > 500 || !itensV.every((x) => x && typeof x === "object" && (typeof x.secao === "string" || Array.isArray(x.sinais)))) {
    st("scope.st.imp_nao_visoes", { arq: f.name }); return; }
  if (!chaveLayout()) { st("scope.st.imp_sem_rodada"); return; }
  if (!(await pergunta({ titulo: tr("scope.q.importa"), ok: tr("scope.q.importa_ok"),
    texto: tr(v.de ? "scope.q.importa_texto_de" : "scope.q.importa_texto", { c: circuitoDe(A), arq: f.name, de: v.de, n: itensV.length }) }))) return;
  const cores = {};
  for (const [k, c] of Object.entries(v.cores && typeof v.cores === "object" ? v.cores : {})) { const cv = corValida(String(c)); if (cv && /^[\w.$+\-]{1,120}$/.test(k)) cores[k] = cv; }
  const esp = {};
  for (const [k, w] of Object.entries(v.espessuras && typeof v.espessuras === "object" ? v.espessuras : {})) if (espessuraValida(w) && /^[\w.$+\-]{1,120}$/.test(k)) esp[k] = +w;
  const tra = {};
  for (const [k, t] of Object.entries(v.tracos && typeof v.tracos === "object" ? v.tracos : {})) if (tracoValido(t) && t !== "continua" && /^[\w.$+\-]{1,120}$/.test(k)) tra[k] = t;
  try { localStorage.setItem(chaveLayout(), JSON.stringify(v.layout)); localStorage.setItem("maisim-scope-cores", JSON.stringify(cores)); localStorage.setItem("maisim-scope-espessuras", JSON.stringify(esp)); localStorage.setItem("maisim-scope-tracos", JSON.stringify(tra)); }
  catch (er) { st("scope.st.imp_nao_guardou"); return; }
  coresSinal = cores; espessurasSinal = esp; tracosSinal = tra; montaTudo();
  st("scope.st.importadas", { arq: f.name, n: itensV.length, cores: Object.keys(cores).length });
};
// ---- apagar gravações: de uma rodada do simu, a pasta inteira (os dados e a cópia do circuito daquela rodada — nunca o
// circuito em "meus circuitos"); de outras pastas, só o scope_*.npz. Filtro e "marcar todas (as filtradas)" (Marcelo, 22/10);
// as guardadas com selo e confirmação a mais; as pastas de rodada sem gravação, à parte
const mb = (b) => (b / 1e6).toFixed(b >= 1e7 ? 0 : 1) + " MB";
// as perguntas no padrão do MaiSim, não o confirm() do navegador (Marcelo, 22/10): Esc ou fora cancela; Enter confirma;
// perigo: o botão em vermelho e o foco no Cancelar
function pergunta({ titulo, texto, ok = "OK", perigo = false }) {
  return new Promise((res) => {
    const f = document.createElement("div"); f.className = "sc-modal-fundo";
    f.innerHTML = `<div class="sc-modal" role="dialog" aria-modal="true"><h3>${escH(titulo)}</h3><p>${escH(texto)}</p>` +
      `<div class="sc-bts"><button class="sc-cancela">${escH(tr("scope.cancelar"))}</button><button class="sc-ok${perigo ? " perigo" : ""}">${escH(ok)}</button></div></div>`;
    document.body.appendChild(f);
    const fecha = (v) => { removeEventListener("keydown", tecla, true); f.remove(); res(v); };
    const tecla = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fecha(false); }
      else if (e.key === "Enter" && !(document.activeElement && document.activeElement.classList.contains("sc-cancela"))) { e.preventDefault(); e.stopPropagation(); fecha(true); } };
    addEventListener("keydown", tecla, true);
    f.querySelector(".sc-cancela").onclick = () => fecha(false); f.querySelector(".sc-ok").onclick = () => fecha(true);
    f.addEventListener("mousedown", (e) => { if (e.target === f) fecha(false); });
    setTimeout(() => f.querySelector(perigo ? ".sc-cancela" : ".sc-ok").focus(), 0);
  });
}
const visiveisAp = () => [...$("ap-lista").querySelectorAll("label:not([hidden]) input")];
function marcaAp() {                                    // o rodapé e o "marcar todas": só o que está à vista
  const vis = visiveisAp(), ck = vis.filter((c) => c.checked), orf = $("ap-orfas").checked ? +$("ap-orfas").dataset.tam : 0;
  const tam = ck.reduce((a, c) => a + +c.dataset.tam, 0) + orf;
  $("ap-marcadas").textContent = ck.length || orf ? tr(orf ? "scope.ap.marcadas_orf" : "scope.ap.marcadas", { n: ck.length, tam: mb(tam) }) : tr("scope.ap.nenhuma_marcada");
  $("ap-ok").disabled = !ck.length && !orf;
  $("ap-ok").textContent = ck.length ? tr("scope.ap.ok_n", { n: ck.length, tam: mb(tam) }) : orf ? tr("scope.ap.ok_orf", { tam: mb(tam) }) : tr("scope.ap.ok");
  const t = $("ap-todas"); t.checked = vis.length > 0 && ck.length === vis.length; t.indeterminate = ck.length > 0 && ck.length < vis.length;
  $("ap-vis").textContent = $("ap-filtro").value.trim() ? tr("scope.ap.vis", { n: vis.length }) : "";
}
function filtraAp() {
  const q = $("ap-filtro").value.trim().toLowerCase();
  $("ap-lista").querySelectorAll("label").forEach((l) => { l.hidden = !!q && !l.dataset.q.includes(q); });
  marcaAp();
}
const LIXO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
async function abreApagar(refaz) {                       // refaz: a janela já aberta, refeita no idioma novo (o "e as pastas" marcado fica)
  const marcadas = new Set([...$("ap-lista").querySelectorAll("input:checked")].map((c) => c.dataset.arq));   // refeita depois de apagar: as marcas ficam
  const orfMarcada = refaz && $("ap-orfas").checked;
  const [lst, orf] = await Promise.all([fetch("rodadas").then((r) => r.json()), fetch("orfas").then((r) => r.json()).catch(() => ({ n: 0, tamanho: 0 }))]);
  if (refaz && (apagando || !$("janela-apagar").classList.contains("aberta"))) return;   // fechada (ou apagando) enquanto a lista vinha
  const total = lst.reduce((a, x) => a + (x.pasta_tam || x.tamanho || 0), 0) + (orf.tamanho || 0);
  $("ap-total").textContent = tr("scope.ap.total", { n: lst.length, tam: mb(total) });
  $("ap-lista").innerHTML = lst.map((x) => {
    const q = [x.rotulo, x.arq, x.nome, x.modelo, x.guardada ? tr("scope.guardada") : ""].join(" ").toLowerCase();
    return `<label data-q="${escH(q)}"><input type="checkbox" data-arq="${escH(x.arq)}" data-tam="${x.pasta_tam || x.tamanho || 0}" data-guardada="${x.guardada ? 1 : ""}"${marcadas.has(x.arq) ? " checked" : ""}>` +
      `<span data-nome="${escH(x.rotulo || x.arq)}">${escH(x.rotulo || x.arq)}${x.guardada ? `<span class="selo" title="${escH(tr("scope.ap.t_selo"))}">${escH(tr("scope.guardada"))}</span>` : ""}</span>` +
      `<span class="tam" title="${escH(tr(x.pasta ? "scope.ap.t_pasta" : "scope.ap.t_npz"))}">${mb(x.pasta_tam || x.tamanho || 0)}</span>` +
      `<button class="lixo" type="button" title="${escH(tr("scope.ap.t_lixo"))}" aria-label="${escH(tr("scope.ap.t_lixo"))}">${LIXO}</button><span class="cam">${escH(x.arq)}</span></label>`; }).join("") ||
    `<i>${escH(tr("scope.ap.nenhuma"))}</i>`;
  $("ap-orfas-l").hidden = !orf.n; $("ap-orfas").checked = !!(orfMarcada && orf.n); $("ap-orfas").dataset.tam = orf.tamanho || 0;
  $("ap-orfas-t").textContent = tr("scope.ap.orfas", { n: orf.n, tam: mb(orf.tamanho || 0) });
  $("ap-lista").querySelectorAll("input").forEach((c) => c.onchange = marcaAp);
  $("ap-lista").querySelectorAll("button.lixo").forEach((b) => b.onclick = (ev) => {    // a lixeira da linha: só esta (Marcelo, 22/10)
    ev.preventDefault(); ev.stopPropagation(); apagaAp([b.closest("label").querySelector("input")], false); });
  filtraAp();                                           // o filtro de antes continua (depois de apagar, a lista é refeita)
  $("janela-apagar").classList.add("aberta");
}
$("bt-apagar").onclick = () => abreApagar();      // sem o evento (o 1º parâmetro é o "refaz")
$("ap-fechar").onclick = () => $("janela-apagar").classList.remove("aberta");
$("ap-filtro").oninput = filtraAp;
$("ap-orfas").onchange = marcaAp;
$("ap-todas").onchange = () => { const on = $("ap-todas").checked; visiveisAp().forEach((c) => { c.checked = on; }); marcaAp(); };
$("ap-ok").onclick = () => apagaAp(visiveisAp().filter((c) => c.checked), $("ap-orfas").checked);
let apagando = false;                                   // um apagar por vez: o 2º clique durante o 1º não faz nada
// o resumo de um apagar, curto (Marcelo, 22/10: a lista inteira das recusadas, com os caminhos, enchia a tela): as recusadas
// contadas por motivo; o que já tinha saído (outra aba, outro pedido) à parte
function resumoApagar(r) {
  const liberou = r.apagados.reduce((a, x) => a + x.tamanho, 0) + (r.orfas || []).reduce((a, x) => a + x.tamanho, 0);
  const motivos = {}; for (const x of r.recusados || []) motivos[x.por] = (motivos[x.por] || 0) + 1;
  const n = r.apagados.length, no = (r.orfas || []).length, nj = (r.ja || []).length;
  // os motivos das recusadas (x.por) vêm do servidor, já como texto
  return [n || no ? tr(no ? "scope.ap.r_apagadas_orf" : "scope.ap.r_apagadas", { n, no, tam: mb(liberou) }) : tr("scope.ap.r_nada"),
    nj ? tr("scope.ap.r_ja", { n: nj }) : "",
    (r.recusados || []).length ? tr("scope.ap.r_ficaram", { n: r.recusados.length, motivos: Object.entries(motivos).map(([m, k]) => `${k} ${m}`).join(", ") }) : ""].filter(Boolean).join("; ");
}
async function apagaAp(ck, orfas) {
  if (apagando || (!ck.length && !orfas)) return;
  const tam = ck.reduce((a, c) => a + +c.dataset.tam, 0) + (orfas ? +$("ap-orfas").dataset.tam : 0), guard = ck.filter((c) => c.dataset.guardada).length;
  const uma = ck.length === 1 && !orfas ? ck[0].closest("label").querySelector("span").dataset.nome : "";   // o nome, sem o selo
  if (!(await pergunta({ titulo: tr("scope.q.apagar"), ok: tr("scope.q.apagar_ok"), perigo: true,
    texto: tr("scope.q.apagar_texto", { quem: uma || tr(orfas ? "scope.q.n_gravacoes_orf" : "scope.q.n_gravacoes", { n: ck.length }), tam: mb(tam) }) }))) return;
  if (guard && !(await pergunta({ titulo: tr("scope.q.guardadas"), ok: tr("scope.q.guardadas_ok"), perigo: true,
    texto: uma ? tr("scope.q.guardada_uma") : tr("scope.q.guardadas_n", { n: guard }) }))) return;
  apagando = true; $("ap-ok").disabled = true; $("ap-ok").textContent = tr("scope.ap.apagando"); $("janela-apagar").classList.add("apagando");
  st("scope.st.apagando", { n: ck.length, tam: mb(tam) });
  try {
    const r = await (await fetch("apagar", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arqs: ck.map((c) => c.dataset.arq), guardadas: guard > 0, orfas }) })).json();
    status(() => resumoApagar(r));
  } catch (e) { st("scope.st.apagar_sem_servidor", { msg: e.message }); }
  finally { apagando = false; $("janela-apagar").classList.remove("apagando"); }
  await listaRodadas(); await abreApagar();
};
$("bt-vivo").onclick = () => {
  modo = "vivo"; $("bt-vivo").classList.add("ativo"); $("bt-comparar").classList.remove("ativo"); avisaSimu();
  A = null; B = null; uniao = null; xFaixa = null; montaTudo(); st("scope.st.sem_rodada"); conectaVivo();
};
$("bt-comparar").onclick = async () => { entraComparar(); await listaRodadas(); st("scope.st.escolha_ab"); };
$("bt-carregar").onclick = async () => {
  st("scope.st.carregando"); entraComparar();
  A = await carrega($("sel-a").value); B = await carrega($("sel-b").value); xFaixa = null; preparaGrade();
  statusAB();
  montaTudo();
};
// clique fora de um menu fecha os menus. O caminho do clique (composedPath) é o da hora do clique: um botão do menu que o
// próprio clique redesenhou (a paleta de cores, por exemplo) já saiu da página, mas o clique foi dentro do menu
document.addEventListener("click", (e) => {
  const dentro = e.composedPath().some((x) => x instanceof Element && x.matches(".menu, .b-sinais, .b-y, .b-opc"));
  if (!dentro) document.querySelectorAll(".menu").forEach((m) => m.remove());
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const m = document.querySelectorAll(".menu"); if (m.length) { m.forEach((x) => x.remove()); return; }
  if (expandido) expande(expandido, false);
});
$("fundo-exp").onclick = () => { if (expandido) expande(expandido, false); };
let tRes = null;
// o tema mudou (o trilho grava "maisim-tema" — o evento storage chega a esta página também dentro do simu; "sistema" segue o
// sistema; o maisim-nav.js, quando está nesta página, avisa com "maisim-tema"): as cores novas e os gráficos redesenhados
function acompanhaTema() {
  let t = "sistema";
  try { t = localStorage.getItem("maisim-tema") || "sistema"; } catch (e) { /* ok */ }
  const novo = t === "escuro" || (t === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches) ? "escuro" : "claro";
  if (novo !== document.documentElement.dataset.tema) document.documentElement.dataset.tema = novo;
  if (novo === temaDesenhado) return;
  temaDesenhado = novo;
  for (const p of paineis()) {
    if (p.u) refazGrafico(p);
    if (p.med && p.med.aberto && p.med.esp.aberto) desenhaEspectro(p);
  }
}
let temaDesenhado = temaAtual();
window.addEventListener("storage", (e) => { if (e.key === "maisim-tema") acompanhaTema(); });
window.addEventListener("maisim-tema", acompanhaTema);
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", acompanhaTema); } catch (e) { /* ok */ }
// o idioma mudou (o trilho, nesta janela ou noutra; dentro do simu também): o aplica() do maisim-i18n já trocou o HTML fixo e
// os data-tr* dos painéis, das seções e da medição; aqui, o que o scope.js escreve, sem remontar o layout (o zoom, os cursores,
// os sinais escolhidos e o painel expandido ficam): os gráficos refeitos (legendas, tabela da medição, espectro), os títulos
// que mudam, o índice, a linha de estado, as listas de rodadas e a janela de apagar, se aberta. Um menu aberto fecha
maisimI18n.aoMudar(() => {
  document.querySelectorAll(".menu").forEach((m) => m.remove());
  poePorLinha();
  for (const x of itens) if (x.tipo === "secao") marcaRecolhida(x);
  for (const p of paineis()) {
    marcaY(p); marcaZoom(p); marcaRecolhido(p); marcaExpande(p);
    const tab = p.el.querySelector(".med-tab"); if (tab) tab.dataset.chave = "";     // a tabela da medição é refeita (mede)
    refazGrafico(p);                                   // com Fixar eixos / Pausar, o que está na tela fica
  }
  // os títulos do automático (só esses; os guardados ficam como estão): no idioma novo, sem gravar o layout
  for (const x of itens) if (x.autoTit) {
    x.titulo = tr(x.autoTit.chave, { rotulo: x.autoTit.rotulo }).trim();
    if (x.tipo === "secao") x.el.querySelector(".titulo-secao").value = x.titulo;
    else { const t = x.el.querySelector("input.titulo"); t.value = t.title = x.titulo; tituloMat(x); }
  }
  if (expandido) expande(expandido, true);
  desenhaIndice(); aplicaVisibilidade();
  if (typeof ultimoStatus === "function") status(ultimoStatus);
  listaRodadas().then(() => { if (typeof ultimoStatus === "function") status(ultimoStatus); })   // o "A: …" com os nomes da lista nova
    .catch(() => { /* sem o servidor: as listas ficam */ });
  if ($("janela-apagar").classList.contains("aberta") && !apagando) abreApagar(true).catch(() => { /* idem */ });
});
window.addEventListener("resize", () => { clearTimeout(tRes); tRes = setTimeout(() => { medeCab(); redimensiona(); if (expandido) expande(expandido, true); }, 150); });

// endereço: /maisim/scope/?a=<arquivo>&b=<arquivo>&x=<min>,<max> (ms) abre direto no modo Comparar, com zoom;
// os pedidos ao servidor usam caminhos relativos (eventos, rodadas…), para funcionar também atrás do maisim-app
(async () => {
  const q = new URLSearchParams(location.search);
  st("scope.st.aguardando");                 // o "aguardando…" do HTML, no idioma
  await listaRodadas();
  if (q.get("a")) {
    entraComparar();
    $("sel-a").value = q.get("a"); $("sel-b").value = q.get("b") || "";
    A = await carrega(q.get("a")); B = await carrega(q.get("b")); preparaGrade();
    if (q.get("x")) { const [a, b] = q.get("x").split(",").map(Number); xFaixa = [a, b]; }
    if (A) statusAB();
    montaTudo();
  } else {
    montaTudo();
    if (!document.hidden) conectaVivo();       // aberta em segundo plano: conecta quando aparecer (visibilitychange)
  }
})();
