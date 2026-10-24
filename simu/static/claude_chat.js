// MaiSim / simu — "pedir ao Claude" (passo 3b): uma conversa por circuito, no painel do controle.
// O Claude do MaiSim cuida só do controle: lê o contexto (o circuito, as medidas, as atuações, Ts, Δt, tfim) e o código atual
// e propõe controle.py, parâmetros e acionamentos; o servidor valida e testa a proposta e aqui o usuário vê a diferença e
// aplica (com volta) ou descarta. Anexos (PDF de artigo, foto de um diagrama, texto) vão para a pasta da conversa: 📎,
// arrastar para a conversa ou colar uma imagem. O topo mostra o uso da conta (sessão de 5 h e semana).
const ICONE_DOC = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
const ICONE_CLIPE = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l9.2-9.2a3.3 3.3 0 0 1 4.7 4.7l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.5-8.5"/></svg>';
const MASCOTE = (w = 20, h = 20, pensando = false) => `<svg class="mascote${pensando ? " pensando" : ""}" width="${w}" height="${h}" aria-hidden="true"><use href="#maisim-claude"/></svg>`;
const cc = { voltou: false, aberto: false, estado: null, timer: null, antes: null, enviando: false, aviso: "", desenhado: "", uso: null, ias: [] };

// ---------------------------------------------------------------- qual IA responde (hub de IA, etapa 3): o seletor e os modelos dela
// (a conversa é a mesma: trocar no meio continua de onde a outra parou — o MaiSim passa a ela a conversa em CONVERSA.md)
const MODELOS_IA = {
  claude: [["", "Modelo: padrão"], ["fable", "Fable"], ["opus", "Opus"], ["sonnet", "Sonnet"], ["haiku", "Haiku"]],
  gemini: [["", "Modelo: automático"], ["pro", "Pro"], ["flash", "Flash"], ["flash-lite", "Flash-Lite"]],
};
const ccIA = () => ($("cc-ia") && $("cc-ia").value) || "claude";
const chaveModelo = (ia) => (ia === "claude" ? "maisim-simu-cc-modelo" : `maisim-simu-cc-modelo-${ia}`);   // o do Claude: a chave de sempre
function iaLogada(ia = ccIA()) {
  if (ia === "claude") return !!(cla.estado && cla.estado.logado);
  const a = (cc.ias || []).find((x) => x.id === ia);
  return a ? (a.tem_login ? !!(a.estado && a.estado.logado) : !!(cla.estado && cla.estado.logado)) : false;   // o Eco (teste) usa o login do Claude
}
const nomeIA = (ia = ccIA()) => ((cc.ias || []).find((x) => x.id === ia) || {}).nome || (ia === "claude" ? "Claude" : ia);
// monta o seletor de IA (as instaladas) e os modelos da escolhida; a escolha fica no navegador
function ccMontaIA() {
  const s = $("cc-ia"); if (!s) return;
  let quer = s.value; try { quer = localStorage.getItem("maisim-simu-cc-ia") || quer; } catch (e) { /* padrão */ }
  const lista = (cc.ias || []).filter((a) => a.instalado);
  if (lista.length) {
    const html = lista.map((a) => `<option value="${escT(a.id)}">${escT(a.nome)}</option>`).join("");
    if (s.innerHTML !== html) s.innerHTML = html;
  }
  s.value = [...s.options].some((o) => o.value === quer) ? quer : "claude";
  s.style.display = s.options.length > 1 ? "" : "none";
  ccModelos();
}
function ccModelos() {
  const ia = ccIA(), sm = $("cc-modelo"), se = $("cc-esforco"); if (!sm) return;
  const a = (cc.ias || []).find((x) => x.id === ia);
  const ops = MODELOS_IA[ia] || (a ? a.modelos.map((m) => [m, m ? (a.rotulos && a.rotulos[m]) || m : "Modelo: padrão"]) : MODELOS_IA.claude);
  const html = ops.map(([v, t]) => `<option value="${escT(v)}">${escT(t)}</option>`).join("");
  if (sm.dataset.ia !== ia || sm.dataset.html !== html) { sm.innerHTML = html; sm.dataset.ia = ia; sm.dataset.html = html; }   // a lista pode chegar depois (o Antigravity)   // sem dica: IA, modelo e esforço são óbvios (Marcelo, 21/10)
  try { const v = localStorage.getItem(chaveModelo(ia)); if (v !== null && [...sm.options].some((o) => o.value === v)) sm.value = v; } catch (e) { /* padrão */ }
  const esforcos = a ? a.esforcos : ["", "low"];
  if (se) { se.style.display = esforcos.length > 1 ? "" : "none"; if (esforcos.length <= 1) se.value = ""; }
}

