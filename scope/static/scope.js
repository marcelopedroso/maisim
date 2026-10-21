// pew-scope: painéis configuráveis (uPlot) em seções, cursor sincronizado no tempo, zoom X/Y/área e ⟲ em cada painel
// (o tempo é comum aos painéis ligados; um painel solto tem o seu), Ctrl + roda, pulsos de PWM e formas de onda medidas no
// Gecko com a resolução do passo fino no zoom, salvar PNG.
// Modos "Ao vivo" (SSE) e "Comparar" (A em cores; B na cor do mesmo sinal, mais clara e tracejada).
"use strict";
const BRACOS = ["au", "al", "bu", "bl", "cu", "cl"];
const NOME = { au: "sup a", al: "inf a", bu: "sup b", bl: "inf b", cu: "sup c", cl: "inf c" };
const PALETA = ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e", "#9467bd", "#8c564b", "#e377c2", "#17becf", "#bcbd22", "#7f7f7f"];
// cores escolhidas pelo usuário, por sinal (vale em todos os painéis; guardadas no navegador); as clássicas, para não
// virar salada, e qualquer #rrggbb
const CLASSICAS = [["vermelho", "#e41a1c"], ["vermelho escuro", "#8b0000"], ["laranja", "#ff7f0e"], ["marrom", "#8c564b"], ["ouro", "#b8860b"],
  ["verde", "#2ca02c"], ["verde escuro", "#006400"], ["ciano", "#17becf"], ["azul", "#1f77b4"], ["azul escuro", "#0b3d91"], ["roxo", "#9467bd"],
  ["magenta", "#d62ab0"], ["cinza", "#7f7f7f"], ["preto", "#111111"]];
let coresSinal = (() => { try { return JSON.parse(localStorage.getItem("pew-scope-cores") || "{}") || {}; } catch (e) { return {}; } })();
const corValida = (c) => /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : /^#[0-9a-fA-F]{3}$/.test(c) ? ("#" + c.slice(1).split("").map((x) => x + x).join("")).toLowerCase() : null;
function corDoSinal(canal, idx) { return corValida(coresSinal[canal] || "") || PALETA[idx % PALETA.length]; }
function poeCorSinal(canal, cor) {                       // cor null: volta ao padrão (a paleta pela ordem)
  if (cor) coresSinal[canal] = cor; else delete coresSinal[canal];
  try { localStorage.setItem("pew-scope-cores", JSON.stringify(coresSinal)); } catch (e) { /* só nesta página */ }
  for (const p of paineis()) if (p.sinais.includes(canal)) criaGrafico(p);
}
// B (Comparar): a cor do mesmo sinal, misturada com o branco — dá para saber quem é quem com vários sinais
function corClara(cor, t = 0.5) {
  const n = parseInt(cor.slice(1), 16), mix = (v) => Math.round(v + (255 - v) * t);
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, "0")).join("");
}
// o tema do PEW (<html data-tema>, posto pelo index.html antes de pintar): as cores do que é desenhado no canvas (eixos,
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
const CHAVE_LAYOUT = "pew-scope-layout-v3";
// medidas no Gecko a cada passo fino. EA … ECA: tensão PWM do conversor calculada das tensões medidas nas pontas das
// cadeias de SMs, e_k = (v_kp + v_kn − V_dc)/2 e e_ab = e_a − e_b. VAB … VCA: tensão nos terminais (depois dos indutores
// de braço), das rodadas gravadas antes de 17/10 11:47
const MEDIDOS = { EAB: "e_ab PWM do conversor, medida (V)", EBC: "e_bc PWM do conversor, medida (V)",
                  ECA: "e_ca PWM do conversor, medida (V)", EA: "e_a PWM de fase, medida (V)", EB: "e_b PWM de fase, medida (V)",
                  EC: "e_c PWM de fase, medida (V)", IA: "i_a (A)", IB: "i_b (A)", IC: "i_c (A)", VDC: "V_dc (V)",
                  VAB: "v_ab nos terminais (V)", VBC: "v_bc nos terminais (V)", VCA: "v_ca nos terminais (V)" };

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
const avisoGrade = () => uniao ? ` · intervalos diferentes (A ${fmtDt(intervalo(A))}, B ${fmtDt(intervalo(B))}): cada uma nos seus instantes` : "";

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
  const add = (grupo, canal, rotulo) => { if (grossa(F, canal)) lst.push({ grupo, canal, rotulo, tipo: tipo(canal) }); };
  add("Porta CC", "vdc", "V_dc (V)"); add("Porta CC", "idc", "i_dc da carga (A)");
  add("Potência", "P_ref", "P* (W)"); add("Potência", "Q_ref", "Q* (var)");
  for (const k of "abc") { add("Rede", `i${k}`, `i_${k} (A)`); add("Rede", `i${k}_ref`, `i_${k}* referência (A)`); add("Rede", `v${k}`, `v_${k} da rede (V)`); }
  for (const [n, r] of Object.entries(MEDIDOS)) add("Medidas no Gecko a cada passo fino", `fino_${n}`, r);
  for (const k of "abc") add("Tensões PWM reconstruídas dos comandos", `e_${k}`, `e_${k} = (v_l − v_u)/2, perna ${k} (V)`);
  for (const b of BRACOS) {
    const g = `Braço ${NOME[b]}`;
    add(g, `iarm_${b}`, "corrente real (A)"); add(g, `iarm_hat_${b}`, "corrente estimada pelos SMs (A)");
    add(g, `iarm_ref_${b}`, "corrente de referência (A)"); add(g, `nhat_${b}`, "N̂");
    add(g, `varm_${b}`, "tensão do braço, PWM (V)");
    for (let j = 1; j <= nSM(); j++) { add(g, `vc_${b}_${j}`, `v_c SM${j} (V)`); add(g, `s_${b}_${j}`, `pulso SM${j}`); add(g, `sig_${b}_${j}`, `σ SM${j} (média na janela)`); }
  }
  // qualquer outro canal da rodada (ex.: rodadas do /pew/simu, com os nomes dos rótulos dos medidores)
  const conhecidos = new Set(lst.map((c) => c.canal));
  for (const k of Object.keys(F.dados).sort()) {
    if (k === "t" || conhecidos.has(k) || /^(pwm_|pwmn_|fino_)/.test(k)) continue;
    add("Sinais da rodada", k, k);
  }
  return lst;
}
function rotulo(canal) {
  const c = catalogo().find((x) => x.canal === canal);
  if (!c) return canal;
  if (c.grupo.startsWith("Braço")) return `${c.grupo.slice(6)}: ${c.rotulo}`;
  if (c.grupo.startsWith("Medidas")) return /medida/.test(c.rotulo) ? c.rotulo : `${c.rotulo} medida`;
  return c.rotulo;
}

