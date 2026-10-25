// MaiSim / simu — painel "Controle" (na doca, ao lado do scope): atuadores (blocos CONST que o código escreve), medidas,
// parâmetros, Ts e o código Python (editor Monaco, o do VS Code; sem internet, uma caixa de texto simples). A configuração
// é guardada no servidor a cada mudança (POST editor/controle) e vai junto quando o circuito é salvo; a rodada com o
// controle ligado chama passo() a cada Ts (servidor.py, laco_controle). Usa as funções globais do simu.js.
// o Monaco: o local (simu/vendor.sh baixa a versão fixa, enxuta, em static/vendor/monaco; os pacotes sempre o levam: funciona
// sem internet) ou, sem ele (a versão de programador antes do vendor.sh), o do CDN, na mesma versão
const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs";
const MONACO_LOCAL = new URL("static/vendor/monaco/vs", location.href).href;
let MONACO = MONACO_CDN;
const ctl = { dados: null, modelosIdioma: {}, carregado: false, editor: null, texto: null, monaco: null, timer: null, timerLig: null, guardando: null, quebra: quebraGuardada(),
  arq: "controle.py", lista: ["controle.py"], modelos: {}, textos: {}, vistas: {} };   // os arquivos do controle: um modelo do Monaco (ou um texto) por arquivo

// quebra de linha no editor (botão ao lado do "?", Alt+Z como no VS Code): as linhas longas continuam embaixo, sem rolar
// para o lado; a escolha fica no navegador
function quebraGuardada() { try { return localStorage.getItem("maisim-simu-quebra") === "1"; } catch (e) { return false; } }
function poeQuebra(on) {
  ctl.quebra = on;
  try { localStorage.setItem("maisim-simu-quebra", on ? "1" : "0"); } catch (e) { /* vale só até recarregar */ }
  const bt = $("ctl-quebra"); bt.classList.toggle("ativo", on); bt.setAttribute("aria-pressed", String(on));
  if (ctl.editor) ctl.editor.updateOptions({ wordWrap: on ? "on" : "off" });
  if (ctl.texto) ctl.texto.style.whiteSpace = on ? "pre-wrap" : "pre";   // sem o Monaco: a caixa de texto simples
}

function carregaMonaco() {
  return new Promise((ok, falha) => {
    if (window.monaco) return ok(window.monaco);
    const prazo = setTimeout(() => falha(new Error(tr("ctl.monaco_falhou"))), 15000);
    fetch(`${MONACO_LOCAL}/loader.js`).then((r) => r.ok, () => false).then((local) => { if (local) MONACO = MONACO_LOCAL; carrega(); });
    function carrega() {
    window.MonacoEnvironment = { getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(
      `self.MonacoEnvironment = { baseUrl: "${MONACO}/../" }; importScripts("${MONACO}/base/worker/workerMain.js");`)}` };
    const s = document.createElement("script"); s.src = `${MONACO}/loader.js`;
    s.onload = () => { window.require.config({ paths: { vs: MONACO } });
      window.require(["vs/editor/editor.main"], () => { clearTimeout(prazo); ok(window.monaco); }, (e) => { clearTimeout(prazo); falha(e); }); };
    s.onerror = () => { clearTimeout(prazo); falha(new Error(tr("ctl.monaco_falhou"))); };
    document.head.appendChild(s);
    }
  });
}

// o botão da coluna (a troca de idioma chama só este: sem regravar a escolha, que vale para as outras janelas)
function botaoLado(recolhido) {
  const bt = $("ctl-lado-bt"); bt.classList.toggle("ativo", recolhido); bt.setAttribute("aria-pressed", String(recolhido));
  bt.title = recolhido ? tr("ctl.t_lado_mostra") : tr("ctl.t_lado_bt");
  bt.querySelector(".seta").setAttribute("d", recolhido ? "M3.4 6.4 4.8 8 3.4 9.6" : "M4.6 6.4 3.2 8l1.4 1.6");
}
// a coluna da esquerda (variáveis | arquivos) recolhida: o editor fica com a largura toda; a escolha fica no navegador
function poeLado(recolhido) {
  $("painel-controle").classList.toggle("sem-lado", recolhido);
  botaoLado(recolhido);
  try { localStorage.setItem("maisim-simu-ctl-sem-lado", recolhido ? "1" : "0"); } catch (e) { /* vale até recarregar */ }
}
// os arquivos do controle (abas): o controle.py e os outros .py (outros controladores: aquisição, central, um por
// subcircuito…). No Monaco, um modelo por arquivo (cada um com o seu desfazer); sem ele, um texto por arquivo na caixa
const textoDe = (arq) => ctl.modelos[arq] ? ctl.modelos[arq].getValue() : arq === ctl.arq && ctl.texto ? ctl.texto.value : (ctl.textos[arq] ?? "");
const codigoAtual = () => textoDe("controle.py");
const travado = () => document.body.classList.contains("sim-rodando");
function arquivosDoEditor() { const o = {}; for (const a of ctl.lista) if (a !== "controle.py") o[a] = textoDe(a); return o; }
function poeCodigo(txt, arq = "controle.py") {
  if (travado()) return;
  if (ctl.modelos[arq]) { if (ctl.modelos[arq].getValue() !== txt) ctl.modelos[arq].setValue(txt); }
  else if (arq === ctl.arq && ctl.texto) ctl.texto.value = txt;
  else ctl.textos[arq] = txt;
}
function criaArquivo(arq, txt) {                         // um arquivo novo no editor (sem guardar: quem chama guarda)
  if (!ctl.lista.includes(arq)) ctl.lista = ["controle.py", ...ctl.lista.filter((a) => a !== "controle.py").concat(arq).sort()];
  if (ctl.monaco && ctl.editor) { if (!ctl.modelos[arq]) { ctl.modelos[arq] = ctl.monaco.editor.createModel(txt, "python", ctl.monaco.Uri.parse(`file:///maisim/${arq}`));
    ctl.modelos[arq].onDidChangeContent(() => { if (!ctl.calado) agendaGuardar(); }); } else ctl.modelos[arq].setValue(txt); }
  else ctl.textos[arq] = txt;
}
function tiraArquivo(arq) {
  if (ctl.arq === arq) mostraArquivo("controle.py", false);
  ctl.lista = ctl.lista.filter((a) => a !== arq);
  if (ctl.modelos[arq]) { ctl.modelos[arq].dispose(); delete ctl.modelos[arq]; }
  delete ctl.textos[arq]; delete ctl.vistas[arq];
}
function poeArquivos(c) {                                 // os arquivos de uma configuração (outro circuito, desfazer…) no editor
  const novos = Object.assign({ "controle.py": c.codigo }, c.arquivos || {});
  ctl.calado = true;
  for (const a of ctl.lista.slice()) if (!(a in novos)) tiraArquivo(a);
  for (const [a, t] of Object.entries(novos)) if (ctl.lista.includes(a)) poeCodigo(t, a); else criaArquivo(a, t);
  ctl.calado = false;
  mostraArquivo(ctl.lista.includes(ctl.arq) ? ctl.arq : "controle.py", false);   // a tabela à vista continua à vista
}
function mostraArquivo(arq, vaiAoCodigo = true) {        // troca a aba (o que está na caixa vai para o arquivo dele); abre a fechada
  if (!ctl.lista.includes(arq)) return;
  if (vaiAoCodigo && ctl.tabela) { ctl.tabela = null; guardaTabelas(); aplicaTabela(); }   // uma tabela à vista: volta ao código
  ctl.fechadas.delete(arq);
  if (ctl.editor && ctl.modelos[arq]) {
    if (ctl.editor.getModel() !== ctl.modelos[arq]) { ctl.vistas[ctl.arq] = ctl.editor.saveViewState(); ctl.editor.setModel(ctl.modelos[arq]);
      if (ctl.vistas[arq]) ctl.editor.restoreViewState(ctl.vistas[arq]); }
  } else if (ctl.texto && arq !== ctl.arq) { ctl.textos[ctl.arq] = ctl.texto.value; ctl.texto.value = ctl.textos[arq] ?? ""; }
  ctl.arq = arq;
  desenhaAbas(); desenhaEntradas();
  if (ctl.dados) marcaErros(ctl.dados.erros, ctl.dados.conferencia, false);
}
const arquivoDe = (x) => x.arquivo || "controle.py";
// uma lista com "e" no idioma da hora (pt: "a e b", en: "a and b")
const listaE = (l) => new Intl.ListFormat(maisimI18n.local(), { type: "conjunction" }).format(l);
// as abas são os arquivos ABERTOS (Marcelo, 19/10: "o × da aba é para fechar a aba; o × da lista, para excluir"): fechar só
// tira a aba (o arquivo fica na lista de arquivos; clicar nele reabre); o controle.py fica sempre aberto
ctl.fechadas = new Set();
const abasAbertas = () => ctl.lista.filter((a) => !ctl.fechadas.has(a));
function fechaAba(a) {
  if (a === "controle.py" || !ctl.lista.includes(a)) return;
  const abertas = abasAbertas(), i = abertas.indexOf(a);
  ctl.fechadas.add(a);
  if (ctl.arq === a) mostraArquivo(abertas[i - 1] || abertas[i + 1] || "controle.py", false); else desenhaAbas();
}
function desenhaAbas() {
  const d = ctl.dados || {}, comErro = new Set((d.erros || []).map(arquivoDe)), comAviso = new Set((d.conferencia || []).map(arquivoDe));
  if ($("ctl-ctls")) atualizaArvore();
  const ativa = (a) => !ctl.tabela && a === ctl.arq, chave = abasAbertas().join("|");
  if ($("ctl-abas").dataset.chave === chave) {          // as mesmas abas: só as classes (redesenhar no meio de um duplo clique perderia o segundo)
    for (const x of $("ctl-abas").querySelectorAll(".aba[data-arq]")) { const a = x.dataset.arq;
      x.classList.toggle("ativa", ativa(a)); x.classList.toggle("com-erro", comErro.has(a)); x.classList.toggle("com-aviso", comAviso.has(a));
      x.setAttribute("aria-selected", String(ativa(a))); }
    return;
  }
  $("ctl-abas").dataset.chave = chave;
  $("ctl-abas").innerHTML = abasAbertas().map((a) => `<button class="aba${ativa(a) ? " ativa" : ""}${comErro.has(a) ? " com-erro" : ""}${comAviso.has(a) ? " com-aviso" : ""}"
      role="tab" aria-selected="${ativa(a)}" data-arq="${escT(a)}" title="${a === "controle.py" ? "controle.py" : escT(tr("ctl.t_aba", { arq: a }))}">${escT(a)}${a === "controle.py" ? ""
      : `<span class="fecha" data-fecha-aba="${escT(a)}" title="${escT(tr("ctl.t_fecha_aba", { arq: a }))}">×</span>`}</button>`).join("") +
    `<button id="ctl-arq-novo" class="aba" title="${escT(tr("ctl.t_arq_novo_aba"))}">+</button>`;
}
// ---- variáveis em tabelas (Marcelo, 19/10: "a barra com atuações, medidas, parâmetros e acionamentos vai ficar ruim com
// muita coisa… mesma dinâmica dos arquivos"): a coluna "variáveis" é o índice, e a tabela escolhida aparece na área do
// código, sem aba ("nem precisa abrir nas abas"): um arquivo, o item de novo ou o ✕ da tabela voltam ao código. Ordenar (clique no título da coluna) e filtrar só mudam a vista: a
// ordem guardada é a do painel. "Onde é usado" lê os arquivos do editor (fora de comentário) e leva à linha
// os textos no idioma da hora (getters: trocar de idioma vale no próximo desenho)
const TABELAS = {
  ent: { get nome() { return tr("ctl.tab_ent"); }, sub: 'm["…"]', get dica() { return tr("ctl.tab_ent_dica"); } },
  par: { get nome() { return tr("ctl.tab_par"); }, sub: 'p["…"]', get dica() { return tr("ctl.tab_par_dica"); } },
  atu: { get nome() { return tr("ctl.tab_atu"); }, get sub() { return tr("ctl.tab_atu_sub"); }, get dica() { return tr("ctl.tab_atu_dica"); } },
  diag: { get nome() { return tr("ctl.tab_diag"); }, sub: "", get dica() { return tr("ctl.tab_diag_dica"); } },
  ac: { get nome() { return tr("ctl.tab_ac"); }, get sub() { return tr("ctl.tab_ac_sub"); }, get dica() { return tr("ctl.tab_ac_dica"); } },
};
const ICONE_TAB = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.2h12M2 9.8h12M6.5 6.2v7.3"/></svg>';
ctl.tabela = null; ctl.ordem = {}; ctl.filtro = {};
try { const g = JSON.parse(localStorage.getItem("maisim-simu-ctl-tabelas") || "null");
  if (g) { ctl.tabela = g.ativa in TABELAS ? g.ativa : null; ctl.ordem = g.ordem || {}; } } catch (e) { /* vale até recarregar */ }
function guardaTabelas() { try { localStorage.setItem("maisim-simu-ctl-tabelas", JSON.stringify({ ativa: ctl.tabela, ordem: ctl.ordem })); } catch (e) { /* ok */ } }
function mostraTabela(k) { if (!(k in TABELAS)) return; ctl.tabela = k; guardaTabelas(); aplicaTabela(); desenhaAbas(); }
function fechaTabela() { ctl.tabela = null; guardaTabelas(); aplicaTabela(); desenhaAbas(); }   // volta ao código
function aplicaTabela() {                                // a área do código mostra a tabela à vista (ou o diagrama, ou o editor)
  const k = ctl.tabela, diag = k === "diag";
  $("ctl-editor").style.display = k ? "none" : "";
  $("ctl-tabela").hidden = !k || diag; $("ctl-diagrama").hidden = !diag; $("ctl-diag-bt").classList.toggle("ativo", diag);
  $("ctl-modelo").style.display = $("ctl-quebra").style.display = k ? "none" : "";   // só valem para o código
  document.querySelectorAll("#ctl-tabela table.ct").forEach((t) => { t.hidden = t.dataset.t !== k; });
  document.querySelectorAll("#ctl-var-lista .ctl-vi").forEach((x) => x.classList.toggle("ativo", x.dataset.tabela === k));
  if (!k) return;
  if (diag) { desenhaDiagrama(); return; }
  $("ct-titulo").textContent = TABELAS[k].nome; $("ct-dica").title = TABELAS[k].dica;
  $("ctl-par-novo").style.display = k === "par" ? "" : "none"; $("ctl-ac-novo").style.display = k === "ac" ? "" : "none";
  $("ct-filtro").value = ctl.filtro[k] || ""; $("ct-filtro").placeholder = k === "ac" ? tr("ctl.ph_filtro_alvo") : tr("ctl.a_filtro");
  marcaOrdem(); filtraTabela();
}
function marcaOrdem() {
  for (const t of document.querySelectorAll("#ctl-tabela table.ct")) { const o = ctl.ordem[t.dataset.t];
    t.querySelectorAll("th[data-col]").forEach((th) => { const e = !!o && th.dataset.col === o.col; th.classList.toggle("ord", e); th.classList.toggle("desc", e && !!o.desc);
      th.title = e ? (o.desc ? tr("ctl.t_ord_desc") : tr("ctl.t_ord_cresc")) : tr("ctl.t_ordenar"); }); }
}
function filtraTabela() {
  const k = ctl.tabela; if (!k) return;
  const q = (ctl.filtro[k] || "").trim().toLowerCase();
  let n = 0, vis = 0;
  document.querySelectorAll(`#ctl-tabela table[data-t="${k}"] tbody tr[data-busca]`).forEach((lin) => { n++; const ok = !q || lin.dataset.busca.includes(q); lin.style.display = ok ? "" : "none"; vis += ok; });
  $("ct-filtro").title = q ? tr("ctl.n_de", { vis, total: n }) : "";
}
function ordenaLinhas(linhas, k) {                            // [{html, s: {coluna: valor}}]; sem ordem: a do painel (a guardada)
  const o = ctl.ordem[k]; if (!o) return linhas;
  return linhas.slice().sort((a, b) => { const x = a.s[o.col], y = b.s[o.col];
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), maisimI18n.local(), { numeric: true, sensitivity: "base" });
    return o.desc ? -r : r; });
}
// onde um nome aparece nos arquivos do editor (fora de comentário): [{arq, linha}]
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function usosNoCodigo(re) {
  const out = [];
  for (const a of ctl.lista) textoDe(a).split("\n").forEach((l, i) => { re.lastIndex = 0; let m;
    while ((m = re.exec(l))) { if (!l.slice(0, m.index).includes("#")) { out.push({ arq: a, linha: i + 1 }); break; } } });
  return out;
}
const usoPar = (n) => usosNoCodigo(new RegExp(`\\bp\\[\\s*["']${escRe(n)}["']\\s*\\]`, "g"));
const usoMed = (n) => usosNoCodigo(new RegExp(`["']${escRe(n)}["'](?!\\s*:)`, "g"));   // m["Va"], x["Va"] e listas ("Va", "Vb"); chave de dicionário de saída não
const usoAtu = (n) => usosNoCodigo(new RegExp(`["']${escRe(n)}["']\\s*:|\\[\\s*["']${escRe(n)}["']\\s*\\]\\s*=(?!=)`, "g"));
function htmlOndeUsa(u) {
  if (!u.length) return `<span class="sem-uso">${escT(tr("ctl.sem_uso"))}</span>`;
  let ant = null; const partes = u.slice(0, 8).map((x) => { const r = `<a data-vai="${escT(x.arq)}:${x.linha}" title="${escT(tr("ctl.t_abrir_linha", { arq: x.arq, linha: x.linha }))}">${x.arq === ant ? "" : `${escT(x.arq)}:`}${x.linha}</a>`; ant = x.arq; return r; });
  return partes.join("") + (u.length > 8 ? `<span class="sem-uso">+${u.length - 8}</span>` : "");
}
function vaiParaLinha(arq, linha) {
  mostraArquivo(arq);
  if (ctl.editor) { ctl.editor.revealLineInCenter(linha); ctl.editor.setPosition({ lineNumber: linha, column: 1 }); ctl.editor.focus(); }
}
// os modelos de código (o botão "Modelo", o arquivo novo, o leitura.py/escrita.py) vêm do servidor (simu/*_modelo.py e
// *_modelo.en.py), no idioma do pedido — o painel diz qual (lingua). Guardados por idioma, à parte do ctl.dados: um GET
// antigo ainda no caminho ao trocar o idioma troca o ctl.dados, mas não traz de volta os modelos do idioma de antes
function modelosCodigo() {
  const l = maisimI18n.lingua(), d = ctl.dados || {};
  if (d.lingua && d.modelos) ctl.modelosIdioma[d.lingua] = { lingua: d.lingua, modelo: d.modelo || "", modelos: d.modelos };
  return ctl.modelosIdioma[l] || { lingua: l, modelo: d.modelo || "", modelos: d.modelos || {} };
}
function buscaModelosCodigo() {                           // ao trocar o idioma (o cookie já é o novo)
  const l = maisimI18n.lingua();
  if (!ctl.dados || ctl.modelosIdioma[l]) return;
  api("editor/controle").then((j) => { if (j.lingua === l && j.modelos) ctl.modelosIdioma[l] = { lingua: l, modelo: j.modelo || "", modelos: j.modelos }; }).catch(() => {});
}
// arquivo novo = um MÓDULO (pedido de Marcelo, 19/10): o controle.py faz import e chama na mesma amostra, sem atraso; para um
// controlador à parte (outro DSP, com atraso nas mensagens), "virar controlador" na árvore
async function novoArquivo() {
  if (travado() || !ctl.carregado) return;
  let k = 1; while (ctl.lista.includes(`modulo${k}.py`)) k++;
  const r = await modal({ titulo: tr("ctl.novo_arq_titulo"), texto: tr("ctl.novo_arq_html"),
    campos: [{ nome: "nome", rotulo: tr("ctl.col_nome"), valor: `modulo${k}.py`, dica: tr("ctl.dica_nome_arq") }], ok: tr("ctl.criar") });
  if (!r) return;
  const nome = /\.py$/.test(r.nome.trim()) ? r.nome.trim() : r.nome.trim() + ".py";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,40}\.py$/.test(nome)) { poeEstado(tr("ctl.nome_arq_invalido"), "erro"); return; }
  if (ctl.lista.includes(nome)) { poeEstado(tr("ctl.ja_existe", { nome }), "erro"); return; }
  const c = coleta(); if (c.invalido) return;
  criaArquivo(nome, modelosCodigo().modelos.modulo || "");
  Object.assign(ctl.dados.controle, c, { arquivos: arquivosDoEditor() }); desenhaLigacoes(); mostraArquivo(nome); guardaControle();
  poeEstado(tr("ctl.modulo_criado", { arq: nome, mod: nomeDoArquivo(nome) }), "ok");
}
// circuito de antes dos módulos: cria o leitura.py e o escrita.py dos modelos (o controle.py não muda: quem chama é você ou o Claude)
function organizaDSP() {
  if (travado() || !ctl.carregado || !ctl.dados) return;
  const c = coleta(); if (c.invalido) return;
  const novos = ["leitura.py", "escrita.py"].filter((a) => !ctl.lista.includes(a));
  const ms = modelosCodigo().modelos;
  for (const a of novos) criaArquivo(a, ms[a] || "");
  Object.assign(ctl.dados.controle, c, { arquivos: arquivosDoEditor() }); desenhaLigacoes(); guardaControle();
  poeEstado(tr("ctl.dsp_criados", { arqs: listaE(novos) }), "ok");
}
async function renomeiaArquivo(a) {
  if (travado() || a === "controle.py") return;
  const r = await modal({ titulo: tr("ctl.renomear_titulo_html", { arq: a }), texto: tr("ctl.renomear_texto_html", { nome: nomeDoArquivo(a) }),
    campos: [{ nome: "nome", rotulo: tr("ctl.col_nome"), valor: a, dica: tr("ctl.dica_nome_arq") }], ok: tr("ctl.renomear") });
  if (!r) return;
  const nome = /\.py$/.test(r.nome.trim()) ? r.nome.trim() : r.nome.trim() + ".py";
  if (nome === a) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,40}\.py$/.test(nome) || nome === "controle.py") { poeEstado(tr("ctl.nome_arq_invalido"), "erro"); return; }
  if (ctl.lista.includes(nome)) { poeEstado(tr("ctl.ja_existe", { nome }), "erro"); return; }
  const c = coleta(); if (c.invalido) return;
  c.controladores.forEach((q) => { if (q.arquivo === a) { if (q.nome === nomeDoArquivo(a)) q.nome = nomeDoArquivo(nome); q.arquivo = nome; } });
  const txt = textoDe(a), ativo = ctl.arq === a;
  criaArquivo(nome, txt); tiraArquivo(a); Object.assign(ctl.dados.controle, c, { arquivos: arquivosDoEditor() });
  desenhaLigacoes(); mostraArquivo(ativo ? nome : ctl.arq); guardaControle();
}
async function apagaArquivo(a) {
  if (travado() || a === "controle.py") return;
  const c = coleta(); if (c.invalido) return;
  const usam = c.controladores.filter((q) => q.arquivo === a).map((q) => q.nome);
  if (!(await confirma(tr("ctl.apagar_titulo"), usam.length ? tr("ctl.apagar_texto_ctl_html", { arq: a, ctls: usam.join(", ") }) : tr("ctl.apagar_texto_html", { arq: a }), tr("ctl.apagar"), true))) return;
  c.controladores = c.controladores.filter((q) => q.arquivo !== a); enxuga(c);
  tiraArquivo(a); Object.assign(ctl.dados.controle, c, { arquivos: arquivosDoEditor() }); desenhaLigacoes(); desenhaAbas(); guardaControle();
}
function insereNoCodigo(txt) {
  if (document.body.classList.contains("sim-rodando")) return;
  if (ctl.tabela) mostraArquivo(ctl.arq);                // de uma tabela: volta ao arquivo aberto e insere no cursor
  if (ctl.editor) { ctl.editor.focus(); ctl.editor.trigger("maisim", "type", { text: txt }); return; }
  if (ctl.texto) { const t = ctl.texto, i = t.selectionStart; t.setRangeText(txt, i, t.selectionEnd, "end"); t.focus(); agendaGuardar(); }
}
// erros (sintaxe, ou o da rodada/teste) em vermelho; a conferência do validador (p[...] sem parâmetro, m[...] que não é medida,
// atuação não marcada) em amarelo, só no trecho
function marcaErros(erros, conferencia = (ctl.dados && ctl.dados.conferencia) || [], revela = true) {
  if (ctl.editor && ctl.monaco) {                       // cada erro ou aviso no modelo do arquivo dele
    const S = ctl.monaco.MarkerSeverity;
    for (const [a, m] of Object.entries(ctl.modelos)) {
      ctl.monaco.editor.setModelMarkers(m, "maisim", (erros || []).filter((e) => arquivoDe(e) === a).map((e) => ({ startLineNumber: e.linha || 1, startColumn: e.coluna || 1,
        endLineNumber: e.linha || 1, endColumn: 1000, message: e.msg, severity: S.Error })).concat((conferencia || []).filter((c) => arquivoDe(c) === a).map((c) => ({
        startLineNumber: c.linha, startColumn: c.coluna, endLineNumber: c.linha, endColumn: Math.max(c.fim || c.coluna + 1, c.coluna + 1), message: c.msg, severity: S.Warning }))));
    }
    const aqui = (erros || []).filter((e) => arquivoDe(e) === ctl.arq);
    if (revela && aqui.length) ctl.editor.revealLineInCenterIfOutsideViewport(aqui[0].linha || 1);
  }
  if (ctl.carregado) desenhaAbas();
}
// a linha de estado do editor: guardado, erro de sintaxe, ou quantos avisos do validador (sublinhados)
// a linha de estado do editor (texto, cor e a dica com o texto inteiro), num lugar só
// ctl.estadoDoCodigo: a linha mostra o que estadoCodigo() escreveu (a troca de idioma refaz só esse; uma mensagem de agora fica)
function poeEstado(texto, classe = "", dica = texto) { const el = $("ctl-estado"); el.textContent = texto; el.className = classe; el.title = dica; ctl.estadoDoCodigo = false; }
function estadoCodigo(j) {
  const e = j.erros[0], cf = j.conferencia || [], n = cf.length, varios = ctl.lista.length > 1;
  const onde = (x) => varios ? tr("ctl.onde_arq", { arq: arquivoDe(x), linha: x.linha }) : tr("ctl.onde", { linha: x.linha });
  const dica = n > 1 ? cf.slice(0, 8).map((c) => `${onde(c)}: ${c.msg}`).join("\n") + (n > 8 ? `\n${tr("ctl.e_mais", { n: n - 8 })}` : "") : null;
  poeEstado(e ? tr("ctl.erro_sintaxe", { onde: onde(e), msg: e.msg })
    : n ? tr("ctl.guardado_avisos", { n, onde: onde(cf[0]), msg: cf[0].msg })
    : j.avisos.length ? tr("ctl.guardado_ver_avisos") : tr("ctl.guardado"), e ? "erro" : n ? "aviso" : "ok", ...(dica ? [dica] : []));
  ctl.estadoDoCodigo = true;
}