const fmtNum = (x) => (typeof x === "number" ? Number(x.toPrecision(6)).toString() : String(x));
function fmtTempo(t) {
  const a = Math.abs(t);
  return a === 0 ? "0 s" : a < 1e-6 ? `${fmtNum(t * 1e9)} ns` : a < 1e-3 ? `${fmtNum(t * 1e6)} µs` : a < 1 ? `${fmtNum(t * 1e3)} ms` : `${fmtNum(t)} s`;
}
// uma equação em LaTeX, formatada pelo KaTeX (static/katex; Marcelo, 20/10: "o Claude do MaiSim apresentar as equações
// formatadas"); sem o KaTeX (não carregou), o TeX como código; TeX inválido sai em vermelho, sem quebrar a conversa
function tex(src, destaque) {
  if (typeof katex === "undefined") return `<code>${escT(src)}</code>`;
  // letras acentuadas (v_{braço}, P_{média}) no modo de equação somem ou trocam de glifo no KaTeX ("\c" literal): a palavra
  // inteira vai como texto, em pé, como um índice em palavra deve ficar — \text{braço}
  const fonte = src.replace(/(?<![\\A-Za-z])[A-Za-z]*[\u00C0-\u024F][A-Za-z\u00C0-\u024F]*/g, (m) => `\\text{${m}}`);
  try { return katex.renderToString(fonte, { displayMode: destaque, throwOnError: false, output: "html", strict: "ignore", trust: false }); }
  catch (e) { return `<code>${escT(src)}</code>`; }
}
// um markdown leve (o que o Claude costuma usar): blocos de código, `código`, **negrito**, listas e parágrafos; tudo escapado.
// Equações: $$…$$ e \[…\] em destaque, $…$ e \(…\) na linha — fora do código; "$Ra e $Rf" (parâmetros do Gecko) não é
// equação: o $ de abrir vem colado ao que segue, o de fechar colado ao que vem antes e sem letra ou número depois
function mdLeve(txt) {
  const partes = String(txt || "").split(/```[a-zA-Z]*\n?/);
  return partes.map((p, i) => {
    if (i % 2) return `<pre><code>${escT(p.replace(/\n$/, ""))}</code></pre>`;
    const guard = [], poe = (html) => `\u0000${guard.push(html) - 1}\u0000`;
    p = p.replace(/`([^`\n]+)`/g, (_, c) => poe(`<code>${escT(c)}</code>`))
      .replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_, a, b) => poe(tex((a || b).trim(), true)))
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, a) => poe(tex(a.trim(), false)))
      .replace(/(^|[^\\$\w])\$(?=[^\s$])([^$\n]*?[^\s$\\])\$(?![\w$])/g, (_, ant, a) => ant + poe(tex(a, false)));
    const volta = (h) => h.replace(/\u0000(\d+)\u0000/g, (_, k) => guard[+k]);
    return blocosMd(p, (t) => volta(escT(t).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")));
  }).join("");
}
// os blocos do markdown (Marcelo, 20/10: as respostas vinham com "## título" e tabelas "| a | b |" cruas): títulos, tabelas
// (com alinhamento), listas (- * + e 1.), citações (>), linha (---) e parágrafos (uma quebra = <br>); inl() faz a linha
function blocosMd(p, inl) {
  const L = p.split("\n"), out = [];
  const tabela = (l) => /^\s*\|.*\|\s*$/.test(l) || /^\s*[^|]+\|[^|]/.test(l) && /\|/.test(l);
  const separador = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && /-/.test(l);
  const celulas = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/, titulo = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/, linha = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
  let i = 0;
  const outroBloco = (l) => !l.trim() || titulo.test(l) || linha.test(l) || item.test(l) || /^\s*>/.test(l);
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(titulo))) { out.push(`<div class="md-h md-h${Math.min(m[1].length, 4)}">${inl(m[2])}</div>`); i++; continue; }
    if (linha.test(l)) { out.push("<hr>"); i++; continue; }
    if (tabela(l) && i + 1 < L.length && separador(L[i + 1])) {
      const cab = celulas(l), al = celulas(L[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : /^:/.test(c) ? "left" : ""));
      const st = (k) => (al[k] ? ` style="text-align:${al[k]}"` : "");
      let h = `<div class="md-tab"><table><thead><tr>${cab.map((c, k) => `<th${st(k)}>${inl(c)}</th>`).join("")}</tr></thead><tbody>`;
      i += 2;
      while (i < L.length && L[i].trim() && /\|/.test(L[i])) {
        const cs = celulas(L[i]); h += `<tr>${cab.map((_, k) => `<td${st(k)}>${inl(cs[k] || "")}</td>`).join("")}</tr>`; i++;
      }
      out.push(h + "</tbody></table></div>"); continue;
    }
    if ((m = l.match(item))) {
      const ord = /\d/.test(m[2]), base = m[1].length, itens = [];
      while (i < L.length && (m = L[i].match(item)) && /\d/.test(m[2]) === ord) {
        let txt = m[3], sub = m[1].length > base; i++;
        while (i < L.length && L[i].trim() && !outroBloco(L[i]) && /^\s+/.test(L[i])) { txt += "\n" + L[i].trim(); i++; }   // continuação
        itens.push(`<li${sub ? ' class="md-sub"' : ""}>${inl(txt).replace(/\n/g, "<br>")}</li>`);
      }
      out.push(ord ? `<ol>${itens.join("")}</ol>` : `<ul>${itens.join("")}</ul>`); continue;
    }
    if (/^\s*>/.test(l)) {
      const q = []; while (i < L.length && /^\s*>/.test(L[i])) { q.push(L[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(`<blockquote>${blocosMd(q.join("\n"), inl)}</blockquote>`); continue;
    }
    const par = [l]; i++;
    while (i < L.length && !outroBloco(L[i]) && !(tabela(L[i]) && i + 1 < L.length && separador(L[i + 1]))) { par.push(L[i]); i++; }
    out.push(`<p>${inl(par.map((x) => x.trim()).join("\n")).replace(/\n/g, "<br>")}</p>`);
  }
  return out.join("");
}
// a diferença linha a linha, como o git: [{t: " " | "-" | "+", l: texto, a: nº da linha antes, b: nº depois}] — começo e
// fim iguais tirados, o meio pela maior subsequência comum (o que sai vem antes do que entra, como no git diff)
function diffLinhas(a, b) {
  const A = String(a).split("\n"), B = String(b).split("\n"), ops = [];
  let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
  let j = 0; while (j < A.length - i && j < B.length - i && A[A.length - 1 - j] === B[B.length - 1 - j]) j++;
  const a2 = A.slice(i, A.length - j), b2 = B.slice(i, B.length - j), n = a2.length, m = b2.length;
  for (let k = 0; k < i; k++) ops.push({ t: " ", l: A[k], a: k + 1, b: k + 1 });
  if (n * m > 1e6) {                                     // grande demais para a tabela: tudo sai e tudo entra
    a2.forEach((l, k) => ops.push({ t: "-", l, a: i + k + 1 })); b2.forEach((l, k) => ops.push({ t: "+", l, b: i + k + 1 }));
  } else {
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let x = n - 1; x >= 0; x--) for (let y = m - 1; y >= 0; y--) L[x][y] = a2[x] === b2[y] ? L[x + 1][y + 1] + 1 : Math.max(L[x + 1][y], L[x][y + 1]);
    let x = 0, y = 0;
    while (x < n || y < m) {
      if (x < n && y < m && a2[x] === b2[y]) { ops.push({ t: " ", l: a2[x], a: i + x + 1, b: i + y + 1 }); x++; y++; }
      else if (x < n && (y >= m || L[x + 1][y] >= L[x][y + 1])) { ops.push({ t: "-", l: a2[x], a: i + x + 1 }); x++; }
      else { ops.push({ t: "+", l: b2[y], b: i + y + 1 }); y++; }
    }
  }
  for (let k = 0; k < j; k++) ops.push({ t: " ", l: A[A.length - j + k], a: A.length - j + k + 1, b: B.length - j + k + 1 });
  return ops;
}
function contaDiff(a, b) {
  const ops = diffLinhas(a, b);
  return { mais: ops.filter((o) => o.t === "+").length, menos: ops.filter((o) => o.t === "-").length };
}
// o trecho mudado, como no git diff: 2 linhas de contexto, "@@ linha N @@" a cada bloco; até max linhas (o resto: ver tudo)
function htmlDiff(ops, max = 60) {
  const mud = ops.map((o, k) => (o.t !== " " ? k : -1)).filter((k) => k >= 0);
  if (!mud.length) return "";
  const vis = new Set(); for (const k of mud) for (let d = -2; d <= 2; d++) if (ops[k + d]) vis.add(k + d);
  const ks = [...vis].sort((x, y) => x - y), out = [];
  let ant = -2;
  for (let q = 0; q < ks.length; q++) {
    const k = ks[q], o = ops[k];
    if (q >= max) { out.push(`<div class="cc-dh">… mais ${ks.length - q} linhas: ver diferença</div>`); break; }
    if (k !== ant + 1) out.push(`<div class="cc-dh">@@ linha ${o.b || o.a} @@</div>`);
    out.push(`<div class="${o.t === "+" ? "cc-dm" : o.t === "-" ? "cc-dr" : "cc-dc"}"><span>${o.t === "-" ? "−" : o.t}</span>${escT(o.l)}</div>`);
    ant = k;
  }
  return `<div class="cc-diff" title="a diferença do controle.py, como no git diff">${out.join("")}</div>`;
}
function mudancasParametros(antes, depois) {
  const A = new Map((antes || []).map((q) => [q.nome, q])), D = new Map((depois || []).map((q) => [q.nome, q])), out = [];
  for (const [n, q] of D) {
    const a = A.get(n), u = q.unidade ? ` ${q.unidade}` : "";
    if (!a) out.push(`novo p["${n}"] = ${fmtNum(q.valor)}${u}`);
    else if (a.valor !== q.valor || (a.unidade || "") !== (q.unidade || "")) out.push(`p["${n}"]: ${fmtNum(a.valor)} → ${fmtNum(q.valor)}${u}`);
  }
  for (const n of A.keys()) if (!D.has(n)) out.push(`tira p["${n}"]`);
  return out;
}
// os controladores (DSPs à parte) e a rede entre eles: o que a proposta cria, tira e muda
function mudancasControladores(p) {
  const A = p.controladores_antes || [], D = p.controladores || [], out = [];
  if (!p.controladores) return out;                      // proposta de antes (sem controladores.json)
  const desc = (q) => `${q.arquivo}; lê ${q.todas ? "todas" : q.medidas.join(", ") || "nada"}; escreve ${q.atuacoes.join(", ") || "nada"}${q.subcircuitos.length ? `; em ${q.subcircuitos.join(", ")}` : ""}`;
  for (const q of D) { const a = A.find((x) => x.nome === q.nome);
    if (!a) out.push(`+ controlador ${q.nome} (${desc(q)})`); else if (JSON.stringify(a) !== JSON.stringify(q)) out.push(`controlador ${q.nome}: ${desc(a)} → ${desc(q)}`); }
  for (const a of A) if (!D.some((x) => x.nome === a.nome)) out.push(`− controlador ${a.nome} (${a.arquivo} volta a ser módulo)`);
  const la = (p.rede_antes || {}).latencia || 0, ld = (p.rede || {}).latencia || 0;
  if (la !== ld) out.push(`rede: latência ${fmtTempo(la)} → ${fmtTempo(ld)}`);
  return out;
}
function mudancasAcionamentos(antes, depois) {
  const chave = (q) => JSON.stringify([q.t, q.alvo, q.valor]), A = new Set((antes || []).map(chave)), D = new Set((depois || []).map(chave));
  const txt = (q) => `t = ${fmtTempo(q.t)}: ${q.alvo.replace(/^p:(.*)$/, 'p["$1"]').replace(/^CONST:/, "")} = ${fmtNum(q.valor)}`;
  return (depois || []).filter((q) => !A.has(chave(q))).map((q) => `+ ${txt(q)}`).concat((antes || []).filter((q) => !D.has(chave(q))).map((q) => `− ${txt(q)}`));
}

