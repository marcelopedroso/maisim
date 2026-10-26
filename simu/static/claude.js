// MaiSim / simu — a IA do MaiSim: botão no cabeçalho com o estado do login e a janela das contas (o Claude).
// O login do Claude é o do próprio Claude Code (`claude auth login`, no servidor, numa pasta só do MaiSim: ~/.claude-maisim): a
// autenticação acontece na página da Anthropic; a tela só mostra os links e, se o retorno automático não chegar, manda ao
// servidor o código que a página mostrou. Nada de credencial passa por aqui. Uma IA de chave de API (modo_login "chave"):
// a chave colada vai uma vez ao servidor, que a guarda; a página nunca a recebe de volta (só o começo e os 4 últimos).
const cla = { estado: null, falha: "", aviso: "", enviando: false, timer: null, janela: null, desenhado: "", uso: null,
  ias: [], iaAviso: {}, iaEnviando: {}, iaTimer: null, aberta: {}, iaUso: {}, iaUsoLendo: {}, trocaChave: {}, usaChave: {}, inst: null, instTimer: null };   // trocaChave: o campo da chave aberto de novo (Trocar chave)   // inst: a instalação do Claude Code (o botão Instalar)   // aberta: os detalhes de cada conta (o botão)   // ias: /claude/ias (as outras IAs trazem o estado do login)

// o diodo com o brilho de IA, animado (o "carregando" do MaiSim): corrente passando, faíscas piscando, o brilho mudando de cor
function diodoIA(px = 22) {
  return `<svg class="diodo-ia" viewBox="0 -1.5 24 23.5" width="${px}" height="${Math.round(px * 23.5 / 24)}" fill="none" aria-hidden="true">
    <path d="M1 14H4.2M18.6 14H23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path class="dia-corpo" d="M4.2 7L17.2 14L4.2 21Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M18.6 7V21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <g class="dia-luz">
      <path class="dia-fluxo" d="M0.5 14H23.5" stroke="#e9d5ff" stroke-width="2.2" stroke-linecap="round"/>
      <path class="dia-b1" d="M10.6 0.6C11 3.3 11.7 4 14.4 4.4 11.7 4.8 11 5.5 10.6 8.2 10.2 5.5 9.5 4.8 6.8 4.4 9.5 4 10.2 3.3 10.6 0.6Z" fill="#a78bfa"/>
      <path class="dia-b2" d="M15.6 1C15.75 2 16 2.25 17 2.4 16 2.55 15.75 2.8 15.6 3.8 15.45 2.8 15.2 2.55 14.2 2.4 15.2 2.25 15.45 2 15.6 1Z" fill="#c4b5fd"/>
    </g></svg>`;
}
async function apiClaude(rota, corpo) {                 // o cabeçalho X-MaiSim: só a página do MaiSim pode pedir (ver pedido_local)
  const r = await fetch(`claude/${rota}`, corpo ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(corpo) } : {});
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.erro) || r.statusText);
  if (j === null) throw new Error(tr("ia.resposta_invalida")); return j;
}
// tr() de uma chave _html com pedaços que já são HTML (o <span> da pasta, a lista de <code>): tr() escaparia esses, então
// entram como uma marca única (que o escape não produz nem muda) e a marca vira o HTML depois — o texto que veio de fora
// (um e-mail, um nome) nunca é procurado por {chaves}
const MARCA_HTML = `\u0000${Math.random().toString(36).slice(2)}\u0000`;
function trHtml(chave, p, html) {
  const ks = Object.keys(html), marcas = {};
  for (const k of ks) marcas[k] = `${MARCA_HTML}${k}${MARCA_HTML}`;
  let s = tr(chave, Object.assign({}, p, marcas));
  for (const k of ks) s = s.split(marcas[k]).join(html[k]);
  return s;
}
const emAndamento = () => !!(cla.estado && cla.estado.login && cla.estado.login.andamento && !cla.estado.logado);

const outrasIAs = () => (cla.ias || []).filter((a) => a.tem_login && a.estado);
const iaAndando = () => outrasIAs().some((a) => a.estado.login && a.estado.login.andamento && !a.estado.logado);
let logadosAntes = null;
function avisaTrilho(nomes) {                            // um login entrou ou saiu: a bolinha da IA no trilho (aqui e nas outras abas) na hora
  const k = nomes.join(","); if (logadosAntes === null || k === logadosAntes) { logadosAntes = k; return; }
  logadosAntes = k;
  try { localStorage.setItem("maisim-ia-logados", k); } catch (e) { /* ok */ }
  if (window.maisimNav && window.maisimNav.situacaoIA) window.maisimNav.situacaoIA(true);
}
function botaoClaude() {
  const b = $("bt-claude"), e = cla.estado; if (!b) return;
  const logado = !!(e && e.logado), outras = outrasIAs().filter((a) => a.estado.logado);
  if (e) avisaTrilho([logado ? "Claude" : "", ...outras.map((a) => a.nome)].filter(Boolean));
  b.classList.toggle("logado", logado || outras.length > 0); b.classList.toggle("andamento", emAndamento() || iaAndando()); b.classList.toggle("falha", !!cla.falha && !e);
  b.title = (!e ? (cla.falha ? tr("ia.bt_falha", { erro: cla.falha }) : tr("ia.bt"))
    : !e.instalado ? tr(cla.inst && cla.inst.andamento ? "ia.bt_instalando" : "ia.bt_ausente")
    : logado ? tr(e.plano ? "ia.bt_logado_plano" : "ia.bt_logado", { email: e.email || "?", plano: e.plano }) : emAndamento() ? tr("ia.bt_andamento") : tr("ia.bt_entrar"))
    + outras.map((a) => ` · ${a.modo_login === "chave" ? tr("ia.bt_outra_chave", { nome: a.nome }) : tr("ia.bt_outra", { nome: a.nome, email: a.estado.email || "?" })}`).join("");
}
// as outras IAs: a lista com o estado do login (arquivos no servidor: rápido). Enquanto um login anda, acompanha
async function atualizaIAs() {
  try { cla.ias = await apiClaude("ias"); if (typeof cc !== "undefined") { cc.ias = cla.ias; if (typeof ccMontaIA === "function") ccMontaIA(); } }
  catch (err) { /* fica o que havia */ }
  botaoClaude(); desenhaJanelaClaude();
  if (typeof cc !== "undefined" && cc.aberto) desenhaChat();
  if (iaAndando() && !cla.iaTimer) cla.iaTimer = setInterval(atualizaIAs, 3000);
  else if (!iaAndando() && cla.iaTimer) { clearInterval(cla.iaTimer); cla.iaTimer = null; }
  return cla.ias;
}

