// MaiSim — a IA do MaiSim na página de scripts (#258): a mesma IA do simu (o login, a conta, um pedido por vez no MaiSim
// todo), com a conversa do script aberto. Ela lê o projeto do script, a saída e os erros da última execução e propõe
// mudanças nos .py; aqui a pessoa vê a diferença e aplica (ou aplica e roda) ou descarta. Nada roda nem é salvo sozinho.
// Rotas: GET scripts/ia?nome=, POST scripts/ia/{pedir,nova,aplicar,descartar}, POST claude/parar; o login: claude/ias.
const ia = { aberta: false, est: null, timer: null, ias: [], ultimaChave: "", vista: false };
const iaApi = async (rota, corpo) => {
  const r = await fetch(rota, corpo ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(corpo) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || r.status);
  return j;
};

// ----------------------------------------------------------------- markdown leve (tudo escapado): ```código```, `código`,
// **negrito**, títulos, listas e parágrafos
function iaMd(txt) {
  return String(txt || "").split(/```[a-zA-Z]*\n?/).map((p, i) => {
    if (i % 2) return `<pre><code>${esc(p.replace(/\n$/, ""))}</code></pre>`;
    const inl = (t) => esc(t).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
    const out = []; let lista = null;
    for (const l of p.split("\n")) {
      const m = l.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/), h = l.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
      if (m) { (lista = lista || []).push(`<li>${inl(m[1])}</li>`); continue; }
      if (lista) { out.push(`<ul>${lista.join("")}</ul>`); lista = null; }
      if (h) out.push(`<div class="md-h">${inl(h[1])}</div>`); else if (l.trim()) out.push(`<p>${inl(l)}</p>`);
    }
    if (lista) out.push(`<ul>${lista.join("")}</ul>`);
    return out.join("");
  }).join("");
}

// ----------------------------------------------------------------- a diferença (linhas): LCS; grande demais, só a nova versão
function iaDif(a, b) {
  const A = a ? a.split("\n") : [], B = b.split("\n");
  if (A.length * B.length > 3e6) return null;
  const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { out.push(["igual", A[i]]); i++; j++; }
    else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { out.push(["menos", A[i]]); i++; }   // o que sai antes do que entra
    else { out.push(["mais", B[j]]); j++; }
  }
  // só os trechos que mudaram, com 2 linhas de contexto
  const perto = out.map((x, k) => x[0] !== "igual" || out.slice(Math.max(0, k - 2), k + 3).some((y) => y[0] !== "igual"));
  let h = "", pulou = false;
  out.forEach(([t, l], k) => {
    if (!perto[k]) { if (!pulou) h += `<span class="igual">⋯</span>`; pulou = true; return; }
    pulou = false; h += `<span class="${t}">${t === "mais" ? "+ " : t === "menos" ? "− " : "  "}${esc(l)}</span>`;
  });
  return h;
}

// ----------------------------------------------------------------- as IAs conectadas e os modelos (como no simu)
async function iaContas() {
  try { ia.ias = await iaApi("claude/ias"); } catch (e) { ia.ias = []; }
  let claudeLogado = false;
  try { claudeLogado = !!(await iaApi("claude/estado")).logado; } catch (e) { /* sem login */ }
  const logada = (x) => (x.id === "claude" ? claudeLogado : x.tem_login ? !!(x.estado && x.estado.logado) : claudeLogado);
  const on = ia.ias.filter((x) => x.instalado && logada(x));
  const q = $("ia-qual"), guardada = (() => { try { return localStorage.getItem("maisim-script-ia"); } catch (e) { return null; } })();
  q.innerHTML = on.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join("");
  if (on.some((x) => x.id === guardada)) q.value = guardada;
  q.hidden = on.length < 2;
  ia.logada = on.length > 0;
  iaModelos();
}
function iaModelos() {
  const a = ia.ias.find((x) => x.id === ($("ia-qual").value || "claude")) || { modelos: [""], rotulos: {} };
  const s = $("ia-modelo"), chave = `maisim-script-ia-modelo-${a.id || "claude"}`;
  s.innerHTML = (a.modelos || [""]).map((m) => `<option value="${esc(m)}">${esc(m ? (a.rotulos || {})[m] || m[0].toUpperCase() + m.slice(1) : tr("scr.ia_modelo_padrao"))}</option>`).join("");
  try { const g = localStorage.getItem(chave); if (g !== null && (a.modelos || []).includes(g)) s.value = g; } catch (e) { /* padrão */ }
}

// ----------------------------------------------------------------- o estado e o desenho
const iaNome = () => (st.grupo === "meus" && st.nome ? st.nome : "");
async function iaAtualiza() {
  const nome = iaNome();
  if (!nome) { ia.est = null; iaDesenha(); return; }
  try { ia.est = await iaApi(`scripts/ia?nome=${encodeURIComponent(nome)}`); } catch (e) { ia.est = null; }
  iaDesenha();
  const p = ia.est && ia.est.pedido, rodando = !!(p && p.andamento);
  clearTimeout(ia.timer);
  if (rodando || (ia.est && ia.est.ocupada_noutro)) ia.timer = setTimeout(iaAtualiza, rodando ? 900 : 4000);
}
function iaDesenha() {
  const e = ia.est, p = e && e.pedido, rodando = !!(p && p.andamento), nome = iaNome();
  const temProposta = !!(p && !rodando && p.proposta && p.proposta.mudou && !p.aplicada);
  $("bt-ia").classList.toggle("trabalhando", rodando);
  $("bt-ia").classList.toggle("proposta", temProposta && !ia.aberta);
  $("ia-parar").hidden = !rodando; $("ia-enviar").hidden = rodando;
  const av = $("ia-aviso");
  const aviso = !ia.logada ? `${esc(tr("scr.ia_sem_login"))} <a href="/maisim/simu/?contas=1">${esc(tr("scr.ia_entrar"))}</a>`
    : e && e.ocupada_noutro ? esc(tr("scr.ia_outro", { onde: e.onde || "?" })) : "";
  av.innerHTML = aviso; av.hidden = !aviso;
  $("ia-enviar").disabled = !ia.logada || !!(e && e.ocupada_noutro);
  if (!ia.aberta) return;
  const chave = JSON.stringify([nome, e, ia.logada]);
  if (chave === ia.ultimaChave) return;
  ia.ultimaChave = chave;
  const M = $("ia-msgs"), noFim = M.scrollHeight - M.scrollTop - M.clientHeight < 40;
  let h = "";
  const hist = (e && e.historico) || [];
  if (!nome) h = `<div class="vazio">${esc(tr("scr.ia_sem_script"))}</div>`;
  else if (!hist.length && !p) h = `<div class="vazio">${esc(tr("scr.ia_vazio"))}</div>`;
  hist.forEach((x, k) => {
    h += `<div class="ia-eu">${esc(x.pedido || "")}</div>`;
    const ultimo = k === hist.length - 1;
    if (x.erro && x.erro !== "parado") h += `<div class="ia-ela ia-erro">${esc(tr("scr.ia_erro", { erro: x.erro }))}</div>`;
    else if (x.erro === "parado") h += `<div class="ia-meta">${esc(tr("scr.ia_parado"))}</div>`;
    if (x.resposta || x.fala) h += `<div class="ia-ela">${iaMd(x.resposta || x.fala)}</div>`;
    const meta = [x.gasto && x.gasto.segundos != null ? tr("scr.ia_gasto", { s: x.gasto.segundos }) : "", x.modelo || ""].filter(Boolean).join(" · ");
    if (meta || x.aplicada) h += `<div class="ia-meta">${esc(meta)}${x.aplicada ? ` · <span class="ia-aplicada">${esc(tr("scr.ia_aplicada"))}</span>` : ""}</div>`;
    if (ultimo && p && !rodando && p.proposta && !p.aplicada) h += iaCartao(p.proposta);
  });
  if (rodando) {
    h += `<div class="ia-eu">${esc(p.pedido || "")}</div><div class="ia-andamento">${esc(tr("scr.ia_trabalhando", { s: Math.round(p.decorrido || 0) }))}`
      + (p.fala ? `<div class="ia-ela">${iaMd(p.fala)}</div>` : "")
      + ((p.eventos || []).length ? `<ul>${p.eventos.slice(-6).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "") + "</div>";
  }
  M.innerHTML = h;
  M.querySelectorAll("[data-ia]").forEach((b) => { b.onclick = () => iaAcao(b.dataset.ia); });
  if (noFim || rodando) M.scrollTop = M.scrollHeight;
}
function iaCartao(prop) {
  if (!prop.mudou) return `<div class="ia-meta">${esc(tr("scr.ia_sem_mudanca"))}</div>`;
  let h = `<div class="ia-cartao"><h4>${esc(tr("scr.ia_proposta"))}</h4>`;
  Object.keys(prop.arquivos).sort().forEach((r, k) => {
    const novo = (prop.novos || []).includes(r), d = iaDif(prop.arquivos_antes[r] || "", prop.arquivos[r]);
    h += `<details class="ia-arq"${k === 0 ? " open" : ""}><summary>${esc(r)}${novo ? `<span class="novo">${esc(tr("scr.ia_novo"))}</span>` : ""}`
      + (prop.sintaxe && prop.sintaxe[r] ? `<span class="sint">${esc(tr("scr.ia_sintaxe", { msg: prop.sintaxe[r] }))}</span>` : "") + `</summary>`
      + `<div class="ia-dif"><pre>${d === null ? esc(prop.arquivos[r]) : d}</pre></div>${d === null ? `<div class="ia-meta">${esc(tr("scr.ia_grande"))}</div>` : ""}</details>`;
  });
  if ((prop.recusados || []).length) h += `<div class="ia-meta">${esc(tr("scr.ia_recusados", { lista: prop.recusados.join(", ") }))}</div>`;
  h += `<div class="ia-bts"><button type="button" class="primario" data-ia="aplicar_rodar">${esc(tr("scr.ia_aplicar_rodar"))}</button>`
    + `<button type="button" data-ia="aplicar">${esc(tr("scr.ia_aplicar"))}</button><button type="button" data-ia="descartar">${esc(tr("scr.ia_descartar"))}</button></div></div>`;
  return h;
}

