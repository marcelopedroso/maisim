// MaiSim — o modo script (issue #258): um .py comum que roda do começo ao fim e manda os resultados para o Scope por
// maisim.scope(...). A lista (seus scripts e os exemplos), o editor (Monaco, como o painel de controle; sem ele, uma caixa de
// texto), Salvar, Rodar (salva antes e roda no servidor), a saída e "Ver no Scope". Tudo pelas rotas /maisim/simu/scripts*.
const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs";
const MONACO_LOCAL = new URL("static/vendor/monaco/vs", location.href).href;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// as abas (os scripts abertos, como no Código): cada uma com o nome, o grupo (meus | exemplos), o que está salvo e o modelo do
// Monaco (o que não foi salvo fica nele ao trocar de aba). st.nome e st.grupo são os da aba ativa (a IA usa os dois)
const st = { abas: [], ativa: -1, pasta: "", editor: null, texto: null, ultimaRodada: null, rodando: false, arvore: [] };
const atual = () => st.abas[st.ativa] || null;
Object.defineProperty(st, "nome", { get: () => (atual() ? atual().nome : "") });
Object.defineProperty(st, "grupo", { get: () => (atual() ? atual().grupo : "meus") });

// ----------------------------------------------------------------- as janelas do MaiSim (Marcelo, 17/11: nada de alert/confirm/
// prompt do navegador): as mesmas do simu (modal). Esc ou clicar fora cancela; Enter confirma; perigo: o botão vermelho e o
// foco no Cancelar. Com campo: devolve o texto (valida: o erro embaixo do campo, a janela fica aberta); sem: true ou null
function janela({ titulo, texto = "", campo = null, opcoes = null, ok = tr("scr.ok"), perigo = false, valida = null }) {
  return new Promise((res) => {
    const f = document.createElement("div"); f.className = "modal-fundo";
    f.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-tit"><h3 id="m-tit">${esc(titulo)}</h3>${texto ? `<p>${esc(texto)}</p>` : ""}`
      + (campo ? `<input class="m-campo" spellcheck="false" autocomplete="off" aria-label="${esc(campo.rotulo || titulo)}" value="${esc(campo.valor || "")}"><div class="m-erro" aria-live="polite"></div>` : "")
      + (opcoes ? `<select class="m-campo m-lista" aria-label="${esc(titulo)}">${opcoes.map((o) => `<option value="${esc(o.valor)}">${esc(o.rotulo)}</option>`).join("")}</select>` : "")
      + `<div class="modal-botoes"><button type="button" class="m-cancela">${esc(tr("scr.cancelar"))}</button><button type="button" class="m-ok ${perigo ? "perigo" : "primario"}">${esc(ok)}</button></div></div>`;
    document.body.appendChild(f);
    const inp = f.querySelector(".m-campo"), err = f.querySelector(".m-erro");
    const fecha = (v) => { removeEventListener("keydown", tecla, true); f.remove(); res(v); };
    const confirma = () => {
      if (!inp) return fecha(true);
      if (inp.tagName === "SELECT") return fecha(inp.value);   // a lista: o valor escolhido ("" = a raiz)
      const v = inp.value.trim(), e = v ? (valida ? valida(v) : "") : tr("scr.campo_vazio");
      if (e) { err.textContent = e; inp.classList.add("invalido"); inp.focus(); return; }
      fecha(v);
    };
    const tecla = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fecha(null); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); const a = document.activeElement;
        if (a && a.tagName === "BUTTON" && f.contains(a)) a.click(); else confirma(); }
    };
    addEventListener("keydown", tecla, true);
    if (inp && err) inp.addEventListener("input", () => { err.textContent = ""; inp.classList.remove("invalido"); });
    f.querySelector(".m-cancela").onclick = () => fecha(null); f.querySelector(".m-ok").onclick = confirma;
    f.addEventListener("mousedown", (e) => { if (e.target === f) fecha(null); });
    (inp || f.querySelector(perigo ? ".m-cancela" : ".m-ok")).focus();   // já na hora: Enter logo depois vai para o lugar certo
  });
}
const PARTE = /^[A-Za-z0-9_-]{1,64}$/;   // o mesmo do servidor (modo_script.NOME_OK): cada parte do caminho
const validaNome = (v) => (v.replace(/\.py$/, "").split("/").every((x) => PARTE.test(x)) ? "" : tr("scr.nome_regra"));
const descartar = async (a = atual()) => !a || !sujoAba(a) || !!(await janela({ titulo: tr("scr.descartar_t"), texto: tr("scr.descartar_aba", { nome: a.nome || tr("scr.sem_nome") }), ok: tr("scr.descartar_ok"), perigo: true }));

// ----------------------------------------------------------------- servidor
async function api(rota, corpo) {
  const r = await fetch(`scripts${rota}`, corpo ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(corpo) }
    : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || r.status);
  return j;
}

