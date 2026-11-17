// MaiSim — o modo script (issue #258): um .py comum que roda do começo ao fim e manda os resultados para o Scope por
// maisim.scope(...). A lista (seus scripts e os exemplos), o editor (Monaco, como o painel de controle; sem ele, uma caixa de
// texto), Salvar, Rodar (salva antes e roda no servidor), a saída e "Ver no Scope". Tudo pelas rotas /maisim/simu/scripts*.
const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs";
const MONACO_LOCAL = new URL("static/vendor/monaco/vs", location.href).href;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const st = { nome: "", grupo: "meus", pasta: "", salvo: "", editor: null, texto: null, ultimaRodada: null, rodando: false };

// ----------------------------------------------------------------- servidor
async function api(rota, corpo) {
  const r = await fetch(`scripts${rota}`, corpo ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(corpo) }
    : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || r.status);
  return j;
}

// ----------------------------------------------------------------- editor
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
const codigo = () => (st.editor ? st.editor.getValue() : st.texto ? st.texto.value : "");
function poeCodigo(c) {
  if (st.editor) st.editor.setValue(c); else if (st.texto) st.texto.value = c;
  st.salvo = c; marca();
}
async function montaEditor() {
  try {
    const monaco = await carregaMonaco();
    st.editor = monaco.editor.create($("editor"), { value: "", language: "python", automaticLayout: true, minimap: { enabled: false },
      fontSize: 13, tabSize: 4, insertSpaces: true, scrollBeyondLastLine: false, theme: document.documentElement.dataset.tema === "escuro" ? "vs-dark" : "vs" });
    st.editor.onDidChangeModelContent(marca);
    st.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => salvar());
    st.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => rodar());
  } catch (e) {
    st.texto = document.createElement("textarea"); st.texto.spellcheck = false; st.texto.oninput = marca;
    $("editor").appendChild(st.texto); escreveSaida(tr("scr.monaco_falhou"), "dica");
  }
}

