// O MaiSim no celular (/movel.html): a casca de abas. O desenho, o controle e a IA são o próprio editor do simu num iframe
// (/maisim/simu/?movel=1, que mostra só o que a aba pede), e o scope é o próprio scope (/maisim/scope/?movel=1): as mesmas
// rotas, os mesmos circuitos e rodadas do PC (o que se salva aqui abre lá). A casca guarda só a aba e o circuito aberto; os
// arquivos ficam no servidor do MaiSim (um dia, talvez, na nuvem). Nada aqui dá foco sozinho: o teclado só sobe com um toque.
(() => {
  const $ = (id) => document.getElementById(id), tr = maisimI18n.tr, escH = maisimI18n.escH;
  const est = { tab: "inicio", arq: null, n: 0, vivo: false, camadas: [], modelos: [] };
  const fSimu = $("f-simu"), fScope = $("f-scope");
  const pedeSimu = (m) => { try { fSimu.contentWindow.postMessage(m, location.origin); } catch (e) { /* ainda abrindo */ } };
  const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const grava = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* só nesta sessão */ } };

  // ── avisos e gavetas (uma de cada vez) ──
  let avisoT = 0;
  function aviso(txt, bt, acao, ms) {
    $("aviso-tx").textContent = txt; $("aviso-bt").textContent = bt || ""; $("aviso-bt").hidden = !bt; $("aviso").classList.remove("erro");
    $("aviso-bt").onclick = () => { $("aviso").classList.remove("on"); if (acao) acao(); };
    $("aviso").classList.add("on"); clearTimeout(avisoT); avisoT = setTimeout(() => $("aviso").classList.remove("on"), ms || 4000);
  }
  function gaveta(tit, sub, ...corpo) { $("g-tit").textContent = tit; $("g-sub").textContent = sub || ""; $("g-corpo").replaceChildren(...corpo); $("g-corpo").scrollTop = 0;
    $("gaveta").classList.add("on"); $("scrim").classList.add("on"); $("aviso").classList.remove("on"); }
  function fecha() { $("gaveta").classList.remove("on"); $("scrim").classList.remove("on"); }
  $("scrim").onclick = fecha; $("g-fechar").onclick = fecha;
  const el = (tag, attrs, ...filhos) => { const e = document.createElement(tag); for (const k in attrs || {}) { if (k === "onclick") e.onclick = attrs[k]; else if (k === "html") e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]); }
    e.append(...filhos.filter((f) => f != null)); return e; };
  const IC = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${d}</svg>`;
  const item = (icone, rot, acao) => { const b = el("button", { type: "button", html: IC(icone) }, rot); b.onclick = () => { fecha(); acao(); }; return b; };

  // ── tema (a mesma chave do desktop) e idioma (o maisim-i18n: os iframes acompanham pelo storage) ──
  function aplicaTema() {
    const t = ler("maisim-tema") || "sistema", escuro = t === "escuro" || (t === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.tema = escuro ? "escuro" : "claro";
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = m.dataset[escuro ? "escuro" : "claro"];
    document.querySelectorAll("[data-tema]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tema === t)));
  }
  document.querySelectorAll("#seg-tema [data-tema]").forEach((b) => b.onclick = () => { grava("maisim-tema", b.dataset.tema); aplicaTema();
    for (const f of [fSimu, fScope]) if (f.getAttribute("src")) try { f.contentWindow.location.reload(); } catch (e) { /* ok */ } });   // os iframes leem o tema ao abrir
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", aplicaTema);
  const marcaLingua = () => document.querySelectorAll("[data-lingua]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lingua === maisimI18n.lingua())));
  document.querySelectorAll("[data-lingua]").forEach((b) => b.onclick = () => maisimI18n.muda(b.dataset.lingua));
  maisimI18n.aoMudar(() => { marcaLingua(); listaModelos(); topo(); pintaVersao(); });

  // ── o Início: os circuitos do servidor (os seus e os exemplos), como na tela inicial do PC ──
  const nomeDe = (arq) => (arq || "").split("/").pop().replace(/\.ipes$/, "");
  const quando = (s) => { const d = Date.now() / 1000 - s; return d < 3600 ? maisimI18n.hora(s * 1000) : maisimI18n.data(s * 1000, { day: "2-digit", month: "2-digit" }); };
  async function carregaModelos() { try { const r = await fetch("/maisim/simu/modelos"); est.modelos = await r.json(); } catch (e) { est.modelos = []; } listaModelos(); }
  function listaModelos() {
    const q = $("busca").value.trim().toLowerCase(), ok = (m) => !q || m.arq.toLowerCase().includes(q);
    const meus = est.modelos.filter((m) => m.id_grupo !== "exemplos" && ok(m)).sort((a, b) => (b.aberto_em || b.alterado || 0) - (a.aberto_em || a.alterado || 0));
    const ex = est.modelos.filter((m) => m.id_grupo === "exemplos" && ok(m));
    const linha = (m, icone) => { const b = el("button", { class: "linha", type: "button", html: `<span class="ic">${IC(icone)}</span>` },
      el("span", { class: "tx" }, el("b", null, nomeDe(m.arq)), el("span", null, m.grupo && m.id_grupo !== "exemplos" ? `${m.grupo} · ${tr("mv.alterado", { quando: quando(m.alterado) })}` : tr("mv.alterado", { quando: quando(m.alterado) }))));
      b.onclick = () => abre(m.arq); return b; };
    $("l-meus").replaceChildren(...(meus.length ? meus.map((m) => linha(m, '<path d="M3 12h4l2-6 4 12 2-6h6"/>')) : [el("div", { class: "vazio-lista" }, tr("mv.nenhum"))]));
    $("l-exemplos").replaceChildren(...ex.map((m) => linha(m, '<path d="M4 6h6l3 4h7M4 18h16M13 10v8"/>')));
  }
  $("busca").oninput = listaModelos;
  // importar um .msd (o mesmo caminho da tela inicial do PC): a prévia, e grava tudo o que veio (com outro nome, se já existe)
  $("imp-msd").onclick = () => { $("arq-msd").value = ""; $("arq-msd").click(); };
  $("arq-msd").onchange = async () => {
    const arq = $("arq-msd").files && $("arq-msd").files[0]; if (!arq) return;
    aviso(tr("mv.msd_lendo"));
    try {
      let r = await fetch("/maisim/simu/msd/ver", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-MaiSim": "1" }, body: arq });
      const pv = await r.json(); if (!r.ok || pv.erro) throw new Error(pv.erro || r.status);
      r = await fetch("/maisim/simu/msd/importar", { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" },
        body: JSON.stringify({ token: pv.token, nome: pv.conflito ? pv.sugerido : pv.circuito, rodadas: pv.rodadas.map((x) => x.pasta), substituir: false }) });
      const j = await r.json(); if (!r.ok || j.erro) throw new Error(j.erro || r.status);
      await carregaModelos(); aviso(tr("mv.msd_ok", { nome: j.nome }), tr("mv.abrir"), () => abre(j.arq), 6000);
    } catch (e) { aviso(tr("mv.msd_erro", { erro: e.message }), null, null, 6000); }
  };

  // ── a versão e o Atualizar (o mesmo do trilho do PC: /maisim/simu/atualizacao; no Android, a pasta do ARM): baixa, troca o
  //    programa e o MaiSim reinicia sozinho; quando a versão nova responde, a página recarrega ──
  let ATU = null, acomp = 0;
  const tipoNome = (t) => tr("mv.tipo_" + (["windows", "appimage", "pasta", "fonte"].includes(t) ? t : "fonte"));
  async function carregaVersao() {
    try { ATU = await (await fetch("/maisim/simu/atualizacao", { cache: "no-store" })).json(); } catch (e) { return; }
    pintaVersao(); if (ATU.aplicando && ATU.aplicando.fase !== "erro") acompanhaAtu();
  }
  function pintaVersao() {
    if (!ATU) return; const n = ATU.nova, ap = ATU.aplicando, soGit = ATU.tipo === "fonte" && !ATU.git;
    let s, bt = null;
    if (ap && ap.fase === "erro") s = tr("mv.atu_erro", { erro: ap.erro || "" });
    else if (ap && ap.fase === "baixando") s = tr("mv.atu_baixando", { versao: ap.versao, pct: ap.total ? `${Math.min(100, Math.round(100 * ap.feito / ap.total))}%` : "" });
    else if (ap) s = tr("mv.atu_instalando", { versao: ap.versao });
    else if (n) { s = tr("mv.atu_nova", { versao: n.versao }) + (soGit ? " · git pull" : ""); if (!soGit) bt = tr("mv.atualizar"); }
    else s = ATU.sem_rede ? tr("mv.atu_sem_rede") : tr("mv.atu_em_dia");
    $("atu-v").textContent = `MaiSim ${ATU.versao}`; $("atu-s").textContent = `${tipoNome(ATU.tipo)} · ${s}`;
    const b = $("atu-bt"); b.hidden = false; b.disabled = !!(ap && ap.fase !== "erro");
    b.textContent = bt || tr("mv.verificar"); b.dataset.acao = bt ? "aplicar" : "verificar"; b.classList.toggle("pri", !!bt);
    $("atu-canal").hidden = soGit; $("atu-canal-bt").setAttribute("aria-checked", String(ATU.canal === "teste"));
  }
  // o canal (o mesmo da janela do PC): as versões de teste (-rc) ou só as estáveis; a escolha já refaz a "há a …"
  $("atu-canal-bt").onclick = async () => {
    const ch = $("atu-canal-bt"), canal = ch.getAttribute("aria-checked") === "true" ? "estavel" : "teste"; ch.disabled = true;
    try { const j = await (await fetch("/maisim/simu/atualizacao/canal", { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify({ canal }) })).json();
      if (j && j.versao) ATU = j; } catch (e) { /* fica */ }
    ch.disabled = false; pintaVersao();
  };
  $("atu-bt").onclick = async () => {
    const b = $("atu-bt"); b.disabled = true;
    try { const j = await (await fetch(`/maisim/simu/atualizacao/${b.dataset.acao}`, { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: "{}" })).json();
      if (j && j.versao) ATU = j; if (j && j.erro) { ATU = { ...ATU, aplicando: { fase: "erro", erro: j.erro } }; carregaAberto(); } } catch (e) { /* fica */ }   // (recusou por algo sem salvar: o cartão do aberto)
    pintaVersao(); if (ATU && ATU.aplicando && ATU.aplicando.fase !== "erro") acompanhaAtu();
  };
  function acompanhaAtu() {
    if (acomp) return; const de = ATU.versao + (ATU.commit || "");
    acomp = setInterval(async () => {
      try { const e = await (await fetch("/maisim/simu/atualizacao", { cache: "no-store" })).json();
        if (e.versao + (e.commit || "") !== de) { location.reload(); return; }   // a versão nova no ar
        ATU = e; pintaVersao(); if (!e.aplicando || e.aplicando.fase === "erro") { clearInterval(acomp); acomp = 0; }
      } catch (err) { /* desligado para atualizar: espera voltar */ }
    }, 1000);
  }

  // ── o circuito aberto no servidor (o editor guarda um, às vezes sem salvar, mesmo com o app fechado): no topo do Início,
  //    para continuar nele (e salvar: o Atualizar recusa com algo sem salvar, e sem isto o celular não tinha como achá-lo) ──
  async function carregaAberto() {
    let p = null;
    try { p = await (await fetch("/maisim/simu/editor/pendente", { cache: "no-store" })).json();
      const a = await (await fetch("/maisim/simu/editor/aberto", { cache: "no-store" })).json(); if (a.fechado) p = null; } catch (e) { p = null; }
    const arq = p && p.arquivo, novo = !!arq && /^\(|sem arquivo/.test(arq);
    $("g-aberto").hidden = !arq || (arq === est.arq && !p.pendente);
    if (!arq) return;
    $("aberto-n").textContent = novo ? tr("mv.novo_sem_nome") : nomeDe(arq);
    $("aberto-s").textContent = p.pendente ? tr("mv.aberto_sujo", { motivo: p.motivo || "" }) : tr("mv.aberto_ok");
    $("aberto-bt").onclick = () => novo ? abre(null) : abre(arq);
  }
  // ── abrir um circuito: o editor (no iframe) abre e liga a edição; as abas do circuito acendem ──
  function abre(arq) {
    est.arq = arq; est.nome = ""; est.n = 0; est.painel = est.janela = false; $("titulo").textContent = nomeDe(arq);   // o editor novo começa sem painel nem janela $("sub").textContent = tr("mv.sub_abrindo");
    est.scope = null; fScope.src = "about:blank";             // o scope do circuito anterior não fica (a aba Scope acha a rodada deste)
    document.querySelectorAll('.aba[data-tab="circuito"], .aba[data-tab="controle"], .aba[data-tab="ia"]').forEach((b) => { b.disabled = false; });
    fSimu.src = arq ? `/maisim/simu/?movel=1&modelo=${encodeURIComponent(arq)}` : "/maisim/simu/?movel=1&novo=1"; aba("circuito");   // (sem arquivo: o novo sem nome do servidor)
  }
  function topo() {
    const com = !!est.arq, t = est.tab;
    $("rodar").hidden = !com || t === "inicio"; $("mais").hidden = !com || !["circuito", "controle", "ia"].includes(t);
    $("titulo").textContent = t === "inicio" || !com ? "MaiSim · Android" : est.nome || nomeDe(est.arq);
    if (!est.vivo) $("sub").textContent = t === "inicio" || !com ? tr("mv.sub_inicio") : est.n ? tr("mv.sub_edit", { n: est.n }) : tr("mv.sub_abrindo");
  }
  function aba(t) {
    est.tab = t; fecha();
    document.querySelectorAll(".aba").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    $("t-inicio").hidden = t !== "inicio"; $("t-simu").hidden = !["circuito", "controle", "ia"].includes(t); $("t-scope").hidden = t !== "scope";
    $("paleta").hidden = t !== "circuito" || est.painel || est.janela;
    if (["circuito", "controle", "ia"].includes(t)) pedeSimu({ cmd: "vista", vista: t });
    if (t === "scope") mostraScope();
    if (t === "inicio") { carregaModelos(); carregaVersao(); carregaAberto(); }
    topo();
  }
  document.querySelectorAll(".aba").forEach((b) => b.onclick = () => aba(b.dataset.tab));
  $("nome").onclick = () => aba("inicio");
  $("paleta").onclick = () => pedeSimu({ cmd: "paleta" });
  $("novo-bt").onclick = () => abre(null);                    // o editor com ?novo=1: pede o nome (e, com algo sem salvar, o que fazer)
  $("contas").onclick = () => { if (!fSimu.getAttribute("src")) fSimu.src = "/maisim/simu/?movel=1"; est.querContas = true; aba("circuito"); pedeSimu({ cmd: "contas" }); };

  // a aba Scope: a rodada do circuito aberto; aberto e sem nenhuma, só o aviso (o scope sem rodada se liga à rodada ao vivo do
  // servidor, que pode ser de outro circuito); sem circuito aberto, o scope geral (a rodada ao vivo)
  function mostraScope() {
    const vazio = !!est.arq && !est.scope; $("scope-vazio").hidden = !vazio; fScope.hidden = vazio;
    const u = vazio ? "about:blank" : est.scope || "/maisim/scope/?movel=1";
    if (fScope.getAttribute("src") !== u) fScope.src = u;
  }
  // a última rodada gravada do circuito aberto (nenhuma: o aviso, até rodar)
  async function ultimaDoCircuito(arq) {
    let u = null;
    try { const r = await (await fetch("/maisim/scope/rodadas")).json();
      const x = r.filter((y) => y.modelo && (y.modelo === arq || y.modelo.endsWith("/" + arq))).sort((a, b) => b.mtime - a.mtime)[0]; if (x) u = `/maisim/scope/?so=rodada&a=${encodeURIComponent(x.arq)}&movel=1`; } catch (e) { /* sem a lista: vazio */ }
    if (arq !== est.arq || est.scope) return;                 // outro circuito aberto (ou uma rodada nova) no meio
    est.scope = u; if (est.tab === "scope") mostraScope();
  }
  // ── o ▶ e o andamento (o editor conta pelo postMessage) ──
  $("rodar").onclick = () => pedeSimu({ cmd: est.vivo ? "parar" : "rodar" });
  const si = (v) => v >= 1 ? `${+v.toPrecision(3)} s` : v >= 1e-3 ? `${+(v * 1e3).toPrecision(3)} ms` : `${+(v * 1e6).toPrecision(3)} µs`;
  addEventListener("message", (ev) => {
    if (ev.origin !== location.origin || ev.source !== fSimu.contentWindow) return; const m = ev.data || {};
    if (m.maisim !== "simu") return;
    if (m.tipo === "arquivo" && m.arq) { est.arq = m.arq; est.nome = m.nome || ""; topo(); }
    if (m.tipo === "msg" && m.texto) { aviso(m.texto, null, null, m.erro ? 7000 : 3500); $("aviso").classList.toggle("erro", !!m.erro); }   // os erros e o "salvo" do editor (o cabeçalho dele não aparece)
    if (m.tipo === "aba" && m.aba) aba(m.aba);                 // o editor pede outra aba (a IA, pelos botões do Controle)   // Salvar como… (ou outro aberto no editor): o arquivo de agora
    if (m.tipo === "painel") est.painel = m.on;
    if (m.tipo === "janela") est.janela = m.on;
    if (m.tipo === "painel" || m.tipo === "janela") $("paleta").hidden = est.painel || est.janela || est.tab !== "circuito";   // o + não cobre o painel nem a janela   // o painel ou a paleta abertos: o + sai da frente
    if (m.tipo === "scope") {                                   // a rodada ao vivo ou a que terminou agora
      est.scope = m.url + (m.url.includes("?") ? "&" : "?") + "movel=1"; mostraScope(); }
    if (m.tipo === "aberto" && !est.scope) ultimaDoCircuito(m.arq || est.arq);   // aberto: a última rodada DESTE circuito (o editor conta a do servidor, de qualquer um)
    if (m.tipo === "aberto") { est.n = m.elementos; est.camadas = m.camadas || []; if (m.arq) est.arq = m.arq; est.nome = m.nome || ""; if (est.querContas) { est.querContas = false; pedeSimu({ cmd: "contas" }); } topo(); }
    if (m.tipo === "rodada") {
      const vivo = ["preparando", "rodando", "pausada"].includes(m.estado), era = est.vivo; est.vivo = vivo;
      $("prog").hidden = !vivo; $("rodar").classList.toggle("ativo", vivo); $("rodar").setAttribute("aria-label", tr(vivo ? "mv.a_parar" : "mv.a_rodar"));
      $("rodar").innerHTML = vivo ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
      if (vivo && m.tfim) { $("progi").style.width = `${Math.min(100, 100 * m.t / m.tfim)}%`; $("sub").textContent = tr("mv.sub_sim", { a: si(m.t), b: si(m.tfim) }); }
      if (!vivo && era) { $("sub").textContent = m.estado === "fim" ? tr("mv.sub_fim", { n: m.amostras }) : tr("mv.sub_edit", { n: est.n });
        if (m.estado === "fim") {
          aviso(tr("mv.pronta", { n: m.amostras }), tr("mv.ver_scope"), () => aba("scope"), 6000); } }
    }
  });

  // ── o ⋯ do circuito: a ⚙, as variáveis $, as camadas, salvar, desfazer, exportar o .msd ──
  $("mais").onclick = () => gaveta(nomeDe(est.arq), "", el("div", { class: "menu-lista" },
    item('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>', tr("mv.m_sim"), () => { aba("circuito"); pedeSimu({ cmd: "parametros" }); }),
    item('<path d="M7 5h10M7 19h10M12 5v14"/>', tr("mv.m_vars"), () => { aba("circuito"); pedeSimu({ cmd: "globais" }); }),
    item('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', tr("mv.m_camadas"), camadas),
    item('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>', tr("mv.m_ajustar"), () => { aba("circuito"); pedeSimu({ cmd: "ajustar" }); }),
    item('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>', tr("mv.m_salvar"), () => pedeSimu({ cmd: "salvar" })),
    item('<path d="M5 4h11l3 3v13H5z"/><path d="M12 11v6M9 14h6"/>', tr("mv.m_salvar_como"), () => { aba("circuito"); pedeSimu({ cmd: "salvar_como" }); }),
    item('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', tr("mv.m_desfazer"), () => pedeSimu({ cmd: "desfazer" })),
    item('<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>', tr("mv.m_exportar"), exporta)));
  function camadas() {
    const nomes = { "bt-controle": "mv.cam_controle", "bt-rotulos": "mv.cam_rotulos", "bt-medicoes": "mv.cam_medicoes", "bt-corrente": "mv.cam_corrente" };
    const lista = el("div", { class: "cartoes" }, ...est.camadas.map((c) => { const ch = el("button", { class: "chave", type: "button", role: "switch", "aria-checked": String(c.on), "aria-label": tr(nomes[c.id]) });
      ch.onclick = () => { c.on = !c.on; ch.setAttribute("aria-checked", String(c.on)); pedeSimu({ cmd: "camada", id: c.id }); };
      return el("div", { class: "ajuste" }, el("span", { class: "rot" }, tr(nomes[c.id])), ch); }));
    gaveta(tr("mv.m_camadas"), nomeDe(est.arq), lista);
  }
  // exportar: o .msd do circuito com as últimas rodadas dele (o navegador baixa: no Android, vai para os Downloads)
  async function exporta() {
    let pastas = [];
    try { const r = await (await fetch("/maisim/scope/rodadas")).json();
      pastas = r.filter((x) => x.pasta && x.modelo && (x.modelo === est.arq || x.modelo.endsWith("/" + est.arq))).sort((a, b) => b.mtime - a.mtime).slice(0, 3).map((x) => x.arq.split("/").slice(-2, -1)[0]); } catch (e) { /* só o circuito */ }
    location.href = `/maisim/simu/msd/exportar?arq=${encodeURIComponent(est.arq)}&rodadas=${encodeURIComponent(pastas.join(","))}`;
  }

  aplicaTema(); marcaLingua(); maisimI18n.aplica(); carregaModelos(); aba("inicio");
})();