// ----------------------------------------------------------------- as ações
async function iaEnvia() {
  const texto = $("ia-texto").value.trim();
  if (!texto) { $("ia-texto").focus(); return; }
  // o que a IA vai ler é o que está salvo: um exemplo vira uma cópia nos seus; mudanças no editor são salvas antes
  if (st.grupo === "exemplos" || !st.nome || sujo() || $("nome").value.trim() !== st.nome) {
    if (!(await salvar())) return;
  }
  const a = $("ia-qual").value || "claude", modelo = $("ia-modelo").value;
  try { localStorage.setItem("maisim-script-ia", a); localStorage.setItem(`maisim-script-ia-modelo-${a}`, modelo); } catch (e) { /* só agora */ }
  try {
    await iaApi("scripts/ia/pedir", { nome: st.nome, texto, modelo, ia: a });
    $("ia-texto").value = "";
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
  await iaAtualiza();
}
async function iaAcao(qual) {
  const nome = iaNome(); if (!nome) return;
  try {
    if (qual === "descartar") { await iaApi("scripts/ia/descartar", { nome }); return iaAtualiza(); }
    // aplicar: grava a proposta guardada no servidor; o editor recarrega o script (o que não foi salvo nele seria perdido)
    if (sujo() && !(await janela({ titulo: tr("scr.ia_aplicar_t"), texto: tr("scr.ia_aplicar_sujo"), ok: tr("scr.ia_aplicar"), perigo: true }))) return;
    const r = await iaApi("scripts/ia/aplicar", { nome });
    escreveSaida(tr("scr.ia_aplicou", { lista: (r.arquivos || []).join(", ") }), "dica");
    const j = await api(`/ler?nome=${encodeURIComponent(nome)}&grupo=meus`);
    poeCodigo(j.codigo); await lista(); await iaAtualiza();
    if (qual === "aplicar_rodar") await rodar();
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
}
function iaAbre(abre) {
  ia.aberta = abre; $("gaveta-ia").hidden = !abre; $("bt-ia").hidden = abre;
  document.documentElement.style.setProperty("--ia-aberta", abre && innerWidth > 900 ? "var(--w-ia, 420px)" : "0px");
  try { localStorage.setItem("maisim-script-ia-aberta", abre ? "1" : ""); } catch (e) { /* só agora */ }
  ia.ultimaChave = "";
  if (abre) { iaContas().then(iaAtualiza); setTimeout(() => $("ia-texto").focus(), 0); } else iaDesenha();
}
// a largura da gaveta: arrastar a borda da esquerda (de 300 px a 70 % da janela); duplo clique: larga ↔ estreita
function larguraIA(px) {
  const w = Math.round(Math.max(300, Math.min(innerWidth * 0.7, px)));
  document.documentElement.style.setProperty("--w-ia", `${w}px`); return w;
}
arrasta($("ia-borda"), (ev) => larguraIA(innerWidth - ev.clientX), () => guarda("maisim-script-w-ia", document.documentElement.style.getPropertyValue("--w-ia")));
$("ia-borda").addEventListener("dblclick", () => {
  const atual = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--w-ia"), 10) || 420;
  larguraIA(atual < innerWidth * 0.45 ? innerWidth * 0.6 : 420); guarda("maisim-script-w-ia", document.documentElement.style.getPropertyValue("--w-ia"));
});
if (lido("maisim-script-w-ia")) document.documentElement.style.setProperty("--w-ia", lido("maisim-script-w-ia"));
$("bt-ia").onclick = () => iaAbre(true);
$("ia-fecha").onclick = () => iaAbre(false);
$("ia-enviar").onclick = iaEnvia;
$("ia-parar").onclick = async () => { try { await iaApi("claude/parar", {}); } catch (e) { /* já parou */ } iaAtualiza(); };
$("ia-nova").onclick = async () => {
  const nome = iaNome(); if (!nome) return;
  if (!(await janela({ titulo: tr("scr.ia_nova_t"), texto: tr("scr.ia_nova_texto"), ok: tr("scr.ia_nova") }))) return;
  try { await iaApi("scripts/ia/nova", { nome }); } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
  iaAtualiza();
};
$("ia-qual").onchange = () => { iaModelos(); try { localStorage.setItem("maisim-script-ia", $("ia-qual").value); } catch (e) { /* só agora */ } };
$("ia-modelo").onchange = () => { try { localStorage.setItem(`maisim-script-ia-modelo-${$("ia-qual").value || "claude"}`, $("ia-modelo").value); } catch (e) { /* só agora */ } };
$("ia-texto").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); iaEnvia(); } });
// trocar de script (abrir outro, salvar com outro nome, mover): a conversa acompanha
const iaVigia = () => { const k = iaNome(); if (k !== ia.vista) { ia.vista = k; ia.ultimaChave = ""; iaAtualiza(); } };
setInterval(iaVigia, 700);
maisimI18n.aoMudar(() => { ia.ultimaChave = ""; iaModelos(); iaDesenha(); });
iaContas().then(() => { try { if (localStorage.getItem("maisim-script-ia-aberta") === "1") iaAbre(true); } catch (e) { /* fechada */ } iaVigia(); });
