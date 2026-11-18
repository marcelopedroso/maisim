// MaiSim — a IA do MaiSim na página de scripts (#258): a mesma IA do simu (o login, a conta, um pedido por vez no MaiSim
// todo) e as mesmas peças da tela dela (cc-*: o topo com o uso da conta, as boas-vindas, os balões, o andamento, o cartão
// da proposta com a diferença, o lembrete, Ctrl+Enter). A conversa é a do script da aba ativa: ela lê o projeto, a saída e
// os erros da última execução e propõe mudanças nos .py; aqui a pessoa vê a diferença e aplica (ou aplica e roda) ou
// descarta. Nada roda nem é salvo sozinho. Rotas: GET scripts/ia?nome=, POST scripts/ia/{pedir,nova,aplicar,descartar},
// POST claude/parar; o login e o uso: claude/ias, claude/estado, claude/uso, claude/ia/uso.
const ia = { aberta: false, est: null, timer: null, ias: [], ultimaChave: "", vista: false, uso: null };
const iaApi = async (rota, corpo) => {
  const r = await fetch(rota, corpo ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(corpo) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || r.status);
  return j;
};
const MASCOTE = (w) => `<svg class="mascote" width="${w}" height="${w}" aria-hidden="true"><use href="#maisim-claude"/></svg>`;

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

// ----------------------------------------------------------------- a diferença (linhas, LCS), no formato da IA do circuito
// (cc-diff: − o que sai, + o que entra, ⋯ o que não mudou); grande demais: só a versão nova
function iaDif(a, b) {
  const A = a ? a.split("\n") : [], B = b.split("\n");
  if (A.length * B.length > 3e6) return null;
  const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { out.push(["c", A[i]]); i++; j++; }
    else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { out.push(["r", A[i]]); i++; }   // o que sai antes do que entra
    else { out.push(["m", B[j]]); j++; }
  }
  const perto = out.map((x, k) => x[0] !== "c" || out.slice(Math.max(0, k - 2), k + 3).some((y) => y[0] !== "c"));
  let h = "", pulou = false;
  out.forEach(([t, l], k) => {
    if (!perto[k]) { if (!pulou) h += `<div class="cc-dh"><span>⋯</span></div>`; pulou = true; return; }
    pulou = false; h += `<div class="cc-d${t}"><span>${t === "m" ? "+" : t === "r" ? "−" : ""}</span>${esc(l)}</div>`;
  });
  return h;
}

