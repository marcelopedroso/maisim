// PEW / simu — a IA do PEW: botão no cabeçalho com o estado dos logins e a janela das contas (o Claude e o Gemini).
// O login do Claude é o do próprio Claude Code (`claude auth login`, no servidor, numa pasta só do PEW: ~/.claude-pew): a
// autenticação acontece na página da Anthropic; a tela só mostra os links e, se o retorno automático não chegar, manda ao
// servidor o código que a página mostrou. O do Gemini é o do Gemini CLI (~/.gemini-pew): a página do Google mostra um
// código depois de autorizar, e a tela o manda ao servidor. Nada de credencial passa por aqui.
const cla = { estado: null, falha: "", aviso: "", enviando: false, timer: null, janela: null, desenhado: "", uso: null,
  ias: [], iaAviso: {}, iaEnviando: {}, iaTimer: null, aberta: {}, iaUso: {} };   // aberta: os detalhes de cada conta (o botão)   // ias: /claude/ias (as outras IAs trazem o estado do login)

// o diodo com o brilho de IA, animado (o "carregando" do PEW): corrente passando, faíscas piscando, o brilho mudando de cor
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
async function apiClaude(rota, corpo) {                 // o cabeçalho X-PEW: só a página do PEW pode pedir (ver pedido_local)
  const r = await fetch(`claude/${rota}`, corpo ? { method: "POST", headers: { "Content-Type": "application/json", "X-PEW": "1" }, body: JSON.stringify(corpo) } : {});
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.erro) || r.statusText);
  if (j === null) throw new Error("resposta inválida do servidor"); return j;
}
const emAndamento = () => !!(cla.estado && cla.estado.login && cla.estado.login.andamento && !cla.estado.logado);

const outrasIAs = () => (cla.ias || []).filter((a) => a.tem_login && a.estado);
const iaAndando = () => outrasIAs().some((a) => a.estado.login && a.estado.login.andamento && !a.estado.logado);
function botaoClaude() {
  const b = $("bt-claude"), e = cla.estado; if (!b) return;
  const logado = !!(e && e.logado), outras = outrasIAs().filter((a) => a.estado.logado);
  b.classList.toggle("logado", logado || outras.length > 0); b.classList.toggle("andamento", emAndamento() || iaAndando()); b.classList.toggle("falha", !!cla.falha && !e);
  b.title = (!e ? `IA do PEW${cla.falha ? `: sem resposta do servidor (${cla.falha})` : ""}`
    : !e.instalado ? "IA do PEW: o Claude Code (claude) não está instalado neste computador"
    : logado ? `IA do PEW — Claude: conectado como ${e.email || "?"}${e.plano ? ` (${e.plano})` : ""}` : emAndamento() ? "IA do PEW — Claude: login em andamento" : "IA do PEW — Claude: entrar")
    + outras.map((a) => ` · ${a.nome}: conectado como ${a.estado.email || "?"}`).join("");
}
// as outras IAs (o Gemini): a lista com o estado do login (arquivos no servidor: rápido). Enquanto um login anda, acompanha
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
  try { const e = await apiClaude("estado"); if (meu < aplicadoClaude) return cla.estado; aplicadoClaude = meu; cla.estado = e; cla.falha = ""; }
  catch (err) { if (meu < aplicadoClaude) return cla.estado; aplicadoClaude = meu; cla.falha = err.message || "erro"; }
  botaoClaude(); desenhaJanelaClaude(); acompanhaClaude();
  if (typeof cc !== "undefined" && cc.aberto) desenhaChat();          // a conversa do controle depende do login
  return cla.estado;
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
  ev.stopPropagation();                                  // os atalhos do editor não valem com a janela aberta
}