// ---------------------------------------------------------------- onde fica a conversa: ao lado do código (3 colunas) ou embaixo
// a escolha fica no navegador; ao lado com o painel estreito demais (o código ficaria espremido), desce sozinha
const LARGURA_MIN_LADO = 820;
const ICONE_LUGAR = {
  lado: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11M10.5 2.5v11"/></svg>',
  embaixo: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11M6 9h8.5"/></svg>' };
let lugarMem = "lado";                                   // sem localStorage: vale até recarregar
function lugarEscolhido() { try { return localStorage.getItem("maisim-simu-claude-lugar") === "embaixo" ? "embaixo" : "lado"; } catch (e) { return lugarMem; } }
function aplicaLugar() {
  const p = $("painel-controle"), escolha = lugarEscolhido(), estreito = p.clientWidth > 0 && p.clientWidth < LARGURA_MIN_LADO;
  const embaixo = escolha === "embaixo" || estreito;
  p.classList.toggle("cc-embaixo", embaixo);
  const b = $("cc-lugar");
  b.innerHTML = ICONE_LUGAR[escolha === "lado" ? "embaixo" : "lado"];            // o ícone mostra para onde o clique leva
  b.title = escolha === "lado" ? `conversa ao lado do código${estreito ? " (agora embaixo: o painel está estreito; alargue a doca)" : ""} · clique: embaixo` : "conversa embaixo do código · clique: ao lado";
  if (ctl.editor) setTimeout(() => ctl.editor.layout(), 30);
}

// ---------------------------------------------------------------- abrir, acompanhar
function ccAbre(on = !cc.aberto) {
  cc.aberto = on;
  $("painel-controle").classList.toggle("com-claude", on); aplicaLugar();
  $("ctl-claude-bt").classList.toggle("ativo", on);
  if (on) {
    if (!cla.estado) atualizaClaude().then(desenhaChat);
    atualizaChat(); carregaUsoChat();
    setTimeout(() => $("cc-texto").focus(), 50);
  } else if (cc.timer) { clearInterval(cc.timer); cc.timer = null; }
  if (ctl.editor) setTimeout(() => ctl.editor.layout(), 30);
}
async function atualizaChat() {
  try { cc.estado = await apiClaude("pedido"); cc.aviso = cc.aviso === "sem resposta do servidor" ? "" : cc.aviso; }
  catch (e) { cc.aviso = "sem resposta do servidor"; }
  if (cc.estado && cc.estado.uso) cla.uso = cc.uso = cc.estado.uso;
  desenhaChat(); acompanhaChat();
}
const editorPronto = () => !!(ctl.editor || ctl.texto);   // o Monaco ainda carregando: o código na tela seria ""
function acompanhaChat() {
  const anda = cc.aberto && !!(cc.estado && cc.estado.andamento);   // fechada a conversa, o acompanhamento para
  if (anda && !cc.timer) cc.timer = setInterval(atualizaChat, 1000);
  else if (!anda && cc.timer) { clearInterval(cc.timer); cc.timer = null; }
}
async function carregaUsoChat(forca = false) {
  try { cc.uso = await apiClaude(forca ? "uso?forca=1" : "uso"); } catch (e) { /* fica o que havia */ }
  desenhaUsoChat(); cla.uso = cc.uso; if (cla.janela) desenhaJanelaClaude();
}
function desenhaUsoChat() {
  const u = cc.uso, el = $("cc-uso"); if (!el) return;
  if (ccIA() !== "claude") { el.textContent = ""; el.title = ""; return; }   // o uso da conta é o do Claude (o /usage)
  if (!u) { el.textContent = ""; return; }
  if (!u.itens || !u.itens.length) { el.textContent = "uso da conta: não consegui ler"; el.title = u.erro || u.texto || ""; return; }
  const nivel = (p) => (p >= 90 ? "alto" : p >= 70 ? "medio" : "");
  el.innerHTML = u.itens.filter((i) => !/·/.test(i.rotulo)).map((i) => `<span class="${nivel(i.pct)}">${escT(i.rotulo.replace(" (5 h)", ""))} ${Math.round(i.pct)}%</span>`).join(" · ");
  el.title = "uso da sua conta do Claude:\n" + u.itens.map((i) => `${i.rotulo}: ${Math.round(i.pct)}%${i.renova ? ` (renova ${i.renova})` : ""}`).join("\n");
}

// ---------------------------------------------------------------- desenhar (só quando algo que aparece mudou)
function desenhaChat() {
  desenhaUsoChat();
  const e = cc.estado, logado = iaLogada(), anda = !!(e && e.andamento);
  const rodando = document.body.classList.contains("sim-rodando");
  $("cc-enviar").disabled = anda || cc.enviando; $("cc-enviar").textContent = cc.enviando ? "Enviando…" : anda ? "Respondendo…" : "Enviar";
  $("cc-texto").placeholder = anda ? "a IA está respondendo… (pode escrever o próximo: envia quando ela terminar)" : "Peça à IA… (Ctrl+Enter envia)";
  $("cc-parar").style.display = anda ? "" : "none";
  $("cc-aviso").textContent = cc.aviso || cc.avisoOk || ""; $("cc-aviso").classList.toggle("ok", !cc.aviso && !!cc.avisoOk);   // avisoOk: deu certo (verde)
  $("cc-nova").disabled = anda; $("cc-salvar").disabled = anda; $("cc-exportar").disabled = anda;
  $("cc-nota").textContent = ctl.dados && !ctl.dados.circuito ? "abra a edição (lápis): sem ela, a IA não conhece as medidas nem as atuações do circuito" : "";
  const anexos = (e && e.conversa && e.conversa.anexos) || [];
  const chave = JSON.stringify([logado, ccIA(), !!cla.estado, e && e.conversa, e && [e.andamento, e.eventos, e.fala, e.proposta, e.aplicada, e.erro, e.outro_circuito, e.pedido, e.auto],
    anda ? Math.floor((Date.now() / 1000 - e.desde) / 5) : 0, rodando, !!cc.antes, cc.voltou, cc.aviso, cc.avisoOk]);
  if (chave === cc.desenhado) return;
  cc.desenhado = chave;
  $("cc-anexos").innerHTML = (typeof cxEtiquetas === "function" ? cxEtiquetas() : "") + anexos.map((a) => `<span class="cc-anexo" title="${escT(a.nome)} · ${Math.max(1, Math.round(a.tamanho / 1024))} kB">${ICONE_DOC}<span>${escT(a.nome)}</span><button data-tira="${escT(a.nome)}" title="tirar o anexo">×</button></span>`).join("");
  const box = $("cc-msgs"), noFim = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  let h = "";
  if (!cla.estado) h = `<div class="cc-vazio">consultando a IA do MaiSim…</div>`;
  else if (!logado) h = `<div class="cc-vazio"><div class="cc-oi"><svg class="mascote" width="40" height="40" aria-hidden="true"><use href="#maisim-claude"/></svg><p>Para pedir à IA, entre com a sua conta do ${escT(nomeIA())} (o balão no cabeçalho)${(cc.ias || []).filter((a) => a.instalado).length > 1 ? ", ou escolha outra IA embaixo" : ""}.</p></div><button id="cc-entrar" class="primario">Entrar com o ${escT(nomeIA())}</button></div>`;
  else {
    const hist = (e && e.conversa && e.conversa.historico) || [];
    if (!hist.length && !anda) h += `<div class="cc-vazio"><div class="cc-oi"><svg class="mascote" width="40" height="40" aria-hidden="true"><use href="#maisim-claude"/></svg><b>IA do MaiSim</b></div><p>Ela lê o circuito e o código e propõe o controle; você vê a diferença antes de aplicar.</p>
      <ul><li>“um PI de corrente com anti-windup”</li><li>“implemente o controle do artigo anexado”</li></ul></div>`;   /* curto (Marcelo, 19/10: "nem precisa tanto") */
    hist.forEach((m, k) => {
      h += `<div class="cc-eu">${escT(m.pedido || "")}${m.anexos && m.anexos.length ? `<small>${ICONE_CLIPE} ${escT(m.anexos.join(", "))}</small>` : ""}</div>`;
      const ultimo = k === hist.length - 1 && !anda;
      const corpo = m.resposta ? mdLeve(m.resposta) : m.fala ? mdLeve(m.fala) : "";
      const erro = m.erro ? `<p class="cc-erro">${m.erro === "parado" ? "parado." : escT(m.erro)}</p>` : "";
      const ia = m.ia && m.ia !== "claude" ? `${escT((cc.ias || []).find((x) => x.id === m.ia)?.nome || m.ia)} · ` : "";   // qual IA respondeu (hub de IA)
      const g = m.gasto, meta = g ? `<span class="cc-meta">${ia}${m.modelo ? `${escT(m.modelo)} · ` : ""}${g.segundos} s · ${g.turnos} passos · ${Math.round((g.entrada + g.saida) / 1000)} mil tokens${m.aplicada ? (m.desfeita ? " · aplicada e desfeita" : " · aplicada") : ""}</span>` : "";
      const r = m.aplicada && m.mudanca_resumo;               // o que mudou ao aplicar (guardado no histórico): para ver depois
      const na = (r && r.arquivos) || [];
      const mud = r ? `<button class="cc-mud" data-mudanca="${m.i}" title="o que mudou ao aplicar esta proposta${na.length ? `: ${escT(na.map((f) => f.arquivo + (f.novo ? " (novo)" : "")).join(", "))}` : ""}${r.outros ? ", e os parâmetros/acionamentos" : ""}">ver a mudança${r.mais || r.menos ? ` <b class="cc-ok">+${r.mais}</b> <b class="cc-erro">−${r.menos}</b>` : ""}${na.length > 1 ? ` · ${na.length} arquivos` : ""}${r.outros ? " · parâmetros" : ""}</button>` : "";
      if (corpo || erro || meta) h += `<div class="cc-linha">${MASCOTE()}<div class="cc-ele">${corpo}${erro}${meta}${mud}</div></div>`;
      if (ultimo && e && e.auto && e.auto.fim && !anda) h += `<div class="cc-ele cc-auto-fim">modo autônomo: ${escT(e.auto.fim)} (${e.auto.feitas} de ${e.auto.max} rodadas; elas estão no scope como Claude_1, Claude_2…)</div>`;
      if (ultimo && e && e.proposta && !e.outro_circuito) h += cartaoProposta(e, rodando);
    });
    if (anda) {
      const seg = Math.max(0, Math.round(e.decorrido != null ? e.decorrido : Date.now() / 1000 - e.desde));   // medido no servidor (relógios diferentes)
      const auto = e.auto ? ` · modo autônomo: ${e.auto.feitas} de ${e.auto.max} rodadas` : "";
      h += `<div class="cc-eu">${escT(e.pedido || "")}</div><div class="cc-linha">${diodoIA(24)}<div class="cc-ele cc-andamento">a IA está trabalhando… (${seg} s${auto})
        ${(e.eventos || []).length ? `<ol>${e.eventos.slice(-8).map((x) => `<li>${escT(x)}</li>`).join("")}</ol>` : ""}${e.fala ? `<div style="margin-top:6px">${mdLeve(e.fala)}</div>` : ""}</div></div>`;
    }
    if (e && e.outro_circuito && e.proposta) h += `<div class="cc-ele cc-aviso-t">A última proposta foi feita para outro circuito (${escT(e.circuito || "")}): abra-o para aplicar.</div>`;
  }
  box.innerHTML = h;
  if (noFim) box.scrollTop = box.scrollHeight;          // quem rolou para cima fica onde estava
}

// os arquivos que mudam numa proposta (ou numa mudança guardada): [{arq, antes, depois, novo}], o controle.py primeiro.
// Etapa B (19/10): o Claude edita e cria os módulos também
function arquivosMudados(p) {
  const antes = Object.assign({ "controle.py": p.codigo_antes || "" }, p.arquivos_antes || {});
  const depois = Object.assign({ "controle.py": p.codigo || "" }, p.arquivos || p.arquivos_antes || {});
  return [...new Set([...Object.keys(antes), ...Object.keys(depois)])].sort((a, b) => (a !== "controle.py") - (b !== "controle.py") || a.localeCompare(b))
    .filter((a) => (antes[a] ?? null) !== (depois[a] ?? null)).map((a) => ({ arq: a, antes: antes[a] || "", depois: depois[a] ?? "", novo: !(a in antes) }));
}
const contaOps = (ops) => ({ mais: ops.filter((o) => o.t === "+").length, menos: ops.filter((o) => o.t === "-").length });
function cartaoProposta(e, rodando) {
  const p = e.proposta, itens = [];
  if (p.erro && !p.mudou) return `<div class="cc-prop"><h5 class="cc-erro">Proposta com problema</h5><p class="cc-erro">${escT(p.erro)}</p></div>`;
  if (!p.mudou) return "";                               // só uma pergunta respondida: nada a aplicar, sem cartão
  const muds = arquivosMudados(p).map((f) => Object.assign(f, { ops: diffLinhas(f.antes, f.depois) }));
  const codigoMudou = muds.length > 0;
  const opsMem = memoriaMudou(p) ? diffLinhas(p.memoria_antes || "", p.memoria || "") : null;
  for (const f of muds) { const d = contaOps(f.ops); itens.push(`${escT(f.arq)}${f.novo ? " <i>(novo)</i>" : ""}: <b class="cc-ok">+${d.mais}</b> <b class="cc-erro">−${d.menos}</b> linhas`); }
  for (const x of mudancasParametros(p.parametros_antes, p.parametros)) itens.push(escT(x));
  for (const x of mudancasAcionamentos(p.acionamentos_antes, p.acionamentos)) itens.push(`acionamento ${escT(x)}`);
  for (const x of mudancasControladores(p)) itens.push(escT(x));
  if (p.marcar && p.marcar.length) itens.push(`marca a atuação ${p.marcar.map((x) => `<code>${escT(x)}</code>`).join(", ")}`);
  if (p.ligar) itens.push(`liga “usar este controle ao simular”`);
  if (opsMem) itens.push(`memória do MaiSim: <b class="cc-ok">+${opsMem.filter((o) => o.t === "+").length}</b> <b class="cc-erro">−${opsMem.filter((o) => o.t === "-").length}</b> linhas (vale nas próximas conversas)`);
  const conf = [];
  if (p.erro) conf.push(`<li class="cc-erro">${escT(p.erro)}</li>`);
  for (const x of p.erros || []) conf.push(`<li class="cc-erro">${x.arquivo && x.arquivo !== "controle.py" ? `${escT(x.arquivo)} ` : ""}linha ${x.linha}: ${escT(x.msg)}</li>`);
  for (const x of (p.avisos || []).filter((a) => !(p.compartilhados || []).includes(a)))   // o compartilhado (pelo código): a árvore já mostra
    conf.push(`<li class="cc-aviso-t">${escT(x)}</li>`);
  for (const x of p.conferencia || []) conf.push(`<li class="cc-aviso-t">linha ${x.linha}: ${escT(x.msg)}</li>`);
  if (codigoMudou && !p.teste && !(p.erros || []).length) conf.push(`<li class="cc-dica-t">o código proposto ainda não rodou: veja a diferença e, se quiser, teste (iniciar e 3 passo, sem simular)</li>`);
  if (p.teste) conf.push(p.teste.ok ? `<li class="cc-ok">teste (iniciar e 3 passo, sem simular): ok${p.teste.passos && p.teste.passos[0] ? ` · devolve ${escT(Object.entries(p.teste.passos[0].a).map(([k, v]) => `${k} = ${fmtNum(v)}`).join(", ") || "nada")}` : ""}</li>`
    : `<li class="cc-erro">teste: ${escT(p.teste.erro)}</li>`);
  const aplicada = !!e.aplicada, bloqueio = rodando ? "a simulação está rodando: o controle fica travado até ela parar" : "";
  const bts = aplicada && cc.voltou ? `<span class="cc-aviso-t">aplicada e desfeita: voltou ao de antes.</span>` : aplicada ? `<span class="cc-ok">aplicada.</span>${cc.antes ? `<button id="cc-voltar" title="volta o código, os parâmetros e os acionamentos de antes da proposta">↶ Voltar ao de antes</button>` : ""}`
    : `${codigoMudou ? `<button id="cc-ver">Ver diferença</button>` : ""}${!codigoMudou || p.teste || (p.erros || []).length ? "" : `<button id="cc-testar" title="roda iniciar() e 3 passo() do código proposto, sem simular — o código roda neste computador: veja a diferença antes">▷ Testar</button>`}<button id="cc-aplicar" class="primario" ${bloqueio ? `disabled title="${escT(bloqueio)}"` : ""}>Aplicar</button><button id="cc-descartar">Descartar</button>`;
  const difs = muds.map((f) => `${muds.length > 1 ? `<div class="cc-diff-rot">${escT(f.arq)}${f.novo ? " (novo)" : ""}</div>` : ""}${htmlDiff(f.ops, muds.length > 1 ? 30 : 60)}`).join("");
  return `<div class="cc-prop"><h5>Proposta</h5><ul>${itens.map((x) => `<li>${x}</li>`).join("")}</ul>${difs}${opsMem ? `<div class="cc-diff-rot">memória do MaiSim</div>${htmlDiff(opsMem, 20)}` : ""}${conf.length ? `<ul>${conf.join("")}</ul>` : ""}<div class="cc-bts">${bts}</div></div>`;
}

// ---------------------------------------------------------------- ações
async function ccEnvia() {
  const t = $("cc-texto"), txt = t.value.trim();
  if (!txt || cc.enviando || (cc.estado && cc.estado.andamento)) return;
  if (!iaLogada()) { abreJanelaClaude(); return; }
  cc.enviando = true; cc.aviso = ""; desenhaChat();
  if (ctl.carregado && !editorPronto()) {               // o editor ainda carregando: espera (antes recusava e o pedido ficava na
    cc.aviso = "esperando o editor do controle carregar…"; desenhaChat();   // caixa — achado num teste que clicava cedo)
    for (let k = 0; k < 75 && !editorPronto(); k++) await new Promise((r) => setTimeout(r, 200));
    cc.aviso = "";
    if (!editorPronto()) { cc.enviando = false; cc.aviso = "o editor do controle não carregou: tente de novo"; desenhaChat(); return; }
  }
  try {
    if (ctl.carregado && !document.body.classList.contains("sim-rodando") && !(await guardaControle()))   // vai o que está na tela
      throw new Error(`não deu para guardar o controle antes: ${ctl.erroGuardar || "veja a linha de estado do controle.py"}`);
    cc.estado = await apiClaude("pedir", { texto: txt, dt: Number(sim.par.dt) || 1e-6, tfim: Number(sim.par.tfim) || 0, modelo: $("cc-modelo").value, esforco: $("cc-esforco").value,
      autonomo: Number($("cc-auto").value) || 0, ia: ccIA() });
    t.value = ""; cc.antes = null; cc.voltou = false;
  } catch (err) { cc.aviso = err.message; }
  finally { cc.enviando = false; }
  desenhaChat(); acompanhaChat();
}
// aplica a proposta: o código entra no editor como uma edição (Ctrl+Z no editor volta), e parâmetros, acionamentos,
// atuações marcadas e o "usar este controle" no painel; guarda tudo. "voltar ao de antes" desfaz as quatro coisas
async function ccVerMudanca(i) {
  let m; try { m = await apiClaude(`mudanca?i=${i}`); } catch (e) { cc.aviso = e.message; desenhaChat(); return; }
  const quando = new Date(m.quando * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  ccDiferenca(m, { historico: true, titulo: `Mudança aplicada em ${quando}${m.desfeita ? " (depois desfeita)" : ""} — controle.py`,
    sub: `pedido: ${(m.pedido || "").slice(0, 300)}${(m.pedido || "").length > 300 ? "…" : ""}` });
}
// aplicar só uma parte (Marcelo, 22/10: "aprovar/reprovar arquivo por arquivo"): op.recusados (os arquivos que ficam como
// estão — o novo recusado nem é criado, o apagado recusado fica) e op.semPars (os parâmetros, acionamentos e controladores
// ficam como estão). "voltar ao de antes" volta tudo, como sempre
function propostaParcial(p, op, c) {
  const rec = op.recusados || new Set(), atual = arquivosDoEditor();
  let arquivos = p.arquivos;
  if (arquivos && rec.size) { arquivos = Object.assign({}, p.arquivos);
    for (const a of rec) if (a !== "controle.py") { if (a in atual) arquivos[a] = atual[a]; else delete arquivos[a]; } }
  const pars = op.semPars ? { parametros: c.parametros, acionamentos: c.acionamentos || [] } : { parametros: p.parametros, acionamentos: p.acionamentos };
  return Object.assign({}, p, { codigo: rec.has("controle.py") ? codigoAtual() : p.codigo, arquivos }, pars, op.semPars ? { controladores: undefined, rede: undefined } : {});
}
async function ccAplica(op = {}) {
  const p0 = cc.estado && cc.estado.proposta;
  if (!p0 || !ctl.dados || cc.aplicando || cc.estado.aplicada || document.body.classList.contains("sim-rodando")) return;
  if (!ctl.carregado) await abreControle();
  if (!editorPronto()) { cc.aviso = "o editor do controle ainda está carregando: aplique daqui a pouco"; desenhaChat(); return; }
  const c = ctl.dados.controle, p = (op.recusados && op.recusados.size) || op.semPars ? propostaParcial(p0, op, c) : p0, igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ordena = (o) => Object.keys(o || {}).sort().map((k) => [k, o[k]]);
  const mudou = [codigoAtual() !== p.codigo_antes && "o código", !igual(c.parametros, p.parametros_antes) && "os parâmetros",
    !igual(c.acionamentos || [], p.acionamentos_antes || []) && "os acionamentos",
    p.arquivos && !igual(ordena(arquivosDoEditor()), ordena(p.arquivos_antes)) && "os outros arquivos",
    p.controladores && !igual(c.controladores || [], p.controladores_antes || []) && "os controladores"].filter(Boolean);
  if (mudou.length && !(await confirma("Aplicar a proposta", `Depois do pedido, ${mudou.join(" e ")} mudaram na tela. Aplicar troca pelo da proposta (o atual volta com “voltar ao de antes”).`, "Aplicar", false))) return;
  cc.aplicando = true;
  const memMudou = memoriaMudou(p);
  if (memMudou) {                                        // a memória mexida depois do pedido (botão "memória"): pergunta
    let atual = null; try { atual = (await apiClaude("memoria")).texto; } catch (e) { /* segue */ }
    if (atual !== null && atual.trim() !== (p.memoria_antes || "").trim() &&
        !(await confirma("Aplicar a proposta", "A memória do MaiSim mudou depois do pedido. Aplicar troca pela da proposta (a atual volta com “voltar ao de antes”).", "Aplicar", false))) { cc.aplicando = false; return; }
  }
  cc.antes = { codigo: codigoAtual(), parametros: JSON.parse(JSON.stringify(c.parametros)), acionamentos: JSON.parse(JSON.stringify(c.acionamentos || [])),
    atuacoes: [...c.atuacoes], ativo: !!c.ativo, arquivos: arquivosDoEditor(),
    controladores: JSON.parse(JSON.stringify(c.controladores || [])), rede: JSON.parse(JSON.stringify(c.rede || { latencia: 0 })) };
  if (memMudou) { try { cc.antes.memoria = (await apiClaude("memoria")).texto; } catch (e) { cc.antes.memoria = p.memoria_antes || ""; } }
  poeControle({ codigo: p.codigo, parametros: p.parametros, acionamentos: p.acionamentos, atuacoes: p.atuacoes || c.atuacoes, ativo: p.ligar ? true : c.ativo, arquivos: p.arquivos,
    ...(p.controladores ? { controladores: p.controladores, rede: p.rede } : {}) });
  try {
    if (await guardaControle()) {
      if (memMudou) { try { await apiClaude("memoria", { texto: p.memoria }); } catch (e) { cc.aviso = `memória: ${e.message}`; } }
      // o que foi de fato aplicado (com recusados, só a parte aceita): é o que o histórico guarda e o que um contexto leva
      try { cc.estado = await apiClaude("aplicada", { antes: { codigo: cc.antes.codigo, parametros: cc.antes.parametros, acionamentos: cc.antes.acionamentos, arquivos: cc.antes.arquivos,
        controladores: cc.antes.controladores, rede: cc.antes.rede },
        aplicado: { codigo: p.codigo, parametros: p.parametros, acionamentos: p.acionamentos, arquivos: p.arquivos,
          controladores: p.controladores || cc.antes.controladores, rede: p.controladores ? p.rede : cc.antes.rede },
        recusados: [...(op.recusados || [])].concat(op.semPars ? ["parâmetros, acionamentos e controladores"] : []) }); } catch (e) { /* ok */ }
    }
    else cc.aviso = "aplicada na tela, mas não deu para guardar (veja o controle.py)";
    if (!cc.aviso && op.recusados && op.recusados.size)
      cc.avisoOk = `aplicada em parte: ficaram como estavam ${[...op.recusados].join(", ")}${op.semPars ? " e os parâmetros" : ""} — rode o “testar”`;
    else if (!cc.aviso && op.semPars) cc.avisoOk = "aplicada sem os parâmetros, acionamentos e controladores — rode o “testar”";
  } finally { cc.aplicando = false; }
  desenhaChat();
}
async function ccVolta() {
  if (!cc.antes || document.body.classList.contains("sim-rodando")) return;
  const mem = cc.antes.memoria;
  poeControle(cc.antes); cc.antes = null; cc.voltou = true;
  if (mem !== undefined) { try { await apiClaude("memoria", { texto: mem }); } catch (e) { cc.aviso = `memória: ${e.message}`; } }
  await guardaControle();
  try { cc.estado = await apiClaude("desfeita", {}); } catch (e) { /* ok: só a marca no histórico */ }
  cc.desenhado = ""; desenhaChat();
}
function poeControle(x) {
  Object.assign(ctl.dados.controle, { parametros: x.parametros, acionamentos: x.acionamentos, atuacoes: x.atuacoes, ativo: x.ativo });
  if (x.controladores) Object.assign(ctl.dados.controle, { controladores: JSON.parse(JSON.stringify(x.controladores)), rede: x.rede || ctl.dados.controle.rede });
  if (x.arquivos) {                                      // os módulos da proposta (ou os de antes, ao voltar): cria, troca e tira
    ctl.calado = true;
    for (const a of ctl.lista.slice()) if (a !== "controle.py" && !(a in x.arquivos)) tiraArquivo(a);
    for (const [a, t] of Object.entries(x.arquivos)) { if (!ctl.lista.includes(a)) criaArquivo(a, t); else if (textoDe(a) !== t) poeCodigo(t, a); }
    ctl.calado = false;
    ctl.dados.controle.arquivos = Object.assign({}, x.arquivos);
  }
  desenhaLigacoes();
  if (ctl.editor) {
    mostraArquivo("controle.py");                        // a proposta é do controle.py (a aba aberta pode ser outra)
    const m = ctl.editor.getModel();
    if (m.getValue() !== x.codigo) { ctl.editor.pushUndoStop(); ctl.editor.executeEdits("claude", [{ range: m.getFullModelRange(), text: x.codigo }]); ctl.editor.pushUndoStop(); }
  } else poeCodigo(x.codigo);
}
const memoriaMudou = (p) => p.memoria !== undefined && (p.memoria || "").trim() !== (p.memoria_antes || "").trim();
// a memória do MaiSim: preferências e lições que valem em todas as conversas; o usuário lê e edita aqui
async function ccMemoria() {
  let txt; try { txt = (await apiClaude("memoria")).texto || ""; } catch (e) { cc.aviso = e.message; desenhaChat(); return; }
  const fundo = document.createElement("div"); fundo.className = "modal-fundo";
  fundo.innerHTML = `<div class="modal cc-mem" role="dialog" aria-modal="true"><h3>Memória da IA do MaiSim</h3>
    <p class="cc-dica-t">Vale em todas as conversas e circuitos: como você gosta dos controles, convenções, lições (ex.: “anti-windup por
    clamping”, “ganhos em V/A”, “Ts sempre múltiplo de 1/fsw”). A IA lê em todo pedido e pode propor linhas novas, que entram
    quando você aplica a proposta.</p><textarea class="cc-mem-txt" spellcheck="false" placeholder="- uma preferência por linha"></textarea>
    <div class="modal-botoes"><button class="m-fechar">Fechar</button><button class="m-guardar primario">Guardar</button></div></div>`;
  document.body.appendChild(fundo);
  const ta = fundo.querySelector("textarea"); ta.value = txt; ta.focus();
  const fecha = () => { removeEventListener("keydown", tecla, true); fundo.remove(); };
  const tecla = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fecha(); } else ev.stopPropagation(); };
  addEventListener("keydown", tecla, true);
  fundo.querySelector(".m-fechar").onclick = fecha;
  fundo.querySelector(".m-guardar").onclick = async () => {
    try { await apiClaude("memoria", { texto: ta.value }); fecha(); } catch (e) { fundo.querySelector(".cc-dica-t").textContent = e.message; }
  };
}
async function ccTesta() {
  const b = $("cc-testar"); if (b) { b.disabled = true; b.textContent = "testando…"; }
  try { cc.estado = await apiClaude("testar", { dt: Number(sim.par.dt) || 1e-6 }); } catch (e) { cc.aviso = e.message; cc.desenhado = ""; }
  desenhaChat();
}
async function ccDescarta() {
  try { cc.estado = await apiClaude("descartar", {}); } catch (e) { cc.aviso = e.message; }
  desenhaChat();
}
// a janela da diferença: a proposta de agora (com "aplicar") ou, do histórico, a mudança já aplicada (op.historico: só ver)
function ccDiferenca(p0, op = {}) {
  const p = op.historico ? p0 : cc.estado && cc.estado.proposta; if (!p) return;
  const fundo = document.createElement("div"); fundo.className = "modal-fundo"; fundo.style.paddingTop = "5vh";
  const pars = mudancasParametros(p.parametros_antes, p.parametros).concat(mudancasAcionamentos(p.acionamentos_antes, p.acionamentos).map((x) => `acionamento ${x}`), mudancasControladores(p));
  const rodando = document.body.classList.contains("sim-rodando");
  const modoDif = (() => { try { return localStorage.getItem("maisim-simu-dif-modo") === "lado" ? "lado" : "uni"; } catch (e) { return "uni"; } })();
  const muds = arquivosMudados(p); if (!muds.length) muds.push({ arq: "controle.py", antes: p.codigo_antes || "", depois: p.codigo || "", novo: false });
  const titulo = (op.titulo || "Proposta da IA — controle.py").replace(/ — controle\.py$/, muds.length > 1 ? "" : ` — ${muds[0].arq}`);
  const escolhe = !op.historico && !cc.estado.aplicada, porArq = escolhe && muds.length > 1, recusados = new Set();   // começa tudo aceito
  muds.forEach((f) => { f.apagado = !f.novo && !Object.assign({ "controle.py": p.codigo || "" }, p.arquivos || p.arquivos_antes || {}).hasOwnProperty(f.arq); });
  fundo.innerHTML = `<div class="modal cc-dif" role="dialog" aria-modal="true"><div class="cc-dif-cab"><h3>${escT(titulo)}</h3>
    ${porArq ? `<span class="grupo-bt cc-dif-escolha" title="este arquivo (a aba aberta): aplicar a mudança dele ou deixar como está"><button data-aceita="1">✓ Aceitar</button><button data-aceita="0">✗ Recusar</button></span>` : ""}
    <span class="grupo-bt cc-dif-modo"><button data-modo="uni" title="como o git diff: o que sai em vermelho, o que entra em verde">Unificado</button><button data-modo="lado" title="antes à esquerda, proposta à direita">Lado a lado</button></span></div>
    ${muds.length > 1 ? `<div class="grupo-bt cc-dif-arqs">${muds.map((f, i) => `<button data-i="${i}" title="${f.novo ? "arquivo novo" : f.apagado ? "a proposta apaga este arquivo" : "a diferença deste arquivo"}">${porArq ? '<i class="cc-dif-marca">✓</i>' : ""}${escT(f.arq)}${f.novo ? " (novo)" : f.apagado ? " (apagado)" : ""}</button>`).join("")}</div>` : ""}
    ${op.sub ? `<p class="cc-dif-sub">${escT(op.sub)}</p>` : ""}<div class="cc-dif-ed"></div>${pars.length ? `<div class="cc-dif-par"><b>Parâmetros, acionamentos e controladores</b>${escolhe ? ` <label class="cc-dif-pars-ok"><input type="checkbox" checked> Aplicar também</label>` : ""}<ul>${pars.map((x) => `<li>${escT(x)}</li>`).join("")}</ul></div>` : ""}
    ${porArq ? `<p class="cc-dif-parcial" hidden>os arquivos dependem uns dos outros (um nome que um muda, o outro usa): aplicar só parte pode quebrar — rode o “testar” depois</p>` : ""}
    <div class="modal-botoes"><button class="m-fechar">Fechar</button>${op.historico || cc.estado.aplicada ? "" : `<button class="m-aplicar primario" ${rodando ? "disabled" : ""}>Aplicar</button>`}</div></div>`;
  document.body.appendChild(fundo);
  const el = fundo.querySelector(".cc-dif-ed"); let dif = null, modelos = [], atual = 0;
  const voltaFoco = document.activeElement;
  const marca = () => {                                    // as abas (✓ / ✗), os botões do arquivo aberto, o "aplicar n de m"
    fundo.querySelectorAll(".cc-dif-arqs button").forEach((b) => { const r = recusados.has(muds[+b.dataset.i].arq);
      b.classList.toggle("recusado", r); const m = b.querySelector(".cc-dif-marca"); if (m) m.textContent = r ? "✗" : "✓"; });
    fundo.querySelectorAll(".cc-dif-escolha button").forEach((b) => b.classList.toggle("ativo", (b.dataset.aceita === "1") !== recusados.has(muds[atual].arq)));
    const ap = fundo.querySelector(".m-aplicar"), cb = fundo.querySelector(".cc-dif-pars-ok input"), comPars = !cb || cb.checked, n = muds.length - recusados.size;
    if (ap) { ap.textContent = recusados.size ? `Aplicar ${n} de ${muds.length}` : !comPars ? "Aplicar sem os parâmetros" : "Aplicar";
      ap.disabled = document.body.classList.contains("sim-rodando") || (!n && (!pars.length || !comPars)); }
    const av = fundo.querySelector(".cc-dif-parcial"); if (av) av.hidden = !recusados.size;
  };
  const mostraArq = (i) => {                               // a aba de um arquivo: a diferença dele
    const f = muds[i]; atual = i;
    fundo.querySelectorAll(".cc-dif-arqs button").forEach((b) => b.classList.toggle("ativo", +b.dataset.i === i));
    const ab = fundo.querySelector(`.cc-dif-arqs button[data-i="${i}"]`); if (ab) ab.scrollIntoView({ block: "nearest", inline: "nearest" });
    marca();
    if (dif) { const novos = [ctl.monaco.editor.createModel(f.antes, "python"), ctl.monaco.editor.createModel(f.depois, "python")];
      dif.setModel({ original: novos[0], modified: novos[1] }); modelos.forEach((m) => m.dispose()); modelos = novos; }
    else el.innerHTML = htmlDiff(diffLinhas(f.antes, f.depois), 100000);
  };
  if (ctl.monaco) dif = ctl.monaco.editor.createDiffEditor(el, { readOnly: true, automaticLayout: true, renderSideBySide: modoDif === "lado", minimap: { enabled: false },
      scrollBeyondLastLine: false, fontSize: 12.5, wordWrap: ctl.quebra ? "on" : "off", originalEditable: false });
  mostraArq(0);
  fundo.querySelectorAll(".cc-dif-arqs button").forEach((b) => { b.onclick = () => mostraArq(+b.dataset.i); });
  const marcaModo = (m) => fundo.querySelectorAll(".cc-dif-modo button").forEach((b) => b.classList.toggle("ativo", b.dataset.modo === m));
  marcaModo(modoDif);
  fundo.querySelectorAll(".cc-dif-modo button").forEach((b) => { b.onclick = () => {
    try { localStorage.setItem("maisim-simu-dif-modo", b.dataset.modo); } catch (e) { /* só agora */ }
    if (dif) dif.updateOptions({ renderSideBySide: b.dataset.modo === "lado" }); marcaModo(b.dataset.modo); }; });
  const fecha = () => { removeEventListener("keydown", tecla, true); if (dif) dif.dispose(); modelos.forEach((m) => m.dispose()); fundo.remove();
    if (voltaFoco && voltaFoco.isConnected) voltaFoco.focus(); };
  const tecla = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fecha(); } };
  addEventListener("keydown", tecla, true);
  fundo.addEventListener("mousedown", (ev) => { if (ev.target === fundo) fecha(); });
  fundo.querySelector(".m-fechar").onclick = fecha;
  fundo.querySelector(".m-fechar").focus();                 // o foco entra na janela (Enter/Espaço não acionam o que está atrás)
  fundo.querySelectorAll(".cc-dif-escolha button").forEach((b) => { b.onclick = () => {
    if (b.dataset.aceita === "1") recusados.delete(muds[atual].arq); else recusados.add(muds[atual].arq); marca(); }; });
  const cbPars = fundo.querySelector(".cc-dif-pars-ok input"); if (cbPars) cbPars.onchange = marca;
  marca();
  const ap = fundo.querySelector(".m-aplicar"); if (ap) ap.onclick = async () => {
    const op2 = { recusados: new Set(recusados), semPars: !!(cbPars && !cbPars.checked) }; fecha(); await ccAplica(op2); };
}
async function ccAnexa(arquivos) {
  const erros = [];                                      // os erros de todos os arquivos ficam (um sucesso não apaga o do outro)
  for (const f of arquivos) {
    if (f.size > 25 * 2 ** 20) erros.push(`${f.name}: maior que 25 MB`);
    else try {
      const b64 = await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => falha(r.error); r.readAsDataURL(f); });
      cc.estado = await apiClaude("anexo", { nome: f.name, dados: b64 });
    } catch (err) { erros.push(`${f.name}: ${err.message}`); }
    cc.aviso = erros.join(" · "); desenhaChat();
  }
}