async function criaEditor(c) {
  const todos = Object.assign({ "controle.py": c.codigo }, c.arquivos || {});
  ctl.lista = ["controle.py", ...Object.keys(c.arquivos || {}).filter((a) => a !== "controle.py").sort()]; ctl.arq = "controle.py";
  try {
    const monaco = ctl.monaco = await carregaMonaco();
    $("ctl-editor").innerHTML = "";
    addEventListener("maisim-tema", () => monaco.editor.setTheme(temaAtual() === "escuro" ? "vs-dark" : "vs"));   // o tema do MaiSim
    for (const a of ctl.lista) { ctl.modelos[a] = monaco.editor.createModel(todos[a], "python", monaco.Uri.parse(`file:///maisim/${a}`));
      ctl.modelos[a].onDidChangeContent(() => { if (!ctl.calado) agendaGuardar(); }); }
    ctl.editor = monaco.editor.create($("ctl-editor"), { model: ctl.modelos["controle.py"], automaticLayout: true, fontSize: 13, theme: temaAtual() === "escuro" ? "vs-dark" : "vs",
      minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 4, insertSpaces: true, lineNumbersMinChars: 3,
      renderLineHighlight: "line", fixedOverflowWidgets: true, wordWrap: ctl.quebra ? "on" : "off", wrappingIndent: "indent" });
    ctl.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { guardaControle().then(() => salvar()); });
    ctl.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { guardaControle().then(() => iniciaSim()); });
    ctl.editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => poeQuebra(!ctl.quebra));
    // autocompletar: m["…"] medidas, p["…"] parâmetros, as atuações (chaves do dicionário que passo() devolve), scope()
    monaco.languages.registerCompletionItemProvider("python", { triggerCharacters: ['"', "'", "["],
      provideCompletionItems(model, pos) {
        const antes = model.getValueInRange({ startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: pos.column });
        const w = model.getWordUntilPosition(pos), range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
        const K = monaco.languages.CompletionItemKind, d = ctl.dados || { entradas: [], controle: { parametros: [], atuacoes: [] } };
        const item = (label, kind, detail, insertText = label) => ({ label, kind, detail, insertText, range });
        const v = visaoDoArquivo(model.uri.path.split("/").pop());          // as medidas e atuações do controlador deste arquivo
        let s;
        if (/\bm\[["'][\w.]*$/.test(antes)) s = (v ? v.medidas : d.entradas).map((n) => item(n, K.Field, tr("ctl.leg_medida")));
        else if (/\bp\[["'][\w]*$/.test(antes)) s = d.controle.parametros.map((q) => item(q.nome, K.Constant, tr("ctl.ac_parametro", { valor: q.valor, unidade: q.unidade || "" }))).concat([item("Ts", K.Constant, tr("ctl.ac_ts"))],
          v ? [item("id", K.Constant, tr("ctl.ac_id"))] : []);
        else if (/\benvia\(["'][\w]*$/.test(antes)) s = (d.instancias || []).map((i) => item(i.nome, K.Module, tr("ctl.ac_controlador", { arq: i.arquivo })));
        else if (/["'][\w]*$/.test(antes)) s = (v ? v.atuacoes : d.controle.atuacoes).map((n) => item(n, K.Property, tr("ctl.ac_atuacao")));
        else s = [item('m["…"]', K.Snippet, tr("ctl.ac_uma_medida"), 'm["${1}"]'), item('p["…"]', K.Snippet, tr("ctl.ac_um_parametro"), 'p["${1}"]'),
                  item("scope", K.Function, tr("ctl.ac_scope"), 'scope("${1:nome}", ${2:valor})'),   // os ${n:…}: o texto que entra no código (como o da API)
                  item("envia", K.Function, tr("ctl.ac_envia"), 'envia("${1:para}", {"${2:x}": ${3:valor}})'),
                  item("recebe", K.Function, tr("ctl.ac_recebe"), "recebe()")]
                  .map((x) => Object.assign(x, { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }));
        return { suggestions: s };
      } });
  } catch (e) {                                          // sem o Monaco: caixa de texto simples (o resto funciona igual)
    $("ctl-editor").innerHTML = `<textarea id="ctl-texto" spellcheck="false"></textarea>`;
    ctl.modelos = {}; ctl.textos = Object.assign({}, todos);
    ctl.texto = $("ctl-texto"); ctl.texto.value = todos["controle.py"]; ctl.texto.addEventListener("input", agendaGuardar);
    ctl.texto.style.whiteSpace = ctl.quebra ? "pre-wrap" : "pre";
    ctl.texto.addEventListener("keydown", (ev) => {
      if (ev.key === "Tab") { ev.preventDefault(); insereNoCodigo("    "); }
      else if (ev.altKey && !ev.ctrlKey && ev.code === "KeyZ") { ev.preventDefault(); poeQuebra(!ctl.quebra); } });
    saidaControle(() => tr("ctl.sem_monaco", { msg: e.message }), "aviso");
  }
}

// a coluna da esquerda: liga/desliga, Ts, atuadores, medidas e parâmetros
function desenhaLigacoes() {
  const d = ctl.dados; if (!d) return;
  const c = d.controle, dt = Number(sim.par.dt) || 1e-6;
  $("ctl-ativo").checked = !!c.ativo;
  if (document.activeElement !== $("ctl-ts")) $("ctl-ts").value = c.Ts;
  infoTs();
  const marcados = new Set(c.atuacoes), vazio = (n, txt) => `<tr><td colspan="${n}" class="vazio">${txt}</td></tr>`;
  const acDe = (n) => (c.acionamentos || []).filter((q) => q.alvo === `CONST:${n}`).map((q) => `t = ${q.t} s → ${q.valor}`).join(" · ");
  const lAtu = d.atuadores.map((a) => { const dest = destinoTexto(a), u = usoAtu(a.nome), m = marcados.has(a.nome);
    return { s: { marc: m ? 0 : 1, nome: a.nome, bloco: a.bloco, destino: dest, uso: u.length, ac: acDe(a.nome) },
      html: `<tr class="ctl-item" data-busca="${escT(`${a.nome} ${a.bloco}`.toLowerCase())}" title="${escT(tr("ctl.t_atu_linha", { bloco: a.bloco }))}">
        <td><input type="checkbox" data-atu="${escT(a.nome)}" ${m ? "checked" : ""} aria-label="${escT(tr("ctl.a_marcar", { nome: a.nome }))}"></td><td><code>${escT(a.nome)}</code></td><td><code>${escT(a.bloco)}</code></td>
        <td class="dest">${escT(dest)}</td><td class="uso">${htmlOndeUsa(u)}</td><td class="dest">${escT(acDe(a.nome) || "—")}</td></tr>` }; })
    .concat(c.atuacoes.filter((x) => !d.atuadores.some((a) => a.nome === x)).map((x) => ({ s: { marc: 0, nome: x, bloco: "", destino: "", uso: usoAtu(x).length },
      html: `<tr class="ctl-item fora" data-busca="${escT(x.toLowerCase())}"><td><input type="checkbox" data-atu="${escT(x)}" checked></td><td><code>${escT(x)}</code></td><td></td>
        <td class="dest">${escT(d.circuito ? tr("ctl.nao_no_circuito") : tr("ctl.abra_edicao_conferir"))}</td><td class="uso">${htmlOndeUsa(usoAtu(x))}</td><td></td></tr>` })));
  $("ctl-atu").innerHTML = ordenaLinhas(lAtu, "atu").map((x) => x.html).join("") ||
    vazio(6, escT(d.circuito ? tr("ctl.sem_const") : tr("ctl.abra_edicao_blocos")));
  desenhaEntradas(); desenhaControladores();
  const lPar = c.parametros.map((q, i) => { const u = q.nome ? usoPar(q.nome) : [];
    return { s: { nome: q.nome, valor: Number(q.valor), unidade: q.unidade || "", uso: u.length },
      html: `<tr class="ctl-par" data-i="${i}" data-busca="${escT(q.nome.toLowerCase())}">
        <td><input data-k="nome" value="${escT(q.nome)}" placeholder="${escT(tr("ctl.ph_nome"))}" title="${escT(tr("ctl.t_par_nome"))}"></td><td><input data-k="valor" value="${q.valor}" placeholder="${escT(tr("ctl.ph_valor"))}"></td>
        <td><input data-k="unidade" value="${escT(q.unidade || "")}" placeholder="${escT(tr("ctl.ph_unidade"))}"></td><td class="uso">${htmlOndeUsa(u)}</td>
        <td><button class="rm" data-rm="${i}" title="${escT(tr("ctl.t_tirar_nome", { nome: q.nome }))}">×</button></td></tr>` }; });
  $("ctl-par").innerHTML = ordenaLinhas(lPar, "par").map((x) => x.html).join("") || vazio(5, escT(tr("ctl.sem_par")));
  const at = c.atraso || { modo: "logo", tempo: 0 };
  $("ctl-atraso").value = at.modo; $("ctl-atraso-tempo").style.display = at.modo === "tempo" ? "" : "none";
  if (document.activeElement !== $("ctl-atraso-t")) $("ctl-atraso-t").value = at.tempo || "";
  infoAtraso();
  // acionamentos: alvo = um bloco CONST (qualquer um) ou um parâmetro do controle
  const alvos = d.atuadores.map((a) => [`CONST:${a.nome}`, `${a.nome} (${a.bloco})`]).concat(c.parametros.map((q) => [`p:${q.nome}`, `p["${q.nome}"]`]));
  const lAc = (c.acionamentos || []).map((q, i) => { const rot = (alvos.find(([v]) => v === q.alvo) || [q.alvo, tr("ctl.nao_existe", { alvo: q.alvo })])[1];
    const escrito = /^CONST:/.test(q.alvo) && c.atuacoes.includes(q.alvo.slice(6));
    const obs = escrito ? tr("ctl.obs_escrito") : /^p:/.test(q.alvo) ? tr("ctl.obs_par") : tr("ctl.obs_const");
    return { s: { t: Number(q.t), alvo: rot, valor: Number(q.valor), obs },
      html: `<tr class="ctl-ac" data-i="${i}" data-busca="${escT(rot.toLowerCase())}">
        <td><input data-k="t" value="${q.t}" placeholder="t (s)" title="${escT(tr("ctl.t_instante"))}"></td>
        <td><select data-k="alvo">${alvos.some(([v]) => v === q.alvo) ? "" : `<option value="${escT(q.alvo)}">${escT(tr("ctl.nao_existe", { alvo: q.alvo }))}</option>`}${alvos.map(([v, r]) => `<option value="${escT(v)}" ${v === q.alvo ? "selected" : ""}>${escT(r)}</option>`).join("")}</select></td>
        <td><input data-k="valor" value="${q.valor}" placeholder="${escT(tr("ctl.ph_valor"))}"></td><td class="dest${escrito ? " alerta" : ""}">${escT(obs)}</td><td><button class="rm" data-rm-ac="${i}" title="${escT(tr("ctl.t_tirar"))}">×</button></td></tr>` }; });
  $("ctl-ac").innerHTML = ordenaLinhas(lAc, "ac").map((x) => x.html).join("") || vazio(5, escT(tr("ctl.sem_ac")));
  $("ctl-avisos").innerHTML = avisosDoPainel(d.avisos, d.compartilhados) + avisoSemEsquema();
  desenhaIndice(); filtraTabela();
}
// o índice da coluna "variáveis": cada tabela com o quanto tem (e um alerta: atuação escrita e não marcada, parâmetro sem uso)
function desenhaIndice() {
  const d = ctl.dados; if (!d) return;
  const c = d.controle, nA = d.atuadores.length, nM = c.atuacoes.filter((x) => d.atuadores.some((a) => a.nome === x)).length;
  const naoMarcada = (d.conferencia || []).some((x) => x.codigo === "atuacao_nao_marcada");
  const semUso = c.parametros.filter((q) => q.nome && !usoPar(q.nome).length).length;
  const conflito = (c.acionamentos || []).filter((q) => /^CONST:/.test(q.alvo) && c.atuacoes.includes(q.alvo.slice(6))).length;
  const itens = [["ent", String(d.entradas.length), false, tr("ctl.vi_medidas", { n: d.entradas.length })],
    ["par", String(c.parametros.length), false, semUso ? tr("ctl.vi_sem_uso", { n: semUso }) : tr("ctl.vi_parametros", { n: c.parametros.length })],
    ["atu", nA ? `${nM}/${nA}` : "0", naoMarcada, naoMarcada ? tr("ctl.vi_nao_marcada") : tr("ctl.vi_marcadas", { m: nM, total: nA })],
    ["ac", String((c.acionamentos || []).length), conflito > 0, conflito ? tr("ctl.vi_conflito", { n: conflito }) : tr("ctl.vi_acionamentos", { n: (c.acionamentos || []).length })]];
  $("ctl-var-lista").innerHTML = itens.map(([k, n, alerta, dica]) => `<div class="ctl-vi${ctl.tabela === k ? " ativo" : ""}${alerta ? " alerta" : ""}" data-tabela="${k}" role="button" tabindex="0"
    title="${escT(tr(ctl.tabela === k ? "ctl.t_vi_ativo" : "ctl.t_vi", { dica }))}">${ICONE_TAB}<span>${TABELAS[k].nome} <small>${escT(TABELAS[k].sub)}</small></span><span class="n">${alerta ? "⚠ " : ""}${n}</span></div>`).join("");
}
// o que o código de um arquivo enxerga: as medidas e atuações (nomes locais) dos controladores que usam o arquivo; null:
// tudo (um controlador só, o de sempre); sem controlador, listas vazias (nenhum = true)
function visaoDoArquivo(arq = ctl.arq) {
  const d = ctl.dados; if (!d || !d.instancias || !(d.controle.controladores || []).length) return null;
  const vs = d.instancias.filter((i) => i.arquivo === arq);
  return { medidas: [...new Set(vs.flatMap((i) => i.medidas || []))].sort(), atuacoes: [...new Set(vs.flatMap((i) => i.atuacoes || []))].sort(),
    instancias: vs.map((i) => i.nome), nenhum: !vs.length };
}
function desenhaEntradas() {                            // a tabela das medidas: todas as do circuito, quem lê (os controladores) e onde
  const d = ctl.dados; if (!d) return;
  const insts = d.instancias || [], lidaPor = (x) => insts.filter((i) => !i.medidas || i.medidas.includes(x)).map((i) => i.nome);
  $("ctl-ent").closest("table").classList.toggle("um-ctl", !(d.controle.controladores || []).length);   // um controlador só: sem a coluna
  const l = d.entradas.map((x) => { const u = usoMed(x), por = lidaPor(x);
    return { s: { nome: x, por: por.join(", "), uso: u.length },
      html: `<tr data-busca="${escT(x.toLowerCase())}"><td><code>${escT(x)}</code></td><td class="dest col-ctl">${escT(por.join(", ") || tr("ctl.nenhum"))}</td><td class="uso">${htmlOndeUsa(u)}</td></tr>` }; });
  $("ctl-ent").innerHTML = ordenaLinhas(l, "ent").map((x) => x.html).join("") ||
    `<tr><td colspan="3" class="vazio">${escT(d.circuito ? tr("ctl.sem_medidas") : tr("ctl.abra_edicao_medidas"))}</td></tr>`;
  filtraTabela();
}
// a coluna "arquivos": a árvore dos .py. Cada arquivo é um controlador (o nome dele é o do arquivo sem o .py: o destino de
// envia e o p["id"]); embaixo, o que ele lê, o que escreve e os subcircuitos em que vale (uma instância por subcircuito,
// com o mesmo código). Cada controlador roda no seu processo, todos juntos a cada amostra; conversam por envia/recebe.
// Sem nenhum na lista, o controle.py de sempre: lê todas as medidas e escreve as atuações marcadas
const ICONE_ARQ = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M9 1.8V5h3.5"/></svg>';
const nomeDoArquivo = (a) => a.replace(/\.py$/, "");
const ehModulo = (a) => ((ctl.dados && ctl.dados.modulos) || []).includes(a);
// o que um destino lê de uma mensagem (a dica da mensagem, no cartão e no diagrama)
function leMsg(p, chaves, le) {
  const sim = chaves.filter((k) => le.has(k)), nao = chaves.filter((k) => !le.has(k)), l = sim.join(", ") || tr("ctl.nada_disso");
  return nao.length ? tr("ctl.le_msg_nao", { p, le: l, nao: nao.join(", ") }) : tr("ctl.le_msg", { p, le: l });
}
function desenhaControladores() {
  const d = ctl.dados, c = d.controle, cs = c.controladores || [];
  const subs = typeof dados !== "undefined" && dados && dados.folhas ? Object.entries(dados.folhas).filter(([k]) => k !== "0").map(([, f]) => f.nome) : [];
  const caixa = (attr, x, on, rot = x, extra = "", dica = "") => `<label${dica ? ` title="${escT(dica)}"` : ""}><input type="checkbox" ${attr}="${escT(x)}" ${on ? "checked" : ""} ${extra}>${escT(rot)}</label>`;
  const unico = (a) => [...new Set(a)];
  // o que estava aberto continua aberto ao redesenhar (marcar uma medida guarda e redesenha)
  const antes = $("ctl-ctls").querySelector(".ctl-ctl") ? new Set([...$("ctl-ctls").querySelectorAll(".ctl-ctl details[open]")].map((x) => `${x.closest(".ctl-ctl").dataset.i}:${x.dataset.g}`)) : null;
  const aberto = (i, g, padrao) => (antes ? antes.has(`${i}:${g}`) : padrao) ? "open" : "";
  const comErro = new Set((d.erros || []).map(arquivoDe));
  const semCircuito = !d.circuito && !d.entradas.length;
  const msgs = cs.length ? mensagensDe(cs) : {}, lat = (c.rede && c.rede.latencia) || 0;
  const quando = lat > 0 ? tr("ctl.quando_fibra", { t: si(lat, "s") }) : tr("ctl.quando_seguinte");
  const oQue = (x) => x.chaves.length ? x.chaves.map((k) => `<code>${escT(k)}</code>`).join(", ") : x.livre ? `<i>${escT(tr("ctl.uma_mensagem"))}</i>` : "<i>{}</i>";
  // o tooltip (Marcelo, 19/10: "passar o mouse e ver o que estou enviando"): as linhas do código do envia, o que vai e o
  // que cada destino lê da mensagem
  const dicaMsg = (de, para, chaves, codigo) => [tr("ctl.dica_msg", { de, para: para.join(", "), chaves: chaves.length ? chaves.join(", ") : tr("ctl.conteudo_ilegivel"), quando }),
    ...[...new Set(codigo)].map((x) => `  ${x}`),
    ...para.filter((p) => msgs[p]).map((p) => leMsg(p, chaves, msgs[p].le))].join("\n");
  const linhasMsg = (q) => { const m = msgs[q.nome]; if (!m) return "";
    // quem manda o mesmo para vários aparece numa linha só (theta → sm_ap_1, sm_an_1)
    const grupos = []; for (const e of m.envia) { const k = oQue(e), g = grupos.find((x) => x.k === k); if (g) { g.para.push(e.para); g.codigo.push(...e.codigo); } else grupos.push({ k, para: [e.para], chaves: e.chaves, codigo: [...e.codigo] }); }
    const lidas = (r) => r.chaves.length ? r.chaves.map((k) => m.le.has(k) ? `<code>${escT(k)}</code>` : `<code class="nao-le" title="${escT(tr("ctl.t_chega_nao_le", { nome: q.nome }))}">${escT(k)}</code>`).join(", ") : oQue(r);
    return m.recebe.map((r) => `<div class="grupo ctl-msg" title="${escT(dicaMsg(r.de, [q.nome], r.chaves, r.codigo || []))}">
        <b>${escT(tr("ctl.g_recebe"))}</b> ${lidas(r)} ← ${escT(r.de)}${m.chamaRecebe ? "" : ` <span class="alerta" title="${escT(tr("ctl.t_sem_recebe"))}">${escT(tr("ctl.sem_recebe"))}</span>`}</div>`).join("") +
      grupos.map((g) => `<div class="grupo ctl-msg" title="${escT(dicaMsg(q.nome, g.para, g.chaves, g.codigo))}">
        <b>${escT(tr("ctl.g_envia"))}</b> ${g.k} → ${g.para.map((p) => msgs[p] ? escT(p) : `<span class="alerta" title="${escT(tr("ctl.t_sem_destino", { nome: p }))}">⚠ ${escT(p)}</span>`).join(", ")} <small>(${quando})</small></div>`).join("");
  };
  const cartao = (q, i) => {
    const ent = unico([...d.entradas, ...q.medidas]), atus = unico([...c.atuacoes, ...q.atuacoes]), ss = unico([...subs, ...q.subcircuitos]);
    // o que vem do código fica marcado e travado (o cartão segue o código); a atuação que o código de outro escreve, travada fora
    const dc = (d.do_codigo || {})[q.nome] || { medidas: [], atuacoes: [] };
    const deOutro = (a) => (Object.entries(d.do_codigo || {}).find(([n, v]) => n !== q.nome && v.atuacoes.includes(a)) || [])[0];
    const medCaixa = (x) => q.todas ? caixa("data-med", x, true, x, "disabled")
      : dc.medidas.includes(x) ? caixa("data-med", x, true, x, "disabled data-codigo", tr("ctl.dica_cod_le", { ctl: q.nome, x })) : caixa("data-med", x, q.medidas.includes(x));
    const atuCaixa = (x) => dc.atuacoes.includes(x) ? caixa("data-atu-ctl", x, true, x, "disabled data-codigo", tr("ctl.dica_cod_esc", { ctl: q.nome, x }))
      : deOutro(x) ? caixa("data-atu-ctl", x, false, x, "disabled", tr("ctl.dica_cod_outro", { ctl: deOutro(x), x })) : caixa("data-atu-ctl", x, q.atuacoes.includes(x));
    const insts = (d.instancias || []).filter((x) => x.controlador === q.nome);
    const resumo = q.subcircuitos.length ? tr(insts.length > 1 ? "ctl.resumo_insts" : "ctl.resumo_inst", { n: insts.length, nomes: insts.map((x) => x.nome).join(", ") }) +
      (insts[0] && insts[0].medidas ? tr("ctl.resumo_cada", { le: insts[0].medidas.join(", ") || tr("ctl.nada"), esc: insts[0].atuacoes.join(", ") || tr("ctl.nada") }) : "") : "";
    const curto = (l) => l.length > 3 ? `${l.slice(0, 3).join(", ")} +${l.length - 3}` : l.join(", ");   // muitas: os 3 primeiros e quantas mais
    const le = q.todas ? tr("ctl.todas") : curto(q.medidas) || (q.subcircuitos.length ? tr("ctl.as_do_sub") : tr("ctl.nada"));
    return `<div class="ctl-ctl" data-i="${i}" data-nome="${escT(q.nome)}" data-arquivo="${escT(q.arquivo)}">
      ${q.nome !== nomeDoArquivo(q.arquivo) ? `<div class="inst">${escT(tr("ctl.inst_nome", { nome: q.nome }))}</div>` : ""}
      <details class="grupo" data-g="le" ${aberto(i, "le", false)}><summary><b>${escT(tr("ctl.g_le"))}</b> ${escT(le)}</summary>
        <div class="opcoes">${q.subcircuitos.length ? "" : caixa("data-todas", "1", q.todas, tr("ctl.todas_medidas"))}
        ${semCircuito ? `<i>${escT(tr("ctl.abra_edicao_medidas"))}</i>` : ent.map(medCaixa).join("") || `<i>${escT(tr("ctl.sem_medida_circuito"))}</i>`}</div></details>
      ${linhasMsg(q)}
      <details class="grupo" data-g="esc" ${aberto(i, "esc", false)}><summary><b>${escT(tr("ctl.g_esc"))}</b> ${escT(curto(q.atuacoes) || (q.subcircuitos.length ? tr("ctl.as_do_sub") : tr("ctl.nada")))}</summary>
        <div class="opcoes">${atus.map(atuCaixa).join("") || `<i>${escT(tr("ctl.marque_atuacoes"))}</i>`}</div></details>
      ${ss.length ? `<details class="grupo" data-g="sub" ${aberto(i, "sub", q.subcircuitos.length > 0)}><summary><b>${escT(tr("ctl.g_sub"))}</b> ${escT(curto(q.subcircuitos.map(nomeSub)) || tr("ctl.nao"))}</summary>
        <div class="opcoes">${ss.map((x) => caixa("data-sub", x, q.subcircuitos.includes(x), nomeSub(x))).join("")}</div></details>` : ""}
      ${resumo ? `<div class="inst">${escT(resumo)}</div>` : ""}
      ${q.arquivo !== "controle.py" ? `<button class="ctl-papel" data-desliga="${escT(q.arquivo)}" title="${escT(tr("ctl.t_virar_modulo"))}">${escT(tr("ctl.virar_modulo"))}</button>` : ""}</div>`;
  };
  const semDSP = !ctl.lista.includes("leitura.py") && !ctl.lista.includes("escrita.py");
  // a árvore pelos imports (Marcelo, 19/10: "a lista já está ficando cheia… busca e hierarquia"): cada controlador na raiz;
  // embaixo, os módulos que ele importa, na ordem em que o passo() os chama (o fluxo); módulo que importa outro fica
  // aninhado; o que já apareceu aparece de novo só como referência (acima); os que ninguém importa vão para "sem uso"
  const ctlsArq = cs.length ? unico(["controle.py", ...cs.map((q) => q.arquivo)]) : ["controle.py"];
  const mostrados = new Set();
  // compartilhados (Marcelo, 19/10: "um lugar do código compartilhado"): entre os arquivos em uso (alcançados a partir dos
  // controladores), o módulo que dois ou mais importam aparece igual em todo lugar (⇄, sem filhos: ninguém é o dono) e uma
  // vez só na seção "Compartilhados", com quem usa. Cada controlador roda a sua cópia (sem memória comum)
  const alcance = new Set(ctlsArq.filter((a) => ctl.lista.includes(a))), filaA = [...alcance];
  while (filaA.length) for (const f of importsDe(filaA.shift())) if (!ctlsArq.includes(f) && !alcance.has(f)) { alcance.add(f); filaA.push(f); }
  const usam = {};
  for (const a of alcance) for (const f of importsDe(a)) if (!ctlsArq.includes(f) && f !== a) (usam[f] = usam[f] || new Set()).add(a);
  const comp = ctl.lista.filter((f) => usam[f] && usam[f].size > 1);
  const quemUsa = (f) => [...usam[f]].map(nomeDoArquivo).join(", ");
  const seta = (chave, tem) => tem ? `<span class="ctl-seta${ctl.recolhidos.has(chave) ? " rec" : ""}" data-seta="${escT(chave)}" title="${escT(tr("ctl.t_seta"))}">▾</span>` : `<span class="ctl-seta vazia"></span>`;
  const ramo = (fs, chave, anc) => fs.length ? `<div class="ctl-ramo"${ctl.recolhidos.has(chave) ? " hidden" : ""}>${fs.map((f) => modulo(f, `${chave}/${f}`, anc)).join("")}</div>` : "";
  const filhos = (a, anc) => importsDe(a).filter((f) => !ctlsArq.includes(f) && !anc.has(f) && f !== a);
  const modulo = (a, chave, anc, inteiro = false) => {   // inteiro: o compartilhado na seção dele (com os filhos)
    if (!inteiro && comp.includes(a)) { mostrados.add(a);
      return `<div class="ctl-no ctl-mod-no compartilhado${a === ctl.arq ? " ativo" : ""}${comErro.has(a) ? " com-erro" : ""}" data-abre="${escT(a)}"
        title="${escT(tr("ctl.t_compartilhado", { arq: a, quem: quemUsa(a) }))}">${seta(chave, 0)}<span class="comp" aria-hidden="true">⇄</span>${ICONE_ARQ}<span class="nome">${escT(a)}</span>
        <span class="acoes"><span class="fecha" data-fecha="${escT(a)}" title="${escT(tr("ctl.t_apagar_arq", { arq: a }))}">×</span></span></div>`; }
    const repetido = !inteiro && mostrados.has(a); mostrados.add(a);
    const fs = repetido ? [] : filhos(a, anc), quem = [...anc].pop();
    return `<div class="ctl-no ctl-mod-no${a === ctl.arq ? " ativo" : ""}${comErro.has(a) ? " com-erro" : ""}${repetido ? " repetido" : ""}" data-abre="${escT(a)}"
      title="${escT(tr(`ctl.t_mod${quem ? "_chamado" : ""}${repetido ? "_rep" : ""}`, { arq: a, mod: nomeDoArquivo(a), quem }))}">${seta(chave, fs.length)}${ICONE_ARQ}<span class="nome">${escT(a)}</span>${repetido ? `<small>${escT(tr("ctl.acima"))}</small>` : ""}
      <span class="acoes"><button class="ctl-mini" data-liga="${escT(a)}" title="${escT(tr("ctl.t_virar_ctl"))}">⤴</button><span class="fecha" data-fecha="${escT(a)}" title="${escT(tr("ctl.t_apagar_arq", { arq: a }))}">×</span></span></div>` +
      ramo(fs, chave, new Set([...anc, a]));
  };
  const raiz = (a) => {
    mostrados.add(a);
    const deles = cs.map((q, i) => [q, i]).filter(([q]) => q.arquivo === a);
    const corpo = deles.map(([q, i]) => cartao(q, i)).join("") || (!cs.length && a === "controle.py"
      ? `<div class="ctl-vazio">${escT(tr("ctl.vazio_ctl"))}${semDSP ? `<br><button data-dsp="1" title="${escT(tr("ctl.t_dsp"))}">${escT(tr("ctl.dsp"))}</button>` : ""}</div>` : "");
    const fs = filhos(a, new Set()), semCartao = ctl.cartoesFechados.has(a);
    // dois controles (Marcelo, 19/10): a seta recolhe os códigos (os módulos embaixo); o +/− mostra ou esconde o cartão
    const bt = corpo ? `<button class="ctl-card-bt" data-card="${escT(a)}" title="${escT(semCartao ? tr("ctl.t_cartao_mostra") : tr("ctl.t_cartao_esconde"))}" aria-expanded="${!semCartao}">${semCartao ? "+" : "−"}</button>` : "";
    return `<div class="ctl-no${a === ctl.arq ? " ativo" : ""}${comErro.has(a) ? " com-erro" : ""}" data-abre="${escT(a)}" title="${escT(tr(a === "controle.py" ? "ctl.t_raiz" : "ctl.t_raiz_renomear", { arq: a }))}">${seta(a, fs.length)}${ICONE_ARQ}<span class="nome">${escT(a)}</span>${bt}${a === "controle.py" ? ""
        : `<span class="fecha" data-fecha="${escT(a)}" title="${escT(tr("ctl.t_apagar_arq", { arq: a }))}">×</span>`}</div>${corpo ? `<div class="ctl-sub"${semCartao ? " hidden" : ""}>${corpo}</div>` : ""}` + ramo(fs, a, new Set([a]));
  };
  let html = ctlsArq.filter((a) => ctl.lista.includes(a)).map(raiz).join("");
  if (comp.length) html += `<details class="ctl-comp" open><summary title="${escT(tr("ctl.t_compartilhados"))}">${escT(tr("ctl.compartilhados", { n: comp.length }))}</summary>${comp.map((f) =>
    modulo(f, `⇄/${f}`, new Set(), true) + `<div class="ctl-usa">${escT(tr("ctl.usado_por", { quem: quemUsa(f) }))}</div>`).join("")}</details>`;
  const soltos = ctl.lista.filter((a) => !mostrados.has(a));
  if (soltos.length) {                                   // primeiro os que nenhum outro solto importa, com os que eles importam embaixo
    const importados = new Set(soltos.flatMap((a) => importsDe(a)));
    let h = soltos.filter((a) => !importados.has(a)).map((a) => modulo(a, `~/${a}`, new Set())).join("");
    h += soltos.filter((a) => !mostrados.has(a)).map((a) => modulo(a, `~/${a}`, new Set())).join("");   // os de um ciclo
    html += `<details class="ctl-soltos" open><summary title="${escT(tr("ctl.t_soltos"))}">${escT(tr("ctl.soltos", { n: soltos.length }))}</summary>${h}</details>`;
  }
  $("ctl-ctls").innerHTML = html;
  buscaArquivos();
  if (ctl.pick) corpoPicker();
  if (ctl.tabela === "diag") desenhaDiagrama();
  $("ctl-rede").style.display = cs.length ? "" : "none";
  if (document.activeElement !== $("ctl-rede-lat")) $("ctl-rede-lat").value = (c.rede && c.rede.latencia) || 0;
  $("ctl-n-arq").textContent = ctl.lista.length > 1 || cs.length ? `${ctl.lista.length}` : "";
  infoRede();
}
// as mensagens entre os controladores, lidas do código (Marcelo, 19/10: "mostrar quando um DSP recebe uma variável de
// outro… o theta vem do PLL… ter essa cadeia"): os envia("destino", {"chave": …}) do arquivo do controlador e dos módulos
// que ele importa (eles também têm envia); o que cada um recebe sai do que os outros mandam para ele
function semComentario(t) { return t.split("\n").map((l) => { const i = l.indexOf("#"); return i < 0 ? l : l.slice(0, i); }).join("\n"); }
function arquivosDoControlador(arq, ctlsArq) {        // o arquivo e os módulos que ele importa (sem os outros controladores)
  const vistos = new Set([arq]), fila = [arq];
  while (fila.length) for (const f of importsDe(fila.shift())) if (!vistos.has(f) && !ctlsArq.includes(f)) { vistos.add(f); fila.push(f); }
  return [...vistos];
}
// o primeiro argumento de uma chamada (até a vírgula de fora de parênteses e de texto) e onde ele acaba
function argumento(t, i) {
  let prof = 0, aspa = null;
  for (let j = i; j < t.length; j++) {
    const ch = t[j];
    if (aspa) { if (ch === "\\") j++; else if (ch === aspa) aspa = null; continue; }
    if (ch === '"' || ch === "'") aspa = ch;
    else if ("([{".includes(ch)) prof++;
    else if (")]}".includes(ch)) { if (!prof) return [t.slice(i, j).trim(), j]; prof--; }
    else if (ch === "," && !prof) return [t.slice(i, j).trim(), j];
  }
  return [t.slice(i).trim(), t.length];
}
// os destinos de envia(arg, …) (Marcelo, 19/10: o controle manda o theta às 6 células num for — envia("sm_ap_%d" % k, …) — e o
// diagrama não ligava nada): o nome escrito ("sm_ap_1") ou montado — "sm_ap_%d" % k, f"sm_ap_{k}", "sm_ap_{}".format(k),
// "sm_ap_" + str(k), ou uma variável de um for sobre nomes —, com os valores do último for antes (for k in (1, 2, 3), [..] ou
// range(…)) quando dá; senão, os controladores cujo nome casa com o molde (cada buraco vale qualquer trecho de letras e números)
function destinosDe(arg, antes, nomes) {
  let m = arg.match(/^["'](\w+)["']$/); if (m) return [m[1]];
  const valores = (v) => {                             // os valores do último "for v in …:" antes do envia
    const ms = [...antes.matchAll(new RegExp(`\\bfor\\s+${escRe(v)}\\s+in\\s+(?:range\\s*\\(([^)]*)\\)|[\\(\\[]([^\\)\\]]*)[\\)\\]])\\s*:`, "g"))];
    if (!ms.length) return null;
    const x = ms[ms.length - 1];
    if (x[1] !== undefined) {
      const a = x[1].split(",").map((s_) => Number(s_.trim())); if (!a.length || a.some((y) => !Number.isInteger(y))) return null;
      const [i0, i1, pas = 1] = a.length === 1 ? [0, a[0]] : a, r = [];
      for (let i = i0; pas > 0 ? i < i1 : i > i1; i += pas) { r.push(String(i)); if (r.length > 200) break; }
      return r;
    }
    return x[2].split(",").map((s_) => s_.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  };
  if ((m = arg.match(/^(\w+)$/))) {                     // uma variável: de um for sobre nomes, ou a última atribuição de um nome
    const v = valores(m[1]); if (v) return v;
    const a = [...antes.matchAll(new RegExp(`\\b${escRe(m[1])}\\s*=\\s*["'](\\w+)["']`, "g"))];
    return a.length ? [a[a.length - 1][1]] : [];
  }
  let molde = null, vars = [];                          // os pedaços escritos e, entre eles, os buracos
  if ((m = arg.match(/^["']([^"']*)["']\s*%\s*(.+)$/))) { molde = m[1].split(/%[-+ 0#]*\d*[disr]/); vars = m[2].replace(/^\(|\)$/g, "").split(",").map((s_) => s_.trim()).filter(Boolean); }
  else if ((m = arg.match(/^f["']([^"']*)["']$/))) { molde = m[1].split(/\{[^}]*\}/); vars = [...m[1].matchAll(/\{\s*(\w+)[^}]*\}/g)].map((x) => x[1]); }
  else if ((m = arg.match(/^["']([^"']*)["']\.format\s*\((.*)\)$/))) { molde = m[1].split(/\{[^}]*\}/); vars = m[2].split(",").map((s_) => s_.trim()); }
  else if (/\+/.test(arg)) {
    molde = [""];
    for (const pd of arg.split("+").map((s_) => s_.trim())) {
      const l = pd.match(/^["']([^"']*)["']$/);
      if (l) molde[molde.length - 1] += l[1];
      else { molde.push(""); const v = pd.match(/^(?:str\s*\(\s*)?(\w+)\s*\)?$/); vars.push(v ? v[1] : ""); }
    }
  }
  if (!molde || molde.length < 2) return [];
  if (molde.length === 2 && vars.length === 1) { const vs = valores(vars[0]); if (vs) return vs.map((v) => molde[0] + v + molde[1]); }
  const re = new RegExp("^" + molde.map(escRe).join("\\w+") + "$");
  return nomes.filter((n) => re.test(n));
}
function mensagensDe(cs) {   // {nome: {envia: [{para, chaves, codigo}], recebe: [{de, chaves, codigo}], le: Set, chamaRecebe}}
  const ctlsArq = cs.map((q) => q.arquivo), out = {};
  const chavesDe = (corpo) => corpo.startsWith("{") ? [...corpo.matchAll(/["'](\w+)["']\s*:/g)].map((x) => x[1]) : [...corpo.matchAll(/(\w+)\s*=/g)].map((x) => x[1]);
  for (const q of cs) out[q.nome] = { envia: [], recebe: [], le: new Set(), chamaRecebe: false };
  for (const q of cs) {
    for (const f of arquivosDoControlador(q.arquivo, ctlsArq)) {
      const t = semComentario(textoDe(f)), linhas = textoDe(f).split("\n");
      if (/\brecebe\s*\(\s*\)/.test(t)) out[q.nome].chamaRecebe = true;
      // o que este controlador lê das mensagens: msg["dados"]["x"] ou msg["dados"].get("x")
      for (const x of t.matchAll(/\[\s*["']dados["']\s*\]\s*(?:\[\s*["'](\w+)["']\s*\]|\.get\(\s*["'](\w+)["'])/g)) out[q.nome].le.add(x[1] || x[2]);
      for (const e0 of t.matchAll(/\benvia\s*\(/g)) {
        const [arg, fim] = argumento(t, e0.index + e0[0].length);
        const m2 = t[fim] === "," ? t.slice(fim + 1).match(/^\s*(\{[^}]*\}|dict\s*\([^)]*\)|\w+)/) : null;
        const para = destinosDe(arg, t.slice(0, e0.index), cs.map((x) => x.nome));
        if (!arg) continue;
        let corpo = (m2 && m2[1]) || "", chaves = [];
        const m = { index: e0.index };
        const n = t.slice(0, m.index).split("\n").length, codigo = [`${f}:${n}: ${(linhas[n - 1] || "").trim()}`];
        if (/^\w+$/.test(corpo)) {                      // uma variável (Marcelo, 19/10: msg = {...}; envia("sm_ap_1", msg)): a última
          const antes = t.slice(0, m.index), v = corpo;  // atribuição antes do envia e as chaves postas depois (msg["x"] = …)
          const ats = [...antes.matchAll(new RegExp(`\\b${v}\\s*=\\s*(\\{[^}]*\\}|dict\\s*\\([^)]*\\))`, "g"))];
          corpo = ats.length ? ats[ats.length - 1][1] : "";
          if (ats.length) { const na = antes.slice(0, ats[ats.length - 1].index).split("\n").length; codigo.push(`${f}:${na}: ${(linhas[na - 1] || "").trim()}`); }
          chaves = [...antes.matchAll(new RegExp(`\\b${v}\\s*\\[\\s*["'](\\w+)["']\\s*\\]\\s*=(?!=)`, "g"))].map((x) => x[1]);
        }
        chaves = [...new Set([...chavesDe(corpo), ...chaves])];
        for (const d of para.length ? para : [arg]) {      // sem destino que se saiba: o texto do código (o cartão avisa)
          const e = out[q.nome].envia.find((x) => x.para === d);
          if (e) { e.chaves = [...new Set([...e.chaves, ...chaves])]; e.codigo.push(...codigo.filter((c_) => !e.codigo.includes(c_))); }
          else out[q.nome].envia.push({ para: d, chaves, livre: !chaves.length, codigo: codigo.slice() });
        }
      }
    }
  }
  for (const q of cs) for (const e of out[q.nome].envia) if (out[e.para]) out[e.para].recebe.push({ de: q.nome, chaves: e.chaves, livre: e.livre, codigo: e.codigo });
  return out;
}
// os avisos embaixo da coluna, menos os de módulo importado por mais de um (a seção "compartilhados" da árvore já diz isso)
// as variáveis do código que não existem no esquema (o servidor acha: m["x"], m[NOME] com NOME = "x", e a chave que o passo()
// de um controlador devolve) — os cartões seguem o código, e este é o aviso que fica (Marcelo, 19/10: "tem que ser algo tipo
// variável do código não existe no esquema"); "trocar por…" mostra a lista do que existe, o mais parecido primeiro ("ter uma
// lista para tentar colocar outra"), e troca no código (o nome entre aspas, em todos os arquivos)
function avisoSemEsquema() {
  const l = (ctl.dados && ctl.dados.sem_esquema) || [];
  // os usos (links) entram no lugar de {usos} depois do tr (as chaves _html escapam os parâmetros); x.tipo vem do servidor
  const USOS = "\u0000usos\u0000";                         // o lugar dos links (o _html escapa os parâmetros; o nome não tem \u0000)
  // so_scope: a medida existe, mas só vai para o scope (o componente: marcar "→ Controle" nele)
  const chave = (x) => (x.tipo === "atuação" ? "ctl.sem_esquema_atu_html" : x.so_scope ? "ctl.sem_esquema_so_scope_html" : "ctl.sem_esquema_html");   // i18n-ok: x.tipo vem do servidor
  return l.map((x, i) => `<div class="ctl-sem">${tr(chave(x), { nome: x.nome, usos: USOS, comp: x.so_scope || "" }).replace(USOS, () =>
    x.usos.map((u) => `<a data-vai="${escT(u.arquivo)}:${u.linha}" title="${escT(tr("ctl.t_abrir_linha", { arq: u.arquivo, linha: u.linha }))}">${escT(u.arquivo)}:${u.linha}</a>`).join(", "))} <button data-troca="${i}" title="${escT(tr("ctl.t_trocar_por"))}">${escT(tr("ctl.trocar_por"))}</button></div>`).join("");
}
function semelhanca(a, b) {                            // pares de letras em comum (Dice), sem caixa nem _: vc_smap_1 ~ SM_ap_1_vCSm
  const pares = (x) => { x = x.toLowerCase().replace(/[^a-z0-9]/g, ""); const p = new Set(); for (let i = 0; i < x.length - 1; i++) p.add(x.slice(i, i + 2)); return p; };
  const pa = pares(a), pb = pares(b); if (!pa.size || !pb.size) return a.toLowerCase() === b.toLowerCase() ? 1 : 0;
  let n = 0; for (const x of pa) if (pb.has(x)) n++;
  return 2 * n / (pa.size + pb.size);
}
async function trocaVariavel(x) {
  if (!x || travado()) return;
  const opcoes = (x.tipo === "atuação" ? ctl.dados.atuadores.map((a) => a.nome) : ctl.dados.entradas.slice())   // i18n-ok: x.tipo vem do servidor
    .sort((a, b) => semelhanca(x.nome, b) - semelhanca(x.nome, a) || a.localeCompare(b));
  if (!opcoes.length) { poeEstado(tr(x.tipo === "atuação" ? "ctl.sem_opcao_atu" : "ctl.sem_opcao_med", { nome: x.nome }), "erro"); return; }   // i18n-ok: x.tipo vem do servidor
  let escolha = opcoes[0];
  const r = await modal({ titulo: tr("ctl.trocar_titulo_html", { nome: x.nome }), largo: true, ok: tr("ctl.trocar_ok"), foco: ".m-filtro",
    texto: tr("ctl.trocar_texto_html", { nome: x.nome }),
    html: `<input class="m-filtro" type="search" placeholder="${escT(tr("ctl.ph_filtrar"))}" aria-label="${escT(tr("ctl.a_filtrar"))}" data-enter="proprio">
      <div class="m-lista">${opcoes.map((n, i) => `<label><input type="radio" name="m-troca" value="${escT(n)}" ${i ? "" : "checked"}><span>${escT(n)}</span></label>`).join("")}</div>`,
    monta: (fundo, fecha) => {
      const lista = fundo.querySelector(".m-lista"), filtro = fundo.querySelector(".m-filtro");
      lista.addEventListener("change", (ev) => { if (ev.target.name === "m-troca") escolha = ev.target.value; });
      lista.addEventListener("dblclick", (ev) => { const l = ev.target.closest("label"); if (l) { escolha = l.querySelector("input").value; fecha({}); } });
      filtro.addEventListener("input", () => {
        const q = filtro.value.toLowerCase(); let prim = null;
        for (const l of lista.querySelectorAll("label")) { const v = l.querySelector("input").value, ve = !q || v.toLowerCase().includes(q); l.hidden = !ve; if (ve && !prim) prim = l; }
        if (prim && (!lista.querySelector("input:checked") || lista.querySelector("input:checked").closest("label").hidden)) { prim.querySelector("input").checked = true; escolha = prim.querySelector("input").value; }
      });
      filtro.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); if (lista.querySelector("label:not([hidden]) input:checked")) fecha({}); } });
    } });
  if (!r) return;
  if (!(await guardaControle())) return;                 // o que está no editor de código vai antes
  try {
    const j = await api("editor/controle/renomeia", { pares: [[x.nome, escolha]] });
    await recarregaControle();
    poeEstado(tr("ctl.trocado", { de: x.nome, para: escolha, n: j.trocas }), "ok");
  } catch (er) { poeEstado(er.message, "erro"); }
}
document.addEventListener("click", (ev) => { if (!ev.target.closest) return;
  const b = ev.target.closest("#ctl-avisos [data-troca]"); if (b && ctl.dados) { trocaVariavel((ctl.dados.sem_esquema || [])[+b.dataset.troca]); return; }
  const vai = ev.target.closest("#ctl-avisos [data-vai]"); if (vai) { const i = vai.dataset.vai.lastIndexOf(":"); vaiParaLinha(vai.dataset.vai.slice(0, i), +vai.dataset.vai.slice(i + 1)); } });
// o módulo compartilhado (o servidor diz quais, pelo código): a árvore já mostra, o painel não repete
const avisosDoPainel = (l, comp) => (l || []).filter((a) => !(comp || []).includes(a)).map((a) => `<div>${escT(a)}</div>`).join("");
function importsDe(a) {
  const t = textoDe(a), nomes = [];
  for (const m of t.matchAll(/^[ \t]*(?:import[ \t]+([\w., \t]+)|from[ \t]+(\w+)[ \t]+import\b)/gm)) {
    const lista = m[1] ? m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0].split(".")[0]) : [m[2]];
    for (const n of lista) if (n && !nomes.includes(n)) nomes.push(n);
  }
  const corpo = t.slice(Math.max(0, t.search(/^def[ \t]+passo[ \t]*\(/m)));
  const pos = (n) => { const i = corpo.search(new RegExp(`\\b${n}\\s*\\.`)); return i < 0 ? Infinity : i; };
  return nomes.map((n) => `${n}.py`).filter((f) => ctl.lista.includes(f)).map((f, k) => [f, pos(nomeDoArquivo(f)), k])
    .sort((x, y) => x[1] - y[1] || x[2] - y[2]).map(([f]) => f);
}
ctl.recolhidos = new Set(); try { ctl.recolhidos = new Set(JSON.parse(localStorage.getItem("maisim-simu-ctl-recolhidos") || "[]")); } catch (e) { /* ok */ }
ctl.cartoesFechados = new Set(); try { ctl.cartoesFechados = new Set(JSON.parse(localStorage.getItem("maisim-simu-ctl-cartoes") || "[]")); } catch (e) { /* ok */ }
// a busca da coluna "arquivos": os arquivos com o texto no nome e as linhas de código com o texto (clique: abre na linha)
function buscaArquivos() {
  const q = ($("ctl-arq-busca").value || "").trim(), ql = q.toLowerCase(), res = $("ctl-busca-res");
  res.hidden = !q; $("ctl-ctls").hidden = !!q;
  document.querySelectorAll("#ctl-v-arq > h4, #ctl-v-arq > .ctl-botoes").forEach((x) => { x.hidden = !!q; });
  if (!q) { res.innerHTML = ""; return; }
  const marca = (txt) => { const i = txt.toLowerCase().indexOf(ql); return i < 0 ? escT(txt) : `${escT(txt.slice(0, i))}<mark>${escT(txt.slice(i, i + q.length))}</mark>${escT(txt.slice(i + q.length))}`; };
  const arqs = ctl.lista.filter((a) => a.toLowerCase().includes(ql));
  const linhas = [];
  for (const a of ctl.lista) textoDe(a).split("\n").forEach((l, i) => { if (linhas.length < 60 && l.toLowerCase().includes(ql)) linhas.push([a, i + 1, l.trim()]); });
  res.innerHTML = `<h4>${escT(tr("ctl.busca_arquivos"))}</h4>${arqs.map((a) => `<div class="ctl-no${a === ctl.arq ? " ativo" : ""}" data-abre="${escT(a)}">${ICONE_ARQ}<span class="nome">${marca(a)}</span></div>`).join("") || `<div class="vazio">${escT(tr("ctl.busca_sem_arq"))}</div>`}
    <h4>${escT(tr("ctl.col_no_codigo"))} <small>${linhas.length >= 60 ? escT(tr("ctl.busca_60")) : linhas.length}</small></h4>${linhas.map(([a, n, l]) => `<a class="r" data-vai="${escT(a)}:${n}" title="${escT(tr("ctl.onde_arq", { arq: a, linha: n }))}"><b>${escT(a)}:${n}</b> ${marca(l)}</a>`).join("") || `<div class="vazio">${escT(tr("ctl.busca_sem_linha"))}</div>`}`;
}
// o diagrama da arquitetura (Marcelo, 19/10: "um diagrama, tipo um flow, mostrando o que ele lê e o que sai dele, o que sai
// de um e entra no outro"): à esquerda as medidas, no meio os DSPs em colunas pela ordem das mensagens (quem só manda antes
// de quem recebe), à direita as atuações; as setas roxas são as mensagens (envia/recebe, lidas do código), com o que vai e a
// latência. Muitas medidas (ou "todas") de um DSP viram um bloco só. Clicar num DSP abre o código dele
// o diagrama como no Figma (Marcelo, 19/10: "clicar e arrastar, dar zoom + −"): arrastar move; a roda rola (Shift: para o lado);
// Ctrl + roda (ou a pinça do touchpad) dá zoom no ponto do mouse; − / % / + / ajustar na barra. Até alguém mexer, o desenho
// cabe inteiro (e acompanha o código e o tamanho da tela); depois, a vista fica onde foi deixada
const vistaDiag = { k: 1, x: 0, y: 0, mexida: false,   // linhas: "juntas" (um ponto por bloco) | "separadas" (um ponto por ligação)
  linhas: (() => { try { return localStorage.getItem("maisim-simu-diag-linhas") === "separadas" ? "separadas" : "juntas"; } catch (e) { return "juntas"; } })() };
function aplicaVistaDiag() {
  const svg = $("ctl-diag-svg"); if (!svg) return;
  svg.style.transform = `translate(${vistaDiag.x}px, ${vistaDiag.y}px) scale(${vistaDiag.k})`;
  if ($("cd-zoom")) $("cd-zoom").textContent = `${Math.round(vistaDiag.k * 100)}%`;
}
function ajustaDiag() {                                  // cabe inteiro, centrado (no máximo 100 %); se nem a 10 % cabe, o começo dele
  const svg = $("ctl-diag-svg"), rolo = svg && svg.parentElement; if (!rolo || !rolo.clientWidth) return;
  const W = +svg.getAttribute("width") || 1, H = +svg.getAttribute("height") || 1, cw = rolo.clientWidth, ch = rolo.clientHeight;
  const k = Math.max(0.1, Math.min(1, (cw - 24) / W, (ch - 24) / H));
  Object.assign(vistaDiag, { k, x: Math.max(12, (cw - W * k) / 2), y: Math.max(12, (ch - H * k) / 2), mexida: false });
  aplicaVistaDiag();
}
// as colunas do diagrama (o nível de cada DSP): quem manda antes de quem recebe. Os que trocam mensagens em ciclo (Marcelo,
// 21/10: o controle manda a todos os SMs e alguns respondem — cada volta empurrava todos uma coluna, os 19 iam parar na
// 19ª e o "ajustar" encolhia um desenho de 7700 px quase vazio) formam um grupo (componente fortemente conexo, Tarjan): o
// grupo vem depois de quem manda para ele e, dentro dele, cada um fica na distância (em mensagens) de quem entra no grupo
// — quem recebe de fora, ou o primeiro da lista. Sem ciclo, é o caminho mais longo, como antes.
function colunasDiag(nomes, sai) {
  const idx = {}, low = {}, naPilha = new Set(), pilha = [], grupos = []; let k = 0;
  const visita = (v) => {
    idx[v] = low[v] = k++; pilha.push(v); naPilha.add(v);
    for (const w of sai(v)) { if (!(w in idx)) { visita(w); low[v] = Math.min(low[v], low[w]); } else if (naPilha.has(w)) low[v] = Math.min(low[v], idx[w]); }
    if (low[v] === idx[v]) { const g = []; let w; do { w = pilha.pop(); naPilha.delete(w); g.push(w); } while (w !== v); grupos.push(g); }
  };
  for (const v of nomes) if (!(v in idx)) visita(v);
  const nivel = {};
  for (const g of grupos.reverse()) {                    // o Tarjan entrega os grupos do fim para o começo
    const base = Object.fromEntries(g.map((v) => [v, -1]));
    for (const u of Object.keys(nivel)) for (const w of sai(u)) if (w in base) base[w] = Math.max(base[w], nivel[u] + 1);
    const ordem = g.slice().sort((a, b) => nomes.indexOf(a) - nomes.indexOf(b));
    const fila = ordem.filter((v) => base[v] >= 0); if (!fila.length) fila.push(ordem[0]);
    fila.forEach((v) => { nivel[v] = Math.max(0, base[v]); });
    for (let i = 0; i < fila.length; i++) for (const w of sai(fila[i])) if (w in base && !(w in nivel)) { nivel[w] = Math.max(nivel[fila[i]] + 1, base[w]); fila.push(w); }
  }
  return nivel;
}
function zoomDiag(f, px, py) {                           // f: o fator; (px, py): o ponto que fica parado (no rolo; padrão: o meio)
  const rolo = $("ctl-diag-svg").parentElement;
  if (px == null) { px = rolo.clientWidth / 2; py = rolo.clientHeight / 2; }
  const k = Math.min(4, Math.max(0.1, vistaDiag.k * f)), r = k / vistaDiag.k;
  Object.assign(vistaDiag, { x: px - (px - vistaDiag.x) * r, y: py - (py - vistaDiag.y) * r, k, mexida: true });
  aplicaVistaDiag();
}
function ligaVistaDiag() {
  const rolo = $("ctl-diag-svg").parentElement, esc = () => rolo.offsetWidth / (rolo.getBoundingClientRect().width || 1);   // o zoom do MaiSim
  let arr = null;
  rolo.addEventListener("pointerdown", (ev) => { if (ev.button !== 0 && ev.button !== 1) return; arr = { x0: ev.clientX, y0: ev.clientY, x: vistaDiag.x, y: vistaDiag.y, moveu: false, id: ev.pointerId }; });
  rolo.addEventListener("pointermove", (ev) => {
    if (!arr) return;
    const s_ = esc(), dx = (ev.clientX - arr.x0) * s_, dy = (ev.clientY - arr.y0) * s_;
    if (!arr.moveu && Math.hypot(dx, dy) < 4) return;
    if (!arr.moveu) { arr.moveu = true; try { rolo.setPointerCapture(arr.id); } catch (e) { /* ok */ } rolo.classList.add("arrastando"); }
    Object.assign(vistaDiag, { x: arr.x + dx, y: arr.y + dy, mexida: true }); aplicaVistaDiag();
  });
  const solta = () => { if (arr && arr.moveu) { ctl.diagArrastou = Date.now(); rolo.classList.remove("arrastando"); } arr = null; };
  rolo.addEventListener("pointerup", solta); rolo.addEventListener("pointercancel", solta);
  rolo.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const r = rolo.getBoundingClientRect(), s_ = esc();
    if (ev.ctrlKey || ev.metaKey) { zoomDiag(Math.exp(-ev.deltaY * (ev.deltaMode ? 0.05 : 0.0018)), (ev.clientX - r.left) * s_, (ev.clientY - r.top) * s_); return; }
    const k = ev.deltaMode ? 16 : 1, dx = (ev.shiftKey ? ev.deltaY : ev.deltaX) * k, dy = ev.shiftKey ? 0 : ev.deltaY * k;
    Object.assign(vistaDiag, { x: vistaDiag.x - dx, y: vistaDiag.y - dy, mexida: true }); aplicaVistaDiag();
  }, { passive: false });
  $("cd-mais").onclick = () => zoomDiag(1.25);
  $("cd-menos").onclick = () => zoomDiag(0.8);
  $("cd-ajusta").onclick = ajustaDiag;
  const botaoLinhas = () => { const b = $("cd-linhas"), sep = vistaDiag.linhas === "separadas";
    b.textContent = sep ? tr("ctl.juntar_linhas") : tr("ctl.separar_linhas"); b.classList.toggle("ativo", sep); b.setAttribute("aria-pressed", sep); };
  ctl.botaoLinhas = botaoLinhas;                       // a troca de idioma redesenha o botão
  $("cd-linhas").onclick = () => {                     // juntas ↔ separadas (fica guardado neste navegador); o desenho volta a caber
    vistaDiag.linhas = vistaDiag.linhas === "separadas" ? "juntas" : "separadas"; vistaDiag.mexida = false;
    try { localStorage.setItem("maisim-simu-diag-linhas", vistaDiag.linhas); } catch (e) { /* ok */ }
    botaoLinhas(); desenhaDiagrama();
  };
  botaoLinhas();
  $("cd-zoom").onclick = () => { const rolo_ = rolo, k = 1 / vistaDiag.k; zoomDiag(k, rolo_.clientWidth / 2, rolo_.clientHeight / 2); };   // 100 %
  addEventListener("resize", () => { if (!vistaDiag.mexida && ctl.tabela === "diag") ajustaDiag(); });
}
function desenhaDiagrama() {
  const svg = $("ctl-diag-svg"); if (!svg || !ctl.dados) return;
  const d = ctl.dados, c = d.controle, cs = (c.controladores || []).length ? c.controladores
    : [{ nome: "controle", arquivo: "controle.py", todas: true, medidas: [], atuacoes: c.atuacoes.slice(), subcircuitos: [] }];
  const msgs = mensagensDe(cs), lat = (c.rede && c.rede.latencia) || 0, quando = lat > 0 ? tr("ctl.diag_fibra", { t: si(lat, "s") }) : tr("ctl.diag_mais1");
  // o que foi de fato nas mensagens (o último "testar" ou a última rodada: mensagens_vistas, no servidor), no lugar do que dá
  // para ler do código (Marcelo, 22/10: envia("controle", c["sobe"]) com o dicionário montado num laço em outro arquivo
  // aparecia só como "mensagem"). Com o código igual ao daquela execução, entram também os pares que o código não deixa ver
  const vistas = d.mensagens_vistas || {}, pares = vistas.pares || {};
  for (const q of cs) {
    for (const m of msgs[q.nome].envia) {             // o código mudou depois: só completa o que o código não deixa ler (não troca)
      const v = pares[`${q.nome}|${m.para}`]; if (v && (vistas.atual || !m.chaves.length)) { m.chaves = v; m.visto = true; } }
    if (vistas.atual) for (const [k, v] of Object.entries(pares)) { const [de, para] = k.split("|");
      if (de === q.nome && para in msgs && !msgs[de].envia.some((m) => m.para === para)) msgs[de].envia.push({ para, chaves: v, codigo: [], visto: true }); }
  }
  const deOnde = vistas.fonte ? tr(`ctl.de_${vistas.fonte === "rodada" ? "rodada" : "testar"}${vistas.atual ? "" : "_mudou"}`, { quando: vistas.quando }) : "";   // fonte: do servidor
  const curto = (ch) => (ch.length > 3 ? `${ch.slice(0, 3).join(", ")} +${ch.length - 3}` : ch.join(", ")) || tr("ctl.leg_mensagem");   // o rótulo: até 3 chaves
  const quandoLongo = lat > 0 ? tr("ctl.chega_fibra", { t: si(lat, "s") }) : tr("ctl.chega_seguinte");
  const ctlsArq = cs.map((q) => q.arquivo), NS = "http://www.w3.org/2000/svg", LIM = 8;
  const larg = (t, px = 7.2) => 18 + t.length * px;
  // as colunas dos DSPs: a ordem das mensagens (quem manda antes de quem recebe; os ciclos: colunasDiag)
  const nomes = cs.map((q) => q.nome);
  const nivel = colunasDiag(nomes, (n) => [...new Set(msgs[n].envia.map((e) => e.para))].filter((p) => p !== n && nomes.includes(p)));
  const nCol = Math.max(...Object.values(nivel)) + 1;
  // as entradas (medidas) e as saídas (atuações) de cada DSP; muitas viram um bloco
  const entradas = new Map(), saidas = new Map();     // chave → {rot, dsps:Set, dica}
  const poe = (m, k, rot, q, dica = "") => { if (!m.has(k)) m.set(k, { k, rot, dsps: new Set(), dica }); m.get(k).dsps.add(q.nome); };
  for (const q of cs) {
    const le = q.todas ? d.entradas : q.medidas;
    if (q.todas || le.length > LIM) poe(entradas, `#${q.nome}`, q.todas ? tr("ctl.diag_todas", { n: le.length }) : tr("ctl.diag_medidas", { n: le.length }), q, le.join(", "));
    else le.forEach((x) => poe(entradas, x, x, q));
    const esc = q.atuacoes;
    if (esc.length > LIM) poe(saidas, `#${q.nome}`, tr("ctl.diag_atuacoes", { n: esc.length }), q, esc.join(", "));
    else esc.forEach((x) => { const a = d.atuadores.find((y) => y.nome === x); poe(saidas, x, x, q, a ? destinoTexto(a) : ""); if (a) saidas.get(x).curta = `→ ${(a.destinos || []).map((z) => z.nome || z.gate).join(", ") || tr("ctl.nada_ligado")}`; });
  }
  // os DSPs: caixas em colunas
  const modsDe = (q) => importsDe(q.arquivo).filter((f) => !ctlsArq.includes(f)).map(nomeDoArquivo);
  // a medida que só um DSP de uma coluna depois da primeira lê fica junto dele (à esquerda da caixa, embaixo da chegada das
  // mensagens): sem linhas longas passando por baixo das outras caixas; as outras ficam na coluna da esquerda
  const locais = {};
  for (const e of entradas.values()) { const [n] = e.dsps; if (e.dsps.size === 1 && nivel[n] > 0) { (locais[n] = locais[n] || []).push(e); e.local = n; } }
  const globais = [...entradas.values()].filter((e) => !e.local);
  const WD = 176, RAIA = 7, PASSO = 12, VAO = 20;     // VAO: o corredor da esquerda fica a VAO px da caixa (a seta cabe reta)
  // as linhas separadas (Marcelo, 21/10: "ao invés de agrupar, cada entrada ter uma linha… ou um botão para agrupar ou
  // explodir… cada bloquinho mais comprido"): cada ligação com o seu ponto na caixa — as que chegam à esquerda, as que saem à
  // direita —, a PASSO px uma da outra; a caixa cresce para caber. Juntas: um ponto de chegada e um de saída por caixa
  const separadas = vistaDiag.linhas === "separadas";
  const ROT0 = separadas ? 30 : 88;                   // ROT0: o corredor da direita começa depois do rótulo (separadas: ele vai em cima)
  // a altura de cada ponto: a mensagem PASSO; a medida e a atuação de um DSP só, a do chip (Marcelo, 21/10: as linhas
  // delas faziam curvas estranhas — agora o chip fica na altura do ponto e a linha sai reta)
  const altMed = (e) => (e.dsps.size === 1 ? 26 : PASSO), altAtu = (e) => (e.dsps.size === 1 ? 40 : PASSO);
  const grupos = {}, nChega = Object.fromEntries(nomes.map((n) => [n, 0])), nSai = { ...nChega };
  for (const q of cs) {                                 // o mesmo conteúdo para vários = um rótulo só, na saída
    const gs = grupos[q.nome] = [];
    for (const m of msgs[q.nome].envia) { if (!(m.para in nivel) || m.para === q.nome) continue;
      const rot = m.chaves.length ? m.chaves.join(", ") : "mensagem", g0 = gs.find((x) => x.rot === rot);
      if (g0) { g0.para.push(m.para); g0.codigo.push(...m.codigo); g0.visto = g0.visto || !!m.visto; } else gs.push({ rot, para: [m.para], chaves: m.chaves, codigo: [...m.codigo], visto: !!m.visto }); }
    for (const gr of gs) for (const p of gr.para) { nSai[q.nome] += PASSO; nChega[p] += PASSO; }
  }
  for (const e of entradas.values()) e.dsps.forEach((n) => { nChega[n] += altMed(e); });
  for (const e of saidas.values()) e.dsps.forEach((n) => { nSai[n] += altAtu(e); });
  // 1) as caixas: a altura e o lugar na coluna (o x vem depois: depende dos corredores das mensagens). A ordem na coluna: quem
  // conversa fica junto (Marcelo, 21/10, o MMC: cada célula troca mensagens com as vizinhas do braço; na ordem da lista, as
  // vizinhas ficavam longe e as linhas se amontoavam): cada grupo de DSPs ligados por mensagens na mesma coluna, percorrido a
  // partir da ponta (o de menos ligações) — uma corrente fica em fila. Os grupos, na ordem da lista
  const viz = Object.fromEntries(nomes.map((n) => [n, new Set()])), pos = (n) => nomes.indexOf(n), feito = new Set(), ordem = [];
  for (const n of nomes) for (const e of msgs[n].envia) if (e.para in viz && e.para !== n && nivel[e.para] === nivel[n]) { viz[n].add(e.para); viz[e.para].add(n); }
  const anda = (v) => { feito.add(v); ordem.push(v); [...viz[v]].sort((a, b) => pos(a) - pos(b)).forEach((w) => { if (!feito.has(w)) anda(w); }); };
  for (const n of nomes) if (!feito.has(n)) {
    const grupo = new Set(), junta = (v) => { if (grupo.has(v)) return; grupo.add(v); viz[v].forEach(junta); }; junta(n);
    anda([...grupo].sort((a, b) => viz[a].size - viz[b].size || pos(a) - pos(b))[0]);
  }
  const caixas = {}, alturaCol = Array(nCol).fill(0);
  for (const q of ordem.map((n) => cs[pos(n)])) {
    const mods = modsDe(q), linhas = 2 + (mods.length ? 1 : 0) + ((q.subcircuitos || []).length ? 1 : 0);
    const h = Math.max(14 + linhas * 16, separadas ? 12 + Math.max(nChega[q.nome], nSai[q.nome]) : 0);
    const nl = (locais[q.nome] || []).length, vaga = Math.max(h, h / 2 + 8 + nl * 26);
    const col = nivel[q.nome]; caixas[q.nome] = { q, mods, col, x: 0, y: alturaCol[col], w: WD, h }; alturaCol[col] += vaga + 40;
  }
  const H = Math.max(80, ...alturaCol.map((h) => h - 40), globais.length * 30, saidas.size * 40);
  for (let col = 0; col < nCol; col++) {                // cada coluna centrada na altura
    const qs = Object.values(caixas).filter((b) => b.col === col), alto = alturaCol[col] - 40, dy = (H - alto) / 2;
    qs.forEach((b) => { b.y += dy; });
  }
  const meio = (b) => b.y + b.h / 2;
  // entradas e saídas: na altura (média) dos DSPs ligados, sem se encostar (Marcelo, 21/10: empilhadas no meio, as linhas
  // das atuações cruzavam o desenho todo e não dava para ver de onde vem e para onde vai): desce o que encosta e, se passar
  // do fim, sobe o que for preciso
  const empilha = (m, passo) => { const l = [...m.values()].sort((a, b) => media(a) - media(b));
    l.forEach((e, i) => { e.y = Math.max(0, media(e) - 11, i ? l[i - 1].y + passo : 0); });
    for (let i = l.length - 1; i >= 0; i--) l[i].y = Math.max(0, Math.min(l[i].y, i < l.length - 1 ? l[i + 1].y - passo : H - 22));
    return l; };
  const media = (e) => [...e.dsps].reduce((s, n) => s + meio(caixas[n]), 0) / e.dsps.size;
  const ents = empilha(new Map(globais.map((e) => [e.k, e])), 30), sais = empilha(saidas, 40);
  // 2) as mensagens (Marcelo, 21/10: "entrar sempre num lado e sair do outro"): toda mensagem sai pela direita de quem manda
  // e entra pela esquerda de quem recebe. Para a frente, uma curva. Na mesma coluna, em ângulo reto: pelo corredor à direita
  // da coluna até o vão junto de quem recebe, atravessa o vão e entra pela esquerda. Para trás (a resposta ao controle), um
  // laço por cima (ou por baixo) do desenho, como a realimentação num diagrama de blocos. Cada linha numa raia (RAIA px) dos
  // corredores, dos vãos e dos laços, sem se sobrepor às que dividem o mesmo trecho; as mais curtas mais perto das caixas.
  const rotas = [], raias = {}, folga = separadas ? 34 : 0;   // folga: os rótulos em cima da 1ª caixa (separadas)
  for (const q of cs) { const a = caixas[q.nome], gs = grupos[q.nome];
    gs.forEach((gr, gi) => { gr.sy = meio(a) - 8 + (gi - (gs.length - 1) / 2) * 14;
      for (const p of gr.para) { const b = caixas[p], tipo = b.col > a.col ? "frente" : b.col === a.col ? "coluna" : "volta";
        rotas.push({ de: q.nome, para: p, a, b, sy: gr.sy, tipo, cima: meio(a) <= H / 2,
          ent: tipo === "frente" ? meio(b) - 10 : (tipo === "coluna" ? a.y < b.y : meio(a) <= H / 2) ? b.y + 8 : b.y + b.h - 8 }); } });
  }
  // separadas: os pontos de cada caixa na ordem da altura do outro lado (as que vêm de cima em cima: não se cruzam na chegada)
  const pontaChega = {}, pontaSai = {};               // "medida|DSP" e "DSP|atuação" → y
  if (separadas) {
    const lado = (r, chega) => r.tipo === "volta" ? (r.cima ? -2e7 : 2e7) : r.tipo === "coluna" ? ((chega ? r.a.y < r.b.y : r.b.y < r.a.y) ? -1e7 : 1e7) : 0;
    for (const n of nomes) {
      const b = caixas[n], chega = [], sai = [];
      for (const r of rotas) { if (r.para === n) chega.push([lado(r, true) + meio(r.a), (y) => { r.ent = y; }]); if (r.de === n) sai.push([lado(r, false) + meio(r.b), (y) => { r.sy = y; }]); }
      for (const e of entradas.values()) if (e.dsps.has(n)) chega.push([e.local ? meio(b) + 8 : e.y + 11, (y) => { pontaChega[`${e.k}|${n}`] = y; if (e.dsps.size === 1) e.y = y - 11; }, altMed(e)]);
      for (const e of sais) if (e.dsps.has(n)) sai.push([e.y + 11, (y) => { pontaSai[`${n}|${e.k}`] = y; if (e.dsps.size === 1) e.y = y - 11; }, altAtu(e)]);
      for (const l of [chega, sai]) {                   // empilhados no meio da caixa, cada um com a sua altura
        let y = meio(b) - l.reduce((t, x) => t + (x[2] || PASSO), 0) / 2;
        l.sort((u, v) => u[0] - v[0]).forEach(([, poe, alt = PASSO]) => { poe(y + alt / 2); y += alt; });
      }
    }
    // os chips das medidas (da esquerda) e das atuações, agora na altura dos pontos, sem se encostar
    for (const [l, passo] of [[ents, 30], [sais, 40]]) { l.sort((u, v) => u.y - v.y).forEach((e, i) => { if (i && e.y < l[i - 1].y + passo - 4) e.y = l[i - 1].y + passo - 4; }); }
  }
  const raia = (canal, i0, i1) => {                     // a primeira raia do canal livre neste trecho
    const l = raias[canal] = raias[canal] || [], [u, v] = i0 < i1 ? [i0, i1] : [i1, i0]; let k = 0;
    while ((l[k] || []).some(([x, y]) => u < y + 6 && x < v + 6)) k++;
    (l[k] = l[k] || []).push([u, v]); return k;
  };
  const longe = (r) => Math.abs(meio(r.b) - r.sy) + (r.tipo === "volta" ? 1e6 : 0);
  for (const r of rotas.filter((x) => x.tipo !== "frente").sort((x, y) => longe(x) - longe(y))) {
    const { a, b } = r;
    if (r.tipo === "coluna") {                         // o vão do lado de quem manda: em cima de quem recebe se vem de cima
      const deCima = a.y < b.y, k = raia(`V${r.para}${deCima ? "c" : "b"}`, 0, 1);
      r.yv = deCima ? b.y - 14 - k * 6 : b.y + b.h + 14 + k * 6;
    } else {                                           // o laço: por cima se quem manda está na metade de cima
      const k = raia(r.cima ? "T" : "B", b.col, a.col + 0.5);
      r.yv = r.cima ? -24 - folga - k * RAIA : H + 24 + k * RAIA;
    }
    r.rd = raia(`R${a.col}`, r.sy, r.yv); r.re = raia(`L${b.col}`, r.yv, r.ent);
  }
  const nRaias = (canal) => (raias[canal] || []).length;
  // 3) o x das colunas: o corredor da direita de uma, o da esquerda da seguinte e as medidas encostadas cabem entre elas
  const loc = Math.max(120, ...Object.values(locais).flat().map((e) => larg(e.rot) + 30));
  const X0 = (globais.length ? Math.max(...globais.map((e) => larg(e.rot))) : 0) + 70 + nRaias("L0") * RAIA, colX = [X0];
  for (let c = 1; c < nCol; c++) colX[c] = colX[c - 1] + WD + Math.max(90, ROT0 + nRaias(`R${c - 1}`) * RAIA + 20) + nRaias(`L${c}`) * RAIA + loc;
  Object.values(caixas).forEach((b) => { b.x = colX[b.col]; });
  const XA = colX[nCol - 1] + WD + Math.max(80, ROT0 + nRaias(`R${nCol - 1}`) * RAIA + 30);   // as atuações: depois do corredor
  const W = XA + Math.max(120, ...sais.map((e) => Math.max(larg(e.rot), 11 + 5.6 * Math.min(28, (e.curta || "").length)))) + 16;
  const topo = folga + (nRaias("T") ? 30 + nRaias("T") * RAIA : 0), fundo = nRaias("B") ? 30 + nRaias("B") * RAIA : 0;
  // o desenho
  svg.innerHTML = ""; svg.setAttribute("width", W + 12); svg.setAttribute("height", H + 30 + topo + fundo);
  svg.setAttribute("viewBox", `-8 ${-12 - topo} ${W + 12} ${H + 30 + topo + fundo}`);
  // as dicas no padrão do MaiSim (maisim-dica.js, pelo atributo title), não a caixinha do navegador que o <title> do SVG mostra
  const dica = (g, t) => g.setAttribute("title", t);
  const el = (tag, at, pai = svg, txt) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); if (txt != null) e.textContent = txt; pai.appendChild(e); return e; };
  const defs = el("defs", {}), mk = el("marker", { id: "cd-seta", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 10, markerHeight: 10, markerUnits: "userSpaceOnUse", orient: "auto-start-reverse" }, defs);   // a ponta não cresce com o destaque
  el("path", { d: "M0 0L10 5L0 10z", fill: "var(--acento)" }, mk);
  const mk2 = el("marker", { id: "cd-seta-a", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: "userSpaceOnUse", orient: "auto" }, defs);
  el("path", { d: "M0 0L10 5L0 10z", fill: COR.atuBorda }, mk2);
  const curva = (x1, y1, x2, y2) => { const dx = Math.max(30, (x2 - x1) / 2); return `M${x1} ${y1}C${x1 + dx} ${y1},${x2 - dx} ${y2},${x2} ${y2}`; };
  const orto = (pts, r = 14) => {                      // em ângulo reto, com os cantos bem arredondados (fluido)
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1], [x, y] = pts[i], [x1, y1] = pts[i + 1], l0 = Math.hypot(x - x0, y - y0) || 1, l1 = Math.hypot(x1 - x, y1 - y) || 1, k = Math.min(r, l0 / 2, l1 / 2);
      d += `L${x - (x - x0) / l0 * k} ${y - (y - y0) / l0 * k}Q${x} ${y} ${x + (x1 - x) / l1 * k} ${y + (y1 - y) / l1 * k}`;
    }
    const [xf, yf] = pts[pts.length - 1]; return `${d}L${xf} ${yf}`;
  };
  const camLig = el("g", {}), camMsg = el("g", {}), camNos = el("g", {});
  const medida = (e, x, y, x2, y2) => {                // o chip da medida e a linha até o DSP
    const g = el("g", { class: "med no", "data-nos": [e.k, ...e.dsps].join("|") }, camNos), w = larg(e.rot);
    el("rect", { x, y, width: w, height: 22, rx: 6 }, g); el("text", { x: x + 9, y: y + 15 }, g, e.rot);
    if (e.dica) dica(g, e.dica);
    for (const n of e.dsps) el("path", { class: "lig", d: curva(x + w, y + 11, x2 != null ? x2 : caixas[n].x,
      separadas ? pontaChega[`${e.k}|${n}`] : y2 != null ? y2 : meio(caixas[n])), "data-nos": `${e.k}|${n}` }, camLig);
  };
  for (const e of ents) medida(e, X0 - 80 - nRaias("L0") * RAIA - larg(e.rot), e.y);
  for (const [n, l] of Object.entries(locais)) { const b = caixas[n], dx = VAO + 14 + nRaias(`L${b.col}`) * RAIA;   // depois do corredor da esquerda
    l.forEach((e, i) => { const y = separadas ? e.y : meio(b) - 5 + i * 26; medida(e, b.x - dx - larg(e.rot), y, b.x, y + 11); }); }   // reta
  for (const e of sais) {                               // DSP → atuações
    const g = el("g", { class: "atu no", "data-nos": [e.k, ...e.dsps].join("|") }, camNos), w = larg(e.rot);
    el("rect", { x: XA, y: e.y, width: w, height: 22, rx: 11, fill: COR.atuFundo, stroke: COR.atuBorda }, g);
    el("text", { x: XA + 9, y: e.y + 15, fill: COR.atuTexto }, g, e.rot);
    if (e.curta || e.dica) { const t = e.curta || e.dica; el("text", { class: "dest", x: XA + 4, y: e.y + 34, fill: "var(--sutil)" }, g, t.length > 28 ? t.slice(0, 27) + "…" : t); dica(g, e.dica || t); }
    for (const n of e.dsps) { const b = caixas[n]; el("path", { class: "esc", d: curva(b.x + b.w, separadas ? pontaSai[`${n}|${e.k}`] : meio(b), XA - 2, e.y + 11), stroke: COR.atuBorda, "marker-end": "url(#cd-seta-a)", "data-nos": `${n}|${e.k}` }, camLig); }
  }
  for (const r of rotas) {                              // as linhas das mensagens
    const { a, b } = r;
    const d = r.tipo === "frente" ? curva(a.x + a.w, r.sy, b.x - 2, r.ent)
      : orto([[a.x + a.w, r.sy], [a.x + a.w + ROT0 + r.rd * RAIA, r.sy], [a.x + a.w + ROT0 + r.rd * RAIA, r.yv],
        [b.x - VAO - r.re * RAIA, r.yv], [b.x - VAO - r.re * RAIA, r.ent], [b.x - 2, r.ent]]);
    el("path", { class: `msg${r.tipo === "volta" ? " volta" : ""}`, d, "marker-end": "url(#cd-seta)", "data-nos": `${r.de}|${r.para}` }, camMsg);
  }
  for (const q of cs) grupos[q.nome].forEach((gr, gi, gs) => {   // os rótulos: logo na saída, por cima das linhas (separadas: em
    const a = caixas[q.nome], txt = curto(gr.chaves), wr = Math.max(larg(txt, 6.8), larg(quando, 5.4));   // cima da caixa, à direita — não cobrem os pontos)
    const lx = separadas ? a.x + a.w - wr / 2 : a.x + a.w + 8 + wr / 2, ly = separadas ? a.y - 17 - (gs.length - 1 - gi) * 30 : gr.sy - 1;
    const g = el("g", { "data-nos": [q.nome, ...gr.para].join("|") }, camMsg);
    dica(g, [`${q.nome} → ${gr.para.join(", ")}: ${gr.chaves.length ? gr.chaves.join(", ") : tr("ctl.conteudo_ilegivel_testar")} · ${quandoLongo}`,
      gr.chaves.length ? (gr.visto ? tr("ctl.o_que_foi", { onde: deOnde }) : tr("ctl.lido_codigo")) : "",
      ...[...new Set(gr.codigo)].map((x) => `  ${x}`),
      ...gr.para.map((p) => {
        if (!gr.chaves.length) return "";
        if (!msgs[p].le.size) return tr("ctl.le_desconhecido", { p });   // não é "nada": não se sabe
        return leMsg(p, gr.chaves, msgs[p].le); })].filter(Boolean).join("\n"));
    el("rect", { class: "fundo-rot", x: lx - wr / 2, y: ly - 13, width: wr, height: 28, rx: 5 }, g);
    el("text", { class: "rot", x: lx, y: ly, "text-anchor": "middle" }, g, txt); el("text", { class: "lat", x: lx, y: ly + 12, "text-anchor": "middle" }, g, quando);
  });
  for (const b of Object.values(caixas)) {              // as caixas dos DSPs por cima
    const q = b.q, g = el("g", { class: "dsp no", "data-arq": q.arquivo, "data-nos": q.nome }, camNos);
    el("rect", { class: "caixa", x: b.x, y: b.y, width: b.w, height: b.h, rx: 9 }, g);
    el("text", { class: "nome", x: b.x + 12, y: b.y + 20 }, g, q.nome);
    el("text", { class: "sub", x: b.x + 12, y: b.y + 36 }, g, q.arquivo);
    let y = b.y + 52;
    if (b.mods.length) { const t = b.mods.join(" → "); el("text", { class: "mods", x: b.x + 12, y }, g, t.length > 30 ? t.slice(0, 29) + "…" : t); y += 16; }
    if ((q.subcircuitos || []).length) el("text", { class: "sub", x: b.x + 12, y }, g, tr("ctl.diag_subs", { n: q.subcircuitos.length }));
    const dd = { nome: q.nome, arq: q.arquivo, le: q.todas ? tr("ctl.todas") : q.medidas.join(", ") || tr("ctl.nada"), esc: q.atuacoes.join(", ") || tr("ctl.nada") };
    dica(g, b.mods.length ? tr("ctl.dica_dsp_mods", { ...dd, mods: b.mods.join(" → ") }) : tr("ctl.dica_dsp", dd));
  }
  if (!ents.length && !sais.length && cs.length === 1 && !msgs[cs[0].nome].envia.length)
    el("text", { class: "vazio", x: X0, y: H + 14 }, svg, tr("ctl.diag_vazio"));
  // encolhe para caber na largura; abaixo de 75 % ficaria ilegível: aí fica no tamanho natural, com rolagem
  const cabe = svg.parentElement.clientWidth - 28; svg.style.maxWidth = cabe > 0 && cabe / W < 0.75 ? "none" : "";
  if (vistaDiag.mexida) aplicaVistaDiag(); else ajustaDiag();
}
// a telinha de escolha do que um controlador lê, escreve e em que subcircuitos vale (Marcelo, 19/10: "com centenas de
// variáveis fica ruim de clicar… um dropdown com filtro e multiselect"): uma vista dos checkboxes do cartão, que continuam
// sendo o que se guarda; marcar aqui marca lá e dispara a mesma mudança (dono único da atuação, "todas", guardar)
const GRUPOS_PICK = { le: { get titulo() { return tr("ctl.g_le"); }, attr: "data-med" }, esc: { get titulo() { return tr("ctl.g_esc"); }, attr: "data-atu-ctl" },
  sub: { get titulo() { return tr("ctl.g_sub"); }, attr: "data-sub" } };
ctl.pick = null;                                         // {nome, g, filtro, ancora}
const cartaoDe = (nome) => [...document.querySelectorAll("#ctl-ctls .ctl-ctl")].find((x) => x.dataset.nome === nome);
function itensPicker() {
  const card = cartaoDe(ctl.pick.nome); if (!card) return null;
  const attr = GRUPOS_PICK[ctl.pick.g].attr;
  return [...card.querySelectorAll(`[${attr}]`)].map((x) => { const v = x.getAttribute(attr);
    const o = ctl.pick.g === "esc" ? [...document.querySelectorAll("#ctl-ctls [data-atu-ctl]")].find((y) => y !== x && y.checked && y.dataset.atuCtl === v) : null;
    return { x, v, rot: x.parentElement.textContent.trim(), dono: o ? o.closest(".ctl-ctl").dataset.nome : "", codigo: x.hasAttribute("data-codigo"), dica: x.parentElement.title || "" }; });
}
function abrePicker(nome, g, sum) {
  fechaPicker();
  ctl.pick = { nome, g, filtro: "" };
  const pk = document.createElement("div"); pk.id = "ctl-pick"; pk.setAttribute("role", "dialog");
  pk.innerHTML = `<div class="cab"><b>${escT(nome)}</b> ${GRUPOS_PICK[g].titulo} <small class="n"></small><button class="fecha" title="${escT(tr("ctl.t_fechar_esc"))}" aria-label="${escT(tr("ctl.a_fechar"))}">✕</button></div>
    <input class="filtro" type="search" placeholder="${escT(tr("ctl.ph_filtrar"))}" aria-label="${escT(tr("ctl.a_filtrar"))}"><div class="corpo"></div>`;
  $("painel-controle").appendChild(pk);
  pk.querySelector(".fecha").onclick = fechaPicker;
  pk.querySelector(".filtro").addEventListener("input", (ev) => { if (!ctl.pick) return; ctl.pick.filtro = ev.target.value; corpoPicker(); });
  pk.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); fechaPicker(); } });
  pk.addEventListener("change", (ev) => {
    if (!ctl.pick || ev.target.classList.contains("filtro")) return;     // o filtro dispara change ao sair (depois do Esc, a telinha já fechou)
    const card = cartaoDe(ctl.pick.nome); if (!card || travado()) return;
    const t = ev.target, attr = GRUPOS_PICK[ctl.pick.g].attr;
    const alvo = t.dataset.pkTodas !== undefined ? card.querySelector("[data-todas]") : [...card.querySelectorAll(`[${attr}]`)].find((x) => x.getAttribute(attr) === t.dataset.pk);
    if (!alvo) return;
    alvo.checked = t.checked; alvo.dispatchEvent(new Event("change", { bubbles: true }));   // o mesmo caminho do cartão
    corpoPicker();
  });
  pk.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pk-tudo]"); if (!b || !ctl.pick || travado()) return;
    const on = b.dataset.pkTudo === "1", q = ctl.pick.filtro.toLowerCase();
    for (const i of itensPicker().filter((i) => !i.x.disabled && (!q || i.rot.toLowerCase().includes(q)))) {
      i.x.checked = on;
      if (on && ctl.pick.g === "esc") document.querySelectorAll("#ctl-ctls [data-atu-ctl]").forEach((y) => { if (y !== i.x && y.dataset.atuCtl === i.v) y.checked = false; });
    }
    infoAtraso(); guardaControle(); corpoPicker();       // de uma vez: um guardar só
  });
  ctl.pick.ancora = sum; posicionaPicker(); corpoPicker(); pk.querySelector(".filtro").focus();
}
function posicionaPicker() {                             // junto da linha clicada, com o zoom do MaiSim (a razão offsetWidth/largura medida)
  const pk = $("ctl-pick"); if (!pk || !ctl.pick) return;
  const card = cartaoDe(ctl.pick.nome), sum = card && card.querySelector(`details[data-g="${ctl.pick.g}"] > summary`);
  const pn = $("painel-controle"), P = pn.getBoundingClientRect(), k = pn.offsetWidth / (P.width || 1);
  if (!sum) return;
  const A = sum.getBoundingClientRect(), h = pk.offsetHeight, alto = pn.offsetHeight;
  let top = (A.bottom - P.top) * k + 4; if (top + h > alto - 6) top = Math.max(6, (A.top - P.top) * k - h - 4);
  pk.style.left = `${Math.max(6, (A.left - P.left) * k)}px`; pk.style.top = `${top}px`;
}
function corpoPicker() {
  const pk = $("ctl-pick"); if (!pk || !ctl.pick) return;
  const card = cartaoDe(ctl.pick.nome), its = card && itensPicker();
  if (!its) { fechaPicker(); return; }
  const todas = ctl.pick.g === "le" ? card.querySelector("[data-todas]") : null, q = ctl.pick.filtro.toLowerCase();
  const vis = its.filter((i) => !q || i.rot.toLowerCase().includes(q)), corpo = pk.querySelector(".corpo"), lista = corpo.querySelector(".lista"), rol = lista ? lista.scrollTop : 0;
  pk.querySelector(".n").textContent = todas && todas.checked ? tr("ctl.todas") : tr("ctl.n_de", { vis: its.filter((i) => i.x.checked).length, total: its.length });
  corpo.innerHTML = `${todas ? `<label class="todas"><input type="checkbox" data-pk-todas ${todas.checked ? "checked" : ""}> ${escT(tr("ctl.pk_todas"))}</label>` : ""}
    <div class="bts"><button data-pk-tudo="1">${escT(tr(q ? "ctl.pk_marcar_filtrados" : "ctl.pk_marcar_todos"))}</button><button data-pk-tudo="0">${escT(tr(q ? "ctl.pk_desmarcar_filtrados" : "ctl.pk_desmarcar_todos"))}</button></div>
    <div class="lista">${vis.map((i) => `<label class="${i.x.disabled ? "off" : ""}"><input type="checkbox" data-pk="${escT(i.v)}" ${i.x.checked ? "checked" : ""} ${i.x.disabled || travado() ? "disabled" : ""}><span>${escT(i.rot)}</span>${i.codigo ? `<small title="${escT(i.dica)}">${escT(tr(ctl.pick.g === "le" ? "ctl.pk_cod_le" : "ctl.pk_cod_esc"))}</small>` : ""}${i.dono ? `<small title="${escT(tr("ctl.t_pk_dono", { dono: i.dono }))}">${escT(tr("ctl.pk_de", { dono: i.dono }))}</small>` : ""}</label>`).join("")
      || `<i>${escT(its.length ? tr("ctl.nada_filtro") : ctl.pick.g === "esc" ? tr("ctl.marque_atuacoes") : tr("ctl.nada"))}</i>`}</div>`;
  corpo.querySelector(".lista").scrollTop = rol;
  posicionaPicker();
}
function fechaPicker() { ctl.pick = null; const pk = $("ctl-pick"); if (pk) pk.remove(); }
// um controlador para o arquivo (o 1º: o controle.py de sempre entra na lista com a mesma visão — lê todas, escreve as marcadas)
function ligaArquivo(c, a) {
  if (!c.controladores.length) c.controladores.push({ nome: "controle", arquivo: "controle.py", todas: true, medidas: [], atuacoes: c.atuacoes.slice(), subcircuitos: [] });
  if (!c.controladores.some((q) => q.arquivo === a)) c.controladores.push({ nome: nomeDoArquivo(a), arquivo: a, todas: false, medidas: [], atuacoes: [], subcircuitos: [] });
}
// só o controle.py de sempre na lista (lê todas, escreve todas as marcadas): volta a lista vazia (o de sempre)
function enxuga(c) {
  const [q] = c.controladores;
  if (c.controladores.length === 1 && q.arquivo === "controle.py" && q.todas && !q.subcircuitos.length && c.atuacoes.every((x) => q.atuacoes.includes(x))) c.controladores = [];
}
function atualizaArvore() {                             // a árvore acompanha a aba aberta e os erros (sem redesenhar os cartões)
  const comErro = new Set(((ctl.dados && ctl.dados.erros) || []).map(arquivoDe));
  document.querySelectorAll("#ctl-ctls .ctl-no").forEach((x) => { x.classList.toggle("ativo", x.dataset.abre === ctl.arq); x.classList.toggle("com-erro", comErro.has(x.dataset.abre)); });
  $("ctl-vistas").querySelector('[data-vista="arq"]').classList.toggle("com-erro", comErro.size > 0 && [...comErro].some((a) => a !== "controle.py"));
}
// a coluna mostra as variáveis (Ts, atuações, medidas, parâmetros, acionamentos) ou os arquivos (a árvore, os controladores, a rede)
function mostraVista(v) {
  v = v === "arq" ? "arq" : "var";
  $("ctl-v-var").hidden = v !== "var"; $("ctl-v-arq").hidden = v !== "arq";
  $("ctl-vistas").querySelectorAll("button").forEach((b) => { b.classList.toggle("ativo", b.dataset.vista === v); b.setAttribute("aria-selected", String(b.dataset.vista === v)); });
  try { localStorage.setItem("maisim-simu-ctl-vista", v); } catch (e) { /* vale até recarregar */ }
}
function infoRede() {                                    // a latência da rede em amostras: chega na 1ª amostra depois do envio com t ≥ t + τ
  const dt = Number(sim.par.dt) || 1e-6, Ts = Math.max(1, Math.round((Number(String($("ctl-ts").value).replace(",", ".")) || 0) / dt)) * dt;
  const tau = Number(String($("ctl-rede-lat").value).replace(",", "."));
  if (!(tau >= 0)) { poeInfo("ctl-rede", [[tr("ctl.lat_invalida"), true]]); return; }
  const n = Math.max(1, Math.ceil(tau / Ts - 1e-9));
  poeInfo("ctl-rede", [[tr("ctl.rede_info", { n, t: si(n * Ts, "s") }), false]]);
}
// aonde o CONST chega (o servidor segue as ligações de controle: GATE → chave, fonte controlada por sinal, blocos no meio)
function destinoTexto(a) {
  const q = a.destinos || [];
  if (!q.length) return tr("ctl.dest_nada");
  return "→ " + q.map((x) => {                         // x.tipo vem do servidor: chave | fonte | subcircuito
    const alvo = x.tipo === "chave" ? tr("ctl.dest_chave", { nome: x.nome || tr("ctl.gate_sem_chave") }) : x.tipo === "fonte" ? tr("ctl.dest_fonte", { nome: x.nome }) : tr("ctl.dest_sai", { nome: x.nome });
    return x.via && x.via.length ? tr("ctl.dest_via", { alvo, via: x.via.join(", ") }) : alvo; }).join(", ");
}
// as explicações vão para a dica do ⓘ ao lado do campo (cabe mais na coluna); à vista ficam só os alertas (⚠)
function poeInfo(id, linhas) {
  const el = $(`${id}-info`), i = $(`${id}-i`);
  el.innerHTML = linhas.filter(([, a]) => a).map(([t]) => `<span class="ctl-alerta">${escT(t)}</span>`).join("<br>");
  if (i) { i.title = linhas.map(([t, a]) => (a ? "⚠ " : "") + t).join("\n"); i.classList.toggle("alerta", linhas.some(([, a]) => a)); }
}
// Ts × Δt: quantos passos do Gecko por amostra, quantas chamadas de passo() na rodada, quanto chega ao scope
function infoTs() {
  const dt = Number(sim.par.dt) || 1e-6, tfim = Number(sim.par.tfim) || 0, passos = Math.round(tfim / dt);
  const amPedidas = parseInt(sim.par.amostras, 10), am = Math.max(10, Math.min(passos, Number.isFinite(amPedidas) ? amPedidas : 4000));   // como em _rodar
  const Ts = Number(String($("ctl-ts").value).replace(",", ".")) || 0;
  if (!(Ts > 0)) { poeInfo("ctl-ts", [[tr("ctl.ts_invalido"), true]]); return; }
  const n = Math.max(1, Math.round(Ts / dt)), N = Math.ceil(passos / n), cada = Math.max(1, Math.ceil(N / am));
  const virgula = maisimI18n.lingua() === "pt";        // o decimal: vírgula em português, ponto em inglês
  const seg = (x) => (x < 60 ? `${x < 10 ? (virgula ? x.toFixed(1).replace(".", ",") : x.toFixed(1)) : Math.round(x)} s` : `${Math.round(x / 60)} min`);
  const linhas = [[tr("ctl.ts_info", { n, dt: si(dt, "s"), ef: si(n * dt, "s") }), false]];
  if (Ts < dt * (1 - 1e-9)) linhas.push([tr("ctl.ts_menor", { dt: si(dt, "s") }), true]);
  else if (Math.abs(n * dt - Ts) > 1e-9 * Ts) linhas.push([tr("ctl.ts_multiplo", { n, ef: si(n * dt, "s") }), true]);
  if (tfim > 0) linhas.push([tr("ctl.ts_chamadas", { vezes: maisimI18n.num(N), tfim: si(tfim, "s"), de: seg(N * 1e-3), ate: seg(N * 3e-3) }), N > 2e5]);
  if (tfim > 0 && cada > 1) linhas.push([tr("ctl.ts_scope", { cada, t: si(cada * n * dt, "s") }), false]);
  poeInfo("ctl-ts", linhas);
}
// o tipo de um destino (do servidor: chave | fonte | subcircuito) no idioma; um tipo novo aparece como veio
const tipoDestino = (t) => (maisimI18n.tem(`ctl.tipo.${t}`) ? tr(`ctl.tipo.${t}`) : t);
function infoAtraso() {
  const dt = Number(sim.par.dt) || 1e-6, Ts = Number($("ctl-ts").value.replace(",", ".")) || 0, n = Math.max(1, Math.round(Ts / dt)), modo = $("ctl-atraso").value;
  const d = modo === "amostra" ? n : modo === "tempo" ? Math.min(n, Math.max(1, Math.round((Number($("ctl-atraso-t").value.replace(",", ".")) || 0) / dt))) : 1;
  const linhas = [[tr("ctl.atraso_info", { d, t: si(d * dt, "s") }), false]];
  // o servidor compensa o atraso próprio do Gecko (chave direto no GATE: no passo da escrita; fonte: um depois; bloco no
  // meio: mais um); o que não dá para compensar fica avisado aqui, com o mesmo motivo que a rodada dá (destinos_fora_do_passo)
  const marc = new Set([...document.querySelectorAll("#ctl-atu [data-atu]")].filter((x) => x.checked).map((x) => x.dataset.atu));
  for (const a of ((ctl.dados && ctl.dados.atuadores) || []).filter((x) => marc.has(x.nome))) {
    const lag = a.atraso_gecko == null ? 1 : a.atraso_gecko, desl = Math.max(0, d - lag);
    if (!(a.destinos || []).length) linhas.push([tr("ctl.atraso_sem_destino", { nome: a.nome }), true]);
    for (const q of a.destinos || []) {
      const alvo = `${tipoDestino(q.tipo)} ${q.nome || q.gate || ""}`;
      if (q.atraso == null) { linhas.push([tr("ctl.atraso_sub", { nome: a.nome, alvo }), true]); continue; }
      const ef = desl + q.atraso;
      if (ef !== d) linhas.push([q.atraso === lag ? tr("ctl.atraso_gecko", { nome: a.nome, alvo, ef, min: q.atraso })
        : tr("ctl.atraso_varios", { nome: a.nome, alvo, ef }), true]);
    }
  }
  poeInfo("ctl-atraso", linhas);
}
function coleta() {
  const c = ctl.dados ? ctl.dados.controle : { atuacoes: [] };
  const porI = (sel) => [...document.querySelectorAll(sel)].sort((a, b) => a.dataset.i - b.dataset.i);   // a ordem do painel, não a da vista
  const pars = porI("#ctl-par .ctl-par").map((r) => ({ nome: r.querySelector('[data-k="nome"]').value.trim(),
    valor: Number(r.querySelector('[data-k="valor"]').value.replace(",", ".")) || 0, unidade: r.querySelector('[data-k="unidade"]').value.trim() }));
  // número digitado (vírgula ou ponto); texto que não é número marca o campo e a configuração não é gravada
  let invalido = null;
  const num = (el, padrao = null) => { const txt = String(el.value).trim().replace(",", "."), v = txt === "" && padrao !== null ? padrao : Number(txt);
    const ok = txt !== "" || padrao !== null ? Number.isFinite(v) : false; el.classList.toggle("invalido", !ok); if (!ok && !invalido) invalido = el; return v; };
  const acs = porI("#ctl-ac .ctl-ac").map((r) => ({ t: num(r.querySelector('[data-k="t"]')),
    alvo: r.querySelector('[data-k="alvo"]').value, valor: num(r.querySelector('[data-k="valor"]')) })).filter((q) => q.alvo);
  const lat = $("ctl-atraso").value === "tempo" ? num($("ctl-atraso-t")) : (Number(String($("ctl-atraso-t").value).replace(",", ".")) || 0);
  for (const r of porI("#ctl-par .ctl-par")) num(r.querySelector('[data-k="valor"]'), 0);
  const ts = num($("ctl-ts"));
  const latRede = $("ctl-rede").style.display === "none" ? ((c.rede && c.rede.latencia) || 0) : num($("ctl-rede-lat"), 0);
  if (invalido) return { invalido };
  const marcados = (r, attr) => [...r.querySelectorAll(`[${attr}]`)].filter((x) => x.checked).map((x) => x.getAttribute(attr));
  const ctls = [...document.querySelectorAll("#ctl-ctls .ctl-ctl")].sort((a, b) => a.dataset.i - b.dataset.i).map((r) => {
    const todas = !!(r.querySelector("[data-todas]") || {}).checked;
    return { nome: r.dataset.nome, arquivo: r.dataset.arquivo, todas, medidas: todas ? [] : marcados(r, "data-med"), atuacoes: marcados(r, "data-atu-ctl"), subcircuitos: marcados(r, "data-sub") }; });
  return { ativo: $("ctl-ativo").checked, Ts: ts || c.Ts || 1e-4,
    atuacoes: [...document.querySelectorAll("#ctl-atu [data-atu]")].filter((x) => x.checked).map((x) => x.dataset.atu),
    parametros: pars.filter((q) => q.nome), codigo: codigoAtual(), arquivos: arquivosDoEditor(), controladores: ctls, rede: { latencia: latRede },
    atraso: { modo: $("ctl-atraso").value, tempo: lat }, acionamentos: acs };
}
function agendaGuardar() { clearTimeout(ctl.timer); poeEstado(tr("ctl.editando")); ctl.timer = setTimeout(guardaControle, 600); }
async function guardaControle() {
  clearTimeout(ctl.timer); ctl.timer = null;
  if (!ctl.carregado) return true;
  if (document.body.classList.contains("sim-rodando")) return false;
  const pedido = coleta();
  if (pedido.invalido) {
    const campo = pedido.invalido.placeholder || pedido.invalido.title || tr("ctl.um_campo");
    ctl.erroGuardar = tr("ctl.valor_invalido", { campo });
    poeEstado(tr("ctl.valor_invalido_corrija", { campo }), "erro"); return false;
  }
  try {
    const j = await api("editor/controle", { controle: pedido }); ctl.erroGuardar = "";
    const editandoPar = document.activeElement && document.activeElement.closest && document.activeElement.closest("#ctl-par, #ctl-ac, .ctl-ts, .ctl-ctl input[data-k]");
    ctl.dados = j; if (!editandoPar) desenhaLigacoes(); else $("ctl-avisos").innerHTML = avisosDoPainel(j.avisos, j.compartilhados) + avisoSemEsquema();
    if (ctl.idiomaPendente) redesenhaIdioma();          // o idioma trocou com um valor inválido à vista: agora vale para tudo
    marcaErros(j.erros, j.conferencia); estadoCodigo(j); desenhaEntradas();
    if (editandoPar) desenhaInstancias();
    if (typeof avisa === "function") avisa("controle");       // a outra janela (a do código, ou a do circuito) acompanha
    if (dados) desenha();                                  // as etiquetas dos atuadores no desenho
    return true;
  } catch (er) { ctl.erroGuardar = er.message; poeEstado(er.message, "erro"); return false; }
}
// outra janela gravou o controle: traz o que ela gravou (digitando aqui, vale o que se guardar daqui: o último a gravar)
async function sincronizaControle() {
  if (!ctl.carregado) { try { ctl.dados = await api("editor/controle"); if (dados) desenha(); } catch (e) { /* ok */ } return; }
  if (ctl.timer || travado()) return;
  try { const j = await api("editor/controle"); ctl.dados = j; poeArquivos(j.controle); desenhaLigacoes(); marcaErros(j.erros, j.conferencia, false); estadoCodigo(j);
    if (dados) desenha(); } catch (e) { /* fica o de antes */ }
}
function desenhaInstancias() {                          // só o resumo das instâncias (sem redesenhar o campo que está sendo digitado)
  const d = ctl.dados; document.querySelectorAll("#ctl-ctls .ctl-ctl").forEach((r) => {
    const q = (d.controle.controladores || [])[+r.dataset.i]; const el = r.querySelector(".inst"); if (!q || !el) return;
    const insts = (d.instancias || []).filter((x) => x.controlador === q.nome); el.textContent = insts.length ? `→ ${insts.map((x) => x.nome).join(", ")}` : ""; });
}
// txt: o texto, ou uma função que o monta (a troca de idioma monta de novo: o que vem do servidor fica como veio)
function saidaControle(txt, tipo = "", ctx = null) {   // ctx: {arquivo, linha} do erro (senão, tirados do texto)
  const monta = typeof txt === "function" ? txt : null; if (monta) txt = monta();
  const s = $("ctl-saida"); s.textContent = txt; s.className = tipo; $("ctl-saida-caixa").style.display = txt ? "" : "none";
  ctl.saida = { txt, tipo, ctx, monta };
  $("ctl-saida-claude").style.display = tipo === "erro" ? "" : "none";
}
// o erro para colar (ou para o Claude do MaiSim): o texto da saída e o trecho do arquivo em volta da linha, com ▶ na do erro
function textoDoErro() {
  const S = ctl.saida || { txt: "" }, ctx = S.ctx || {};
  const m = String(S.txt).match(/([\w.-]+\.py) (?:linha|line) (\d+)/);   // o texto do servidor (em português ou em inglês)
  const arq = ctx.arquivo || (m && m[1]), linha = +(ctx.linha || (m && m[2]) || 0);
  let out = S.txt.trim();
  const cod = arq && ctl.lista.includes(arq) ? textoDe(arq).split("\n") : null;
  if (cod && linha >= 1 && linha <= cod.length) {
    const a = Math.max(1, linha - 6), b = Math.min(cod.length, linha + 3), w = String(b).length;
    out += `\n\n${tr("ctl.trecho", { arq, a, b })}\n` +
      cod.slice(a - 1, b).map((l, k) => `${a + k === linha ? "▶" : " "} ${String(a + k).padStart(w)} | ${l}`).join("\n");
  }
  return out;
}
async function copiaTexto(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch (e) { /* sem a área de transferência: o jeito antigo */ }
  const t = document.createElement("textarea"); t.value = txt; t.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(t); t.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch (e) { /* ok */ } t.remove(); return ok;
}
// chave: o texto do botão no dicionário — volta no idioma da hora (o idioma pode mudar nesse 1,5 s)
function feito(bt, txt, chave = null) { const antes = bt.textContent; bt.textContent = txt; bt.classList.add("feito");
  setTimeout(() => { bt.textContent = chave ? tr(chave) : antes; bt.classList.remove("feito"); }, 1500); }