// o estado vem do servidor; uma falha de rede não apaga o que já se sabia (nem vira "não instalado"). O `claude auth
// status` leva segundos: uma resposta mais antiga que a última aplicada (fora de ordem) é ignorada, senão um pedido velho
// ainda a caminho sobrescreveria o estado novo
let seqClaude = 0, aplicadoClaude = 0;
async function atualizaClaude() {
  const meu = ++seqClaude;
  try { const e = await apiClaude("estado"); if (meu < aplicadoClaude) return cla.estado; aplicadoClaude = meu; cla.estado = e; cla.falha = "";
    cla.inst = e.instalacao || null; }                  // o servidor manda a instalação sempre que houve uma (desde que subiu)
  catch (err) { if (meu < aplicadoClaude) return cla.estado; aplicadoClaude = meu; cla.falha = err.message || tr("ia.erro"); }
  botaoClaude(); desenhaJanelaClaude(); acompanhaClaude(); acompanhaInstalacao();
  if (typeof ccMontaIA === "function") ccMontaIA();                    // o seletor de IA do chat: só as conectadas
  if (typeof cc !== "undefined" && cc.aberto) desenhaChat();          // a conversa do controle depende do login
  return cla.estado;
}
// a instalação do Claude Code pelo botão (Windows: o instalador oficial da Anthropic, no servidor): enquanto anda, a saída;
// no fim, o estado de novo (o servidor procura o claude.exe recém-instalado) e a janela passa ao "Entrar"
function acompanhaInstalacao() {
  const anda = !!(cla.inst && cla.inst.andamento);
  if (anda && !cla.instTimer) cla.instTimer = setInterval(async () => {
    try { cla.inst = await apiClaude("instalacao"); } catch (err) { return; }      // uma falha de rede: tenta na próxima
    if (!cla.inst.andamento) { clearInterval(cla.instTimer); cla.instTimer = null; await atualizaClaude(); atualizaIAs(); }
    else { botaoClaude(); desenhaJanelaClaude(); }
  }, 1500);
  else if (!anda && cla.instTimer) { clearInterval(cla.instTimer); cla.instTimer = null; }
}
// a instalação é de uma IA (a ferramenta dela: o botão da seção dela); uma por vez — a que anda aparece na seção de quem a pediu
const instDe = (ia) => (cla.inst && (cla.inst.ia || "claude") === ia ? cla.inst : null);
const instAnda = () => !!(cla.inst && cla.inst.andamento);
async function instalaClaude(ia = "claude") {
  if (ia === "claude") cla.aviso = ""; else cla.iaAviso = { ...cla.iaAviso, [ia]: "" };
  cla.instalando = ia; desenhaJanelaClaude();
  try { cla.inst = await apiClaude("instalar", { ia }); }
  catch (err) { if (ia === "claude") cla.aviso = err.message; else cla.iaAviso = { ...cla.iaAviso, [ia]: err.message }; }
  finally { cla.instalando = false; }
  botaoClaude(); desenhaJanelaClaude(); acompanhaInstalacao();
}
async function procuraClaude() {                        // instalado por fora (outra pasta, ou pelo terminal): o servidor procura de novo
  cla.aviso = ""; cla.procurando = true; desenhaJanelaClaude();
  try { await atualizaClaude(); } finally { cla.procurando = false; }
  if (cla.estado && !cla.estado.instalado) cla.aviso = tr("ia.ainda_ausente");
  desenhaJanelaClaude(); if (cla.estado && cla.estado.instalado) atualizaIAs();
}
// o "não instalado" do Claude: no Windows, o botão Instalar (e a saída do instalador, enquanto anda ou se falhou); no Linux e
// no macOS, o comando oficial para o terminal; nos dois, "Procurar de novo"
function htmlAusenteClaude(e) {
  const i = instDe("claude"), saida = i && i.saida ? `<pre class="cla-saida">${escT(i.saida)}</pre>` : "";
  if (!e.pode_instalar) return `<p>${tr("ia.ausente_html")}</p><p class="cla-alt">${tr("ia.instalar_claude_terminal_html", { cmd: "curl -fsSL https://claude.ai/install.sh | bash" })}</p>`;
  if (i && i.andamento) return `<p>${tr("ia.ausente_html")}</p><p class="cla-espera">${escT(tr("ia.instalando"))}</p>${saida}`;
  return `<p>${tr("ia.ausente_html")}</p><p class="cla-alt">${tr("ia.instalar_claude_win_html")}</p>`
    + (i && i.erro ? `<p class="cla-erro">${escT(i.erro)}</p>${saida}` : "");
}
function botoesAusenteClaude(e) {
  if (instDe("claude") && instDe("claude").andamento) return "";
  const proc = `<button id="cla-procura"${cla.procurando ? " disabled" : ""}>${escT(cla.procurando ? tr("ia.procurando") : tr("ia.procurar"))}</button>`;
  if (!e.pode_instalar) return proc;
  return proc + `<button id="cla-instalar" class="primario"${cla.instalando || instAnda() ? " disabled" : ""}>${escT(cla.instalando === "claude" ? tr("ia.abrindo")
    : instDe("claude") && instDe("claude").erro ? tr("ia.instalar_de_novo") : tr("ia.instalar"))}</button>`;
}
// enquanto o login anda (com a janela aberta ou não): o retorno automático pode chegar a qualquer hora
function acompanhaClaude() {
  if (emAndamento() && !cla.timer) cla.timer = setInterval(atualizaClaude, 1500);
  else if (!emAndamento() && cla.timer) { clearInterval(cla.timer); cla.timer = null; }
}