// ----------------------------------------------------------------- estado e lista
function marca() {
  const sujo = codigo() !== st.salvo || ($("nome").value.trim() !== st.nome);
  $("estado").textContent = st.grupo === "exemplos" ? tr("scr.exemplo_so_ler") : sujo ? tr("scr.nao_salvo") : st.nome ? tr("scr.salvo") : tr("scr.nao_salvo");
  $("bt-apagar").disabled = st.grupo !== "meus" || !st.nome;
}
const sujo = () => codigo() !== st.salvo;
// a árvore (pastas e scripts): as pastas abertas ficam guardadas neste navegador; a pasta escolhida (st.pasta, nos seus) é
// onde o "+ Novo script" e o "+ Pasta" criam
let abertas = new Set();
try { abertas = new Set(JSON.parse(localStorage.getItem("maisim-script-abertas") || "[]")); } catch (e) { /* nenhuma */ }
const guardaAbertas = () => { try { localStorage.setItem("maisim-script-abertas", JSON.stringify([...abertas])); } catch (e) { /* só agora */ } };
const contaScripts = (itens) => itens.reduce((n, x) => n + (x.tipo === "pasta" ? contaScripts(x.filhos) : 1), 0);
function ramo(itens, grupo) {
  return itens.map((x) => {
    if (x.tipo === "pasta") {
      const id = `${grupo}:${x.caminho}`;
      return `<li class="pasta${abertas.has(id) ? " aberta" : ""}" data-id="${esc(id)}"><div class="linha">`
        + `<button type="button" class="abre${grupo === "meus" && st.pasta === x.caminho ? " sel" : ""}" data-pasta="${esc(x.caminho)}" data-grupo="${grupo}"><span class="seta">▸</span> ${esc(x.nome)}</button>`
        + (grupo === "meus" ? `<button type="button" class="tira" data-tira="${esc(x.caminho)}" data-n="${contaScripts(x.filhos)}" title="${esc(tr("scr.apagar_pasta"))}" aria-label="${esc(tr("scr.apagar_pasta"))}">×</button>` : "")
        + `</div><ul>${ramo(x.filhos, grupo) || `<li class="vazio">${esc(tr("scr.pasta_vazia"))}</li>`}</ul></li>`;
    }
    return `<li><button type="button" data-nome="${esc(x.caminho)}" data-grupo="${grupo}" title="${esc(x.caminho)}"${x.caminho === st.nome && grupo === st.grupo ? ' aria-current="true"' : ""}>${esc(x.nome)}</button></li>`;
  }).join("");
}
async function lista() {
  const j = await api("");
  $("lista-meus").innerHTML = j.meus.length ? ramo(j.meus, "meus") : `<li class="vazio">${esc(tr("scr.nenhum"))}</li>`;
  $("lista-exemplos").innerHTML = ramo(j.exemplos, "exemplos");
  $("raiz-meus").classList.toggle("sel", !st.pasta);
  for (const b of document.querySelectorAll("aside li button[data-nome]")) b.onclick = () => abre(b.dataset.nome, b.dataset.grupo);
  for (const b of document.querySelectorAll("aside button[data-pasta]")) b.onclick = () => {
    const li = b.closest("li.pasta"), id = li.dataset.id;
    if (b.dataset.grupo === "meus" && st.pasta !== b.dataset.pasta) { st.pasta = b.dataset.pasta; abertas.add(id); }   // escolher abre
    else if (abertas.has(id)) abertas.delete(id); else abertas.add(id);
    guardaAbertas(); lista();
  };
  for (const b of document.querySelectorAll("aside button[data-tira]")) b.onclick = () => apagaPasta(b.dataset.tira, +b.dataset.n);
}
const naPasta = (nome) => (st.pasta ? `${st.pasta}/${nome}` : nome);
async function abre(nome, grupo) {
  if (sujo() && !confirm(tr("scr.descartar"))) return;
  try {
    const j = await api(`/ler?nome=${encodeURIComponent(nome)}&grupo=${encodeURIComponent(grupo)}`);
    st.nome = j.nome; st.grupo = grupo; $("nome").value = j.nome; poeCodigo(j.codigo); st.ultimaRodada = null; $("bt-scope").disabled = true;
    if (grupo === "meus") st.pasta = j.nome.includes("/") ? j.nome.slice(0, j.nome.lastIndexOf("/")) : "";
    const partes = j.nome.split("/"); for (let i = 1; i < partes.length; i++) abertas.add(`${grupo}:${partes.slice(0, i).join("/")}`);   // a pasta dele aberta
    guardaAbertas();
    history.replaceState(null, "", `?nome=${encodeURIComponent(j.nome)}${grupo === "exemplos" ? "&grupo=exemplos" : ""}`);
    await lista();
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
}
async function novo() {
  if (sujo() && !confirm(tr("scr.descartar"))) return;
  const j = await api("/novo");
  st.nome = ""; st.grupo = "meus"; $("nome").value = st.pasta ? `${st.pasta}/` : ""; poeCodigo(j.codigo);
  history.replaceState(null, "", location.pathname); $("nome").focus(); await lista();
}
async function novaPasta() {
  const nome = (prompt(tr("scr.pede_pasta", { onde: st.pasta || tr("scr.meus") })) || "").trim();
  if (!nome) return;
  try {
    const r = await api("/pasta/criar", { nome: naPasta(nome) });
    st.pasta = r.nome; abertas.add(`meus:${r.nome}`); guardaAbertas(); await lista();
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
}
async function apagaPasta(caminho, n) {
  if (!confirm(tr("scr.confirma_apagar_pasta", { nome: caminho, n }))) return;
  try {
    await api("/pasta/apagar", { nome: caminho });
    if (st.pasta === caminho || st.pasta.startsWith(`${caminho}/`)) st.pasta = "";
    if (st.grupo === "meus" && st.nome.startsWith(`${caminho}/`)) { st.nome = ""; st.salvo = ""; await novo(); } else await lista();
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
}

// ----------------------------------------------------------------- salvar, apagar, rodar
async function salvar() {
  let nome = $("nome").value.trim().replace(/\.py$/, "");
  if (st.grupo === "exemplos" && nome === st.nome) {   // o exemplo fica como está: salvar faz uma cópia nos seus (a pasta dele
    try {                                            // inteira, se está numa: os arquivos que ele importa vêm junto)
      const c = await api("/copiar_exemplo", { nome });
      await api("/salvar", { nome: c.nome, codigo: codigo(), sobrescrever: true });
      st.nome = c.nome; st.grupo = "meus"; $("nome").value = c.nome; st.salvo = codigo(); marca();
      st.pasta = c.nome.includes("/") ? c.nome.slice(0, c.nome.lastIndexOf("/")) : "";
      const partes = c.nome.split("/"); for (let i = 1; i < partes.length; i++) abertas.add(`meus:${partes.slice(0, i).join("/")}`);
      guardaAbertas(); history.replaceState(null, "", `?nome=${encodeURIComponent(c.nome)}`);
      escreveSaida(tr("scr.copiado", { nome: c.nome }), "dica"); await lista(); return true;
    } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); return false; }
  }
  if (!nome || nome.endsWith("/")) { const n = (prompt(tr("scr.pede_nome")) || "").trim(); nome = n ? (nome || (st.pasta ? `${st.pasta}/` : "")) + n : ""; }
  if (!nome) return false;
  try {
    let r = await api("/salvar", { nome, codigo: codigo() });
    if (r.codigo === "confirmar") {
      if (!confirm(tr("scr.confirma_sobrescrever", { pergunta: r.pergunta }))) return false;
      r = await api("/salvar", { nome, codigo: codigo(), sobrescrever: true });
    }
    st.nome = r.nome; st.grupo = "meus"; $("nome").value = r.nome; st.salvo = codigo(); marca();
    history.replaceState(null, "", `?nome=${encodeURIComponent(r.nome)}`);
    await lista(); return true;
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); return false; }
}
async function apagar() {
  if (st.grupo !== "meus" || !st.nome || !confirm(tr("scr.confirma_apagar", { nome: st.nome }))) return;
  try { await api("/apagar", { nome: st.nome }); st.nome = ""; st.salvo = ""; await novo(); }
  catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
}
function escreveSaida(txt, cls) {
  const s = document.createElement("span"); if (cls) s.className = cls; s.textContent = txt.endsWith("\n") ? txt : txt + "\n"; $("saida").appendChild(s);
}
async function rodar() {
  if (st.rodando) return;
  // um exemplo sem mudança roda como está; o resto salva antes (roda sempre o que está no disco)
  const precisaSalvar = !(st.grupo === "exemplos" && !sujo() && $("nome").value.trim() === st.nome) && (sujo() || !st.nome || $("nome").value.trim() !== st.nome);
  if (precisaSalvar && !(await salvar())) return;
  st.rodando = true; $("bt-rodar").disabled = true; $("bt-rodar").textContent = tr("scr.rodando");
  $("saida").textContent = ""; $("resultado").textContent = ""; $("resultado").className = "";
  try {
    const r = await api("/rodar", { nome: st.nome, grupo: st.grupo });
    if (r.saida) escreveSaida(r.saida);
    if (r.erro) escreveSaida(r.erro, "err");
    const res = $("resultado");
    res.textContent = r.prazo_estourado ? tr("scr.resultado_prazo") : r.ok ? tr("scr.resultado_ok", { s: r.tempo }) : tr("scr.resultado_erro", { c: r.codigo_saida, s: r.tempo });
    res.className = r.ok ? "ok" : "erro";
    if (r.rodadas.length) {
      escreveSaida(tr("scr.rodadas", { n: r.rodadas.length }), "dica");
      for (const x of r.rodadas) {
        const a = document.createElement("a"); a.href = `/maisim/scope/?a=${encodeURIComponent(x.arquivo)}`; a.textContent = x.pasta;
        const l = document.createElement("span"); l.className = "dica"; l.append("  ", a, "\n"); $("saida").appendChild(l);
      }
      st.ultimaRodada = r.rodadas[r.rodadas.length - 1].arquivo; $("bt-scope").disabled = false;
    } else if (r.ok) escreveSaida(tr("scr.sem_rodadas"), "dica");
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
  st.rodando = false; $("bt-rodar").disabled = false; $("bt-rodar").textContent = tr("scr.rodar");
}

// ----------------------------------------------------------------- início
document.title = tr("scr.titulo");
$("bt-novo").onclick = novo; $("bt-pasta").onclick = novaPasta;
$("raiz-meus").onclick = () => { st.pasta = ""; lista(); }; $("bt-salvar").onclick = salvar; $("bt-rodar").onclick = rodar; $("bt-apagar").onclick = apagar;
// o Scope na mesma aba, com o trilho (o Script do trilho volta aqui); o Rodar já salvou, então não se perde nada
$("bt-scope").onclick = () => { if (st.ultimaRodada) location.href = `/maisim/scope/?a=${encodeURIComponent(st.ultimaRodada)}`; };
$("nome").oninput = marca;
// o aviso de segurança: aparece até a pessoa dizer "Entendi" (guardado neste navegador)
try { if (localStorage.getItem("maisim-script-aviso") === "ok") $("aviso").hidden = true; } catch (e) { /* mostra */ }
$("bt-aviso").onclick = () => { $("aviso").hidden = true; try { localStorage.setItem("maisim-script-aviso", "ok"); } catch (e) { /* só agora */ } };
document.addEventListener("keydown", (e) => {                 // sem o Monaco: os mesmos atalhos
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === "s") { e.preventDefault(); salvar(); } else if (e.key === "Enter") { e.preventDefault(); rodar(); }
});
window.addEventListener("beforeunload", (e) => { if (sujo()) { e.preventDefault(); e.returnValue = ""; } });
maisimI18n.aoMudar(() => { maisimI18n.aplica(document); marca(); });
(async () => {
  maisimI18n.aplica(document);
  escreveSaida("", ""); $("saida").innerHTML = `<span class="dica">${esc(tr("scr.saida_vazia"))}\n</span><span class="dica">${tr("scr.ajuda_html")}\n</span>`;
  await montaEditor();
  const q = new URLSearchParams(location.search);
  if (q.get("nome")) await abre(q.get("nome"), q.get("grupo") === "exemplos" ? "exemplos" : "meus");
  else { await novo(); }
})();