// abrir o painel (1ª vez: carrega do servidor e cria o editor); recarregar quando outro circuito é aberto
async function abreControle() {
  if (ctl.carregado) return;
  try {
    ctl.dados = await api("editor/controle");
    ctl.lista = ["controle.py", ...Object.keys(ctl.dados.controle.arquivos || {}).sort()];
    ctl.carregado = true; desenhaLigacoes();
    await criaEditor(ctl.dados.controle);
    desenhaAbas(); desenhaEntradas(); desenhaLigacoes(); aplicaTabela(); marcaErros(ctl.dados.erros); estadoCodigo(ctl.dados);
    if (dados) desenha();
  } catch (e) { poeEstado(e.message, "erro"); }
}
async function recarregaControle() {                    // outro circuito (Abrir, Novo): o controle dele
  if (!ctl.carregado) { try { ctl.dados = await api("editor/controle"); if (dados) desenha(); } catch (e) { /* ok */ } return; }
  try { ctl.dados = await api("editor/controle"); poeArquivos(ctl.dados.controle); desenhaLigacoes(); marcaErros(ctl.dados.erros); estadoCodigo(ctl.dados); saidaControle("");
    if (dados) desenha(); } catch (e) { /* ok */ }
  if (typeof cc !== "undefined" && cc.aberto) { cc.antes = null; atualizaChat(); }   // a conversa é por circuito
}
function ligacoesMudaram() {                            // o circuito mudou: medidas e atuadores podem ser outros
  clearTimeout(ctl.timerLig);
  ctl.timerLig = setTimeout(async () => {
    try { const j = await api("editor/controle"); const cod = ctl.carregado ? codigoAtual() : null, outros = ctl.carregado ? arquivosDoEditor() : null;
      ctl.dados = j; if (ctl.carregado) { j.controle.codigo = cod; j.controle.arquivos = outros; desenhaLigacoes(); if (!ctl.timer) { marcaErros(j.erros, j.conferencia); estadoCodigo(j); } }
      if (dados) desenha(); } catch (e) { /* ok */ }
  }, 400);
}
function travaControle(on) {                           // simulação rodando: código e painel só para leitura
  if (on && !document.body.classList.contains("sim-rodando")) clearTimeout(ctl.timer);
  document.body.classList.toggle("sim-rodando", on);
  $("ctl-trava").style.display = on ? "" : "none";
  document.querySelectorAll("#ctl-lado input, #ctl-lado select, #ctl-lado button, #ctl-tabela tbody input, #ctl-tabela tbody select, #ctl-tabela tbody button, .ct-mais, #ctl-modelo, #ctl-testar").forEach((x) => { x.disabled = on; });
  if (ctl.editor) ctl.editor.updateOptions({ readOnly: on }); if (ctl.texto) ctl.texto.readOnly = on;
  if (typeof cc !== "undefined" && cc.aberto) desenhaChat();          // "aplicar" a proposta do Claude espera a rodada
}
function mostraErroControle(j) {                        // erro no código durante a rodada: abre o painel na linha
  mostraDoca("controle");
  const linha = j.erro_controle && j.erro_controle.linha, arq = (j.erro_controle && j.erro_controle.arquivo) || "controle.py";
  if (ctl.lista.includes(arq)) mostraArquivo(arq);
  marcaErros(linha ? [{ linha, coluna: 1, msg: j.erro, arquivo: arq }] : [], []);
  saidaControle([j.erro, j.erro_controle && j.erro_controle.rastro, j.saida_controle].filter(Boolean).join("\n\n"), "erro", { arquivo: arq, linha });
}
// atuadores no desenho: etiqueta "→ nome" na saída dos blocos CONST marcados
function atuadorDe(e) {
  const d = ctl.dados; if (!d || e.tipo !== "CONST") return null;
  const a = d.atuadores.find((x) => x.folha === folhaAtual && x.elemento === e.nome);
  return a && d.controle.atuacoes.includes(a.nome) ? a.nome : null;
}
function tagAtuador(g, x, y, nome, centrada = false) {   // centrada: x é o meio da etiqueta (em cima do bloco)
  const w = 1.0 + 0.33 * nome.length;
  const gg = no("g", { class: "tag-atuador", transform: `translate(${(centrada ? x - w / 2 : x) * G},${y * G})` }, g);
  no("rect", { x: 0, y: -0.36 * G, width: w * G, height: 0.72 * G, rx: 0.36 * G, fill: COR.atuFundo, stroke: COR.atuBorda, "stroke-width": 1 }, gg);
  texto(gg, 0.22, 0.02, "⚙", { fill: COR.atuIcone, "font-size": 0.5 * G, "dominant-baseline": "middle" });
  texto(gg, 0.8, 0.02, nome, { fill: COR.atuTexto, "font-size": 0.46 * G, "font-weight": 600, "dominant-baseline": "middle" });
}