// ----------------------------------------------------------------- as IAs conectadas, os modelos e o uso (como no simu)
async function iaContas() {
  try { ia.ias = await iaApi("claude/ias"); } catch (e) { ia.ias = []; }
  let claudeLogado = false;
  try { claudeLogado = !!(await iaApi("claude/estado")).logado; } catch (e) { /* sem login */ }
  const logada = (x) => (x.id === "claude" ? claudeLogado : x.tem_login ? !!(x.estado && x.estado.logado) : claudeLogado);
  const on = ia.ias.filter((x) => x.instalado && logada(x));
  const q = $("ia-qual"), guardada = lido("maisim-script-ia");
  q.innerHTML = on.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join("");
  if (on.some((x) => x.id === guardada)) q.value = guardada;
  q.hidden = on.length < 2;
  ia.logada = on.length > 0;
  iaModelos(); iaUso();
}
function iaModelos() {
  const a = ia.ias.find((x) => x.id === ($("ia-qual").value || "claude")) || { modelos: [""], rotulos: {} };
  const s = $("ia-modelo"), chave = `maisim-script-ia-modelo-${a.id || "claude"}`;
  s.innerHTML = (a.modelos || [""]).map((m) => `<option value="${esc(m)}">${esc(m ? (a.rotulos || {})[m] || m[0].toUpperCase() + m.slice(1) : tr("scr.ia_modelo_padrao"))}</option>`).join("");
  const g = lido(chave); if (g !== null && (a.modelos || []).includes(g)) s.value = g;
}
async function iaUso() {                                 // o topo: o uso da sessão do Claude (5 h, semana) ou o saldo de outra IA
  const qual = $("ia-qual").value || "claude", el = $("cc-uso");
  try { ia.uso = await iaApi(qual === "claude" ? "claude/uso" : `claude/ia/uso?ia=${encodeURIComponent(qual)}`); } catch (e) { ia.uso = null; }
  const u = ia.uso;
  if (u && u.saldo && u.saldo.valor != null) {
    el.textContent = tr("scr.ia_saldo", { valor: Number(u.saldo.valor).toLocaleString(maisimI18n.lingua() === "en" ? "en" : "pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      moeda: u.saldo.moeda === "USD" ? "US$" : u.saldo.moeda || "" });
  } else if (u && u.itens && u.itens.length) {
    const nivel = (p) => (p >= 90 ? "alto" : p >= 70 ? "medio" : "");
    el.innerHTML = u.itens.filter((i) => !/·/.test(i.rotulo)).map((i) => `<span class="${nivel(i.pct)}">${esc(i.rotulo.replace(" (5 h)", ""))} ${Math.round(i.pct)}%</span>`).join(" · ");
  } else el.textContent = "";
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
  else if (ia.estavaRodando) { ia.estavaRodando = false; iaUso(); }   // terminou: o uso de depois do pedido
  if (rodando) ia.estavaRodando = true;
}
function iaDesenha() {
  const e = ia.est, p = e && e.pedido, rodando = !!(p && p.andamento), nome = iaNome();
  const temProposta = !!(p && !rodando && p.proposta && p.proposta.mudou && !p.aplicada);
  $("bt-ia").classList.toggle("trabalhando", rodando);
  $("bt-ia").classList.toggle("proposta", temProposta && !ia.aberta);
  $("ia-parar").hidden = !rodando; $("ia-enviar").hidden = rodando;
  $("cc-aviso").textContent = e && e.ocupada_noutro ? tr("scr.ia_outro", { onde: e.onde || "?" }) : "";
  $("ia-enviar").disabled = !ia.logada || !!(e && e.ocupada_noutro);
  for (const id of ["ia-texto", "ia-modelo"]) $(id).disabled = !ia.logada;
  if (!ia.aberta) return;
  const chave = JSON.stringify([nome, st.grupo, e, ia.logada]);
  if (chave === ia.ultimaChave) return;
  ia.ultimaChave = chave;
  const M = $("ia-msgs"), noFim = M.scrollHeight - M.scrollTop - M.clientHeight < 40;
  let h = "";
  const hist = (e && e.historico) || [];
  if (!ia.logada) h = `<div class="cc-vazio"><div class="cc-oi">${MASCOTE(40)}<p>${esc(tr("scr.ia_sem_login"))}</p></div><a href="/maisim/simu/?contas=1" target="_blank"><button type="button" class="primario" id="ia-entrar">${esc(tr("scr.ia_entrar"))}</button></a></div>`;
  else if (!nome) h = `<div class="cc-vazio"><div class="cc-oi">${MASCOTE(40)}<b>${esc(tr("scr.ia_titulo"))}</b></div><p>${esc(tr(st.grupo === "exemplos" ? "scr.ia_exemplo_dica" : "scr.ia_sem_script"))}</p></div>`;
  else if (!hist.length && !p) h = `<div class="cc-vazio"><div class="cc-oi">${MASCOTE(40)}<b>${esc(tr("scr.ia_titulo"))}</b></div><p>${esc(tr("scr.ia_oi"))}</p>`
    + `<ul><li>${esc(tr("scr.ia_ex1"))}</li><li>${esc(tr("scr.ia_ex2"))}</li><li>${esc(tr("scr.ia_ex3"))}</li></ul></div>`;
  hist.forEach((x, k) => {
    h += `<div class="cc-eu">${esc(x.pedido || "")}</div>`;
    const ultimo = k === hist.length - 1;
    if (x.erro && x.erro !== "parado") h += `<div class="cc-ele cc-erro">${esc(tr("scr.ia_erro", { erro: x.erro }))}</div>`;
    else if (x.erro === "parado") h += `<span class="cc-meta">${esc(tr("scr.ia_parado"))}</span>`;
    if (x.resposta || x.fala) h += `<div class="cc-ele">${iaMd(x.resposta || x.fala)}</div>`;
    const meta = [x.gasto && x.gasto.segundos != null ? tr("scr.ia_gasto", { s: x.gasto.segundos }) : "", x.modelo || ""].filter(Boolean).join(" · ");
    if (meta || x.aplicada) h += `<span class="cc-meta">${esc(meta)}${x.aplicada ? ` · <span class="cc-ok ia-aplicada">${esc(tr("scr.ia_aplicada"))}</span>` : ""}</span>`;
    if (ultimo && p && !rodando && p.proposta && !p.aplicada) h += iaCartao(p.proposta);
  });
  if (rodando) {
    h += `<div class="cc-eu">${esc(p.pedido || "")}</div><div class="cc-andamento"><span class="pulso"></span>${esc(tr("scr.ia_trabalhando", { s: Math.round(p.decorrido || 0) }))}`
      + (p.fala ? `<div class="cc-ele">${iaMd(p.fala)}</div>` : "")
      + ((p.eventos || []).length ? `<ol>${p.eventos.slice(-6).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : "") + "</div>";
  }
  M.innerHTML = h;
  M.querySelectorAll("[data-ia]").forEach((b) => { b.onclick = () => iaAcao(b.dataset.ia); });
  if (noFim || rodando) M.scrollTop = M.scrollHeight;
}
function iaCartao(prop) {
  if (!prop.mudou) return `<span class="cc-meta">${esc(tr("scr.ia_sem_mudanca"))}</span>`;
  const arqs = Object.keys(prop.arquivos).sort();
  let h = `<div class="cc-prop"><h5>${esc(tr("scr.ia_proposta"))}</h5><ul>${arqs.map((r) => `<li><code>${esc(r)}</code>${(prop.novos || []).includes(r) ? ` · ${esc(tr("scr.ia_novo"))}` : ""}</li>`).join("")}</ul>`;
  arqs.forEach((r) => {
    const d = iaDif(prop.arquivos_antes[r] || "", prop.arquivos[r]);
    h += `<div class="cc-diff-rot">${esc(r)}${(prop.novos || []).includes(r) ? `<span class="novo">${esc(tr("scr.ia_novo"))}</span>` : ""}`
      + (prop.sintaxe && prop.sintaxe[r] ? `<span class="sint">${esc(tr("scr.ia_sintaxe", { msg: prop.sintaxe[r] }))}</span>` : "") + `</div>`
      + `<div class="cc-diff">${d === null ? `<div class="cc-dc">${esc(prop.arquivos[r])}</div>` : d}</div>${d === null ? `<span class="cc-meta">${esc(tr("scr.ia_grande"))}</span>` : ""}`;
  });
  if ((prop.recusados || []).length) h += `<span class="cc-meta">${esc(tr("scr.ia_recusados", { lista: prop.recusados.join(", ") }))}</span>`;
  h += `<div class="cc-bts"><button type="button" class="primario" data-ia="aplicar_rodar">${esc(tr("scr.ia_aplicar_rodar"))}</button>`
    + `<button type="button" data-ia="aplicar">${esc(tr("scr.ia_aplicar"))}</button><button type="button" data-ia="descartar">${esc(tr("scr.ia_descartar"))}</button></div></div>`;
  return h;
}

// ----------------------------------------------------------------- as ações
async function iaEnvia() {
  const texto = $("ia-texto").value.trim();
  if (!texto) { $("ia-texto").focus(); return; }
  // o que a IA vai ler é o que está salvo: um exemplo vira uma cópia nos seus; mudanças no editor são salvas antes
  if (st.grupo === "exemplos" || !st.nome || sujo()) { if (!(await salvar())) return; }
  const a = $("ia-qual").value || "claude", modelo = $("ia-modelo").value;
  guarda("maisim-script-ia", a); guarda(`maisim-script-ia-modelo-${a}`, modelo);
  try {
    await iaApi("scripts/ia/pedir", { nome: st.nome, texto, modelo, ia: a });
    $("ia-texto").value = "";
  } catch (e) { $("cc-aviso").textContent = tr("scr.falhou", { erro: e.message }); }
  await iaAtualiza();
}
async function iaAcao(qual) {
  const nome = iaNome(); if (!nome) return;
  try {
    if (qual === "descartar") { await iaApi("scripts/ia/descartar", { nome }); return iaAtualiza(); }
    // aplicar: grava a proposta guardada no servidor; as abas abertas dos arquivos mudados recarregam (o que não foi salvo
    // nelas seria perdido: pergunta antes)
    const prop = ia.est && ia.est.pedido && ia.est.pedido.proposta;
    const base = nome.includes("/") ? nome.split("/")[0] + "/" : "";
    const afetadas = st.abas.filter((a) => a.grupo === "meus" && prop && Object.keys(prop.arquivos).some((r) => base + r.replace(/\.py$/, "") === a.nome));
    if (afetadas.some(sujoAba) && !(await janela({ titulo: tr("scr.ia_aplicar_t"), texto: tr("scr.ia_aplicar_sujo"), ok: tr("scr.ia_aplicar"), perigo: true }))) return;
    const r = await iaApi("scripts/ia/aplicar", { nome });
    escreveSaida(tr("scr.ia_aplicou", { lista: (r.arquivos || []).join(", ") }), "dica");
    for (const a of afetadas) {
      const j = await api(`/ler?nome=${encodeURIComponent(a.nome)}&grupo=meus`);
      if (a.model) a.model.setValue(j.codigo); else a.codigo = j.codigo;
      a.salvo = j.codigo; if (a === atual() && st.texto) st.texto.value = j.codigo;
    }
    desenhaAbas(); marca(); await lista(); await iaAtualiza();
    if (qual === "aplicar_rodar") await rodar();
  } catch (e) { escreveSaida(tr("scr.falhou", { erro: e.message }), "err"); }
}
function iaAbre(abre) {
  ia.aberta = abre; $("gaveta-ia").hidden = !abre;
  $("bt-ia").classList.toggle("ativo", abre); $("bt-ia").setAttribute("aria-pressed", String(abre));
  guarda("maisim-script-ia-aberta", abre ? "1" : "");
  ia.ultimaChave = "";
  if (abre) { iaContas().then(iaAtualiza); setTimeout(() => $("ia-texto").focus(), 0); } else iaDesenha();
}
// a largura da coluna: arrastar a borda da esquerda (de 320 px a 70 % da janela); duplo clique: larga ↔ estreita
function larguraIA(px) { raiz.setProperty("--w-ia", `${limita(px, 320, innerWidth * 0.7)}px`); }
arrasta($("ia-borda"), (ev) => larguraIA(innerWidth - ev.clientX), () => guarda("maisim-script-w-ia", raiz.getPropertyValue("--w-ia")));
$("ia-borda").addEventListener("dblclick", () => {
  const atualW = $("gaveta-ia").getBoundingClientRect().width;
  larguraIA(atualW < innerWidth * 0.45 ? innerWidth * 0.6 : 440); guarda("maisim-script-w-ia", raiz.getPropertyValue("--w-ia"));
});
if (lido("maisim-script-w-ia")) raiz.setProperty("--w-ia", lido("maisim-script-w-ia"));
$("bt-ia").onclick = () => iaAbre(!ia.aberta);
$("ia-fecha").onclick = () => iaAbre(false);
$("ia-enviar").onclick = iaEnvia;
$("ia-parar").onclick = async () => { try { await iaApi("claude/parar", {}); } catch (e) { /* já parou */ } iaAtualiza(); };
$("ia-nova").onclick = async () => {
  const nome = iaNome(); if (!nome) return;
  if (!(await janela({ titulo: tr("scr.ia_nova_t"), texto: tr("scr.ia_nova_texto"), ok: tr("scr.ia_nova") }))) return;
  try { await iaApi("scripts/ia/nova", { nome }); } catch (e) { $("cc-aviso").textContent = tr("scr.falhou", { erro: e.message }); }
  iaAtualiza();
};
$("ia-qual").onchange = () => { iaModelos(); iaUso(); guarda("maisim-script-ia", $("ia-qual").value); };
$("ia-modelo").onchange = () => guarda(`maisim-script-ia-modelo-${$("ia-qual").value || "claude"}`, $("ia-modelo").value);
// Ctrl+Enter envia (como na IA do circuito); Enter sozinho quebra a linha
$("ia-texto").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); iaEnvia(); } });
// trocar de aba (abrir outro, salvar com outro nome, mover): a conversa acompanha
const iaVigia = () => { const k = `${st.grupo}:${iaNome()}`; if (k !== ia.vista) { ia.vista = k; ia.ultimaChave = ""; iaAtualiza(); } };
setInterval(iaVigia, 700);
maisimI18n.aoMudar(() => { ia.ultimaChave = ""; iaModelos(); iaUso(); iaDesenha(); });
iaContas().then(() => { if (lido("maisim-script-ia-aberta") === "1") iaAbre(true); iaVigia(); });