// redesenha só quando algo que aparece mudou (o acompanhamento não apaga o que se digita nem tira o foco)
function desenhaJanelaClaude() {
  const m = cla.janela && cla.janela.querySelector(".modal"); if (!m) return;
  const e = cla.estado, l = (e && e.login) || {};
  const modo = !e ? "falha" : !e.instalado ? "ausente" : e.logado ? "logado" : l.andamento ? "andamento" : "deslogado";
  const chave = JSON.stringify([modo, e && e.email, e && e.plano, e && e.erro, l.url_auto, l.url_manual, l.erro, cla.aviso, cla.falha, cla.enviando, cla.uso,
    outrasIAs().map((a) => a.estado), cla.iaAviso, cla.iaEnviando, cla.aberta, cla.iaUso]);
  if (chave === cla.desenhado) return;
  cla.desenhado = chave;
  // o que se digita nos campos de código (o do Claude e os das outras IAs) sobrevive ao redesenho, com o foco
  const campos = [...m.querySelectorAll("input")].filter((x) => x.id).map((x) => ({ id: x.id, v: x.value, foco: document.activeElement === x,
    sel: [x.selectionStart, x.selectionEnd] }));
  const pasta = `<code>${escT((e && e.pasta) || "~/.claude-pew")}</code>`, aberta = !!cla.aberta.claude;
  const corpo = {
    falha: `<p class="cla-erro">Sem resposta do servidor do PEW${cla.falha ? `: ${escT(cla.falha)}` : ""}.</p>`,
    ausente: `<p>O Claude Code (o comando <code>claude</code>) não está instalado neste computador.</p>`,
    logado: `<p class="cla-ok">Conectado como <b>${escT((e && e.email) || "?")}</b>${e && e.plano ? ` · plano ${escT(e.plano)}` : ""}.</p>
      ${aberta ? `<div class="cla-det">${htmlUso(cla.uso)}<p>A IA do PEW (Claude) usa a pasta ${pasta}. O seu outro login do Claude não muda.</p></div>` : ""}`,
    andamento: `<p>1. Abra a página da Anthropic, entre na sua conta e autorize. Ao terminar, a página volta sozinha e o PEW fica conectado.</p>
      <p><a class="cla-link" target="_blank" rel="noopener noreferrer" id="cla-auto">Abrir a página de login ↗</a></p>
      <p class="cla-alt">2. Se a página não voltar sozinha (ou mostrar um código), use <a target="_blank" rel="noopener noreferrer" id="cla-manual">este outro link</a>:
      ele mostra um código; cole aqui.</p>
      <label class="cla-cod"><input id="cla-codigo" placeholder="código (xxxx#yyyy)" autocomplete="off" spellcheck="false"><button id="cla-enviar"${cla.enviando ? " disabled" : ""}>${cla.enviando ? "conferindo…" : "enviar"}</button></label>
      <p class="cla-espera">esperando a autorização…</p>`,
    deslogado: `<p>O PEW usa o Claude Code deste computador, numa pasta só dele (${pasta}); o seu outro login do Claude não muda.
      A autenticação é na página da própria Anthropic.</p>${l.erro ? `<p class="cla-erro">Último login: ${escT(l.erro)}</p>` : ""}`,
  }[modo] + (e && e.erro ? `<p class="cla-erro">${escT(e.erro)}</p>` : "") + (cla.aviso ? `<p class="cla-erro">${escT(cla.aviso)}</p>` : "")
    + (cla.falha && e ? `<p class="cla-erro">Sem resposta do servidor agora (${escT(cla.falha)}); tentando de novo.</p>` : "");
  const botoes = {
    falha: `<button id="cla-tentar">tentar de novo</button>`, ausente: "",
    logado: `${botaoDetalhes("claude")}<button id="cla-sair" class="perigo">sair</button>`,
    andamento: `<button id="cla-cancelar">cancelar</button>`,
    deslogado: `<button id="cla-entrar" class="primario">entrar</button>`,
  }[modo];
  const algumaLogada = (e && e.logado) || outrasIAs().some((a) => a.estado.logado);
  m.innerHTML = `<h3>IA do PEW — contas</h3><section class="cla-ia"><h4>Claude <small>Anthropic · ${modo === "logado" ? "conectado" : "Claude Code"}</small></h4>${corpo}
    ${botoes ? `<div class="cla-bts">${botoes}</div>` : ""}</section>${outrasIAs().map(htmlContaIA).join("")}
    <div class="modal-botoes"><button class="m-ok${algumaLogada ? "" : " primario"}">fechar</button>${algumaLogada ? `<button id="cla-pedir" class="primario">pedir à IA</button>` : ""}</div>`;
  // os links vêm do CLI; entram pela propriedade href (nada de HTML), e só https
  for (const [id, u] of [["cla-auto", l.url_auto || l.url_manual], ["cla-manual", l.url_manual]]) {
    const a = m.querySelector(`#${id}`); if (a && u && /^https:\/\//.test(u)) a.href = u; else if (a) a.removeAttribute("href");
  }
  for (const c of campos) {
    const x = m.querySelector(`#${c.id}`); if (!x) continue;
    x.value = c.v; if (c.foco) { x.focus(); try { x.setSelectionRange(c.sel[0], c.sel[1]); } catch (err) { /* ok */ } }
  }
  for (const a of outrasIAs()) {                         // o link do Google: pela propriedade href (nada de HTML), e só https
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
  on("cla-tentar", atualizaClaude);
  on("cla-cancelar", async () => { cla.aviso = ""; try { cla.estado = await apiClaude("cancelar", {}); } catch (err) { cla.aviso = err.message; } atualizaClaude(); });
  on("cla-sair", async () => { if (!(await confirma("Sair da conta do Claude", "Desconectar a conta do Claude da IA do PEW? (o seu outro login do Claude não muda)", "sair", true))) return;
    cla.aviso = ""; try { cla.estado = await apiClaude("sair", {}); } catch (err) { cla.aviso = err.message; } atualizaClaude(); });
  on("cla-enviar", enviaCodigoClaude);
  on("cla-pedir", () => { fechaJanelaClaude(); mostraDoca("controle"); ccAbre(true); });
  on("cla-uso-atualiza", () => carregaUsoClaude(true));
  if (modo === "logado" && aberta && !cla.uso && !cla.lendoUso) carregaUsoClaude();
}
const botaoDetalhes = (id) => `<button class="cla-mini cla-abre" data-abre="${id}" aria-expanded="${!!cla.aberta[id]}">${cla.aberta[id] ? "ocultar detalhes ▴" : "detalhes e limites ▾"}</button>`;
// os limites de uma outra IA (o Antigravity: o /usage dele, sem gastar o modelo)
async function carregaUsoIA(id, forca = false) {
  cla.iaUso = { ...cla.iaUso, [id]: cla.iaUso[id] && forca ? { ...cla.iaUso[id], lendo: true } : cla.iaUso[id] };
  let u; try { u = await apiClaude(`ia/uso?ia=${encodeURIComponent(id)}${forca ? "&forca=1" : ""}`); } catch (err) { u = { itens: [], erro: err.message }; }
  cla.iaUso = { ...cla.iaUso, [id]: u }; desenhaJanelaClaude();
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
  if (!u) return `<p class="cla-espera">lendo o uso da conta…</p>`;
  if (!u.itens || !u.itens.length) return `<p class="cla-erro">Não consegui ler o uso da conta${u.erro ? ` (${escT(u.erro)})` : ""}.</p>`;
  const nivel = (p) => (p >= 90 ? "alto" : p >= 70 ? "medio" : "");
  const pct = (p) => (p > 0 && p < 10 ? p.toFixed(1).replace(".", ",") : Math.round(p));   // o pouco usado aparece (0,8%, não 1%)
  const claude = ia === "claude", de = claude ? "o mesmo do /usage do Claude Code" : "o mesmo da tela de uso do Antigravity";
  return `<div class="cla-uso" title="${de}">${u.itens.map((i) => `<div class="cla-uso-l"${i.grupo ? ` title="${escT(i.grupo)}"` : ""}><span>${escT(i.rotulo)}</span>
    <span class="barra"><i class="${nivel(i.pct)}" style="width:${Math.max(0, Math.min(100, i.pct))}%"></i></span><b>${pct(i.pct)}%</b>
    ${i.renova ? `<small>renova ${escT(i.renova)}</small>` : ""}</div>`).join("")}</div>
    <p class="cla-espera">${claude ? "uso da conta (o mesmo do /usage)" : "usado de cada limite (o mesmo do Antigravity)"} · <button ${claude ? 'id="cla-uso-atualiza"' : `data-uso="${escT(ia)}"`} class="cla-mini">atualizar</button></p>`;
}

// as contas das outras IAs (o Google Antigravity; o Gemini só em teste): uma seção cada, com o login delas pelo PEW
const IA_DE = {
  antigravity: { empresa: "Google", ferramenta: "Antigravity CLI", instala: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    conta: "Com a sua conta Google (grátis, Google AI Pro ou Ultra): vale o limite do seu plano no Antigravity, sem chave e sem pagar por uso. Por ele, os modelos Gemini e os outros que o Antigravity oferece.",
    pagina: "Abra a página do Google, entre na sua conta e autorize o Antigravity.", codigo: "A página mostra um código de autorização: copie e cole aqui." },
  gemini: { empresa: "Google", ferramenta: "Gemini CLI", instala: "npm install -g @google/gemini-cli",
    termos: "https://developers.google.com/gemini-code-assist/resources/privacy-notices",
    conta: "Atenção: o Google não atende mais contas pessoais pelo Gemini CLI (a cota grátis, o Google AI Pro e o Ultra vão agora pelo Antigravity; resposta do Google em 21/10). Pela conta Google, só contas de organização com o Gemini Code Assist Standard ou Enterprise.",
    pagina: "Abra a página do Google, entre na sua conta e autorize o Gemini CLI.", codigo: "A página mostra um código de autorização: copie e cole aqui." },
};
function htmlContaIA(a) {
  const e = a.estado, l = e.login || {}, d = IA_DE[a.id] || {}, av = cla.iaAviso[a.id], env = cla.iaEnviando[a.id];
  const modo = !e.instalado ? "ausente" : e.logado ? "logado" : l.andamento ? "andamento" : "deslogado";
  const pasta = `<code>${escT(e.pasta || "")}</code>`, ferr = escT(d.ferramenta || a.nome), nome = escT(a.nome);
  const corpo = {
    ausente: `<p>O ${ferr} não está instalado neste computador.${d.instala ? ` Para instalar (Node 20 ou mais novo): <code>${escT(d.instala)}</code>` : ""}</p>`,
    logado: `<p class="cla-ok">${e.email ? `Conectado como <b>${escT(e.email)}</b>` : "Conectado"}${e.plano ? ` · plano ${escT(e.plano)}` : ""}.</p>
      ${cla.aberta[a.id] ? `<div class="cla-det">${htmlUso(cla.iaUso[a.id], a.id)}<p>A IA do PEW (${nome}) usa a pasta ${pasta}. O seu outro login do ${nome} não muda.${e.email ? ` A conta vem do registro (log) do ${ferr}; o plano ele não informa.` : ""}</p></div>` : ""}`,
    andamento: `<p>1. ${escT(d.pagina || "Abra a página de login e autorize.")}</p>
      <p><a class="cla-link" target="_blank" rel="noopener noreferrer" id="iac-link-${a.id}">Abrir a página de login ↗</a></p>
      <p class="cla-alt">2. ${escT(d.codigo || "Cole aqui o código que a página mostrar.")}</p>
      <label class="cla-cod"><input id="iac-codigo-${a.id}" data-ia-codigo="${a.id}" placeholder="código de autorização" autocomplete="off" spellcheck="false"><button data-ia="${a.id}" data-ia-acao="codigo"${env ? " disabled" : ""}>${env ? "conferindo…" : "enviar"}</button></label>
      <p class="cla-espera">esperando o código… (a página vale por 5 minutos)</p>`,
    deslogado: `<p>${escT(d.conta || "")} O PEW usa o ${ferr} deste computador, numa pasta só dele (${pasta}); o seu outro login do ${nome} não muda.</p>
      ${d.termos ? `<p class="cla-alt">Valem os <a target="_blank" rel="noopener noreferrer" href="${d.termos}">termos e os avisos de privacidade do Gemini Code Assist</a>: veja o que dizem sobre o uso dos dados antes de mandar algo sensível. O PEW desliga o envio de estatísticas de uso.</p>` : ""}
      ${l.erro ? `<p class="iac-erro">Último login: ${escT(l.erro)}</p>` : ""}`,
  }[modo] + (av ? `<p class="iac-erro">${escT(av)}</p>` : "");
  const bts = { ausente: "", logado: `${botaoDetalhes(a.id)}<button class="perigo" data-ia="${a.id}" data-ia-acao="sair">sair</button>`,
    andamento: `<button data-ia="${a.id}" data-ia-acao="cancelar">cancelar</button>`,
    deslogado: `<button class="primario" data-ia="${a.id}" data-ia-acao="entrar"${env ? " disabled" : ""}>${env ? "abrindo…" : "entrar"}</button>` }[modo];
  return `<section class="cla-ia" id="iac-${a.id}"><h4>${nome} <small>${escT(d.empresa || "")} · ${modo === "logado" ? "conectado" : ferr}</small></h4>${corpo}${bts ? `<div class="cla-bts">${bts}</div>` : ""}</section>`;
}
async function acaoIA(ia, acao) {
  const a = (cla.ias || []).find((x) => x.id === ia); if (!a) return;
  if (acao === "codigo") return enviaCodigoIA(ia);
  if (acao === "sair" && !(await confirma(`Sair da conta do ${a.nome}`, `Desconectar a conta do ${a.nome} da IA do PEW? (o seu outro login do ${a.nome} não muda)`, "sair", true))) return;
  cla.iaAviso = { ...cla.iaAviso, [ia]: "" };
  if (acao === "entrar") { cla.iaEnviando = { ...cla.iaEnviando, [ia]: true }; desenhaJanelaClaude(); }   // o CLI leva uns segundos para dar o link
  try { a.estado = await apiClaude(`ia/${acao}`, { ia }); } catch (err) { cla.iaAviso = { ...cla.iaAviso, [ia]: err.message }; }
  finally { if (acao === "entrar") cla.iaEnviando = { ...cla.iaEnviando, [ia]: false }; }
  atualizaIAs();
}
async function enviaCodigoIA(ia) {
  const ci = $(`iac-codigo-${ia}`); if (!ci || !ci.value.trim() || cla.iaEnviando[ia]) return;
  cla.iaEnviando = { ...cla.iaEnviando, [ia]: true }; cla.iaAviso = { ...cla.iaAviso, [ia]: "" }; desenhaJanelaClaude();
  try {
    const e = await apiClaude("ia/codigo", { ia, codigo: ci.value }), a = (cla.ias || []).find((x) => x.id === ia); if (a) a.estado = e;
    const n = $(`iac-codigo-${ia}`); if (n) n.value = "";
    if (!e.logado && e.login && e.login.erro) cla.iaAviso = { ...cla.iaAviso, [ia]: `o login não entrou: ${e.login.erro}` };
  } catch (err) { cla.iaAviso = { ...cla.iaAviso, [ia]: err.message }; }
  finally { cla.iaEnviando = { ...cla.iaEnviando, [ia]: false }; }
  atualizaIAs();
}

async function entraClaude() {
  const m = cla.janela && cla.janela.querySelector(".modal");
  if (m) m.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  cla.aviso = "";
  try { cla.estado = await apiClaude("login", {}); } catch (err) { cla.aviso = err.message; cla.desenhado = ""; }
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
  fundo.innerHTML = `<div class="modal largo cla" role="dialog" aria-modal="true"><h3>IA do PEW — contas</h3><p>consultando…</p></div>`;
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
})();