// eventos da coluna da esquerda
(() => {
  const lado = $("ctl-lado");
  lado.addEventListener("change", (ev) => {
    if (!ev.target.closest("input, select")) return;
    const t = ev.target;
    if (t.matches("[data-atu-ctl]") && t.checked)               // cada atuação tem um dono só: sai dos outros
      document.querySelectorAll("#ctl-ctls [data-atu-ctl]").forEach((x) => { if (x !== t && x.dataset.atuCtl === t.dataset.atuCtl) x.checked = false; });
    if (t.matches("[data-todas]"))                                // "todas" desligado: começa com todas marcadas (tire as que não)
      t.closest(".ctl-ctl").querySelectorAll("[data-med]").forEach((x) => { x.disabled = t.checked; x.checked = true; });
    if (ev.target.id === "ctl-ts") desenhaLigacoesTs();
    if (ev.target.id === "ctl-atraso") $("ctl-atraso-tempo").style.display = ev.target.value === "tempo" ? "" : "none";
    infoAtraso(); guardaControle();
  });
  lado.addEventListener("input", (ev) => { if (ev.target.id === "ctl-ts") desenhaLigacoesTs(); if (ev.target.id === "ctl-ts" || ev.target.id === "ctl-atraso-t") infoAtraso(); });
  const tab = $("ctl-tabela");
  tab.addEventListener("click", (ev) => {
    const ins = ev.target.closest("[data-ins]"); if (ins) { ev.preventDefault(); insereNoCodigo(ins.dataset.ins); return; }
    const vai = ev.target.closest("[data-vai]"); if (vai) { const i = vai.dataset.vai.lastIndexOf(":"); vaiParaLinha(vai.dataset.vai.slice(0, i), +vai.dataset.vai.slice(i + 1)); return; }
    const th = ev.target.closest("th[data-col]");
    if (th) {                                            // ordenar: crescente → decrescente → a ordem do painel
      const k = th.closest("table").dataset.t, o = ctl.ordem[k], col = th.dataset.col;
      ctl.ordem[k] = !o || o.col !== col ? { col, desc: false } : !o.desc ? { col, desc: true } : undefined;
      if (!ctl.ordem[k]) delete ctl.ordem[k];
      if (ctl.dados) { const c = coleta(); if (!c.invalido) Object.assign(ctl.dados.controle, c); }   // o que foi digitado não se perde
      guardaTabelas(); marcaOrdem(); desenhaLigacoes(); return;
    }
    const rm = ev.target.closest("[data-rm]");
    if (rm && ctl.dados) { const c = coleta(); if (c.invalido) return; c.parametros.splice(+rm.dataset.rm, 1); Object.assign(ctl.dados.controle, c); desenhaLigacoes(); guardaControle(); }
    const rmAc = ev.target.closest("[data-rm-ac]");
    if (rmAc && ctl.dados) { const c = coleta(); if (c.invalido) return; c.acionamentos.splice(+rmAc.dataset.rmAc, 1); Object.assign(ctl.dados.controle, c); desenhaLigacoes(); guardaControle(); }
  });
  tab.addEventListener("change", (ev) => { if (!ev.target.closest("tbody") || !ev.target.closest("input, select")) return; infoAtraso(); guardaControle(); });
  $("ct-filtro").addEventListener("input", () => { if (!ctl.tabela) return; ctl.filtro[ctl.tabela] = $("ct-filtro").value; filtraTabela(); });
  const alterna = (k) => (ctl.tabela === k ? fechaTabela() : mostraTabela(k));      // o item à vista de novo: volta ao código
  lado.addEventListener("click", (ev) => { const vi = ev.target.closest("#ctl-var-lista [data-tabela]"); if (vi) alterna(vi.dataset.tabela); });
  lado.addEventListener("keydown", (ev) => { const vi = ev.target.closest("#ctl-var-lista [data-tabela]"); if (vi && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); alterna(vi.dataset.tabela); } });
  $("ct-fecha").onclick = fechaTabela;
  $("ctl-par-novo").onclick = () => { if (!ctl.dados) return; const c = coleta(); let k = 1; while (c.parametros.some((q) => q.nome === `k${k}`)) k++;
    if (c.invalido) return; c.parametros.push({ nome: `k${k}`, valor: 0, unidade: "" }); Object.assign(ctl.dados.controle, c); ctl.filtro.par = ""; $("ct-filtro").value = ""; desenhaLigacoes();
    const nova = document.querySelector(`#ctl-par .ctl-par[data-i="${c.parametros.length - 1}"]`); if (nova) { nova.scrollIntoView({ block: "nearest" }); nova.querySelector('[data-k="nome"]').select(); } guardaControle(); };
  $("ctl-ac-novo").onclick = () => { if (!ctl.dados) return; const c = coleta(), d = ctl.dados; if (c.invalido) return;
    const alvo = d.atuadores.length ? `CONST:${d.atuadores[0].nome}` : c.parametros.length ? `p:${c.parametros[0].nome}` : "";
    if (!alvo) { saidaControle(() => (d.circuito ? tr("ctl.ac_sem_alvo") : tr("ctl.ac_sem_alvo_edicao")), "aviso"); return; }
    c.acionamentos.push({ t: 0, alvo, valor: 0 }); Object.assign(ctl.dados.controle, c); ctl.filtro.ac = ""; $("ct-filtro").value = ""; desenhaLigacoes();
    const nova = document.querySelector(`#ctl-ac .ctl-ac[data-i="${c.acionamentos.length - 1}"]`); if (nova) { nova.scrollIntoView({ block: "nearest" }); nova.querySelector('[data-k="t"]').select(); } guardaControle(); };
  $("ctl-abas").addEventListener("click", (ev) => {
    const f = ev.target.closest("[data-fecha-aba]"); if (f) { ev.stopPropagation(); fechaAba(f.dataset.fechaAba); return; }   // fecha a aba (não apaga)
    if (ev.target.closest("#ctl-arq-novo")) { novoArquivo(); return; }
    const a = ev.target.closest(".aba[data-arq]"); if (a) mostraArquivo(a.dataset.arq);
  });
  $("ctl-abas").addEventListener("dblclick", (ev) => { const a = ev.target.closest(".aba[data-arq]"); if (a && !ev.target.closest("[data-fecha-aba]")) renomeiaArquivo(a.dataset.arq); });
  lado.addEventListener("click", (ev) => {
    const sm = ev.target.closest("#ctl-ctls .ctl-ctl details.grupo > summary");
    if (sm) { ev.preventDefault(); const dt = sm.parentElement, nome = dt.closest(".ctl-ctl").dataset.nome;
      if (ctl.pick && ctl.pick.nome === nome && ctl.pick.g === dt.dataset.g) fechaPicker(); else abrePicker(nome, dt.dataset.g, sm); return; }
    const cb = ev.target.closest("[data-card]");
    if (cb) { const k = cb.dataset.card; ctl.cartoesFechados.has(k) ? ctl.cartoesFechados.delete(k) : ctl.cartoesFechados.add(k);
      try { localStorage.setItem("maisim-simu-ctl-cartoes", JSON.stringify([...ctl.cartoesFechados])); } catch (e) { /* ok */ }
      if (ctl.pick && ctl.pick.nome) fechaPicker(); desenhaControladores(); return; }
    const st = ev.target.closest("[data-seta]");
    if (st) { const k = st.dataset.seta; ctl.recolhidos.has(k) ? ctl.recolhidos.delete(k) : ctl.recolhidos.add(k);
      try { localStorage.setItem("maisim-simu-ctl-recolhidos", JSON.stringify([...ctl.recolhidos])); } catch (e) { /* ok */ } desenhaControladores(); return; }
    const f = ev.target.closest("#ctl-ctls [data-fecha]"); if (f) { apagaArquivo(f.dataset.fecha); return; }
    const vai = ev.target.closest("#ctl-busca-res [data-vai]"); if (vai) { const i = vai.dataset.vai.lastIndexOf(":"); vaiParaLinha(vai.dataset.vai.slice(0, i), +vai.dataset.vai.slice(i + 1)); return; }
    const no_ = ev.target.closest("#ctl-ctls .ctl-no, #ctl-busca-res .ctl-no"); if (no_ && !ev.target.closest("[data-liga], [data-desliga]")) { mostraArquivo(no_.dataset.abre); return; }   // i18n-ok: um seletor
    const vista = ev.target.closest("#ctl-vistas [data-vista]"); if (vista) { mostraVista(vista.dataset.vista); return; }
    if (ev.target.closest("[data-dsp]")) { organizaDSP(); return; }
    const desliga = ev.target.closest("[data-desliga]");      // controlador → módulo: sai da lista (quem importa chama)
    if (desliga && ctl.dados && !travado()) { const c = coleta(); if (c.invalido) return;
      c.controladores = c.controladores.filter((q) => q.arquivo !== desliga.dataset.desliga); enxuga(c);
      Object.assign(ctl.dados.controle, c); desenhaLigacoes(); guardaControle(); return; }
    const liga = ev.target.closest("[data-liga]");             // módulo (ou arquivo que não roda) → controlador
    if (!liga || !ctl.dados || travado()) return;
    const c = coleta(); if (c.invalido) return;
    ligaArquivo(c, liga.dataset.liga); Object.assign(ctl.dados.controle, c); desenhaLigacoes(); guardaControle();
  });
  lado.addEventListener("dblclick", (ev) => { const no_ = ev.target.closest("#ctl-ctls .ctl-no"); if (no_ && !ev.target.closest("[data-fecha]")) renomeiaArquivo(no_.dataset.abre); });
  $("ctl-arq-novo2").onclick = () => novoArquivo();
  $("ctl-arq-busca").addEventListener("input", buscaArquivos);
  $("ctl-diag-bt").onclick = () => (ctl.tabela === "diag" ? fechaTabela() : mostraTabela("diag"));
  $("cd-fecha").onclick = fechaTabela;
  $("ctl-diag-svg").addEventListener("click", (ev) => { const g = ev.target.closest(".dsp"); if (g && Date.now() - (ctl.diagArrastou || 0) > 300) mostraArquivo(g.dataset.arq); });
  ligaVistaDiag();
  // o mouse num bloco: ficam acesos ele, as linhas dele (mais grossas) e os blocos do outro lado delas (Marcelo, 21/10:
  // "além de destacar, podia destacar quem ele tá conectado") — o resto apaga
  $("ctl-diag-svg").addEventListener("mouseover", (ev) => {
    const no_ = ev.target.closest(".no"), svg = $("ctl-diag-svg"); if (!no_) return;
    const meus = new Set(no_.dataset.nos.split("|")), vizinhos = new Set(meus);
    svg.querySelectorAll("path[data-nos]").forEach((x) => { const ns = x.dataset.nos.split("|"); if (ns.some((n) => meus.has(n))) ns.forEach((n) => vizinhos.add(n)); });
    svg.querySelectorAll("[data-nos]").forEach((x) => {
      const ns = x.dataset.nos.split("|"), meu = ns.some((n) => meus.has(n));
      const aceso = x === no_ || meu || (x.classList.contains("no") && vizinhos.has(ns[0]));
      x.classList.toggle("apagado", !aceso); x.classList.toggle("ligado", x.tagName === "path" && meu);
    });
  });
  $("ctl-diag-svg").addEventListener("mouseleave", () => $("ctl-diag-svg").querySelectorAll(".apagado, .ligado").forEach((x) => x.classList.remove("apagado", "ligado")));
  document.addEventListener("mousedown", (ev) => { if (ctl.pick && !ev.target.closest("#ctl-pick, .ctl-ctl details.grupo > summary")) fechaPicker(); });
  lado.addEventListener("scroll", posicionaPicker);
  $("ctl-arq-busca").addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.target.value = ""; buscaArquivos(); } });
  $("ctl-fora-bt").onclick = () => { document.body.classList.add("codigo-aqui"); requestAnimationFrame(() => { if (dados) reajustaAspecto(); }); };   // editar também aqui (vale o último a guardar)
  $("ctl-fora-ir").onclick = () => irPara("codigo", "maisim-codigo", "/maisim/simu/?vista=codigo&janela=1", (l) => /[?&]vista=codigo/.test(l.search));   // a janela do código para a frente
  $("ctl-lado-bt").onclick = () => poeLado(!$("painel-controle").classList.contains("sem-lado"));
  let semLado = false; try { semLado = localStorage.getItem("maisim-simu-ctl-sem-lado") === "1"; } catch (e) { /* ok */ }
  poeLado(semLado);
  let vistaGuardada = "var"; try { vistaGuardada = localStorage.getItem("maisim-simu-ctl-vista") || "var"; } catch (e) { /* ok */ }
  mostraVista(vistaGuardada);
  $("ctl-rede-lat").addEventListener("input", infoRede);
  $("ctl-guia").onclick = () => window.open("static/guia.html", "_blank");
  $("ctl-quebra").onclick = () => poeQuebra(!ctl.quebra);
  $("ctl-quebra").classList.toggle("ativo", ctl.quebra); $("ctl-quebra").setAttribute("aria-pressed", String(ctl.quebra));
  $("ctl-testar").onclick = testaControle;
  $("ctl-saida-fecha").onclick = () => { $("ctl-saida-caixa").style.display = "none"; };
  $("ctl-saida-copia").onclick = async () => { const bt = $("ctl-saida-copia"); feito(bt, (await copiaTexto(ctl.saida && ctl.saida.tipo === "erro" ? textoDoErro() : $("ctl-saida").textContent)) ? tr("ctl.copiado") : tr("ctl.nao_deu"), "ctl.saida_copia"); };
  $("ctl-saida-claude").onclick = () => {                  // a conversa abre com o pedido escrito; quem envia é você
    if (typeof ccAbre !== "function") return;
    ccAbre(true);
    const caixa = $("cc-texto"), pedido = tr("ctl.pedido_erro") + "\n\n" + textoDoErro();
    caixa.value = caixa.value.trim() ? caixa.value.trimEnd() + "\n\n" + pedido : pedido;
    setTimeout(() => { caixa.focus(); caixa.setSelectionRange(caixa.value.length, caixa.value.length); caixa.scrollTop = 0; }, 80);
  };   // a saída do testar (e da rodada) fecha; o ▷ Testar abre de novo
  $("ctl-modelo").onclick = async () => { if (await confirma(tr("ctl.modelo_titulo"), tr("ctl.modelo_texto_html", { arq: ctl.arq }), tr("ctl.trocar"), true)) {
    const d = modelosCodigo(), ms = d.modelos;
    poeCodigo(ctl.arq === "controle.py" ? (d.modelo || "") : ms[ctl.arq] || (ehModulo(ctl.arq) ? ms.modulo : ms.outro) || "", ctl.arq);
    if (ctl.arq === "controle.py") for (const a of ["leitura.py", "escrita.py"]) if (!ctl.lista.includes(a) && ms[a]) criaArquivo(a, ms[a]);   // o modelo importa os dois
    if (ctl.dados) ctl.dados.controle.arquivos = arquivosDoEditor();
    guardaControle(); } };
})();
function desenhaLigacoesTs() { infoTs(); }