// ---------------------------------------------------------------- dados de um painel
function seriesDe(p) {
  const out = []; let kp = 0;
  p.sinais.forEach((canal, idx) => {
    const desloc = canal.startsWith("s_") ? 1.3 * kp++ : 0;     // pulsos empilhados, como num analisador lógico
    const ganho = (p.ganhos && p.ganhos[canal]) || 1;            // só no desenho; o cursor mostra o valor real
    const rot = rotulo(canal) + (ganho !== 1 ? ` ×${ganho}` : "") + (desloc ? ` (+${desloc.toFixed(1)})` : "");
    const cor = corDoSinal(canal, idx);
    if (grossa(A, canal)) out.push({ F: A, canal, rot: B ? `${rot} · A` : rot, cor, desloc, ganho, degrau: tipo(canal) === "f" });
    if (B && grossa(B, canal)) out.push({ F: B, canal, rot: `${rot} · B`, cor: corClara(cor), dash: [6, 4], largura: 1.2, desloc, ganho, degrau: tipo(canal) === "f" });
  });
  // com o Medir aberto, a curva Σ(t): a soma ponto a ponto dos sinais que estão no Σ da tabela (os mesmos: um clique no
  // nome tira/põe), com os valores reais; o valor no cursor vai para a legenda (Marcelo, 20/10: "a soma tem que ser dos
  // pontos no gráfico também: va(t) + vb(t) + vc(t) = 0"); clicar no Σ da legenda esconde a curva (e a escala volta)
  if (p.med && p.med.aberto) for (const F of B ? [A, B] : [A]) {
    const partes = out.filter((se) => se.F === F && !p.espFora.has(`${se.canal}|${F === A ? "A" : "B"}`)).map((se) => se.canal);
    if (partes.length < 2) continue;
    const suf = B ? (F === A ? " · A" : " · B") : "", comb = p.med.comb || "ambos";
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
  if (p.med && p.med.aberto) mede(p);
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
function reseta(p) { p.yZoom = null; mudaX(p, null); }      // ⟲: vertical automática (ou o Y fixo) e o tempo todo

// ---------------------------------------------------------------- medição num intervalo
// Mesmo método de smauto.metrics (window, harmonic_phasors, thd), para os números baterem com os scripts e o artigo:
// janela de n períodos inteiros de f₀ a partir de t₀, com as amostras t₀ − 1 ns ≤ t < t₀ + n/f₀ − 1 ns; DFT de N pontos;
// harmônico h no bin k = h·n, pico = |X_k|·2/N e fase do cosseno = ângulo de X_k (t = 0 no início da janela);
// THD = √(Σ |X_hn|², h = 2 … 50, hn < N/2 + 1) / |X_n|, sobre x − média. Sempre o valor real (sem o ×k nem o
// empilhamento da tela); canais "passo fino" no passo fino (1 µs), os outros a cada janela de controle.
// comb: o que a medição mostra dos sinais juntos — "soma" (Σ), "media" (x̄ = Σ/n, a média instantânea dos n sinais; Marcelo,
// 20/10: "a média da soma no instante, 10 sinais: soma os 10 e divide por 10") ou "ambos" (o padrão: "os dois"); oculta: as
// curvas escondidas na legenda ({soma, media}), guardadas no layout
const MED_PADRAO = { aberto: false, t0: 0, n: 1, f0: 50, hs: "1, 2, 3", comb: "ambos", oculta: {}, imp: { on: false, ate: 15 }, par: { on: false, ate: 10 },
                     esp: { aberto: false, hmax: 50, log: true, dec: 4 } };
const novaMed = (cfg) => { const c = cfg || {}, m = Object.assign({}, MED_PADRAO, c); m.oculta = Object.assign({}, c.oculta || {});
  for (const k of ["imp", "par", "esp"]) m[k] = Object.assign({}, MED_PADRAO[k], c[k] || {});
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
  if (!am) return { erro: "sem dados" };
  const N = am.x.length, Nexato = T / am.dt, Nesp = Math.round(Nexato);
  if (!N) return { erro: "sem amostras na janela" };
  // o passo do scope nem sempre divide o período (ex.: 380 µs e 20 ms: 13 períodos = 684,2 amostras); até uma amostra de
  // diferença é a janela inteira (antes: "janela incompleta: 685 de 684 amostras" e nada medido)
  if (N !== Nesp && Math.abs(N - Nexato) >= 1) return { erro: `janela incompleta: ${N} de ${Nesp} amostras`, N, dt: am.dt };
  if (am.faltam) return { erro: `faltam ${am.faltam} amostra(s) na janela`, N, dt: am.dt };
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
  if (ok.length < 2) return { erro: lista.length < 2 ? "" : "Σ: menos de 2 sinais sem erro na janela", parte: ok };
  const dt = ok[0].r.dt, N = ok[0].r.N;
  const outro = ok.find((x) => Math.abs(x.r.dt - dt) > 1e-12 * dt || x.r.N !== N);
  if (outro) return { erro: `Σ: passos diferentes (${ok[0].nome} ${fmtDt(dt)}, ${outro.nome} ${fmtDt(outro.r.dt)}): não dá para somar ponto a ponto`, parte: ok };
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
  const n = `<td${r.aprox ? ' title="o passo não divide o período: a janela tem até uma amostra a mais ou a menos que os períodos pedidos (média e harmônicos por mínimos quadrados, até 80 % da metade da taxa)"' : ""}>${r.aprox ? "≈ " : ""}${r.N || "–"}${r.dt ? ` <span>· ${fmtDt(r.dt)}</span>` : ""}</td></tr>`;
  if (r.erro) return `<td colspan="${hs.length + 2}" class="erro">${r.erro}</td>` + n;
  return `<td>${fmtM(r.media)}</td>` + r.harm.map((c) => c ? `<td>${fmtM(c[0])}${isFinite(c[1]) ? ` ∠ ${c[1].toFixed(1)}°` : ""}</td>` : `<td title="acima da metade da taxa de amostragem">–</td>`).join("") +
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
  if (!seriesMed(p).length) { tab.innerHTML = "<i>sem sinais neste painel</i>"; desenhaEspectro(p); return; }
  let html = `<table><thead><tr><th>sinal</th><th>média</th>${hs.map((h) => `<th>h${h} · ${+(h * M.f0).toPrecision(5)} Hz<br><span>pico ∠ fase</span></th>`).join("")}<th>THD<br><span>h 2–50</span></th><th>N<br><span>· passo</span></th></tr></thead><tbody>`;
  for (const se of seriesMed(p)) {
    const r = mede1(se.F, se.canal, M, hs);
    const nome = rotulo(se.canal) + (B ? (se.F === A ? " · A" : " · B") : ""), ch = `${se.canal}|${se.F === A ? "A" : "B"}`;
    p.medRes.push({ se, r, nome, chave: ch });
    html += `<tr data-chave="${ch}" class="${p.espFora.has(ch) ? "fora" : ""}"><td class="nome" title="clique para tirar ou pôr: no gráfico, no Σ / x̄ e no espectro (como esconder na legenda)"><i style="background:${se.cor}"></i>${nome}</td>`;
    html += celulasMed(r, hs);
  }
  // Σ de cada rodada (A; e B, no Comparar), com os sinais que não foram tirados
  for (const F of B ? [A, B] : [A]) {
    const lista = p.medRes.filter((x) => x.se.F === F && !p.espFora.has(x.chave));
    if (p.medRes.filter((x) => x.se.F === F).length < 2) continue;
    const r = medeSoma(lista, M, hs), suf = B ? (F === A ? " · A" : " · B") : "", np = (r.parte || []).length;
    const quem = (r.parte || []).map((x) => x.nome).join(" + ") || "nenhum", comb = M.comb || "ambos";
    for (const [k, rot, dica] of [["soma", "Σ", "soma, ponto a ponto"], ["media", "x̄", `média instantânea (a soma ÷ ${np}), ponto a ponto`]]) {
      if (comb !== k && comb !== "ambos") continue;
      html += `<tr class="soma"><td class="nome-soma" title="${dica}, de: ${quem}">${rot}${suf} <span>(${np} ${np === 1 ? "sinal" : "sinais"})</span></td>`;
      html += r.erro !== undefined ? `<td colspan="${hs.length + 3}" class="erro">${r.erro || `${rot}: pelo menos 2 sinais (um clique no nome põe de volta)`}</td></tr>`
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
  if (!ls.length || !(ymax > 0)) { g.fillText(ls.length ? "sem valores no espectro" : "nenhum sinal medido no espectro", L, T + 16); return; }
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
  for (let h = 0; h <= hmax; h += passoH) g.fillText(h ? String(h) : "CC", L + (h + 0.5) * slot, T + ph + 4);
  g.fillText(`harmônico h  (f = h · ${+M.f0} Hz)   ·   pico${log ? ", escala log" : ""}`, L + pw / 2, T + ph + 19);
  p.espGeo = { L, slot, hmax, T, ph, marcas: marcas.filter((m) => m[2]).map((m) => +m[0].toPrecision(3)), yPos };
}
function dicaEspectro(p, e) {
  const dica = p.el.querySelector(".esp-dica"), G = p.espGeo;
  const h = G ? Math.floor((e.offsetX - G.L) / G.slot) : -1;
  if (!G || h < 0 || h > G.hmax || e.offsetY > G.T + G.ph) { dica.style.display = "none"; return; }
  const ls = p.medRes.filter((x) => x.r.espec && !p.espFora.has(x.chave));
  dica.innerHTML = `<b>${h ? `h${h} · ${+(h * p.med.f0).toPrecision(6)} Hz` : "CC (média)"}</b>` + ls.map((x) => {
    const v = x.r.espec[h], f1 = x.r.espec[1];
    const val = !v ? "acima da metade da taxa" : h ? `${fmtM(v[0])} ∠ ${v[1].toFixed(1)}°${f1 && f1[0] > 0 ? ` · ${fmtM(100 * v[0] / f1[0])} % de h1` : ""}` : fmtM(x.r.media);
    return `<div><i style="background:${x.se.cor}"></i>${x.nome}: ${val}</div>`; }).join("");
  dica.style.display = "block";
  const cw = p.el.querySelector(".esp").clientWidth, dw = dica.offsetWidth;
  dica.style.left = `${Math.min(e.offsetX + 14, cw - dw - 4)}px`; dica.style.top = `${Math.max(0, e.offsetY - 10)}px`;
}
function mudaMed(p, guarda = true) {                   // depois de mudar t₀, n, f₀ ou harmônicos
  const box = p.el.querySelector(".medicao"), M = p.med;
  box.style.display = M.aberto ? "" : "none";
  p.el.querySelector(".b-med").classList.toggle("ativo", M.aberto);
  if (M.aberto) {
    box.querySelector(".m-t0").value = +M.t0.toFixed(3); box.querySelector(".m-n").value = M.n;
    box.querySelector(".m-f0").value = M.f0; box.querySelector(".m-hs").value = M.hs; box.querySelector(".m-comb").value = M.comb || "ambos";
    for (const k of ["imp", "par"]) { box.querySelector(`.m-${k}`).checked = M[k].on; box.querySelector(`.m-${k}-n`).value = M[k].ate; }
    box.querySelector(".med-tab").dataset.chave = "";
    mede(p);
  }
  if (p.u && assinaturaComb(seriesDe(p)) !== assinaturaComb(p.series)) criaGrafico(p);   // as curvas Σ(t)/x̄(t) entram ou saem
  else if (p.u) p.u.redraw(false, false);
  if (guarda) guardaLayout();                          // não durante a montagem: gravaria o layout pela metade
}
function intervaloMed(p, a, b) {                       // a, b em ms: começa em a, períodos inteiros de f₀ (pelo menos 1)
  const M = p.med; M.aberto = true;
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
  box.innerHTML = `<div class="med-cab"><b title="Shift + arrastar no gráfico escolhe o intervalo: começa onde o arrasto começa, com os períodos inteiros de f₀ que cabem. Valores reais (sem o ×k da tela). Pico e fase do cosseno, fase referida ao início da janela. Mesmo método de smauto.metrics (window, harmonic_phasors, thd).">Medição</b>
    <label>t₀ <input type="number" step="any" class="m-t0"> ms</label>
    <label><input type="number" step="1" min="1" class="m-n"> períodos de</label>
    <label>f₀ <input type="number" step="any" min="0" class="m-f0"> Hz</label> <span class="med-jan"></span>
    <label>harmônicos <input type="text" class="m-hs" title="ex.: 1, 2, 3 ou 1-7 (pode ficar vazio se marcar ímpares ou pares)"></label>
    <label title="todos os ímpares até este (somam-se à lista)"><input type="checkbox" class="m-imp"> ímpares até <input type="number" min="1" max="199" step="1" class="m-imp-n"></label>
    <label title="todos os pares até este (somam-se à lista)"><input type="checkbox" class="m-par"> pares até <input type="number" min="2" max="200" step="1" class="m-par-n"></label>
    <button class="m-vis" title="a janela começa no início do que está à vista, com os períodos inteiros que cabem nela">usar o visível</button>
    <button class="m-esp" title="espectro de harmônicos (barras) dos sinais da tabela; clique no nome de um sinal para tirá-lo ou pô-lo">Espectro</button>
    <label title="os sinais da tabela juntos, ponto a ponto, no gráfico (curva e legenda) e na tabela: a soma Σ, a média instantânea x̄ = Σ/n ou as duas; clique no nome de um sinal para tirá-lo ou pô-lo">combinar <select class="m-comb"><option value="ambos">Σ e x̄</option><option value="soma">Σ soma</option><option value="media">x̄ média (Σ/n)</option></select></label>
    <span class="med-dica">Shift + arrastar: intervalo</span><button class="m-fecha" title="fechar a medição">✕</button></div>
    <div class="med-tab"></div>
    <div class="esp" style="display:none"><div class="esp-cab"><label>até h <input type="number" min="1" max="1000" step="1" class="m-hmax"></label>
      <label title="escala vertical logarítmica"><input type="checkbox" class="m-log"> log</label>
      <label title="quantas décadas abaixo do maior valor a escala log mostra">décadas <input type="number" min="1" max="8" step="1" class="m-dec"></label></div>
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
  return box;
}
function faixaMed(u, p) {                              // gancho draw: faixa sombreada da janela de medição
  const M = p.med; if (!M || !M.aberto) return;
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

// ---------------------------------------------------------------- painéis e seções
const MODOS_ZOOM = { x: "X", y: "Y", xy: "área" };
// ícones de corrente (ligado) e corrente partida (solto), desenhados para não depender de fonte de emoji
const svg = (d) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px">${d}</svg>`;
const ICONE_LIGADO = svg(`<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>`);
const ICONE_SOLTO = svg(`<path d="M18.8 12.3l1.7-1.7a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M5.2 11.7l-1.7 1.7a5 5 0 0 0 7 7l1.7-1.7"/><path d="M8 2v3M2 8h3M16 19v3M19 16h3"/>`);
const ICONE_SETA = svg(`<path d="M6 9l6 6 6-6"/>`);                                    // recolher (▾) / abrir (▸, girada)
const ICONE_EXPANDE = svg(`<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>`);
const ICONE_VOLTA = svg(`<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>`);
const dragDe = (modo) => ({ x: modo !== "y", y: modo !== "x", setScale: false, dist: 3 });

// acionamentos de uma rodada do /pew/simu (meta.acionamentos: t em s, alvo, valor): linha vertical tracejada e o rótulo
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
function criaGrafico(p) {
  if (p.u) { p.u.destroy(); p.u = null; }
  p.area.innerHTML = "";
  if (!A || !p.sinais.length) { p.area.innerHTML = `<div class="vazio">${A ? "escolha os sinais em “Sinais ▾”" : "aguardando dados"}</div>`; return; }
  p.series = seriesDe(p);
  p.semDados = false;
  if (!p.series.length) {                    // com dados chegando, não adianta remontar: marca para o redesenho não insistir
    p.semDados = !!(A && A.dados && A.dados.t && A.dados.t.length);
    p.area.innerHTML = `<div class="vazio">estes sinais não existem nesta rodada</div>`; return;
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
      draw: [(u) => faixaMed(u, p), marcaAcionamentos],
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
      }],   // faixa da medição; acionamentos da rodada (PEW / simu)
    },
  };
  p.u = new uPlot(opts, dadosPainel(p), p.area);
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
  p.u.over.addEventListener("dblclick", () => reseta(p));
  p.u.over.addEventListener("mousedown", (e) => {     // Shift: o arrasto escolhe o intervalo de medição (só no tempo)
    if (!e.shiftKey || e.button !== 0) return;
    p.arrastoMed = true; p.u.cursor.drag.x = true; p.u.cursor.drag.y = false;
    window.addEventListener("mouseup", () => setTimeout(() => {
      p.arrastoMed = false; if (p.u) { p.u.cursor.drag.x = p.modo !== "y"; p.u.cursor.drag.y = p.modo !== "x"; }
    }, 0), { once: true });
  }, true);
  atualiza(p);
}

function montaMenu(p) {
  const menu = document.createElement("div"); menu.className = "menu";
  const busca = document.createElement("input"); busca.type = "text"; busca.placeholder = "procurar…"; busca.style.width = "100%";
  const lista = document.createElement("div");
  menu.append(busca, lista);
  let aberta = null;                                     // o sinal com a paleta de cores aberta
  const paletaHTML = (canal, idx) => { const atual = corDoSinal(canal, idx);
    return `<div class="paleta" data-c="${canal}">${CLASSICAS.map(([n, c]) => `<button class="amostra${c === atual ? " atual" : ""}" data-cor="${c}" style="background:${c}" title="${n} ${c}"></button>`).join("")}
      <span class="paleta-hex"><input class="hex" value="${atual}" maxlength="7" spellcheck="false" title="qualquer cor: #rrggbb (Enter)"><input type="color" class="livre" value="${atual}" title="escolher outra cor">
      <button class="padrao" title="volta à cor da ordem (paleta padrão)">padrão</button></span></div>`; };
  const desenha = () => {
    const q = busca.value.toLowerCase(); let html = "", grupo = "";
    for (const c of catalogo()) {
      if (q && !(`${c.grupo} ${c.rotulo} ${c.canal}`).toLowerCase().includes(q)) continue;
      if (c.grupo !== grupo) { grupo = c.grupo; html += `<h4>${grupo}</h4>`; }
      const marc = p.sinais.includes(c.canal);
      html += `<div class="item"><label><input type="checkbox" data-c="${c.canal}" ${marc ? "checked" : ""}> ${c.rotulo}` +
              (c.tipo === "f" ? ` <span class="fino">passo fino</span>` : "") + "</label>" +
              (marc ? `<button class="cor-sinal" data-c="${c.canal}" style="background:${corDoSinal(c.canal, p.sinais.indexOf(c.canal))}" title="cor do sinal (em todos os painéis)"></button>` +
                      `<span class="x">×</span><input type="number" step="any" class="ganho" data-c="${c.canal}" value="${(p.ganhos || {})[c.canal] || 1}"
                 title="multiplica só o desenho (para sobrepor sinais de escalas diferentes); o cursor continua mostrando o valor real">` : "") + "</div>" +
              (marc && aberta === c.canal ? paletaHTML(c.canal, p.sinais.indexOf(c.canal)) : "");
    }
    lista.innerHTML = html || "<i>nenhum sinal</i>";
    lista.querySelectorAll("input[type=checkbox]").forEach((ck) => ck.onchange = () => {
      const c = ck.dataset.c;
      p.sinais = ck.checked ? p.sinais.concat(c) : p.sinais.filter((x) => x !== c);
      if (!ck.checked && p.ganhos) delete p.ganhos[c];
      guardaLayout(); criaGrafico(p); desenha();
    });
    lista.querySelectorAll("button.cor-sinal").forEach((b) => b.onclick = (ev) => { ev.preventDefault(); aberta = aberta === b.dataset.c ? null : b.dataset.c; desenha(); });
    const escolhe = (canal, cor) => { poeCorSinal(canal, cor); desenha(); };
    lista.querySelectorAll(".paleta").forEach((pl) => {
      const canal = pl.dataset.c;
      pl.querySelectorAll("button.amostra").forEach((b) => b.onclick = () => escolhe(canal, b.dataset.cor));
      pl.querySelector("button.padrao").onclick = () => escolhe(canal, null);
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
  const b = s.el.querySelector(".b-rec"); b.title = s.recolhida ? "abrir a seção (mostrar os painéis)" : "recolher a seção (esconder os painéis; fica guardado)";
  b.setAttribute("aria-expanded", String(!s.recolhida));
}
function marcaRecolhido(p) {
  p.el.classList.toggle("recolhido", !!p.recolhido);
  const b = p.el.querySelector(".cab .b-rec"); b.title = p.recolhido ? "abrir o painel" : "recolher o painel (fica só o título; guardado no layout)";
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
  b.title = p.expandido ? "voltar ao tamanho do layout (Esc)" : "expandir: o painel ocupa a janela (Esc volta)";
}
function expande(p, sim) {
  if (sim && expandido && expandido !== p) expande(expandido, false);
  if (!sim && !p.expandido) return;
  p.expandido = !!sim; expandido = sim ? p : null;
  const esq = parseFloat(getComputedStyle(document.body).paddingLeft) || 0;     // o trilho do PEW, se houver
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
  el.innerHTML = `<span class="b-arrasta" draggable="true" title="arraste para mudar a seção de lugar (vai com os painéis dela)">⠿</span><button class="b-rec">${ICONE_SETA}</button>
    <input class="titulo-secao" type="text"><span class="n-rec"></span><button class="b-mais" title="novo painel no fim desta seção">+ Painel</button>
    <button class="b-rem" title="tirar este título de seção (os painéis ficam)">✕</button><span class="dica">seção vazia: arraste um painel pela alça ⠿ para cá, ou use + Painel</span>`;
  s.el = el;
  const tit = el.querySelector(".titulo-secao"); tit.value = titulo;
  tit.onchange = () => { s.titulo = tit.value; guardaLayout(); };
  el.querySelector(".b-mais").onclick = () => {
    let k = itens.indexOf(s) + 1; while (k < itens.length && itens[k].tipo === "painel") k++;
    abreSecaoDe(adicionaPainel({ titulo: "Novo painel", sinais: [] }, k)); guardaLayout();
  };
  el.querySelector(".b-rem").onclick = () => { el.remove(); itens = itens.filter((x) => x !== s); marcaSecoesVazias(); guardaLayout(); };
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
  m.innerHTML = `<b>Escala vertical fixa</b><label>máx <input type="number" step="any" class="y-max"></label>
    <label>mín <input type="number" step="any" class="y-min"></label>
    <div><button class="y-ok">Fixar</button> <button class="y-auto">Automática</button></div>`;
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
function marcaY(p) { const b = p.el.querySelector(".b-y"); b.classList.toggle("ativo", !!p.yFixo); b.title = p.yFixo ? `escala vertical fixa: ${p.yFixo[0]} … ${p.yFixo[1]} (o ⟲ volta a ela)` : "fixar a escala vertical (mín/máx), guardada no layout"; }
function marcaZoom(p) {
  p.el.querySelectorAll(".b-zm").forEach((b) => b.classList.toggle("ativo", b.dataset.m === p.modo));
  const b = p.el.querySelector(".b-solto");
  b.classList.toggle("solto", !!p.solto);
  b.innerHTML = p.solto ? ICONE_SOLTO : ICONE_LIGADO;
  b.title = p.solto ? "este painel tem o seu tempo; clique para voltar ao tempo comum dos painéis ligados"
                    : "tempo ligado aos outros painéis; clique para soltar e dar zoom no tempo só neste painel";
}
const ALTURAS = [[220, "baixa"], [340, "média"], [460, "alta"]];
const LARGURAS = [[1, "linha inteira"], [2, "1/2"], [3, "1/3"]];
function aplicaLargura(p) { p.el.style.setProperty("--span", String(6 / p.largura)); }
function menuOpc(p) {
  const m = document.createElement("div"); m.className = "menu menu-opc";
  m.innerHTML = `<h4>Largura na linha</h4><div class="seg">${LARGURAS.map(([n, r]) => `<button data-l="${n}" class="${p.largura === n ? "ativo" : ""}">${r}</button>`).join("")}</div>
    <h4>Altura</h4><div class="seg">${ALTURAS.map(([h, r]) => `<button data-h="${h}" class="${p.altura === h ? "ativo" : ""}">${r}</button>`).join("")}</div>
    <h4>Imagem</h4><button class="o-png">Salvar PNG deste painel</button>`;
  m.querySelectorAll("[data-l]").forEach((b) => b.onclick = () => { p.largura = +b.dataset.l; aplicaLargura(p); guardaLayout(); m.remove(); setTimeout(redimensiona, 0); });
  m.querySelectorAll("[data-h]").forEach((b) => b.onclick = () => { p.altura = +b.dataset.h; guardaLayout(); criaGrafico(p); m.remove(); });
  m.querySelector(".o-png").onclick = () => { baixa(canvasPainel(p), `${nomeArq(p.titulo)}.png`); m.remove(); };
  return m;
}
function adicionaPainel(cfg, posicao) {
  const p = { tipo: "painel", id: ++seq, titulo: cfg.titulo || "Novo painel", sinais: (cfg.sinais || []).slice(), altura: cfg.altura || 220,
              largura: [1, 2, 3].includes(cfg.largura) ? cfg.largura : larguraPadrao,
              yFixo: cfg.yFixo || null, ganhos: Object.assign({}, cfg.ganhos || {}),
              modo: MODOS_ZOOM[cfg.modo] ? cfg.modo : "x", solto: !!cfg.solto, xZoom: null, yZoom: null,
              med: novaMed(cfg.med), espFora: new Set(), recolhido: !!cfg.recolhido, expandido: false };
  const el = document.createElement("div"); el.className = "cartao";
  el.innerHTML = `<div class="cab"><span class="b-arrasta" draggable="true" title="arraste para mudar o painel de lugar">⠿</span><button class="b-rec">${ICONE_SETA}</button>
    <input class="titulo" type="text"><div class="ferr"><button class="b-sinais">Sinais ▾</button>
    <span class="zoom" title="o que o arrastar faz neste painel"><span class="rot">zoom</span>${Object.entries(MODOS_ZOOM).map(([m, r]) =>
      `<button class="b-zm" data-m="${m}" title="${{ x: "arrastar escolhe o intervalo de tempo", y: "arrastar escolhe a faixa vertical deste painel", xy: "arrastar escolhe uma área (tempo e vertical)" }[m]}">${r}</button>`).join("")}<button
      class="b-reset" title="ver tudo neste painel: vertical automática (ou o Y fixo) e o tempo todo; o tempo vale para todos os painéis ligados (duplo clique faz o mesmo)">⟲</button></span>
    <button class="b-solto"></button><button class="b-med" title="média e série de Fourier num intervalo (Shift + arrastar no gráfico)">Medir</button><button class="b-y">Y fixo</button>
    <button class="b-opc" title="largura, altura, PNG">⋯</button></div><button class="b-exp"></button><button class="b-rem" title="remover painel">✕</button></div><div class="area"></div>`;
  p.el = el; p.area = el.querySelector(".area");
  aplicaLargura(p);
  el.appendChild(caixaMed(p));
  const tit = el.querySelector("input.titulo"); tit.value = p.titulo; tit.title = p.titulo;
  tit.onchange = () => { p.titulo = tit.value; tit.title = tit.value; guardaLayout(); };
  const abre = (botao, fazMenu) => (e) => {
    e.stopPropagation();
    const aberto = el.querySelector(".menu");
    const mesmo = aberto && aberto.dataset.de === botao;
    document.querySelectorAll(".menu").forEach((m) => m.remove());
    if (!mesmo) { const m = fazMenu(p); m.dataset.de = botao; const b = e.currentTarget; m.style.top = `${b.offsetTop + b.offsetHeight + 4}px`; el.appendChild(m); }
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
  el.querySelector(".b-rem").onclick = () => { if (p.expandido) expande(p, false); if (p.u) p.u.destroy(); p.u = null; obsLargura.unobserve(el); el.remove(); itens = itens.filter((x) => x !== p); marcaSecoesVazias(); guardaLayout(); };
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

function layoutPadrao() {
  const n = nSM(); const r = (f) => Array.from({ length: n }, (_, j) => f(j + 1));
  const L = [{ secao: "Porta CC e rede" },
    { titulo: "V_dc", sinais: ["vdc"] },
    { titulo: "Correntes da rede e referências", sinais: ["ia", "ib", "ic", "ia_ref", "ib_ref", "ic_ref"] },
    { titulo: "P* e Q*", sinais: ["P_ref", "Q_ref"] },
    { secao: "Correntes de braço — real × estimada pelos SMs" }];
  for (const b of BRACOS) L.push({ titulo: `Braço ${NOME[b]}`, sinais: [`iarm_${b}`, `iarm_hat_${b}`, `iarm_ref_${b}`] });
  L.push({ secao: "Tensões dos capacitores v_c(t)" });
  for (const b of BRACOS) L.push({ titulo: `v_c braço ${NOME[b]}`, sinais: r((j) => `vc_${b}_${j}`) });
  L.push({ secao: "PWM — dê zoom abaixo de 40 ms para ver o passo fino" },
    { titulo: "Tensões PWM de linha medidas no Gecko (e_ab = e_a − e_b)", sinais: ["fino_EAB", "fino_EBC", "fino_ECA"] },
    { titulo: "Tensões PWM de fase medidas no Gecko (e = (v_p + v_n − V_dc)/2)", sinais: ["fino_EA", "fino_EB", "fino_EC"] },
    { titulo: "Pulsos do braço sup a", sinais: r((j) => `s_au_${j}`) },
    { titulo: "Tensão do braço sup a (dos comandos)", sinais: ["varm_au"] },
    { titulo: "Tensões de perna (dos comandos)", sinais: ["e_a", "e_b", "e_c"] },
    { secao: "Estimativa distribuída" },
    { titulo: "N̂ de cada braço", sinais: BRACOS.map((b) => `nhat_${b}`) });
  return L;
}
function guardaLayout() {
  try { localStorage.setItem(CHAVE_LAYOUT, JSON.stringify({ colunas: larguraPadrao, indice, itens: itens.map((x) => x.tipo === "secao" ? { secao: x.titulo, recolhida: x.recolhida || undefined } : { titulo: x.titulo, sinais: x.sinais, altura: x.altura, largura: x.largura, yFixo: x.yFixo, ganhos: x.ganhos, modo: x.modo, solto: x.solto, med: x.med, recolhido: x.recolhido || undefined }) })); } catch (e) { /* sem armazenamento */ }
  desenhaIndice(); aplicaVisibilidade();
}
function leLayout() {
  try { const j = JSON.parse(localStorage.getItem(CHAVE_LAYOUT) || "null"); if (j && j.itens && j.itens.length) return j; } catch (e) { /* idem */ }
  return null;
}
function montaTudo() {
  if (expandido) expande(expandido, false);
  for (const p of paineis()) if (p.u) p.u.destroy();
  obsLargura.disconnect(); itens = []; $("paineis").innerHTML = "";
  const salvo = leLayout();
  larguraPadrao = [1, 2, 3].includes(salvo && salvo.colunas) ? salvo.colunas : 2;    // layouts antigos: as colunas viram a largura
  if (salvo && salvo.indice) indice = Object.assign({ aberto: false, unica: false, secao: -1 }, salvo.indice);
  $("bt-porlinha").textContent = `Por linha: ${larguraPadrao}`;
  document.body.classList.toggle("com-indice", indice.aberto); $("ck-unica").checked = indice.unica;
  for (const cfg of (salvo ? salvo.itens : layoutPadrao())) { if (cfg.secao) adicionaSecao(cfg.secao, null, cfg.recolhida); else adicionaPainel(cfg); }
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
// só a rodada: numa rodada do /pew/simu (ou com ?so=rodada, como o simu abre o scope) os painéis sem nenhum sinal dela
// (os do MMC) somem, e as suas seções também, no índice inclusive; o layout guardado não muda
const SO_RODADA = new URLSearchParams(location.search).get("so") === "rodada";
const soDaRodada = () => SO_RODADA || !!(A && A.meta && A.meta.planta === "gecko-pew");
// um painel some se nenhum dos sinais dele existe na rodada (pelos dados, não por já ter gráfico: marcar o 1º sinal de um
// painel novo guarda o layout antes de montar o gráfico, e o painel sumia até a próxima mudança — achado de Marcelo, 19/10)
const temSinal = (F, c) => !!(F && F.dados && grossa(F, c));
const mostravel = (p) => !(soDaRodada() && p.sinais.length && !p.u && !p.sinais.some((c) => temSinal(A, c) || temSinal(B, c)));
function gruposMostraveis() {
  return soDaRodada() ? grupos().filter((g) => !g.ps.length || g.ps.some(mostravel)) : grupos();
}
function desenhaIndice() {
  const lista = document.querySelector("#indice .lista"); if (!lista) return;
  lista.innerHTML = gruposMostraveis().map((g) => `<div class="s${indice.unica && g.k === indice.secao ? " atual" : ""}${g.s && g.s.recolhida ? " recolhida" : ""}" data-k="${g.k}"${g.k >= 0 ? ` draggable="true"` : ""}>${escH(g.s ? g.s.titulo : "(sem seção)")}</div>` +
    g.ps.filter(mostravel).map((p) => `<div class="p" data-id="${p.id}" title="${escH(p.titulo)}">${escH(p.titulo)}</div>`).join("")).join("");
}
function aplicaVisibilidade() {
  const gs = gruposMostraveis(), ks = new Set(gs.map((g) => g.k)); let mudou = false;
  if (indice.unica && gs.length && !ks.has(indice.secao)) { indice.secao = gs[0].k; desenhaIndice(); }
  for (const g of grupos()) {
    const ver = ks.has(g.k) && (!indice.unica || g.k === indice.secao);
    if (g.s) { const n = g.ps.filter(mostravel).length; g.s.el.querySelector(".n-rec").textContent = g.s.recolhida ? `${n} ${n === 1 ? "painel" : "painéis"}` : ""; }
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
// rodada com sinais fora do catálogo do MMC (ex.: /pew/simu) e nenhum painel mostrando: um painel com eles no topo
// (não grava no layout; fica se você mexer em algo do layout)
function garantePainelDaRodada() {
  if (!A || !A.dados) return;
  const gen = catalogo().filter((c) => c.grupo === "Sinais da rodada").map((c) => c.canal);
  if (!gen.length || paineis().some((p) => p.sinais.some((c) => gen.includes(c)))) return;
  adicionaSecao(`Rodada ${A.meta.rotulo || ""}`.trim(), 0);
  adicionaPainel({ titulo: A.meta.planta === "gecko-pew" ? `Sinais da rodada ${A.meta.rotulo || ""} (PEW / simu)` : "Sinais da rodada", sinais: gen.slice(0, 8), largura: 1 }, 1);
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
  c.width = larg; c.height = Math.round(30 * r + src.height + linhas * 18 * r + 8 * r);
  const g = c.getContext("2d");
  const C = cores();                                  // o PNG sai como está na tela (tema claro: fundo branco)
  g.fillStyle = C.fundo; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = C.titulo; g.font = `600 ${14 * r}px system-ui, sans-serif`; g.textBaseline = "middle";
  g.fillText(p.titulo, 8 * r, 15 * r);
  g.drawImage(src, 0, 30 * r);
  g.font = `${12 * r}px system-ui, sans-serif`;
  p.series.forEach((se, k) => {
    const x = 8 * r + (k % porLinha) * (larg / porLinha), y = 30 * r + src.height + (Math.floor(k / porLinha) + 0.6) * 18 * r;
    g.strokeStyle = se.cor; g.lineWidth = 2 * r; g.setLineDash((se.dash || []).map((d) => d * r));
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18 * r, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = C.titulo; g.fillText(se.rot, x + 24 * r, y);
  });
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
  baixa(out, `pew-scope_${nomeArq((A && A.meta && A.meta.planta) || "")}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`);
}
function baixa(canvas, nome) { const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = nome; a.click(); }

// ---------------------------------------------------------------- Ao vivo (SSE)
let fonteEventos = null, redesenhoPendente = false, repeticao = false, timerEscondida = null;
let esperaEscondida = 30000;                 // aba escondida por mais que isto (ms): fecha a conexão ao vivo (ver abaixo)
function status(txt) { $("status").textContent = txt; }
const nomePlanta = (m) => m.planta === "gecko-pew" ? `PEW / simu · ${m.rotulo || ""}` : (m.planta || "");
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
  fonteEventos = new EventSource("eventos");
  // ao conectar, o servidor repete a rodada em curso ("inicio" e tudo o que já veio): só esse 1º "inicio", com a meta
  // igual (o servidor numera cada rodada), é a mesma rodada; qualquer outro "inicio" é rodada nova
  fonteEventos.onopen = () => { repeticao = true; setTimeout(() => { repeticao = false; }, 3000); };
  fonteEventos.addEventListener("inicio", (ev) => {
    if (modo !== "vivo") return;
    const meta = JSON.parse(ev.data), rep = repeticao; repeticao = false;
    if (rep && A && JSON.stringify(A.meta) === JSON.stringify(meta)) {   // reconexão na mesma rodada: os dados vêm todos de novo;
      A.dados = {}; A.ger = (A.ger || 0) + 1; limpaCaches(A); return;    // painéis e zoom ficam, a medição recalcula (A.ger)
    }
    A = { meta, dados: {} }; xFaixa = null;
    montaTudo();                             // rodada nova: os painéis deixam de apontar para a anterior
    for (const p of paineis()) { p.xZoom = null; p.yZoom = null; }
    status(`ao vivo: ${nomePlanta(A.meta)} — aguardando dados`);
  });
  fonteEventos.addEventListener("dados", (ev) => {
    if (modo !== "vivo" || !A) return;
    const lote = JSON.parse(ev.data);
    for (const k in lote) { const dst = (A.dados[k] = A.dados[k] || []); for (const v of lote[k]) dst.push(v); }
    limpaCaches(A);
    const t = A.dados.t || [];
    if (t.length) status(`ao vivo: ${nomePlanta(A.meta)} — t = ${(t[t.length - 1] * 1e3).toFixed(2)} ms (${t.length} amostras)`);
    redesenha();
  });
  fonteEventos.addEventListener("fim", () => { if (modo === "vivo" && A) status(`terminou: ${nomePlanta(A.meta)} — ${(A.dados.t || []).length} amostras`); });
  fonteEventos.onerror = () => status("sem conexão com o servidor do scope (tentando de novo…)");
}
// a conexão ao vivo só com a aba à vista: o navegador abre no máximo 6 conexões por endereço (somando as abas, HTTP/1.1)
// e cada EventSource aberto segura uma; com 6 abas do scope (ou do simu com o scope embutido) em segundo plano, a próxima
// página do PEW ficava na fila, sem o trilho. Escondida por mais de 30 s, a aba fecha a sua; ao voltar, reconecta e o
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
    sel.innerHTML = `<option value="">${sel.id === "sel-b" ? "(nenhuma)" : "(escolha)"}</option>` +
      lst.map((x) => `<option value="${x.arq}" title="${x.arq}">${x.rotulo || x.arq}</option>`).join("");
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
      if (buf.byteLength >= 8 && dv.getUint32(0, false) === 0x50455742) {          // "PEWB"
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
    status(`não consegui abrir ${arq.split("/").pop()}: ${(j && j.erro) || "a gravação não existe mais?"}`); return null;
  }
  return j;
}
function entraComparar() {
  modo = "comparar"; $("bt-comparar").classList.add("ativo"); $("bt-vivo").classList.remove("ativo");
  if (fonteEventos) fonteEventos.close();
}
const nomeSel = (sel) => sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : "—";

// ---------------------------------------------------------------- barra de ferramentas
$("ck-fixar").onchange = (e) => { fixar = e.target.checked; };
$("ck-pausar").onchange = (e) => { pausado = e.target.checked; if (!pausado) redesenha(); };
$("bt-painel").onclick = () => {                       // só a rodada: no fim da seção dela (o fim do layout é uma seção do MMC, escondida)
  const alvo = soDaRodada() ? grupos().reverse().find((g) => g.ps.some((p) => p.u)) : null;
  if (alvo) { abreSecaoDe(adicionaPainel({ titulo: "Novo painel", sinais: [] }, itens.indexOf(alvo.ps[alvo.ps.length - 1]) + 1)); indice.secao = alvo.k; }
  else { abreSecaoDe(adicionaPainel({ titulo: "Novo painel", sinais: [] })); const gs = grupos(); indice.secao = gs[gs.length - 1].k; }
  guardaLayout();
};
$("bt-secao").onclick = () => { adicionaSecao("Nova seção"); const gs = grupos(); indice.secao = gs[gs.length - 1].k; guardaLayout(); };
$("bt-porlinha").onclick = () => {
  larguraPadrao = larguraPadrao % 3 + 1; $("bt-porlinha").textContent = `Por linha: ${larguraPadrao}`;
  for (const p of paineis()) { p.largura = larguraPadrao; aplicaLargura(p); }
  guardaLayout(); setTimeout(redimensiona, 0);
};
$("bt-padrao").onclick = () => { try { localStorage.removeItem(CHAVE_LAYOUT); } catch (e) { /* ok */ } indice = { aberto: indice.aberto, unica: false, secao: -1 }; montaTudo(); guardaLayout(); };
$("bt-salvar").onclick = salvaTodos;
// ---- apagar gravações (só scope_*.npz; o servidor recusa qualquer outra coisa)
const mb = (b) => (b / 1e6).toFixed(b >= 1e7 ? 0 : 1) + " MB";
async function abreApagar() {
  const lst = await (await fetch("rodadas")).json();
  const total = lst.reduce((a, x) => a + (x.tamanho || 0), 0);
  $("ap-total").textContent = `— ${lst.length} gravações, ${mb(total)} no disco`;
  $("ap-lista").innerHTML = lst.map((x) => `<label><input type="checkbox" data-arq="${x.arq}" data-tam="${x.tamanho || 0}">` +
    `<span>${x.rotulo || x.arq}</span><span class="tam">${mb(x.tamanho || 0)}</span><span class="cam">${x.arq}</span></label>`).join("") ||
    "<i>nenhuma gravação</i>";
  const marca = () => {
    const ck = [...$("ap-lista").querySelectorAll("input:checked")];
    $("ap-marcadas").textContent = ck.length ? `${ck.length} marcadas, ${mb(ck.reduce((a, c) => a + +c.dataset.tam, 0))}` : "nenhuma marcada";
  };
  $("ap-lista").querySelectorAll("input").forEach((c) => c.onchange = marca); marca();
  $("janela-apagar").classList.add("aberta");
}
$("bt-apagar").onclick = abreApagar;
$("ap-fechar").onclick = () => $("janela-apagar").classList.remove("aberta");
$("ap-ok").onclick = async () => {
  const ck = [...$("ap-lista").querySelectorAll("input:checked")];
  if (!ck.length) return;
  const tam = ck.reduce((a, c) => a + +c.dataset.tam, 0);
  if (!confirm(`Apagar ${ck.length} gravação(ões), ${mb(tam)}, do disco? Não dá para desfazer pela tela.`)) return;
  const r = await (await fetch("apagar", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arqs: ck.map((c) => c.dataset.arq) }) })).json();
  status(`apagadas ${r.apagados.length} gravações (${mb(r.apagados.reduce((a, x) => a + x.tamanho, 0))})` +
         (r.recusados.length ? `; recusadas: ${r.recusados.join(", ")}` : ""));
  await listaRodadas(); await abreApagar();
};
$("bt-vivo").onclick = () => {
  modo = "vivo"; $("bt-vivo").classList.add("ativo"); $("bt-comparar").classList.remove("ativo");
  A = null; B = null; uniao = null; xFaixa = null; montaTudo(); status("ao vivo: aguardando uma rodada com --scope"); conectaVivo();
};
$("bt-comparar").onclick = async () => { entraComparar(); await listaRodadas(); status("escolha A (e B, se quiser comparar) e clique em Carregar"); };
$("bt-carregar").onclick = async () => {
  status("carregando…"); entraComparar();
  A = await carrega($("sel-a").value); B = await carrega($("sel-b").value); xFaixa = null; preparaGrade();
  status(`A: ${nomeSel($("sel-a"))}${B ? " | B: " + nomeSel($("sel-b")) : ""}${avisoGrade()}`);
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
// o tema mudou (o trilho grava "pew-tema" — o evento storage chega a esta página também dentro do simu; "sistema" segue o
// sistema; o pew-nav.js, quando está nesta página, avisa com "pew-tema"): as cores novas e os gráficos redesenhados
function acompanhaTema() {
  let t = "sistema";
  try { t = localStorage.getItem("pew-tema") || "sistema"; } catch (e) { /* ok */ }
  const novo = t === "escuro" || (t === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches) ? "escuro" : "claro";
  if (novo !== document.documentElement.dataset.tema) document.documentElement.dataset.tema = novo;
  if (novo === temaDesenhado) return;
  temaDesenhado = novo;
  for (const p of paineis()) {
    if (p.u) criaGrafico(p);
    if (p.med && p.med.aberto && p.med.esp.aberto) desenhaEspectro(p);
  }
}
let temaDesenhado = temaAtual();
window.addEventListener("storage", (e) => { if (e.key === "pew-tema") acompanhaTema(); });
window.addEventListener("pew-tema", acompanhaTema);
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", acompanhaTema); } catch (e) { /* ok */ }
window.addEventListener("resize", () => { clearTimeout(tRes); tRes = setTimeout(() => { medeCab(); redimensiona(); if (expandido) expande(expandido, true); }, 150); });

// endereço: /pew/scope/?a=<arquivo>&b=<arquivo>&x=<min>,<max> (ms) abre direto no modo Comparar, com zoom;
// os pedidos ao servidor usam caminhos relativos (eventos, rodadas…), para funcionar também atrás do pew-app
(async () => {
  const q = new URLSearchParams(location.search);
  await listaRodadas();
  if (q.get("a")) {
    entraComparar();
    $("sel-a").value = q.get("a"); $("sel-b").value = q.get("b") || "";
    A = await carrega(q.get("a")); B = await carrega(q.get("b")); preparaGrade();
    if (q.get("x")) { const [a, b] = q.get("x").split(",").map(Number); xFaixa = [a, b]; }
    if (A) status(`A: ${nomeSel($("sel-a"))}${B ? " | B: " + nomeSel($("sel-b")) : ""}${avisoGrade()}`);
    montaTudo();
  } else {
    montaTudo();
    if (!document.hidden) conectaVivo();       // aberta em segundo plano: conecta quando aparecer (visibilitychange)
  }
})();