// ----------------------------------------------------------------- editor e abas
function carregaMonaco() {
  return new Promise((ok, falha) => {
    if (window.monaco) return ok(window.monaco);
    const prazo = setTimeout(() => falha(new Error("monaco")), 15000);
    fetch(`${MONACO_LOCAL}/loader.js`).then((r) => r.ok, () => false).then((local) => {
      const base = local ? MONACO_LOCAL : MONACO_CDN;
      window.MonacoEnvironment = { getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(
        `self.MonacoEnvironment = { baseUrl: "${base}/../" }; importScripts("${base}/base/worker/workerMain.js");`)}` };
      const s = document.createElement("script"); s.src = `${base}/loader.js`;
      s.onload = () => { window.require.config({ paths: { vs: base } });
        window.require(["vs/editor/editor.main"], () => { clearTimeout(prazo); ok(window.monaco); }, (e) => { clearTimeout(prazo); falha(e); }); };
      s.onerror = () => { clearTimeout(prazo); falha(new Error("monaco")); };
      document.head.appendChild(s);
    });
  });
}
const conteudo = (a) => (a.model ? a.model.getValue() : a === atual() && st.texto ? st.texto.value : a.codigo);
const sujoAba = (a) => conteudo(a) !== a.salvo;
const codigo = () => (atual() ? conteudo(atual()) : "");
const sujo = () => !!atual() && sujoAba(atual());
function poeCodigo(c) {                                  // a aba ativa passa a ter c, salvo (vindo do disco)
  const a = atual(); if (!a) return;
  if (a.model) a.model.setValue(c); else if (st.texto) st.texto.value = c;
  a.codigo = c; a.salvo = c; marca();
}
async function montaEditor() {
  try {
    const monaco = await carregaMonaco();
    const temaEditor = () => (document.documentElement.dataset.tema === "escuro" ? "vs-dark" : "vs");
    st.editor = monaco.editor.create($("editor"), { model: null, automaticLayout: true, minimap: { enabled: false },
      fontSize: 13, tabSize: 4, insertSpaces: true, scrollBeyondLastLine: false, theme: temaEditor() });
    // o trilho trocou o tema (aqui ou noutra aba): o editor acompanha (Marcelo, 17/11: "o tema não respeitou")
    addEventListener("maisim-tema", () => monaco.editor.setTheme(temaEditor()));
    st.editor.onDidChangeModelContent(marca);
    st.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => salvar());
    st.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => rodar());
  } catch (e) {
    st.texto = document.createElement("textarea"); st.texto.spellcheck = false; st.texto.oninput = marca;
    $("editor").appendChild(st.texto); escreveSaida(tr("scr.monaco_falhou"), "dica");
  }
}
function novaAba(nome, grupo, cod, previa = false, fixa = false) {
  const a = { nome, grupo, salvo: cod, codigo: cod, model: null, previa, fixa };
  if (st.editor) { a.model = window.monaco.editor.createModel(cod, "python"); a.model.updateOptions({ tabSize: 4, insertSpaces: true }); }
  st.abas.push(a); return st.abas.length - 1;
}
function ativa(i) {
  const antes = atual();
  if (antes && !antes.model && st.texto) antes.codigo = st.texto.value;   // sem o Monaco: guarda o texto da aba que sai
  st.ativa = i;
  const a = atual();
  if (st.editor) st.editor.setModel(a ? a.model : null); else if (st.texto) st.texto.value = a ? a.codigo : "";
  if (a && a.grupo === "meus" && a.nome) st.pasta = paiDe(a.nome);
  if (a && a.grupo === "exemplos" && $("secao-exemplos")) secaoExemplos(true, false);
  if (a && a.nome) { const partes = a.nome.split("/"); for (let k = 1; k < partes.length; k++) abertas.add(`${a.grupo}:${partes.slice(0, k).join("/")}`); guardaAbertas(); }
  history.replaceState(null, "", a && a.nome ? `?nome=${encodeURIComponent(a.nome)}${a.grupo === "exemplos" ? "&grupo=exemplos" : ""}` : location.pathname);
  guardaAbas(); desenhaAbas(); marca(); marcaArvore();
  if (st.editor) st.editor.focus();
}
// as abas como no VS Code: um clique na árvore abre em PRÉVIA (itálico: o próximo clique troca o arquivo nela); editar, duplo
// clique (na aba ou na árvore) ou 📌 a mantém; 📌 também a FIXA à esquerda (sem o ×). Guardadas neste navegador
const guardaAbas = () => guarda("maisim-script-abas", JSON.stringify(st.abas.filter((a) => a.nome).map((a) => [a.nome, a.grupo, a.fixa ? 1 : 0])));
function desenhaAbas() {
  $("ctl-abas").innerHTML = st.abas.map((a, i) => `<button type="button" role="tab" class="aba${i === st.ativa ? " ativa" : ""}${a.previa ? " previa" : ""}${a.fixa ? " fixa" : ""}" data-i="${i}" aria-selected="${i === st.ativa}" title="${esc((a.nome ? (a.grupo === "exemplos" ? tr("scr.aba_exemplo", { nome: a.nome }) : a.nome) : tr("scr.sem_nome")) + (a.previa ? " · " + tr("scr.aba_previa") : ""))}">`
    + `${a.grupo === "exemplos" ? '<span class="cadeado" aria-hidden="true">🔒</span>' : ""}<span class="nome-aba">${esc(a.nome ? a.nome.split("/").pop() + ".py" : tr("scr.sem_nome"))}</span>${sujoAba(a) || !a.nome ? '<span class="ponto-sujo">•</span>' : ""}`
    + `<span class="fixa-bt" data-fixa="${i}" role="button" title="${esc(tr(a.fixa ? "scr.desafixar_aba" : "scr.fixar_aba"))}" aria-label="${esc(tr(a.fixa ? "scr.desafixar_aba" : "scr.fixar_aba"))}">📌</span>`
    + `<span class="fecha" data-fecha="${i}" role="button" aria-label="${esc(tr("scr.fechar_aba"))}">×</span></button>`).join("");
}
function fixaAba(i, fixa) { const a = st.abas[i]; if (!a) return; a.previa = false; if (fixa !== undefined) a.fixa = fixa; guardaAbas(); desenhaAbas(); }
$("ctl-abas").addEventListener("click", (e) => {
  const f = e.target.closest("[data-fecha]"); if (f) { e.stopPropagation(); fechaAba(+f.dataset.fecha); return; }
  const p = e.target.closest("[data-fixa]"); if (p) { e.stopPropagation(); fixaAba(+p.dataset.fixa, !st.abas[+p.dataset.fixa].fixa); return; }
  const b = e.target.closest(".aba"); if (b && +b.dataset.i !== st.ativa) ativa(+b.dataset.i);   // a ativa: não redesenha (o duplo clique precisa do mesmo botão)
});
$("ctl-abas").addEventListener("dblclick", (e) => { const b = e.target.closest(".aba"); if (b) fixaAba(+b.dataset.i); });   // duplo clique: sai da prévia
$("ctl-abas").addEventListener("auxclick", (e) => { const b = e.target.closest(".aba"); if (b && e.button === 1) fechaAba(+b.dataset.i); });   // o botão do meio fecha
async function fechaAba(i, semPerguntar = false) {
  const a = st.abas[i]; if (!a) return;
  if (!semPerguntar && !(await descartar(a))) return;
  if (a.model) a.model.dispose();
  st.abas.splice(i, 1);
  if (!st.abas.length) { st.ativa = -1; await novo(); return; }
  ativa(Math.min(i <= st.ativa ? Math.max(0, st.ativa - 1) : st.ativa, st.abas.length - 1));
}

// ----------------------------------------------------------------- estado e lista
function marca() {
  const a = atual();
  if (a && a.previa && sujoAba(a)) { a.previa = false; desenhaAbas(); }   // editou: a aba fica (sai da prévia)
  const naoSalvo = !!a && a.grupo !== "exemplos" && (sujoAba(a) || !a.nome);
  $("ctl-estado").textContent = !a ? "" : a.grupo === "exemplos" ? tr("scr.exemplo_so_ler") : naoSalvo ? tr("scr.nao_salvo") : tr("scr.salvo");
  $("ctl-estado").classList.toggle("nao-salvo", naoSalvo);   // em vermelho, para chamar a atenção (Marcelo, 17/11)
  $("nome-atual").textContent = a ? (a.nome || tr("scr.sem_nome")) : "";
  $("bt-apagar").disabled = !a || a.grupo !== "meus" || !a.nome;
  $("bt-mover").disabled = !a || a.grupo !== "meus" || !a.nome;
  // o "•" da aba acompanha sem redesenhar tudo
  const b = document.querySelector(`#ctl-abas .aba[data-i="${st.ativa}"]`);
  if (b && a) { const tem = !!b.querySelector(".ponto-sujo"), quer = sujoAba(a) || !a.nome; if (tem !== quer) desenhaAbas(); }
}
function marcaArvore() {
  document.querySelectorAll("#col-arq li button[data-nome]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.nome === st.nome && b.dataset.grupo === st.grupo)));
}
// a árvore (pastas e scripts): as pastas abertas ficam guardadas neste navegador; a pasta escolhida (st.pasta, nos seus) é
// onde o "+ Script" e o "+ Pasta" criam
let abertas = new Set();
try { abertas = new Set(JSON.parse(localStorage.getItem("maisim-script-abertas") || "[]")); } catch (e) { /* nenhuma */ }
const guardaAbertas = () => guarda("maisim-script-abertas", JSON.stringify([...abertas]));
const contaScripts = (itens) => itens.reduce((n, x) => n + (x.tipo === "pasta" ? contaScripts(x.filhos) : 1), 0);
function ramo(itens, grupo) {
  return itens.map((x) => {
    if (x.tipo === "pasta") {
      const id = `${grupo}:${x.caminho}`;
      return `<li class="pasta${abertas.has(id) ? " aberta" : ""}" data-id="${esc(id)}"><div class="linha">`
        + `<button type="button" class="abre${grupo === "meus" && st.pasta === x.caminho ? " sel" : ""}" data-pasta="${esc(x.caminho)}" data-grupo="${grupo}"${grupo === "meus" ? ` draggable="true" data-arrasta="${esc(x.caminho)}" data-recebe="${esc(x.caminho)}"` : ""}><span class="seta">▸</span> ${esc(x.nome)}</button>`
        + (grupo === "meus" ? `<button type="button" class="tira mover" data-mover="${esc(x.caminho)}" title="${esc(tr("scr.mover_pasta"))}" aria-label="${esc(tr("scr.mover_pasta"))}">⇄</button>` : "")
        + (grupo === "meus" ? `<button type="button" class="tira" data-tira="${esc(x.caminho)}" data-n="${contaScripts(x.filhos)}" title="${esc(tr("scr.apagar_pasta"))}" aria-label="${esc(tr("scr.apagar_pasta"))}">×</button>` : "")
        + `</div><ul>${ramo(x.filhos, grupo) || `<li class="vazio">${esc(tr("scr.pasta_vazia"))}</li>`}</ul></li>`;
    }
    return `<li><button type="button" data-nome="${esc(x.caminho)}" data-grupo="${grupo}" title="${esc(x.caminho)}"${grupo === "meus" ? ` draggable="true" data-arrasta="${esc(x.caminho)}"` : ""} aria-current="${x.caminho === st.nome && grupo === st.grupo}">${esc(x.nome)}.py</button></li>`;
  }).join("");
}
async function lista() {
  const j = await api(""); st.arvore = j.meus; st.listaFeita = true;
  $("lista-meus").innerHTML = j.meus.length ? ramo(j.meus, "meus") : `<li class="vazio">${esc(tr("scr.nenhum"))}</li>`;
  $("lista-exemplos").innerHTML = ramo(j.exemplos, "exemplos");
  $("raiz-meus").classList.toggle("sel", !st.pasta);
  for (const b of document.querySelectorAll("#col-arq li button[data-nome]")) {
    b.onclick = () => abre(b.dataset.nome, b.dataset.grupo, true);          // um clique: em prévia
    b.ondblclick = () => abre(b.dataset.nome, b.dataset.grupo, false);      // duplo clique: a aba fica
  }
  for (const b of document.querySelectorAll("#col-arq button[data-pasta]")) b.onclick = () => {
    const li = b.closest("li.pasta"), id = li.dataset.id;
    if (b.dataset.grupo === "meus" && st.pasta !== b.dataset.pasta) { st.pasta = b.dataset.pasta; abertas.add(id); }   // escolher abre
    else if (abertas.has(id)) abertas.delete(id); else abertas.add(id);
    guardaAbertas(); lista();
  };
  for (const b of document.querySelectorAll("#col-arq button[data-tira]")) b.onclick = () => apagaPasta(b.dataset.tira, +b.dataset.n);
  for (const b of document.querySelectorAll("#col-arq button[data-mover]")) b.onclick = () => pedeDestino(b.dataset.mover);
  filtra();
}
// a busca (como a dos Arquivos do Código): só os scripts com o texto no nome, e as pastas deles abertas
function filtra() {
  const q = $("arq-busca").value.trim().toLowerCase();
  const passa = (li) => {
    const b = li.querySelector(":scope > button[data-nome]");
    if (b) { const ok = !q || b.dataset.nome.toLowerCase().includes(q); li.hidden = !ok; return ok; }
    if (li.classList.contains("pasta")) {
      const algum = [...li.querySelectorAll(":scope > ul > li")].map(passa).some(Boolean);
      li.hidden = !!q && !algum; if (q) li.classList.toggle("aberta", algum); else li.classList.toggle("aberta", abertas.has(li.dataset.id));
      return algum;
    }
    li.hidden = !!q; return false;                   // "vazio", "nenhum ainda"
  };
  document.querySelectorAll("#lista-meus > li, #lista-exemplos > li").forEach(passa);
}
$("arq-busca").addEventListener("input", () => {
  filtra();
  const q = $("arq-busca").value.trim();
  if (q && [...document.querySelectorAll("#lista-exemplos li button[data-nome]")].some((b) => !b.closest("li[hidden]"))) secaoExemplos(true, false);
});
function secaoExemplos(on, guardar = true) {
  $("secao-exemplos").classList.toggle("aberta", on); $("cab-exemplos").setAttribute("aria-expanded", String(on));
  if (guardar) guarda("maisim-script-exemplos", on ? "1" : "");
}
$("cab-exemplos").onclick = () => secaoExemplos(!$("secao-exemplos").classList.contains("aberta"));
$("arq-busca").addEventListener("keydown", (e) => {   // Enter abre o primeiro que sobrou; Esc limpa
  if (e.key === "Escape") { $("arq-busca").value = ""; filtra(); }
  if (e.key === "Enter") { const b = [...document.querySelectorAll("#col-arq li button[data-nome]")].find((x) => !x.closest("li[hidden]")); if (b) b.click(); }
});

// ----------------------------------------------------------------- mover (Marcelo, 17/11): arrastar um script ou uma pasta
// dos seus para outra pasta (ou para "Meus scripts", a raiz); pelo teclado, mover (o script aberto) e ⇄ (a pasta) com a
// lista das pastas. As abas acompanham (o que não foi salvo continua no editor)
const pastasDe = (itens) => itens.filter((x) => x.tipo === "pasta").flatMap((x) => [x.caminho, ...pastasDe(x.filhos)]);
const paiDe = (c) => (c.includes("/") ? c.slice(0, c.lastIndexOf("/")) : "");
async function move(nome, destino) {
  try {
    const r = await api("/mover", { nome, destino });
    if (r.nome !== nome) {
      const segue = (c) => (c === nome ? r.nome : c.startsWith(`${nome}/`) ? r.nome + c.slice(nome.length) : c);
      st.abas.forEach((a) => { if (a.grupo === "meus" && a.nome) a.nome = segue(a.nome); });
      st.pasta = segue(st.pasta);
      abertas = new Set([...abertas].map((id) => (id.startsWith("meus:") ? `meus:${segue(id.slice(5))}` : id)));
      if (destino) abertas.add(`meus:${destino}`); guardaAbertas();
      if (atual() && atual().nome) history.replaceState(null, "", `?nome=${encodeURIComponent(atual().nome)}${atual().grupo === "exemplos" ? "&grupo=exemplos" : ""}`);
      escreveSaida(tr("scr.movido", { de: nome, para: r.nome }), "dica");
    }
    guardaAbas(); desenhaAbas(); marca(); await lista();
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
}
async function pedeDestino(nome) {
  const ehPasta = pastasDe(st.arvore || []).includes(nome);
  const ops = ["", ...pastasDe(st.arvore || [])].filter((p) => p !== paiDe(nome) && !(ehPasta && (p === nome || p.startsWith(`${nome}/`))));
  if (!ops.length) { escreveSaida(tr("scr.mover_sem_destino"), "dica"); return; }
  const d = await janela({ titulo: tr("scr.mover_t", { nome }), texto: tr("scr.mover_texto"), ok: tr("scr.mover"),
    opcoes: ops.map((p) => ({ valor: p, rotulo: p || tr("scr.meus") })) });
  if (d !== null) await move(nome, d);
}
$("lista-meus").addEventListener("dragstart", (e) => {
  const b = e.target.closest("[data-arrasta]"); if (!b) return;
  e.dataTransfer.setData("text/x-maisim-script", b.dataset.arrasta); e.dataTransfer.effectAllowed = "move";
});
const alvoDe = (e) => e.target.closest("[data-recebe]");
for (const zona of [$("lista-meus"), $("raiz-meus")]) {
  zona.addEventListener("dragover", (e) => {
    const a = alvoDe(e); if (!a || !e.dataTransfer.types.includes("text/x-maisim-script")) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".alvo").forEach((x) => x !== a && x.classList.remove("alvo")); a.classList.add("alvo");
  });
  zona.addEventListener("dragleave", (e) => { const a = alvoDe(e); if (a && !a.contains(e.relatedTarget)) a.classList.remove("alvo"); });
  zona.addEventListener("drop", (e) => {
    const a = alvoDe(e), nome = e.dataTransfer.getData("text/x-maisim-script"); if (!a || !nome) return;
    e.preventDefault(); document.querySelectorAll(".alvo").forEach((x) => x.classList.remove("alvo"));
    move(nome, a.dataset.recebe);
  });
}
document.addEventListener("dragend", () => document.querySelectorAll(".alvo").forEach((x) => x.classList.remove("alvo")));
const naPasta = (nome) => (st.pasta ? `${st.pasta}/${nome}` : nome);
async function abre(nome, grupo, previa = false) {     // já aberto: vai para a aba dele; senão, uma aba nova (ou a de prévia)
  const k = st.abas.findIndex((a) => a.nome === nome && a.grupo === grupo);
  if (k >= 0) { if (!previa) st.abas[k].previa = false; ativa(k); if (!st.listaFeita) await lista(); return; }   // (a 1ª vez, a árvore ainda não foi desenhada)
  try {
    const j = await api(`/ler?nome=${encodeURIComponent(nome)}&grupo=${encodeURIComponent(grupo)}`);
    // dá lugar: a aba de prévia intocada (como no VS Code) ou a "sem nome" intocada
    const sai = st.abas.findIndex((a) => !sujoAba(a) && (a.previa || (!a.nome && a === atual())));
    if (sai >= 0) { const a = st.abas[sai]; if (a.model) a.model.dispose(); st.abas.splice(sai, 1); if (st.ativa >= sai) st.ativa = Math.max(-1, st.ativa - 1); }
    const i = novaAba(j.nome, grupo, j.codigo, previa);
    if (sai >= 0 && sai < st.abas.length - 1) { st.abas.splice(sai, 0, st.abas.pop()); ativa(sai); } else ativa(i);   // no mesmo lugar
    await lista();
  } catch (e) {                                       // não abriu (apagado, movido): o erro na saída, a lista desenhada mesmo
    escreveSaida(tr("scr.falhou", { erro: e.message }), "err");
    if (!st.nome) history.replaceState(null, "", location.pathname);
    if (st.ativa < 0 && st.abas.length) ativa(0);     // as abas da última vez continuam; senão, um script novo
    if (!st.abas.length) await novo().catch(() => {}); else await lista().catch(() => {});
  }
}
async function novo() {
  const j = await api("/novo");
  ativa(novaAba("", "meus", j.codigo)); await lista();
}
async function novaPasta() {
  const nome = await janela({ titulo: tr("scr.pasta_t"), texto: tr("scr.pede_pasta", { onde: st.pasta || tr("scr.meus") }), ok: tr("scr.criar"),
    campo: { rotulo: tr("scr.pasta_t") }, valida: (v) => (PARTE.test(v) ? "" : tr("scr.pasta_regra")) });
  if (!nome) return;
  try {
    const r = await api("/pasta/criar", { nome: naPasta(nome) });
    st.pasta = r.nome; abertas.add(`meus:${r.nome}`); guardaAbertas(); await lista();
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
}
async function apagaPasta(caminho, n) {
  if (!(await janela({ titulo: tr("scr.apagar_pasta_t"), texto: tr("scr.confirma_apagar_pasta", { nome: caminho, n }), ok: tr("scr.apagar"), perigo: true }))) return;
  try {
    await api("/pasta/apagar", { nome: caminho });
    if (st.pasta === caminho || st.pasta.startsWith(`${caminho}/`)) st.pasta = "";
    // as abas da pasta apagada fecham sem perguntar (o que estava nelas foi apagado de propósito)
    for (let i = st.abas.length - 1; i >= 0; i--) if (st.abas[i].grupo === "meus" && st.abas[i].nome.startsWith(`${caminho}/`)) await fechaAba(i, true);
    await lista();
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
}

// ----------------------------------------------------------------- salvar, salvar como, apagar, rodar
async function gravaComo(nome, a) {                    // grava o conteúdo da aba a com o nome; pergunta antes de substituir outro
  let r = await api("/salvar", { nome, codigo: conteudo(a), sobrescrever: a.grupo === "meus" && nome === a.nome });
  if (r.codigo === "confirmar") {
    if (!(await janela({ titulo: tr("scr.sobrescrever_t"), texto: r.pergunta, ok: tr("scr.substituir"), perigo: true }))) return false;
    r = await api("/salvar", { nome, codigo: conteudo(a), sobrescrever: true });
  }
  a.nome = r.nome; a.grupo = "meus"; a.salvo = conteudo(a);
  return true;
}
async function salvar() {
  const a = atual(); if (!a) return false;
  try {
    if (a.grupo === "exemplos") {                   // o exemplo fica como está: salvar faz uma cópia nos seus (a pasta dele
      const c = await api("/copiar_exemplo", { nome: a.nome });   // inteira, se está numa: os arquivos que ele importa vêm junto)
      await api("/salvar", { nome: c.nome, codigo: conteudo(a), sobrescrever: true });
      a.nome = c.nome; a.grupo = "meus"; a.salvo = conteudo(a);
      escreveSaida(tr("scr.copiado", { nome: c.nome }), "dica");
    } else if (!a.nome) {                            // sem nome: pergunta (dentro da pasta escolhida, se houver)
      const n = await janela({ titulo: tr("scr.nome_t"), texto: tr("scr.pede_nome"), ok: tr("scr.salvar"), campo: { rotulo: tr("scr.nome"), valor: st.pasta ? `${st.pasta}/` : "" }, valida: validaNome });
      if (!n || !(await gravaComo(n.replace(/\.py$/, ""), a))) return false;
    } else if (!(await gravaComo(a.nome, a))) return false;
    ativa(st.ativa); await lista(); return true;
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); return false; }
}
async function salvarComo() {
  const a = atual(); if (!a) return false;
  const n = await janela({ titulo: tr("scr.salvar_como_t"), texto: tr("scr.pede_nome"), ok: tr("scr.salvar"),
    campo: { rotulo: tr("scr.nome"), valor: a.nome && a.grupo === "meus" ? a.nome : st.pasta ? `${st.pasta}/` : "" }, valida: validaNome });
  if (!n) return false;
  try { if (!(await gravaComo(n.replace(/\.py$/, ""), a))) return false; ativa(st.ativa); await lista(); return true; }
  catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); return false; }
}
async function apagar() {
  const a = atual(); if (!a || a.grupo !== "meus" || !a.nome) return;
  if (!(await janela({ titulo: tr("scr.apagar_t"), texto: tr("scr.confirma_apagar", { nome: a.nome }), ok: tr("scr.apagar"), perigo: true }))) return;
  // o script apagado era o aberto: a aba fecha sem perguntar se descarta
  try { await api("/apagar", { nome: a.nome }); await fechaAba(st.ativa, true); await lista(); }
  catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
}
function escreveSaida(txt, cls) {
  const s = document.createElement("span"); if (cls) s.className = cls; s.textContent = txt.endsWith("\n") ? txt : txt + "\n"; $("saida").appendChild(s);
}
const urlScope = (arq) => `/maisim/scope/?so=rodada&a=${encodeURIComponent(arq)}`;   // o mesmo do simu: só os sinais da rodada
function mostraScope(arq) {                            // a rodada na coluna do Scope (como o fim da rodada no simu)
  if (arq) { $("if-scope").src = urlScope(arq); $("if-scope").hidden = false; $("scope-vazio").hidden = true; }
  coluna("scope", true);
}
async function rodar() {
  const a = atual(); if (st.rodando || !a) return;
  // um exemplo sem mudança roda como está; o resto salva antes (roda sempre o que está no disco)
  if (!(a.grupo === "exemplos" && !sujoAba(a)) && (sujoAba(a) || !a.nome) && !(await salvar())) return;
  st.rodando = true; $("bt-rodar").disabled = true; $("bt-rodar").classList.add("rodando"); msg(tr("scr.rodando"));
  $("saida").textContent = ""; $("resultado").textContent = ""; $("resultado").className = "";
  if ($("saida-box").classList.contains("recolhida")) recolheSaida(false);   // rodou: a saída aparece
  try {
    const r = await api("/rodar", { nome: atual().nome, grupo: atual().grupo });
    if (r.saida) escreveSaida(r.saida);
    if (r.erro) escreveSaida(r.erro, "err");
    const res = $("resultado");
    res.textContent = r.prazo_estourado ? tr("scr.resultado_prazo") : r.ok ? tr("scr.resultado_ok", { s: r.tempo }) : tr("scr.resultado_erro", { c: r.codigo_saida, s: r.tempo });
    res.className = r.ok ? "ok" : "erro"; msg(res.textContent, r.ok ? "ok" : "erro");
    if (r.rodadas.length) {
      escreveSaida(tr("scr.rodadas", { n: r.rodadas.length }), "dica");
      for (const x of r.rodadas) {                     // cada rodada: na coluna do Scope (clique) ou no Scope inteiro (nova aba)
        const a1 = document.createElement("a"); a1.href = "#"; a1.textContent = x.pasta; a1.onclick = (ev) => { ev.preventDefault(); mostraScope(x.arquivo); };
        const a2 = document.createElement("a"); a2.href = `/maisim/scope/?a=${encodeURIComponent(x.arquivo)}`; a2.target = "_blank"; a2.textContent = tr("scr.scope_inteiro");
        const l = document.createElement("span"); l.className = "dica"; l.append("  ", a1, " · ", a2, "\n"); $("saida").appendChild(l);
      }
      st.ultimaRodada = r.rodadas[r.rodadas.length - 1].arquivo; mostraScope(st.ultimaRodada);
    } else if (r.ok) escreveSaida(tr("scr.sem_rodadas"), "dica");
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); msg(tr("scr.falhou", { erro: e.message }), "erro"); }
  st.rodando = false; $("bt-rodar").disabled = false; $("bt-rodar").classList.remove("rodando");
}
function msg(t, cls) { $("msg").textContent = t || ""; $("msg").className = cls || ""; }

// ----------------------------------------------------------------- as colunas (Arquivos, Scope; a IA em script_ia.js), as
// bordas de arrastar e a Saída (arrastar a altura; "−" minimiza, como no VS Code): tudo guardado neste navegador
const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* só agora */ } };
const lido = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const raiz = document.documentElement.style;
function coluna(qual, on) {
  const el = $(qual === "arq" ? "col-arq" : "col-scope"), bt = $(qual === "arq" ? "bt-col-arq" : "bt-col-scope");
  el.hidden = !on; bt.classList.toggle("ativo", on); bt.setAttribute("aria-pressed", String(on));
  guarda(`maisim-script-col-${qual}`, on ? "1" : "0");
}
$("bt-col-arq").onclick = () => coluna("arq", $("col-arq").hidden);
$("bt-col-scope").onclick = () => coluna("scope", $("col-scope").hidden);
$("bt-modelo").onclick = () => { coluna("arq", true); $("arq-busca").focus(); $("arq-busca").select(); };   // como o ▾ do circuito: procurar outro
function arrasta(borda, aoMover, aoSoltar) {
  borda.addEventListener("pointerdown", (e) => {
    e.preventDefault(); borda.setPointerCapture(e.pointerId); borda.classList.add("arrastando"); document.body.classList.add("arrastando-borda");
    const move = (ev) => aoMover(ev);
    const solta = () => { borda.removeEventListener("pointermove", move); borda.removeEventListener("pointerup", solta);
      borda.classList.remove("arrastando"); document.body.classList.remove("arrastando-borda"); if (aoSoltar) aoSoltar(); };
    borda.addEventListener("pointermove", move); borda.addEventListener("pointerup", solta);
  });
}
const limita = (v, a, b) => Math.round(Math.max(a, Math.min(b, v)));
arrasta($("div-arq"), (ev) => raiz.setProperty("--w-arq", `${limita(ev.clientX - $("corpo").getBoundingClientRect().left, 180, 520)}px`),
  () => guarda("maisim-script-w-arq", raiz.getPropertyValue("--w-arq")));
arrasta($("div-scope"), (ev) => { const fim = $("gaveta-ia").hidden ? innerWidth : $("gaveta-ia").getBoundingClientRect().left;
  raiz.setProperty("--w-scope", `${limita(fim - ev.clientX, 280, innerWidth * 0.7)}px`); }, () => guarda("maisim-script-w-scope", raiz.getPropertyValue("--w-scope")));
function alturaSaida(px) { const max = $("col-cod").clientHeight - 140; raiz.setProperty("--h-saida", `${limita(px, 90, max)}px`); }
arrasta($("saida-borda"), (ev) => alturaSaida($("col-cod").getBoundingClientRect().bottom - ev.clientY), () => guarda("maisim-script-h-saida", raiz.getPropertyValue("--h-saida")));
$("saida-borda").addEventListener("dblclick", () => { raiz.removeProperty("--h-saida"); guarda("maisim-script-h-saida", ""); });
function recolheSaida(sim) {
  $("saida-box").classList.toggle("recolhida", sim); $("bt-saida").textContent = sim ? "+" : "−";
  $("bt-saida").setAttribute("aria-expanded", String(!sim));
  const k = sim ? "scr.saida_mostrar" : "scr.saida_recolher"; $("bt-saida").dataset.trTitle = k; $("bt-saida").dataset.trAria = k;
  $("bt-saida").title = tr(k); $("bt-saida").setAttribute("aria-label", tr(k));
  guarda("maisim-script-saida-recolhida", sim ? "1" : "");
}
$("bt-saida").onclick = () => recolheSaida(!$("saida-box").classList.contains("recolhida"));
for (const k of ["w-arq", "w-scope", "h-saida"]) if (lido(`maisim-script-${k}`)) raiz.setProperty(`--${k}`, lido(`maisim-script-${k}`));
if (lido("maisim-script-saida-recolhida") === "1") recolheSaida(true);
coluna("arq", lido("maisim-script-col-arq") !== "0"); secaoExemplos(lido("maisim-script-exemplos") === "1", false); coluna("scope", lido("maisim-script-col-scope") === "1");
// a altura do cabeçalho (ele quebra em linhas numa janela estreita): o corpo começa logo abaixo
new ResizeObserver(() => raiz.setProperty("--cab", `${$("cab").offsetHeight}px`)).observe($("cab"));

// o Monaco cancela as próprias tarefas ao trocar o modelo de uma aba (a prévia que dá lugar): "Canceled" não é um erro
addEventListener("unhandledrejection", (e) => { if (e.reason && (e.reason.name === "Canceled" || e.reason.message === "Canceled")) e.preventDefault(); });
// ----------------------------------------------------------------- início
document.title = tr("scr.titulo");
$("bt-novo").onclick = novo; $("bt-novo2").onclick = novo; $("bt-pasta").onclick = novaPasta; $("bt-pasta2").onclick = novaPasta;
$("bt-mover").onclick = () => { if (st.grupo === "meus" && st.nome) pedeDestino(st.nome); };
$("raiz-meus").onclick = () => { st.pasta = ""; lista(); };
$("bt-salvar").onclick = salvar; $("bt-salvar-como").onclick = salvarComo; $("bt-rodar").onclick = rodar; $("bt-apagar").onclick = apagar;
// o aviso de segurança: aparece até a pessoa dizer "Entendi" (guardado neste navegador)
if (lido("maisim-script-aviso") === "ok") $("aviso").hidden = true;
$("bt-aviso").onclick = () => { $("aviso").hidden = true; guarda("maisim-script-aviso", "ok"); };
document.addEventListener("keydown", (e) => {          // os atalhos (o Monaco trata os dele quando tem o foco)
  if (!(e.ctrlKey || e.metaKey) || e.target.closest("#gaveta-ia")) return;   // na IA, Ctrl+Enter envia (script_ia.js)
  if (e.key === "s") { e.preventDefault(); salvar(); } else if (e.key === "Enter") { e.preventDefault(); rodar(); }
});
window.addEventListener("beforeunload", (e) => { if (st.abas.some((a) => a.nome && sujoAba(a))) { e.preventDefault(); e.returnValue = ""; } });
maisimI18n.aoMudar(() => { maisimI18n.aplica(document); desenhaAbas(); marca(); lista(); });
(async () => {
  maisimI18n.aplica(document);
  $("saida").innerHTML = `<span class="dica">${esc(tr("scr.saida_vazia"))}\n</span><span class="dica">${tr("scr.ajuda_html")}\n</span>`;
  await montaEditor();
  // as abas da última vez (as que ainda existem), e o script do endereço por cima
  let guardadas = [];
  try { guardadas = JSON.parse(lido("maisim-script-abas") || "[]"); } catch (e) { /* nenhuma */ }
  for (const [n, g, f] of guardadas) {
    try { const j = await api(`/ler?nome=${encodeURIComponent(n)}&grupo=${encodeURIComponent(g)}`); novaAba(j.nome, g, j.codigo, false, !!f); } catch (e) { /* sumiu */ }
  }
  const q = new URLSearchParams(location.search);
  if (q.get("nome")) await abre(q.get("nome"), q.get("grupo") === "exemplos" ? "exemplos" : "meus");
  else if (st.abas.length) { ativa(0); await lista(); }
  else await novo();
})();