// o divisor entre o código e a conversa (pedido de Marcelo, 19/10): ao lado muda a largura da conversa (--cc-w), embaixo a
// altura (--cc-h); guardado no navegador. As contas em pixels de CSS (o zoom do MaiSim muda a escala do mouse: k)
function divisorConversa() {
  const pc = $("painel-controle"), dv = $("cc-divisor"); if (!dv) return;
  try { for (const v of ["w", "h"]) { const x = localStorage.getItem(`maisim-simu-cc-${v}`); if (x) pc.style.setProperty(`--cc-${v}`, x); } } catch (e) { /* padrão */ }
  dv.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return; ev.preventDefault();
    const cl = $("ctl-claude"), embaixo = pc.classList.contains("cc-embaixo"), r = cl.getBoundingClientRect();
    const k = embaixo ? cl.offsetHeight / (r.height || 1) : cl.offsetWidth / (r.width || 1);
    const v0 = embaixo ? cl.offsetHeight : cl.offsetWidth, p0 = embaixo ? ev.clientY : ev.clientX;
    const max = embaixo ? pc.offsetHeight - 150 : pc.offsetWidth - ($("ctl-lado").offsetWidth || 0) - 300, min = embaixo ? 160 : 260;
    dv.classList.add("arrastando"); document.body.style.cursor = embaixo ? "row-resize" : "col-resize";
    let v = v0;
    const mexe = (e) => { v = Math.round(Math.max(min, Math.min(max, v0 - ((embaixo ? e.clientY : e.clientX) - p0) * k)));
      pc.style.setProperty(embaixo ? "--cc-h" : "--cc-w", `${v}px`); if (ctl.editor) ctl.editor.layout(); };
    const solta = () => { removeEventListener("mousemove", mexe); removeEventListener("mouseup", solta); dv.classList.remove("arrastando"); document.body.style.cursor = "";
      try { localStorage.setItem(embaixo ? "maisim-simu-cc-h" : "maisim-simu-cc-w", `${v}px`); } catch (e) { /* só agora */ }
      if (ctl.editor) ctl.editor.layout(); };
    addEventListener("mousemove", mexe); addEventListener("mouseup", solta);
  });
  dv.addEventListener("dblclick", () => {
    const v = pc.classList.contains("cc-embaixo") ? "h" : "w"; pc.style.removeProperty(`--cc-${v}`);
    try { localStorage.removeItem(`maisim-simu-cc-${v}`); } catch (e) { /* ok */ } if (ctl.editor) setTimeout(() => ctl.editor.layout(), 30);
  });
}
(function iniciaChat() {
  const painel = $("ctl-claude"); if (!painel) return;
  divisorConversa();
  for (const id of ["cc-modelo", "cc-esforco"]) {          // o modelo (de cada IA) e o esforço escolhidos ficam no navegador
    const chave = () => (id === "cc-modelo" ? chaveModelo(ccIA()) : `maisim-simu-${id}`);
    try { const v = localStorage.getItem(chave()); if (v !== null && [...$(id).options].some((o) => o.value === v)) $(id).value = v; } catch (e) { /* padrão */ }
    $(id).onchange = () => { try { localStorage.setItem(chave(), $(id).value); } catch (e) { /* só agora */ } };
  }
  $("cc-ia").onchange = () => { try { localStorage.setItem("maisim-simu-cc-ia", ccIA()); } catch (e) { /* só agora */ } ccModelos(); desenhaChat(); };
  if (cla.ias && cla.ias.length) { cc.ias = cla.ias; ccMontaIA(); }   // as IAs do MaiSim (o seletor e o nome de quem respondeu): atualizaIAs()
  $("ctl-claude-bt").onclick = () => ccAbre();
  $("cc-fechar").onclick = () => ccAbre(false);
  $("cc-memoria").onclick = ccMemoria;
  $("cc-lugar").onclick = () => { lugarMem = lugarEscolhido() === "lado" ? "embaixo" : "lado";
    try { localStorage.setItem("maisim-simu-claude-lugar", lugarMem); } catch (e) { /* só até recarregar */ } aplicaLugar(); };
  new ResizeObserver(() => { if (cc.aberto) aplicaLugar(); }).observe($("painel-controle"));
  $("cc-enviar").onclick = ccEnvia;
  $("cc-parar").onclick = async () => { try { cc.estado = await apiClaude("parar", {}); } catch (e) { cc.aviso = e.message; } desenhaChat(); acompanhaChat(); };
  $("cc-nova").onclick = async () => {
    if (cc.estado && cc.estado.andamento) return;
    if (!(await confirma("Nova conversa", "Começar uma conversa nova com a IA neste circuito? Ela esquece esta, e os anexos saem.", "Nova conversa", false))) return;
    try { cc.estado = await apiClaude("nova", {}); cc.antes = null; } catch (e) { cc.aviso = e.message; } desenhaChat();
  };
  $("cc-texto").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); ccEnvia(); } });
  $("cc-texto").addEventListener("paste", (ev) => {      // colar só uma imagem (um print de um diagrama): vira anexo; com texto junto, cola o texto
    const cb = ev.clipboardData; if (!cb || cb.getData("text/plain")) return;
    const imgs = [...cb.items].filter((x) => x.kind === "file" && /^image\//.test(x.type)).map((x) => x.getAsFile()).filter(Boolean);
    if (!imgs.length) return;
    ev.preventDefault();
    const hora = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
    ccAnexa(imgs.map((f, k) => new File([f], `imagem_${hora}${k ? `_${k}` : ""}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: f.type })));
  });
  $("cc-arq").onchange = (ev) => { ccAnexa([...ev.target.files]); ev.target.value = ""; };
  $("cc-anexar").onclick = () => $("cc-arq").click();
  // com a conversa aberta, um arquivo solto fora da coluna não abre no lugar do MaiSim
  for (const t of ["dragover", "drop"]) addEventListener(t, (ev) => {
    if (cc.aberto && ev.dataTransfer && [...ev.dataTransfer.types].includes("Files") && !painel.contains(ev.target)) {
      ev.preventDefault(); if (t === "drop") { cc.aviso = "solte o arquivo na conversa para anexar"; desenhaChat(); } }
  });
  let nArrasto = 0;
  painel.addEventListener("dragenter", (ev) => { if ([...ev.dataTransfer.types].includes("Files")) { nArrasto++; painel.classList.add("arrastando"); } });
  painel.addEventListener("dragleave", () => { if (--nArrasto <= 0) { nArrasto = 0; painel.classList.remove("arrastando"); } });
  painel.addEventListener("dragover", (ev) => { if ([...ev.dataTransfer.types].includes("Files")) ev.preventDefault(); });
  painel.addEventListener("drop", (ev) => { ev.preventDefault(); nArrasto = 0; painel.classList.remove("arrastando"); if (ev.dataTransfer.files.length) ccAnexa([...ev.dataTransfer.files]); });
  painel.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.tira) { try { cc.estado = await apiClaude("tira_anexo", { nome: b.dataset.tira }); } catch (e) { cc.aviso = e.message; } desenhaChat(); return; }
    if (b.dataset.mudanca) { ccVerMudanca(+b.dataset.mudanca); return; }
    ({ "cc-entrar": abreJanelaClaude, "cc-ver": ccDiferenca, "cc-testar": ccTesta, "cc-aplicar": ccAplica, "cc-descartar": ccDescarta, "cc-voltar": ccVolta }[b.id] || (() => {}))();
  });
  addEventListener("focus", () => { if (cc.aberto && !cc.timer) atualizaChat(); });
})();