function fechaJanelaClaude() {
  if (cla.janela) { cla.janela.remove(); cla.janela = null; }
  cla.aviso = ""; cla.desenhado = "";
  removeEventListener("keydown", teclaJanelaClaude, true);
}
function teclaJanelaClaude(ev) {
  const fundos = document.querySelectorAll(".modal-fundo");
  if (fundos[fundos.length - 1] !== cla.janela) return;    // outra janela por cima (a confirmação de sair): é dela
  if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); fechaJanelaClaude(); return; }
  if (ev.key === "Enter" && ev.target.id === "cla-codigo") { ev.preventDefault(); enviaCodigoClaude(); }
  if (ev.key === "Enter" && ev.target.dataset && ev.target.dataset.iaCodigo) { ev.preventDefault(); enviaCodigoIA(ev.target.dataset.iaCodigo); }
  if (ev.key === "Enter" && ev.target.dataset && ev.target.dataset.iaChave) { ev.preventDefault(); enviaChaveIA(ev.target.dataset.iaChave); }
  ev.stopPropagation();                                  // os atalhos do editor não valem com a janela aberta
}

// redesenha só quando algo que aparece mudou (o acompanhamento não apaga o que se digita nem tira o foco)
function desenhaJanelaClaude() {
  const m = cla.janela && cla.janela.querySelector(".modal"); if (!m) return;
  const e = cla.estado, l = (e && e.login) || {};
  const modo = !e ? "falha" : !e.instalado ? "ausente" : e.logado ? "logado" : l.andamento ? "andamento" : "deslogado";
  const chave = JSON.stringify([modo, e && e.email, e && e.plano, e && e.erro, l.url_auto, l.url_manual, l.erro, cla.aviso, cla.falha, cla.enviando, cla.uso,
    e && e.pode_instalar, cla.inst, cla.instalando, cla.procurando,
    outrasIAs().map((a) => a.estado), cla.iaAviso, cla.iaEnviando, cla.aberta, cla.iaUso, cla.trocaChave, cla.usaChave]);
  if (chave === cla.desenhado) return;
  cla.desenhado = chave;
  // o que se digita nos campos de código (o do Claude e os das outras IAs) sobrevive ao redesenho, com o foco
  const campos = [...m.querySelectorAll("input")].filter((x) => x.id).map((x) => ({ id: x.id, v: x.value, foco: document.activeElement === x,
    sel: [x.selectionStart, x.selectionEnd] }));
  const pasta = tr("ia.pasta_html", { pasta: (e && e.pasta) || "~/.claude-maisim" }), aberta = !!cla.aberta.claude;
  const corpo = {
    falha: `<p class="cla-erro">${escT(cla.falha ? tr("ia.sem_servidor_erro", { erro: cla.falha }) : tr("ia.sem_servidor"))}</p>`,
    ausente: e && !e.instalado ? htmlAusenteClaude(e) : "",
    logado: `<p class="cla-ok">${tr(e && e.plano ? "ia.conectado_plano_html" : "ia.conectado_html", { email: (e && e.email) || "?", plano: e && e.plano })}</p>
      ${aberta ? `<div class="cla-det">${htmlUso(cla.uso)}<p>${trHtml("ia.usa_pasta_html", { nome: "Claude" }, { pasta })}</p></div>` : ""}`,
    andamento: `<p>${escT(tr("ia.passo1_anthropic"))}</p>
      <p><a class="cla-link" target="_blank" rel="noopener noreferrer" id="cla-auto">${escT(tr("ia.abrir_login"))}</a></p>
      <p class="cla-alt">${tr("ia.passo2_anthropic_html")}</p>
      <label class="cla-cod"><input id="cla-codigo" placeholder="${escT(tr("ia.ph_codigo"))}" autocomplete="off" spellcheck="false"><button id="cla-enviar"${cla.enviando ? " disabled" : ""}>${escT(cla.enviando ? tr("ia.conferindo") : tr("ia.enviar"))}</button></label>
      <p class="cla-espera">${escT(tr("ia.esperando_aut"))}</p>`,
    deslogado: `${instDe("claude") && cla.inst.ok && Date.now() / 1000 - cla.inst.fim < 600 ? `<p class="cla-ok">${escT(tr("ia.instalado_entre"))}</p>` : ""}<p>${trHtml("ia.deslogado_html", {}, { pasta })}</p>${l.erro ? `<p class="cla-erro">${escT(tr("ia.ultimo_login", { erro: l.erro }))}</p>` : ""}`,
  }[modo] + (e && e.erro ? `<p class="cla-erro">${escT(e.erro)}</p>` : "") + (cla.aviso ? `<p class="cla-erro">${escT(cla.aviso)}</p>` : "")
    + (cla.falha && e ? `<p class="cla-erro">${escT(tr("ia.sem_servidor_agora", { erro: cla.falha }))}</p>` : "");
  const botoes = {
    falha: `<button id="cla-tentar">${escT(tr("ia.tentar"))}</button>`, ausente: e && !e.instalado ? botoesAusenteClaude(e) : "",
    logado: `${botaoDetalhes("claude")}<button id="cla-sair" class="perigo">${escT(tr("ia.sair"))}</button>`,
    andamento: `<button id="cla-cancelar">${escT(tr("ia.cancelar"))}</button>`,
    deslogado: `<button id="cla-entrar" class="primario">${escT(tr("ia.entrar"))}</button>`,
  }[modo];
  const algumaLogada = (e && e.logado) || outrasIAs().some((a) => a.estado.logado);
  // o aviso geral (Marcelo, 23/10): a IA é a da pessoa, no computador dela, e segue os termos de cada empresa
  m.innerHTML = `<h3>${escT(tr("ia.titulo"))}</h3><p class="cla-termos">${tr("ia.termos_html")}</p>
    <section class="cla-ia"><h4>Claude <small>Anthropic · ${modo === "logado" ? escT(tr("ia.conectado")) : "Claude Code"} · ${linkTermos("Claude Code", "Anthropic", TERMOS_CLAUDE)}</small></h4>${corpo}
    ${botoes ? `<div class="cla-bts">${botoes}</div>` : ""}</section>${outrasIAs().map(htmlContaIA).join("")}
    <div class="modal-botoes"><button class="m-ok${algumaLogada ? "" : " primario"}">${escT(tr("ia.fechar"))}</button>${algumaLogada ? `<button id="cla-pedir" class="primario">${escT(tr("ia.pedir"))}</button>` : ""}</div>`;
  // os links vêm do CLI; entram pela propriedade href (nada de HTML), e só https
  for (const [id, u] of [["cla-auto", l.url_auto || l.url_manual], ["cla-manual", l.url_manual]]) {
    const a = m.querySelector(`#${id}`); if (a && u && /^https:\/\//.test(u)) a.href = u; else if (a) a.removeAttribute("href");
  }
  for (const c of campos) {
    const x = m.querySelector(`#${c.id}`); if (!x) continue;
    x.value = c.v; if (c.foco) { x.focus(); try { x.setSelectionRange(c.sel[0], c.sel[1]); } catch (err) { /* ok */ } }
  }
  for (const a of outrasIAs()) {                         // o link do login: pela propriedade href (nada de HTML), e só https
    const x = m.querySelector(`#iac-link-${a.id}`), u = a.estado.login && a.estado.login.url;
    if (x && u && /^https:\/\//.test(u)) x.href = u; else if (x) x.removeAttribute("href");
  }
  m.querySelectorAll("[data-ia-acao]").forEach((b) => { b.onclick = () => acaoIA(b.dataset.ia, b.dataset.iaAcao); });
  m.querySelectorAll("[data-abre]").forEach((b) => { b.onclick = () => {              // os detalhes e os limites de uma conta
    const id = b.dataset.abre; cla.aberta = { ...cla.aberta, [id]: !cla.aberta[id] };
    if (cla.aberta[id] && id !== "claude" && !cla.iaUso[id]) carregaUsoIA(id);
    desenhaJanelaClaude(); }; });
  m.querySelectorAll("[data-uso]").forEach((b) => { b.onclick = () => carregaUsoIA(b.dataset.uso, true); });
  m.querySelector(".m-ok").onclick = fechaJanelaClaude;
  const on = (id, f) => { const x = m.querySelector(`#${id}`); if (x) x.onclick = f; };
  on("cla-entrar", entraClaude);
  on("cla-instalar", () => instalaClaude("claude"));
  on("cla-procura", procuraClaude);
  on("cla-tentar", atualizaClaude);
  on("cla-cancelar", async () => { cla.aviso = ""; try { cla.estado = await apiClaude("cancelar", {}); } catch (err) { cla.aviso = err.message; } atualizaClaude(); });
  on("cla-sair", async () => { if (!(await confirma(tr("ia.sair_titulo", { nome: "Claude" }), tr("ia.sair_texto", { nome: "Claude" }), tr("ia.sair"), true))) return;
    cla.aviso = ""; try { cla.estado = await apiClaude("sair", {}); } catch (err) { cla.aviso = err.message; } atualizaClaude(); });
  on("cla-enviar", enviaCodigoClaude);
  on("cla-pedir", () => { fechaJanelaClaude(); mostraDoca("controle"); ccAbre(true); });
  on("cla-uso-atualiza", () => carregaUsoClaude(true));
  if (modo === "logado" && aberta && !cla.uso && !cla.lendoUso) carregaUsoClaude();
  for (const a of outrasIAs())                           // o saldo de uma IA de chave conectada: aparece junto da chave
    if (a.modo_login === "chave" && a.estado.logado && !cla.iaUso[a.id]) carregaUsoIA(a.id);
  if (cla.focaChave) { const x = m.querySelector(`#iac-chave-${cla.focaChave}`); cla.focaChave = null; if (x) x.focus(); }   // Trocar chave: o cursor no campo
}
// os termos da empresa de cada IA: um link discreto no título da seção dela (o aviso geral do topo vale para todas)
const TERMOS_CLAUDE = "https://code.claude.com/docs/en/legal-and-compliance";
const linkTermos = (nome, empresa, href) => (/^https:\/\//.test(href || "") ? `<a class="iac-termos" target="_blank" rel="noopener noreferrer" href="${escT(href)}"
  title="${escT(tr("ia.t_termos_link", { nome, empresa: empresa || nome }))}">${escT(tr("ia.termos_link"))} ↗</a>` : "");
const botaoDetalhes = (id) => `<button class="cla-mini cla-abre" data-abre="${id}" aria-expanded="${!!cla.aberta[id]}">${escT(cla.aberta[id] ? tr("ia.ocultar_det") : tr("ia.det"))}</button>`;
// os limites de uma outra IA (se a peça informar, sem gastar o modelo)
// (uma leitura por vez de cada IA; a conversa mostra o mesmo no topo quando ela é a escolhida)
async function carregaUsoIA(id, forca = false) {
  if (cla.iaUsoLendo[id]) return;
  cla.iaUsoLendo = { ...cla.iaUsoLendo, [id]: true };
  cla.iaUso = { ...cla.iaUso, [id]: cla.iaUso[id] && forca ? { ...cla.iaUso[id], lendo: true } : cla.iaUso[id] };
  let u; try { u = await apiClaude(`ia/uso?ia=${encodeURIComponent(id)}${forca ? "&forca=1" : ""}`); } catch (err) { u = { itens: [], erro: err.message }; }
  finally { cla.iaUsoLendo = { ...cla.iaUsoLendo, [id]: false }; }
  const a = (cla.ias || []).find((x) => x.id === id);
  if (a && a.estado && !a.estado.logado) u = undefined;  // saiu enquanto lia: o saldo de antes não vale
  cla.iaUso = { ...cla.iaUso, [id]: u }; desenhaJanelaClaude();
  if (typeof desenhaUsoChat === "function") desenhaUsoChat();
}
// o saldo de uma chave de API, no formato do idioma (pt "US$ 1,84" · en "$1.84")
function fmtSaldo(s) {
  try { return new Intl.NumberFormat(maisimI18n.local(), { style: "currency", currency: s.moeda || "USD" }).format(s.valor); }
  catch (err) { return `${s.valor} ${s.moeda || ""}`.trim(); }
}

// o uso da conta (o mesmo do /usage do Claude Code): sessão de 5 h e semana, com quando renova
async function carregaUsoClaude(forca = false) {
  cla.lendoUso = true;
  try { cla.uso = await apiClaude(forca ? "uso?forca=1" : "uso"); } catch (err) { cla.uso = { itens: [], erro: err.message }; }
  finally { cla.lendoUso = false; }
  if (typeof cc !== "undefined" && cla.uso && cla.uso.itens && cla.uso.itens.length) { cc.uso = cla.uso; desenhaUsoChat(); }
  desenhaJanelaClaude();
}
function htmlUso(u, ia = "claude") {
  if (!u) return `<p class="cla-espera">${escT(tr("ia.lendo_uso"))}</p>`;
  // a IA não informa o uso pela ferramenta (não é erro): o aviso neutro, com o painel da conta dela
  if (u.sem_limites && !(u.itens && u.itens.length)) return `<p class="cla-alt">${u.painel ? tr("ia.uso_no_painel_html", { url: escT(u.painel) }) : escT(tr("ia.uso_nao_informa"))}</p>`;
  if (!u.itens || !u.itens.length) return `<p class="cla-erro">${escT(u.erro ? tr("ia.uso_falhou_erro", { erro: u.erro }) : tr("ia.uso_falhou"))}</p>`;
  const nivel = (p) => (p >= 90 ? "alto" : p >= 70 ? "medio" : "");
  const virgula = (0.5).toLocaleString(maisimI18n.local()).charAt(1);              // a vírgula decimal do idioma (pt "," · en ".")
  const pct = (p) => (p > 0 && p < 10 ? p.toFixed(1).replace(".", virgula) : Math.round(p));   // o pouco usado aparece (0,8%, não 1%)
  const claude = ia === "claude", de = claude ? tr("ia.uso_de_claude") : tr("ia.uso_de_ia");
  return `<div class="cla-uso" title="${escT(de)}">${u.itens.map((i) => `<div class="cla-uso-l"${i.grupo ? ` title="${escT(i.grupo)}"` : ""}><span>${escT(i.rotulo)}</span>
    <span class="barra"><i class="${nivel(i.pct)}" style="width:${Math.max(0, Math.min(100, i.pct))}%"></i></span><b>${pct(i.pct)}%</b>
    ${i.renova ? `<small>${escT(tr("ia.renova", { quando: i.renova }))}</small>` : ""}</div>`).join("")}</div>
    <p class="cla-espera">${escT(claude ? tr("ia.uso_rodape_claude") : tr("ia.uso_rodape_ia"))} · <button ${claude ? 'id="cla-uso-atualiza"' : `data-uso="${escT(ia)}"`} class="cla-mini">${escT(tr("ia.atualizar"))}</button></p>`;
}

// as contas das outras IAs (uma IA com o login pelo MaiSim): uma seção cada. Cada uma pode dizer aqui a empresa, a
// ferramenta, o comando de instalar (fora do Windows; instalaTexto: a chave do texto) e os textos do login; uma IA de chave de
// API (modo_login "chave"), a página onde se cria a chave (chaveUrl, chaveSite), o texto de antes de conectar (chaveIntro), o
// que ela precisa instalado (precisa) e o aviso de custo (custo); e os termos de uso da empresa (termos: o link no título
// da seção) e o que ela diz dos dados enviados (dados, com o link da política de privacidade). Getters: lidos na
// hora de desenhar, no idioma de agora
const IA_DE = {
  // a DeepSeek: o Claude Code deste computador com a chave de API da pessoa (ia/deepseek.py); sem o Claude Code, o mesmo
  // instalador do Claude
  deepseek: { empresa: "DeepSeek", ferramenta: "Claude Code", instala: "curl -fsSL https://claude.ai/install.sh | bash", instalaTexto: "ia.instalar_claude_terminal_html",
    chaveUrl: "https://platform.deepseek.com/api_keys", chaveSite: "platform.deepseek.com → API keys", chavePh: "sk-…",
    // os termos da plataforma (API) e a política de privacidade, nos endereços que o deepseek.com usa (conferidos em 25/10)
    termos: "https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html",
    privacidade: "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html",
    get chaveIntro() { return tr("ia.deepseek_intro"); }, get precisa() { return tr("ia.deepseek_precisa"); }, get dados() { return tr("ia.deepseek_dados"); } },
  // o Cursor: o Cursor CLI oficial (ia/cursor.py), com a conta (o login pela página: o CLI confere sozinho, nada para colar —
  // semCodigo) ou com a chave de API dele; as duas entradas, na ordem do servidor (estado.entradas, MAISIM_CURSOR_ENTRADA)
  cursor: { empresa: "Cursor", ferramenta: "Cursor CLI", instala: "curl https://cursor.com/install -fsS | bash", instalaTexto: "ia.instalar_terminal_html",
    termos: "https://cursor.com/terms-of-service", semCodigo: true,
    chaveUrl: "https://cursor.com/dashboard/api", chaveSite: "cursor.com/dashboard → API Keys",
    get conta() { return tr("ia.cursor_conta"); }, get entrar() { return tr("ia.cursor_entrar"); }, get pagina() { return tr("ia.cursor_pagina"); },
    get espera() { return tr("ia.cursor_espera"); }, get chaveIntro() { return tr("ia.cursor_chave_intro"); }, get chavePh() { return tr("ia.cursor_ph_chave"); },
    get custo() { return tr("ia.cursor_custo"); } },
};
// o "não instalado" de outra IA: o botão Instalar (quando o servidor tem o instalador dela) ou o comando para o terminal
function htmlAusenteIA(a, d, win) {
  const i = instDe(a.id), ferr0 = d.ferramenta || a.nome, saida = i && i.saida ? `<pre class="cla-saida">${escT(i.saida)}</pre>` : "";
  const h = `${d.precisa ? `<p>${escT(d.precisa)}</p>` : ""}<p>${escT(tr("ia.outra_ausente", { ferr: ferr0 }))}`;
  if (a.pode_instalar) {
    if (i && i.andamento) return `${h}</p><p class="cla-espera">${escT(tr("ia.outra_instalando", { ferr: ferr0 }))}</p>${saida}`;
    return `${h} ${escT(tr("ia.outra_pode_instalar"))}</p>` + (i && i.erro ? `<p class="cla-erro">${escT(i.erro)}</p>${saida}` : "");
  }
  return `${h}${d.instala && !win ? ` ${tr(d.instalaTexto || "ia.instalar_html", { cmd: d.instala })}` : ""}</p>`;
}
// o modo da chave de API (DeepSeek…): 1. criar a chave na página da empresa; 2. colar (campo de senha) e salvar. A chave
// colada vai uma vez ao servidor e sai do campo; a página nunca a recebe de volta
function htmlColaChave(a, d, env) {
  const id = a.id, url = d.chaveUrl && /^https:\/\//.test(d.chaveUrl) ? d.chaveUrl : "";
  const link = url ? `<a class="iac-link" target="_blank" rel="noopener noreferrer" href="${escT(url)}">${escT(d.chaveSite || url)} ↗</a>` : "";
  return `<p>${escT(d.chaveIntro || tr("ia.chave_intro", { nome: a.nome }))}</p>
    ${link ? `<p class="iac-passo">1. ${trHtml("ia.chave_criar_html", {}, { link })}</p>` : ""}
    <div class="iac-passo"><label class="cla-cod"><span>${escT((link ? "2. " : "") + tr("ia.chave_cole_aqui"))}</span><input type="password" id="iac-chave-${id}" data-ia-chave="${id}"
      placeholder="${escT(d.chavePh || tr("ia.ph_chave"))}" autocomplete="off" spellcheck="false" aria-describedby="iac-chave-nota-${id}"><button data-ia="${id}" data-ia-acao="chave"${env ? " disabled" : ""}>${escT(env ? tr("ia.conferindo") : tr("ia.salvar_chave"))}</button></label></div>
    <p class="cla-espera" id="iac-chave-nota-${id}">${escT(tr("ia.chave_nota"))}</p>`;
}
function htmlChaveConectada(a, d) {
  const u = cla.iaUso[a.id], saldo = u && u.saldo ? ` · ${escT(tr("ia.saldo", { valor: fmtSaldo(u.saldo) }))}` : "";
  return `<p class="cla-ok iac-chave">${escT(tr("ia.chave_conectada"))} <code>${escT(a.estado.chave || "")}</code>${saldo}</p>
    <p class="cla-alt">${escT(d.custo || tr("ia.chave_custo"))}</p>`;
}
function htmlContaIA(a) {
  const e = a.estado, l = e.login || {}, d = IA_DE[a.id] || {}, av = cla.iaAviso[a.id], env = cla.iaEnviando[a.id];
  // uma IA com as duas entradas (o login pela página e a chave: o Cursor): conectada, a que está valendo; senão, a 1ª da ordem
  // dela (modo_login "chave": a chave primeiro) ou a chave, se a pessoa pediu ("Usar uma chave de API")
  const duas = (e.entradas || []).length > 1;
  const deChave = duas ? (e.logado ? e.modo === "chave" : a.modo_login === "chave" || !!cla.usaChave[a.id]) : a.modo_login === "chave";
  const trocando = deChave && e.logado && !!cla.trocaChave[a.id];
  const modo = !e.instalado ? "ausente" : e.logado && !trocando ? "logado" : l.andamento ? "andamento" : deChave ? "chave" : "deslogado";
  const win = !!(cla.estado && cla.estado.sistema === "windows");   // um comando de bash não serve lá
  const pasta = tr("ia.pasta_html", { pasta: e.pasta || "" }), ferr0 = d.ferramenta || a.nome, ferr = escT(ferr0), nome = escT(a.nome);
  const conectado = e.email ? (e.plano ? "ia.conectado_plano_html" : "ia.conectado_html") : e.plano ? "ia.conectado_so_plano_html" : "ia.conectado_so_html";
  const corpo = {
    ausente: htmlAusenteIA(a, d, win),
    logado: deChave ? htmlChaveConectada(a, d) : `<p class="cla-ok">${tr(conectado, { email: e.email, plano: e.plano })}</p>
      ${cla.aberta[a.id] ? `<div class="cla-det">${htmlUso(cla.iaUso[a.id], a.id)}<p>${trHtml("ia.usa_pasta_html", { nome: a.nome }, { pasta })}${e.email ? ` ${escT(tr("ia.plano_nao_informa", { ferr: ferr0 }))}` : ""}</p></div>` : ""}`,
    chave: htmlColaChave(a, d, env),
    andamento: d.semCodigo ? `<p>${escT(d.pagina || tr("ia.pagina_padrao"))}</p>
      <p><a class="cla-link" target="_blank" rel="noopener noreferrer" id="iac-link-${a.id}">${escT(tr("ia.abrir_login"))}</a></p>
      <p class="cla-espera" role="status">${escT(d.espera || tr("ia.esperando_aut"))}</p>` : `<p>1. ${escT(d.pagina || tr("ia.pagina_padrao"))}</p>
      <p><a class="cla-link" target="_blank" rel="noopener noreferrer" id="iac-link-${a.id}">${escT(tr("ia.abrir_login"))}</a></p>
      <p class="cla-alt">2. ${escT(d.codigo || tr("ia.codigo_padrao"))}</p>
      <label class="cla-cod"><input id="iac-codigo-${a.id}" data-ia-codigo="${a.id}" placeholder="${escT(tr("ia.ph_codigo_aut"))}" autocomplete="off" spellcheck="false"><button data-ia="${a.id}" data-ia-acao="codigo"${env ? " disabled" : ""}>${escT(env ? tr("ia.conferindo") : tr("ia.enviar"))}</button></label>
      <p class="cla-espera">${escT(tr("ia.esperando_cod"))}</p>`,
    deslogado: `<p>${d.conta ? escT(d.conta) + " " : ""}${trHtml("ia.outra_deslogado_html", { ferr: ferr0, nome: a.nome, empresa: d.empresa || a.nome }, { pasta })}</p>
      ${l.erro ? `<p class="iac-erro">${escT(tr("ia.ultimo_login", { erro: l.erro }))}</p>` : ""}`,
  }[modo]
    + (d.dados && (modo === "chave" || modo === "logado") ? `<p class="cla-alt iac-dados">${escT(d.dados)}${/^https:\/\//.test(d.privacidade || "")
      ? ` <a class="iac-termos" target="_blank" rel="noopener noreferrer" href="${escT(d.privacidade)}">${escT(tr("ia.privacidade_link"))} ↗</a>` : ""}</p>` : "")
    + (av ? `<p class="iac-erro" role="alert">${escT(av)}</p>` : "");
  const i = instDe(a.id), bt = (acao, txt, extra = "") => `<button data-ia="${a.id}" data-ia-acao="${acao}"${extra}>${escT(txt)}</button>`;
  const bts = {
    ausente: i && i.andamento ? "" : bt("procurar", cla.procurando ? tr("ia.procurando") : tr("ia.procurar"), cla.procurando ? " disabled" : "")
      + (a.pode_instalar ? bt("instalar", cla.instalando === a.id ? tr("ia.abrindo") : i && i.erro ? tr("ia.instalar_de_novo") : tr("ia.outra_instalar", { ferr: ferr0 }),
        ` class="primario"${cla.instalando || instAnda() ? " disabled" : ""}`) : ""),
    logado: deChave ? `${bt("trocar", tr("ia.trocar_chave"))}${bt("sair", tr("ia.sair"), ' class="perigo"')}`
      : `${botaoDetalhes(a.id)}${bt("sair", tr("ia.sair"), ' class="perigo"')}`,
    chave: trocando ? bt("nao_trocar", tr("ia.cancelar")) : duas ? bt("entrar", env ? tr("ia.abrindo") : d.entrar || tr("ia.entrar"), env ? " disabled" : "") : "",
    andamento: bt("cancelar", tr("ia.cancelar")),
    deslogado: bt("entrar", env ? tr("ia.abrindo") : d.entrar || tr("ia.entrar"), ` class="primario"${env ? " disabled" : ""}`)
      + (duas ? bt("usar_chave", tr("ia.usar_chave")) : "") }[modo];
  const situacao = modo === "logado" ? tr("ia.conectado") : modo === "chave" ? tr("ia.nao_conectado") : ferr0;
  return `<section class="cla-ia" id="iac-${a.id}"><h4>${nome} <small>${[d.empresa !== a.nome && d.empresa, situacao].filter(Boolean).map(escT).concat(d.termos ? [linkTermos(a.nome, d.empresa, d.termos)] : []).join(" · ")}</small></h4>${corpo}${bts ? `<div class="cla-bts">${bts}</div>` : ""}</section>`;
}
async function acaoIA(ia, acao) {
  const a = (cla.ias || []).find((x) => x.id === ia); if (!a) return;
  if (acao === "codigo") return enviaCodigoIA(ia);
  if (acao === "chave") return enviaChaveIA(ia);
  if (acao === "instalar") return instalaClaude(ia);
  if (acao === "procurar") { cla.procurando = true; desenhaJanelaClaude(); try { await atualizaIAs(); } finally { cla.procurando = false; } desenhaJanelaClaude(); return; }
  if (acao === "usar_chave") {                           // a outra entrada (o Cursor): o campo da chave em vez do login
    cla.usaChave = { ...cla.usaChave, [ia]: true }; cla.iaAviso = { ...cla.iaAviso, [ia]: "" }; cla.focaChave = ia;
    return desenhaJanelaClaude();
  }
  if (acao === "trocar" || acao === "nao_trocar") {      // Trocar chave: o campo de novo (a chave de agora vale até salvar a nova)
    cla.trocaChave = { ...cla.trocaChave, [ia]: acao === "trocar" }; cla.iaAviso = { ...cla.iaAviso, [ia]: "" };
    if (acao === "trocar") cla.focaChave = ia;
    return desenhaJanelaClaude();
  }
  if (acao === "sair" && !(await confirma(tr("ia.sair_titulo", { nome: a.nome }), tr("ia.sair_texto", { nome: a.nome }), tr("ia.sair"), true))) return;
  cla.iaAviso = { ...cla.iaAviso, [ia]: "" };
  if (acao === "entrar") { cla.iaEnviando = { ...cla.iaEnviando, [ia]: true }; desenhaJanelaClaude(); }   // o CLI leva uns segundos para dar o link
  try { a.estado = await apiClaude(`ia/${acao}`, { ia }); } catch (err) { cla.iaAviso = { ...cla.iaAviso, [ia]: err.message }; }
  finally { if (acao === "entrar") cla.iaEnviando = { ...cla.iaEnviando, [ia]: false }; }
  if (acao === "sair") { cla.iaUso = { ...cla.iaUso, [ia]: undefined }; cla.trocaChave = { ...cla.trocaChave, [ia]: false }; cla.usaChave = { ...cla.usaChave, [ia]: false }; }
  atualizaIAs();
}
// a chave colada: vai uma vez ao servidor (que confere a forma, guarda num arquivo só dele e devolve o estado com a chave
// mascarada) e sai do campo; recusada, fica no campo para corrigir, com o motivo
async function enviaChaveIA(ia) {
  const ci = $(`iac-chave-${ia}`); if (!ci || !ci.value.trim() || cla.iaEnviando[ia]) return;
  const chave = ci.value;
  cla.iaEnviando = { ...cla.iaEnviando, [ia]: true }; cla.iaAviso = { ...cla.iaAviso, [ia]: "" }; desenhaJanelaClaude();
  try {
    const e = await apiClaude("ia/codigo", { ia, codigo: chave }), a = (cla.ias || []).find((x) => x.id === ia); if (a) a.estado = e;
    const n = $(`iac-chave-${ia}`); if (n) n.value = "";
    cla.trocaChave = { ...cla.trocaChave, [ia]: false }; cla.iaUso = { ...cla.iaUso, [ia]: undefined };   // o saldo é o da chave nova
  } catch (err) { cla.iaAviso = { ...cla.iaAviso, [ia]: err.message }; }
  finally { cla.iaEnviando = { ...cla.iaEnviando, [ia]: false }; }
  atualizaIAs();
}
async function enviaCodigoIA(ia) {
  const ci = $(`iac-codigo-${ia}`); if (!ci || !ci.value.trim() || cla.iaEnviando[ia]) return;
  cla.iaEnviando = { ...cla.iaEnviando, [ia]: true }; cla.iaAviso = { ...cla.iaAviso, [ia]: "" }; desenhaJanelaClaude();
  try {
    const e = await apiClaude("ia/codigo", { ia, codigo: ci.value }), a = (cla.ias || []).find((x) => x.id === ia); if (a) a.estado = e;
    const n = $(`iac-codigo-${ia}`); if (n) n.value = "";
    if (!e.logado && e.login && e.login.erro) cla.iaAviso = { ...cla.iaAviso, [ia]: tr("ia.login_nao_entrou", { erro: e.login.erro }) };
  } catch (err) { cla.iaAviso = { ...cla.iaAviso, [ia]: err.message }; }
  finally { cla.iaEnviando = { ...cla.iaEnviando, [ia]: false }; }
  atualizaIAs();
}

async function entraClaude() {
  const m = cla.janela && cla.janela.querySelector(".modal");
  if (m) m.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  cla.aviso = ""; cla.entrando = true;                   // entrando: a troca de idioma não redesenha (os botões voltariam a valer)
  try { cla.estado = await apiClaude("login", {}); } catch (err) { cla.aviso = err.message; cla.desenhado = ""; }
  finally { if (cla.entrando === "idioma") cla.desenhado = ""; cla.entrando = false; }   // o idioma trocou no meio: redesenha agora
  atualizaClaude();
}

async function enviaCodigoClaude() {
  const ci = $("cla-codigo"); if (!ci || !ci.value.trim() || cla.enviando) return;
  cla.enviando = true; cla.aviso = ""; desenhaJanelaClaude();
  try { cla.estado = await apiClaude("codigo", { codigo: ci.value }); const n = $("cla-codigo"); if (n) n.value = ""; }
  catch (err) { cla.aviso = err.message; }
  finally { cla.enviando = false; }
  atualizaClaude();
}

async function abreJanelaClaude() {
  fechaJanelaClaude();
  const fundo = document.createElement("div"); fundo.className = "modal-fundo";
  fundo.innerHTML = `<div class="modal largo cla" role="dialog" aria-modal="true"><h3>${escT(tr("ia.titulo"))}</h3><p>${escT(tr("ia.consultando"))}</p></div>`;
  fundo.addEventListener("mousedown", (ev) => { if (ev.target === fundo) fechaJanelaClaude(); });
  document.body.appendChild(fundo); cla.janela = fundo; addEventListener("keydown", teclaJanelaClaude, true);
  atualizaIAs();
  await atualizaClaude();
  if (cla.estado && cla.estado.logado && !cla.lendoUso) carregaUsoClaude();   // o uso de agora (o servidor guarda 60 s)
}

(function iniciaClaude() {
  const b = $("bt-claude"); if (!b) return;
  b.onclick = abreJanelaClaude;
  atualizaClaude(); atualizaIAs();
  addEventListener("focus", () => { if (!cla.timer) atualizaClaude(); if (!cla.iaTimer) atualizaIAs(); });   // voltou à aba (login feito noutra janela?)
  // trocou o idioma: o title do botão e a janela das contas (se já desenhada; sem o estado ainda, ela espera o servidor)
  maisimI18n.aoMudar(() => { botaoClaude(); if (cla.entrando) { cla.entrando = "idioma"; return; }
    if (cla.desenhado) { cla.desenhado = ""; desenhaJanelaClaude(); } });
})();