// "testar": guarda e roda iniciar() e 3 passo() no servidor, sem simular (medidas zeradas): o que o código devolveria, ou o
// erro com a linha — para conferir o código antes de uma rodada
async function atualizaVistas() {                     // o que foi nas mensagens (mensagens_vistas): o diagrama acompanha
  try { const j = await api("editor/controle"); if (ctl.dados) { ctl.dados.mensagens_vistas = j.mensagens_vistas; if (ctl.tabela === "diag") desenhaDiagrama(); } }
  catch (e) { /* ok: fica o de antes */ }
}
async function testaControle() {
  const bt = $("ctl-testar"); if (bt.disabled) return;
  bt.disabled = true; saidaControle(() => tr("ctl.testando"));
  try {
    if (!(await guardaControle())) { saidaControle(() => tr("ctl.nao_guardou"), "erro"); return; }
    const j = await api("editor/controle/testar", { dt: Number(sim.par.dt) || 1e-6 });
    if (!j.ok) {
      const arq = j.arquivo || "controle.py"; if (ctl.lista.includes(arq)) mostraArquivo(arq);
      marcaErros(j.linha ? [{ linha: j.linha, coluna: 1, msg: j.erro, arquivo: arq }] : [], ctl.dados ? ctl.dados.conferencia : []);
      saidaControle(() => `${tr("ctl.teste_erro", { erro: j.erro })}${j.rastro ? `\n${j.rastro}` : ""}${j.saida ? `\n— print —\n${j.saida}` : ""}`, "erro"); return;
    }
    const monta = () => {                               // o texto da saída (montado de novo se o idioma mudar)
      const fmt = (o) => Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k} = ${v === null ? "nan/inf" : +v.toPrecision(6)}`).join(", ") : tr("ctl.nada_paren");
      const linhas = j.passos.map((q) => (Object.keys(q.s).length ? tr("ctl.teste_passo_scope", { t: si(q.t, "s"), a: fmt(q.a), s: fmt(q.s) }) : tr("ctl.teste_passo", { t: si(q.t, "s"), a: fmt(q.a) })) +
        (q.fora.length ? tr("ctl.teste_fora", { x: q.fora.join(", ") }) : ""));
      const ok = { passos: j.passos.length, ts: si(j.Ts, "s"), med: j.medidas.join(", ") || tr("ctl.nenhuma") };
      return ((j.controladores || []).length ? tr("ctl.teste_ok_ctls", { ...ok, ctls: j.controladores.join(", ") }) : tr("ctl.teste_ok", ok)) + "\n" +
        linhas.join("\n") + (j.saida ? `\n— print —\n${j.saida}` : ""); };
    saidaControle(monta, j.passos.some((q) => q.fora.length) ? "aviso" : "ok");
    marcaErros(ctl.dados ? ctl.dados.erros : []);
    atualizaVistas();
  } catch (e) { saidaControle(() => tr("ctl.teste_erro", { erro: e.message }), "erro"); }
  finally { bt.disabled = document.body.classList.contains("sim-rodando"); }
}

// trocou o idioma (o botão do trilho, nesta janela ou noutra): redesenha o que este arquivo escreve (o HTML estático, o
// aplica() do maisim-i18n já trocou); o que foi digitado e não guardado vai junto, como ao ordenar uma tabela
const CAMPOS_DO_PAINEL = "#ctl-par, #ctl-ac, .ctl-ts, .ctl-ctl input[data-k], #ctl-tabela tbody";   // os campos que o redesenho troca
function redesenhaIdioma() {
  if (!ctl.carregado || !ctl.dados) return;
  const foco = document.activeElement;
  if (foco && foco.closest && foco.closest(CAMPOS_DO_PAINEL)) {          // digitando: espera sair do campo (não o destrói)
    // um ouvinte só por campo; se o campo sumiu sem focusout (outro redesenho, já no idioma novo), a próxima troca liga outro
    if (ctl.esperaIdioma !== foco) { ctl.esperaIdioma = foco;
      foco.addEventListener("focusout", () => setTimeout(() => { if (ctl.esperaIdioma === foco) ctl.esperaIdioma = null; redesenhaIdioma(); }, 0), { once: true }); }
    return;
  }
  const c = coleta();
  ctl.idiomaPendente = !!c.invalido;
  if (!c.invalido) {
    Object.assign(ctl.dados.controle, c);
    desenhaLigacoes();                                  // as tabelas, os cartões, a árvore, o índice e os ⓘ
  } else {                                              // um valor inválido à vista (e marcado): as tabelas e os cartões
    desenhaIndice(); infoTs(); infoAtraso(); infoRede();   // ficam; o próximo guardar que der certo refaz a troca
  }
  $("ctl-abas").dataset.chave = "";                      // as mesmas abas: sem isso, só as classes mudariam
  desenhaAbas(); aplicaTabela(); marcaOrdem();
  if (travado()) travaControle(true);                    // os campos redesenhados continuam travados durante a rodada
  const d = ctl.dados;                                   // a linha de estado: só a que estadoCodigo() escreveu
  if (ctl.estadoDoCodigo && !ctl.timer && d.erros && d.avisos) estadoCodigo(d);
  const S = ctl.saida;                                   // a saída do testar (a montada aqui; a do servidor fica)
  if (S && S.monta && $("ctl-saida").textContent === S.txt) saidaControle(S.monta, S.tipo, S.ctx);
}
maisimI18n.aoMudar(() => {
  botaoLado($("painel-controle").classList.contains("sem-lado"));
  if (ctl.botaoLinhas) ctl.botaoLinhas();
  fechaPicker();                                         // o título dela é do idioma de antes; abre de novo com um clique
  redesenhaIdioma();
  // os modelos de código (o botão "Modelo", o arquivo novo) no idioma novo: o servidor os escolhe pelo cookie, já trocado
  buscaModelosCodigo();
});
