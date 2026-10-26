// Menu lateral do MaiSim: trilho fixo à esquerda com Início, Simu, Código e Scope.
// Servido pelo maisim-app em /maisim-nav.js e carregado pelas páginas dos módulos (/maisim/scope, /maisim/gecko, …). Aberta fora do
// MaiSim (direto na porta do módulo), a página não acha o arquivo e segue sem o menu. Páginas do React chamam
// window.maisimNav.montar() / desmontar() (só a página inicial usa; os seminários ficam sem o menu).
(() => {
  // as dicas do MaiSim no lugar da caixinha do navegador (maisim-dica.js), nas páginas que ainda não as trouxeram (a inicial, a do Gecko)
  try {
    if (!window.maisimDica && !document.querySelector('script[src$="maisim-dica.js"]')) {
      const d = document.createElement("script"); d.src = "/maisim-dica.js"; d.onerror = () => d.remove(); (document.head || document.documentElement).appendChild(d);
    }
  } catch (e) { /* sem o documento de verdade (a leitura dos dicionários no node): sem as dicas */ }
  if (window.maisimNav || window.top !== window.self) return;     // embutido (tela dividida): sem menu
  const L = 56;
  // os textos do trilho, em português e inglês (o idioma: o botão PT/EN aqui no pé, ao lado do tema; maisim-i18n.js)
  // (o motor lido na hora: a reserva da página pode passar o lugar ao de verdade depois; sem nenhum — a página do Gecko —,
  // o português daqui mesmo)
  const I = () => window.maisimI18n;
  const TXT = {
    "nav.inicio": { pt: "Início", en: "Home" },
    "nav.simu": { pt: "Simu · monte e simule", en: "Simu · build and simulate" },
    "nav.codigo": { pt: "Código · o controle em outra janela", en: "Code · the control in its own window" },
    "nav.scope": { pt: "Scope · rodadas e medição", en: "Scope · runs and measurement" },
    "nav.ia": { pt: "IA do MaiSim: as contas", en: "MaiSim AI: the accounts" },
    "nav.ia_conectadas": { pt: { one: "IA: {nomes} conectado (clique: as contas)", other: "IAs conectadas: {nomes} (clique: as contas)" },
      en: { one: "AI: {nomes} connected (click: the accounts)", other: "AIs connected: {nomes} (click: the accounts)" } },
    "nav.ia_nenhuma": { pt: "IA: nenhuma conectada (clique: conectar)", en: "AI: none connected (click: connect)" },
    "nav.tema_sistema": { pt: "Tema: como o sistema (clique: claro)", en: "Theme: like the system (click: light)" },
    "nav.tema_claro": { pt: "Tema: claro (clique: escuro)", en: "Theme: light (click: dark)" },
    "nav.tema_escuro": { pt: "Tema: escuro (clique: como o sistema)", en: "Theme: dark (click: like the system)" },
    "nav.maior": { pt: "MaiSim maior", en: "MaiSim larger" },
    "nav.menor": { pt: "MaiSim menor", en: "MaiSim smaller" },
    "nav.tamanho_maior": { pt: "Tamanho do MaiSim: {pct}% (clique: maior)", en: "MaiSim size: {pct}% (click: larger)" },
    "nav.tamanho_menor": { pt: "Tamanho do MaiSim: {pct}% (clique: menor)", en: "MaiSim size: {pct}% (click: smaller)" },
    "nav.lingua": { pt: "Idioma: português (clique: English)", en: "Language: English (click: português)" },
    // a versão sob a marca e a atualização automática (simu/atualizacao.py)
    "nav.versao_curta": { pt: "v{versao}", en: "v{versao}" },
    "nav.versao_dica": { pt: "MaiSim {versao} · {tipo}", en: "MaiSim {versao} · {tipo}" },
    "nav.versao_nova": { pt: "MaiSim {versao} · {tipo}\nHá a {nova} (clique)", en: "MaiSim {versao} · {tipo}\n{nova} is available (click)" },
    "nav.tipo_windows": { pt: "Windows (instalado)", en: "Windows (installed)" },
    "nav.tipo_appimage": { pt: "Linux (AppImage)", en: "Linux (AppImage)" },
    "nav.tipo_fonte": { pt: "código-fonte", en: "source code" },
    "atu.titulo": { pt: "MaiSim {versao} disponível", en: "MaiSim {versao} available" },
    "atu.titulo_em_dia": { pt: "Atualizações do MaiSim", en: "MaiSim updates" },
    "atu.de": { pt: "Você está na {versao} ({tipo}).", en: "You have {versao} ({tipo})." },
    "atu.em_dia": { pt: "O MaiSim {versao} é a versão mais recente neste canal.", en: "MaiSim {versao} is the latest version on this channel." },
    "atu.sem_rede": { pt: "Sem conexão com o GitHub: não deu para procurar atualizações agora.", en: "No connection to GitHub: could not look for updates now." },
    "atu.nunca": { pt: "Procurando atualizações…", en: "Looking for updates…" },
    "atu.atualizar": { pt: "Atualizar", en: "Update" },
    "atu.depois": { pt: "Depois", en: "Later" },
    "atu.fechar": { pt: "Fechar", en: "Close" },
    "atu.procurar": { pt: "Procurar agora", en: "Check now" },
    "atu.canal": { pt: "Canal:", en: "Channel:" },
    "atu.canal_estavel": { pt: "estável", en: "stable" },
    "atu.canal_teste": { pt: "teste (com as versões -rc)", en: "testing (with the -rc versions)" },
    "atu.fonte": { pt: "Na versão de programador, atualize pelo git:", en: "In the developer version, update with git:" },
    "atu.aviso": { pt: "O MaiSim fecha para atualizar e abre de novo sozinho (salve antes). O arquivo é conferido pelo SHA-256.",
      en: "MaiSim closes to update and opens again by itself (save first). The file is checked against its SHA-256." },
    "atu.baixando": { pt: "Baixando a {versao}… {pct}", en: "Downloading {versao}… {pct}" },
    "atu.instalando": { pt: "Instalando a {versao}: o MaiSim fecha e abre de novo sozinho.", en: "Installing {versao}: MaiSim closes and opens again by itself." },
    "atu.reiniciando": { pt: "A {versao} está no lugar: o MaiSim fecha e abre de novo sozinho.", en: "{versao} is in place: MaiSim closes and opens again by itself." },
    "atu.erro": { pt: "Não deu para atualizar: {erro}", en: "Could not update: {erro}" },
    "atu.github": { pt: "ver no GitHub", en: "see on GitHub" },
  };
  if (I()) I().add(TXT);
  const tr = (k, p) => { if (I()) return I().tr(k, p);
    let v = TXT[k] ? TXT[k].pt : k; if (typeof v === "object") v = p && p.n === 1 ? v.one : v.other;
    return p ? v.replace(/\{(\w+)\}/g, (m, x) => (x in p ? String(p[x]) : m)) : v; };
  const trocaLingua = () => { const i = I(); return !!(i && i.muda && !i.reserva); };   // o botão só com o motor de verdade
  const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ITENS = [
    { href: "/", chave: "nav.inicio", ativo: (p) => p === "/",
      icone: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>') },
    // a janela do Gecko (/maisim/gecko/, a tela remota dele) saiu do trilho (18/10, Marcelo: "nem precisa mais"): o simu faz tudo
    // pelo Gecko escondido; a página continua no endereço e no cartão da página inicial, para conferir
    { href: "/maisim/simu/", chave: "nav.simu", ativo: (p, q) => (p.startsWith("/maisim/simu") && !/[?&]vista=codigo/.test(q)) || p.startsWith("/maisim/control"),
      icone: svg('<path d="M2.5 8h4.3l1.6-3.6 3 7.2 3-7.2 1.6 3.6h5.5v12.6H2.5z"/><path d="M9.6 13.3l6.2 3.6-6.2 3.6z" fill="currentColor" stroke="none"/>') },   // um circuito (resistor na malha) e o "simular"
    // o código do controle numa janela só dele (para outro monitor): ligado ao circuito aberto no simu; o ▶ fica no simu
    { href: "/maisim/simu/?vista=codigo", chave: "nav.codigo", janela: "maisim-codigo", ativo: (p, q) => p.startsWith("/maisim/simu") && /[?&]vista=codigo/.test(q),
      icone: svg('<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.6 4.5 10.4 19.5"/>') },
    // o scope também numa janela só dele (para outro monitor, ao vivo enquanto o circuito roda)
    { href: "/maisim/scope/", chave: "nav.scope", janela: "maisim-scope", ativo: (p) => p.startsWith("/maisim/scope"),
      icone: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M5 14c2-6 3-6 4 0s2 6 4 0 3-6 4 0 2 4 2 4"/>') },
  ];
  // a marca do MaiSim: o diodo com o brilho de IA (public/marca/)
  const MARCA = '<path d="M1 14H4.2M18.6 14H23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4.2 7L17.2 14L4.2 21Z" fill="#2b2440" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M18.6 7V21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M10.6 0.6C11 3.3 11.7 4 14.4 4.4 11.7 4.8 11 5.5 10.6 8.2 10.2 5.5 9.5 4.8 6.8 4.4 9.5 4 10.2 3.3 10.6 0.6Z" fill="currentColor"/><path d="M15.6 1C15.75 2 16 2.25 17 2.4 16 2.55 15.75 2.8 15.6 3.8 15.45 2.8 15.2 2.55 14.2 2.4 15.2 2.25 15.45 2 15.6 1Z" fill="currentColor"/>';
  // no tema claro (#maisim-nav.claro, Marcelo 24/10): o trilho na cor do cabeçalho, com uma linha fina separando, e o diodo
  // da marca vazado como no ícone; o Gecko fica escuro
  const css = `
  #maisim-nav { position:fixed; left:0; top:0; bottom:0; width:${L}px; z-index:2147483000; background:#15181d;
             border-right:1px solid #2a2f37; display:flex; flex-direction:column; align-items:center; gap:6px; padding:10px 0;
             font-family:system-ui,-apple-system,"Segoe UI",sans-serif; box-sizing:border-box; }
  #maisim-nav .marca { color:#c4b5fd; font-weight:800; font-size:9.5px; letter-spacing:.1em; margin:2px 0 8px; text-decoration:none;
             display:flex; flex-direction:column; align-items:center; gap:2px; }
  #maisim-nav .marca svg { display:block; }
  #maisim-nav .versao { position:relative; margin:-8px 0 6px; padding:1px 4px; border:0; border-radius:5px; background:transparent; color:#8a94a0;
             font:500 9.5px/1.3 system-ui, sans-serif; font-variant-numeric:tabular-nums; cursor:pointer; }
  #maisim-nav .versao:hover { color:#fff; background:#232831; } #maisim-nav .versao[hidden] { display:none; }
  #maisim-nav .versao .ponto { position:absolute; right:-3px; top:-1px; width:6px; height:6px; border-radius:50%; background:#f59e0b; display:none; }
  #maisim-nav .versao.novidade .ponto { display:block; } #maisim-nav .versao.novidade { color:#fbbf24; }
  #maisim-nav.claro .versao { color:#5b6470; } #maisim-nav.claro .versao:hover { color:#1b1f24; background:#eef0f3; } #maisim-nav.claro .versao.novidade { color:#b45309; }
  #maisim-atu { position:fixed; inset:0; z-index:2147483100; background:rgba(15,23,42,.45); display:flex; align-items:center; justify-content:center;
             font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif; }
  #maisim-atu .caixa { width:min(560px, calc(100vw - 32px)); max-height:min(640px, calc(100vh - 32px)); display:flex; flex-direction:column; gap:10px;
             background:#fff; color:#1b1f24; border:1px solid #d9dde3; border-radius:12px; padding:18px 20px; box-shadow:0 18px 50px rgba(0,0,0,.3); box-sizing:border-box; }
  html[data-tema="escuro"] #maisim-atu .caixa { background:#1b1f26; color:#e6e9ee; border-color:#2a2f37; }
  #maisim-atu h2 { margin:0; font-size:17px; } #maisim-atu .sub { margin:0; color:#5b6470; font-size:13px; }
  html[data-tema="escuro"] #maisim-atu .sub { color:#9aa3ae; }
  #maisim-atu .notas { overflow:auto; min-height:0; flex:1 1 auto; border-top:1px solid rgba(127,127,127,.25); border-bottom:1px solid rgba(127,127,127,.25); padding:4px 2px; font-size:13px; }
  #maisim-atu .notas:empty { display:none; } #maisim-atu .notas h1, #maisim-atu .notas h2, #maisim-atu .notas h3 { font-size:14px; margin:10px 0 4px; }
  #maisim-atu .notas ul { padding-left:20px; margin:4px 0; } #maisim-atu .notas code, #maisim-atu code { font:12px ui-monospace,monospace; background:rgba(127,127,127,.15); padding:1px 4px; border-radius:4px; }
  #maisim-atu a { color:#7c3aed; } #maisim-atu .msg { margin:0; font-size:13px; } #maisim-atu .msg.falha { color:#dc2626; } #maisim-atu .msg:empty { display:none; }
  #maisim-atu .pe { display:flex; align-items:center; gap:8px; flex-wrap:wrap; } #maisim-atu .pe .procurar { margin-left:auto; }
  #maisim-atu .pe label { font-size:13px; display:flex; align-items:center; gap:6px; }
  #maisim-atu select { width:auto !important; min-width:0; flex:0 1 auto; font:inherit; font-size:13px; padding:3px 6px; border:1px solid rgba(127,127,127,.4); border-radius:7px; background:transparent; color:inherit; }
  #maisim-atu button { font:inherit; font-size:13px; padding:6px 14px; border-radius:8px; border:1px solid rgba(127,127,127,.4); background:transparent; color:inherit; cursor:pointer; }
  #maisim-atu button.prim { background:#7c3aed; border-color:#7c3aed; color:#fff; } #maisim-atu button:disabled { opacity:.5; cursor:default; }
  #maisim-nav .item { position:relative; width:42px; height:42px; display:flex; align-items:center; justify-content:center;
             color:#aab2bd; border-radius:10px; text-decoration:none; }
  #maisim-nav .item:hover { background:#232831; color:#fff; }
  #maisim-nav .item.ativo { background:#2b2440; color:#fff; }
  #maisim-nav .item.ativo::before { content:""; position:absolute; left:-7px; top:9px; bottom:9px; width:3px; border-radius:2px; background:#8b5cf6; }
  #maisim-nav .item.fora { opacity:.35; cursor:default; }
  #maisim-nav .item::after { content:attr(data-rotulo); position:absolute; left:50px; top:50%; transform:translateY(-50%);
             white-space:nowrap; background:#15181d; color:#fff; font-size:12px; padding:4px 9px; border-radius:6px;
             border:1px solid #2a2f37; opacity:0; pointer-events:none; transition:opacity .12s; }
  #maisim-nav .item:hover::after { opacity:1; }
  body.com-maisim-nav { padding-left:${L}px !important; box-sizing:border-box; }
  #maisim-nav .item.ia { margin-top:auto; }
  #maisim-nav .item.ia .ponto { position:absolute; right:6px; top:6px; width:8px; height:8px; border-radius:50%; background:#22c55e;
             box-shadow:0 0 0 2px #15181d; display:none; } #maisim-nav .item.ia.conectada .ponto { display:block; }
  #maisim-nav .escala { display:flex; flex-direction:column; align-items:center; gap:1px; }
  #maisim-nav .escala .item { height:26px; border:0; background:transparent; cursor:pointer; font:600 17px/1 system-ui, sans-serif; }
  #maisim-nav .escala .item:disabled { opacity:.3; cursor:default; } #maisim-nav .escala .item:disabled:hover { background:transparent; color:#aab2bd; }
  #maisim-nav .escala .pct { color:#8a94a0; font-size:10px; font-variant-numeric:tabular-nums; }
  #maisim-nav .tema { border:0; background:transparent; cursor:pointer; font:inherit; }
  #maisim-nav .lingua[hidden] { display:none; }
  #maisim-nav .lingua { border:0; background:transparent; cursor:pointer; font:600 12px/1 system-ui, sans-serif; letter-spacing:.04em; }
  #maisim-nav.claro { background:#ffffff; border-right-color:#d9dde3; }
  #maisim-nav.claro .marca { color:#6d28d9; }
  #maisim-nav.claro .marca svg path:nth-of-type(2) { fill:none; }
  #maisim-nav.claro .item { color:#5b6470; }
  #maisim-nav.claro .item:hover { background:#eef0f3; color:#1b1f24; }
  #maisim-nav.claro .item.ativo { background:#ede9fe; color:#6d28d9; }
  #maisim-nav.claro .item.ia .ponto { box-shadow:0 0 0 2px #ffffff; }
  #maisim-nav.claro .escala .item:disabled:hover { color:#5b6470; }
  #maisim-nav.claro .escala .pct { color:#5b6470; }`;
  // tema do MaiSim inteiro: sistema (segue o Windows), claro ou escuro. Guardado no navegador (localStorage "maisim-tema", o mesmo
  // para todas as páginas do MaiSim na porta dele); aplicado em <html data-tema="claro|escuro">; as páginas ouvem "maisim-tema"
  const TEMAS = ["sistema", "claro", "escuro"];
  const ICONE_TEMA = {
    sistema: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
    claro: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    escuro: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>') };
  const escolhaTema = () => { try { const t = localStorage.getItem("maisim-tema"); return TEMAS.includes(t) ? t : "sistema"; } catch (e) { return "sistema"; } };
  const midiaEscura = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function aplicaTema() {
    const t = escolhaTema(), escuro = t === "escuro" || (t === "sistema" && !!(midiaEscura && midiaEscura.matches));
    const antes = document.documentElement.dataset.tema;
    document.documentElement.dataset.tema = escuro ? "escuro" : "claro";
    const cor = document.querySelector('meta[name="theme-color"]');   // a barra da janela do app acompanha (cada página diz as
    if (cor && cor.dataset.claro) cor.setAttribute("content", escuro ? cor.dataset.escuro : cor.dataset.claro);   // suas duas cores)
    const nav = document.getElementById("maisim-nav");   // o trilho claro no tema claro (fora a página do Gecko, sempre escura)
    if (nav) nav.classList.toggle("claro", !escuro && comEscala());
    const b = document.querySelector("#maisim-nav .tema");
    if (b) { b.innerHTML = ICONE_TEMA[t]; b.dataset.rotulo = tr(`nav.tema_${t}`); b.setAttribute("aria-label", tr(`nav.tema_${t}`)); }
    if (antes !== document.documentElement.dataset.tema) window.dispatchEvent(new CustomEvent("maisim-tema", { detail: { tema: document.documentElement.dataset.tema, escolha: t } }));
  }
  // tamanho do MaiSim (o nosso "zoom", independente do do navegador): + e − no pé do trilho, de 80 % a 140 %, guardado no
  // navegador (localStorage "maisim-escala") como o tema; zoom do CSS na página inteira (o desenho e o editor acertam o
  // clique: conferido). Fora: /maisim/gecko (a tela remota do Gecko ficaria borrada) e as páginas sem o trilho (seminários,
  // que têm o A−/A+ deles)
  const ESCALAS = [0.8, 0.9, 1, 1.1, 1.25, 1.4];
  const escolhaEscala = () => { try { const v = parseFloat(localStorage.getItem("maisim-escala")); return ESCALAS.includes(v) ? v : 1; } catch (e) { return 1; } };
  const comEscala = () => !location.pathname.startsWith("/maisim/gecko");
  function aplicaEscala() {
    const v = document.getElementById("maisim-nav") && comEscala() ? escolhaEscala() : 1, raiz = document.documentElement;
    const antes = parseFloat(raiz.style.zoom) || 1;
    if (v === 1) raiz.style.removeProperty("zoom"); else raiz.style.zoom = String(v);
    const n = document.querySelector("#maisim-nav .escala");
    if (n) {
      n.querySelector(".pct").textContent = `${Math.round(v * 100)}%`;
      const k = ESCALAS.indexOf(v);
      n.querySelector(".mais").disabled = k === ESCALAS.length - 1; n.querySelector(".menos").disabled = k <= 0;
      n.querySelector(".mais").dataset.rotulo = tr("nav.tamanho_maior", { pct: Math.round(v * 100) });
      n.querySelector(".menos").dataset.rotulo = tr("nav.tamanho_menor", { pct: Math.round(v * 100) });
    }
    if (antes !== v) { window.dispatchEvent(new CustomEvent("maisim-escala", { detail: { escala: v } })); window.dispatchEvent(new Event("resize")); }
  }
  function mudaEscala(passo) {
    const k = Math.max(0, Math.min(ESCALAS.length - 1, ESCALAS.indexOf(escolhaEscala()) + passo));
    try { localStorage.setItem("maisim-escala", String(ESCALAS[k])); } catch (e) { /* só nesta página */ }
    aplicaEscala();
  }
  window.addEventListener("storage", (e) => { if (e.key === "maisim-escala") aplicaEscala(); });   // outra aba do MaiSim mudou o tamanho
  // a IA no pé do trilho (Marcelo, 23/10): a bolinha verde quando alguma IA está conectada; o clique abre a janela das contas
  // (no simu, na hora; nas outras páginas, o simu já com ela aberta: ?contas=1). A situação vem do simu (o Claude leva ~0,5 s:
  // chama o claude) — ao abrir, ao voltar à aba e a cada 2 min, em segundo plano; na hora, quando um login entra ou sai (o
  // simu avisa: maisim-ia-logados). A janela à parte (janela=1) não mostra o trilho: não pergunta
  const ICONE_IA = svg('<path d="M4.5 4.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8.5l-4.5 3.6v-3.6h-2a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/><path d="M6.5 11h2.2M15.6 11h1.9M8.7 8.2l5.6 2.8-5.6 2.8z"/><path d="M15.6 8.2v5.6"/>');
  let ultimaIA = 0, ultimasIAs = null;
  const rotuloIA = (nomes) => (nomes.length ? tr("nav.ia_conectadas", { n: nomes.length, nomes: nomes.join(", ") }) : tr("nav.ia_nenhuma"));   // "IAs conectadas: Claude, DeepSeek"
  const soJanela = () => new URLSearchParams(location.search).get("janela") === "1";
  async function situacaoIA(agora) {
    const a = document.querySelector("#maisim-nav .item.ia");
    if (!a || soJanela() || document.hidden || (!agora && Date.now() - ultimaIA < 20000)) return;
    ultimaIA = Date.now();
    try {
      const [e, ias] = await Promise.all([fetch("/maisim/simu/claude/estado").then((r) => r.json()), fetch("/maisim/simu/claude/ias").then((r) => r.json())]);
      const nomes = [e && e.logado ? "Claude" : null, ...(ias || []).filter((x) => x.estado && x.estado.logado).map((x) => x.nome)].filter(Boolean);
      ultimasIAs = nomes;
      const rot = rotuloIA(nomes);
      a.classList.toggle("conectada", nomes.length > 0); a.dataset.rotulo = rot; a.setAttribute("aria-label", rot);
    } catch (err) { /* sem o simu no ar: fica como estava */ }
  }
  setInterval(situacaoIA, 120000);
  // um login que mudou com esta aba escondida: a consulta fica para quando ela voltar (sem esperar os 20 s entre consultas)
  let loginMudou = false;
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { situacaoIA(loginMudou); loginMudou = false; } });
  window.addEventListener("storage", (e) => { if (e.key === "maisim-ia-logados") { if (document.hidden) loginMudou = true; else situacaoIA(true); } });   // login noutra aba
  if (midiaEscura) midiaEscura.addEventListener("change", aplicaTema);
  window.addEventListener("storage", (e) => { if (e.key === "maisim-tema") aplicaTema(); });   // outra aba do MaiSim trocou o tema
  function montar() {
    if (document.getElementById("maisim-nav")) return;
    if (!document.getElementById("maisim-nav-css")) { const s = document.createElement("style"); s.id = "maisim-nav-css"; s.textContent = css; document.head.appendChild(s); }
    const p = location.pathname, nav = document.createElement("nav");
    nav.id = "maisim-nav";
    nav.innerHTML = `<a class="marca" href="/" title="MaiSim: MaiSim"><svg viewBox="0 0 24 22" width="30" height="27.5" fill="none" aria-hidden="true">${MARCA}</svg>MaiSim</a><button class="versao" type="button" hidden><span class="txt"></span><span class="ponto"></span></button>` + ITENS.map((it) =>
      `<a class="item${it.ativo(p, location.search) ? " ativo" : ""}${it.pronto === false ? " fora" : ""}" href="${it.pronto === false ? "#" : it.href}" data-rotulo="${tr(it.chave)}"
          aria-label="${tr(it.chave)}"${it.janela ? ` data-janela="${it.janela}"` : ""}>${it.icone}</a>`).join("");
    nav.querySelectorAll("a.fora").forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
    // o código e o scope abrem numa janela à parte (a mesma, se já estiver aberta), para ir ao outro monitor; já nela, o clique fica nela
    nav.querySelectorAll("a[data-janela]").forEach((a) => a.addEventListener("click", (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || a.classList.contains("ativo")) return;
      e.preventDefault(); const url = a.href + (a.href.includes("?") ? "&" : "?") + "janela=1";   // janela=1: a janela vem sem o trilho
      const w = window.open(url, a.dataset.janela, "popup,width=1200,height=900"); if (w) w.focus(); else location.href = url; }));
    nav.insertAdjacentHTML("beforeend", `<a class="item ia" href="/maisim/simu/?contas=1" data-rotulo="${tr("nav.ia")}" aria-label="${tr("nav.ia")}">${ICONE_IA}<span class="ponto"></span></a>`
      + (comEscala() ? `<div class="escala"><button class="item mais" type="button" aria-label="${tr("nav.maior")}">+</button>
      <span class="pct"></span><button class="item menos" type="button" aria-label="${tr("nav.menor")}">−</button></div>` : "")
      + `<button class="item lingua" type="button" hidden></button><button class="item tema" type="button"></button>`);
    const bl = nav.querySelector(".lingua");             // PT/EN: mostra o idioma de agora; o clique troca pelo outro, em todas as janelas
    bl.addEventListener("click", () => { if (trocaLingua()) I().muda(I().lingua() === "pt" ? "en" : "pt"); });
    if (comEscala()) { nav.querySelector(".mais").addEventListener("click", () => mudaEscala(1)); nav.querySelector(".menos").addEventListener("click", () => mudaEscala(-1)); }
    nav.querySelector(".item.ia").addEventListener("click", (e) => {   // no simu: a janela das contas na hora
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || typeof window.abreJanelaClaude !== "function") return;
      e.preventDefault(); window.abreJanelaClaude(); });
    nav.querySelector(".versao").addEventListener("click", abreAtualizacao);
    nav.querySelector(".tema").addEventListener("click", () => {
      const prox = TEMAS[(TEMAS.indexOf(escolhaTema()) + 1) % TEMAS.length];
      try { localStorage.setItem("maisim-tema", prox); } catch (e) { /* ok */ }
      aplicaTema();
    });
    document.body.prepend(nav);
    rotulaLingua();
    // a janela à parte (scope, código), aberta pelo trilho: sem o trilho à vista (ele continua montado: o tema e o tamanho
    // do MaiSim valem nela também, e mudam junto com as outras janelas)
    if (soJanela()) nav.style.display = "none";
    aplicaTema(); aplicaEscala();
    if (soJanela()) return;
    situacaoIA(); situacaoVersao();
    document.body.classList.add("com-maisim-nav");
    document.documentElement.style.setProperty("--maisim-nav-w", `${L}px`);
    window.dispatchEvent(new Event("resize"));            // páginas com gráficos se reajustam à largura nova
  }
  function desmontar() {
    const n = document.getElementById("maisim-nav"); if (n) n.remove();
    aplicaEscala();                                       // sem o trilho (seminário), sem o nosso zoom
    document.body.classList.remove("com-maisim-nav");
    document.documentElement.style.removeProperty("--maisim-nav-w");
    window.dispatchEvent(new Event("resize"));
  }
  // o idioma: o botão (o idioma de agora; Marcelo, 24/10: "mostrar a que está e, quando clica, mudar") e os rótulos do trilho, de novo quando muda (aqui ou noutra janela)
  function rotulaLingua() {
    const nav = document.getElementById("maisim-nav"); if (!nav) return;
    const b = nav.querySelector(".lingua");
    if (b) { b.hidden = !trocaLingua(); if (!b.hidden) { b.textContent = I().lingua() === "pt" ? "PT" : "EN"; b.dataset.rotulo = tr("nav.lingua"); b.setAttribute("aria-label", tr("nav.lingua")); } }
    nav.querySelectorAll("a.item[href]").forEach((a) => { const it = ITENS.find((x) => x.href === a.getAttribute("href"));
      if (it) { a.dataset.rotulo = tr(it.chave); a.setAttribute("aria-label", tr(it.chave)); } });
    const ia = nav.querySelector(".item.ia");
    if (ia) { const r = ultimasIAs ? rotuloIA(ultimasIAs) : tr("nav.ia"); ia.dataset.rotulo = r; ia.setAttribute("aria-label", r); }
    rotulaVersao();
    const m = nav.querySelector(".mais"), n = nav.querySelector(".menos");
    if (m) m.setAttribute("aria-label", tr("nav.maior"));
    if (n) n.setAttribute("aria-label", tr("nav.menor"));
    aplicaTema(); aplicaEscala();
  }
  // a versão sob a marca (o VERSION, pelo simu: /atualizacao) e, com uma release nova no canal escolhido, o ponto nela; o
  // clique abre a janela da atualização (as notas da release, Atualizar / Depois, o canal). A situação: ao montar e a cada
  // 10 min (o simu procura no GitHub na partida e a cada 6 h; aqui só pergunta a ele)
  let ATU = null;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const postAtu = (rota, corpo) => fetch(`/maisim/simu/atualizacao/${rota}`, { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" },
    body: JSON.stringify(corpo || {}) }).then((r) => r.json());
  const tipoAtu = (e) => tr(`nav.tipo_${e && ["windows", "appimage", "fonte"].includes(e.tipo) ? e.tipo : "fonte"}`);
  function rotulaVersao() {
    const b = document.querySelector("#maisim-nav .versao"); if (!b || !ATU) return;
    b.hidden = false; b.querySelector(".txt").textContent = tr("nav.versao_curta", { versao: ATU.versao });
    b.classList.toggle("novidade", !!ATU.nova);
    const r = ATU.nova ? tr("nav.versao_nova", { versao: ATU.versao, tipo: tipoAtu(ATU), nova: ATU.nova.versao }) : tr("nav.versao_dica", { versao: ATU.versao, tipo: tipoAtu(ATU) });
    b.title = r; b.setAttribute("aria-label", r);
    if (document.getElementById("maisim-atu")) pintaAtualizacao();
  }
  async function situacaoVersao() {
    try { ATU = await fetch("/maisim/simu/atualizacao", { cache: "no-store" }).then((r) => r.json()); rotulaVersao(); } catch (e) { /* sem o simu: sem a versão */ }
  }
  setInterval(() => { if (!document.hidden && !soJanela()) situacaoVersao(); }, 600000);
  // as notas da release (markdown) pelo marked do simu; o HTML de dentro vai escapado e só ficam os links http(s), numa aba nova
  let marked = null;
  const carregaMarked = () => marked || (marked = new Promise((ok) => { if (window.marked) return ok(window.marked);
    const s = document.createElement("script"); s.src = "/maisim/simu/static/marked.min.js"; s.onload = () => ok(window.marked); s.onerror = () => ok(null); document.head.appendChild(s); }));
  async function notasHTML(md, alvo) {
    const m = await carregaMarked(), seguro = String(md || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    alvo.innerHTML = m ? m.parse(seguro) : `<pre>${esc(md || "")}</pre>`;
    alvo.querySelectorAll("a").forEach((a) => { if (!/^https?:\/\//i.test(a.getAttribute("href") || "")) a.removeAttribute("href"); else { a.target = "_blank"; a.rel = "noopener"; } });
    alvo.querySelectorAll("img,iframe,script,style,object,embed").forEach((x) => x.remove());
  }
  let notasDe = null, acompanha = null;
  function pintaAtualizacao() {
    const j = document.getElementById("maisim-atu"); if (!j || !ATU) return;
    const n = ATU.nova, ap = ATU.aplicando, fonte = ATU.tipo === "fonte";
    j.querySelector("h2").textContent = n ? tr("atu.titulo", { versao: n.versao }) : tr("atu.titulo_em_dia");
    j.querySelector(".sub").textContent = tr("atu.de", { versao: ATU.versao, tipo: tipoAtu(ATU) });
    const notas = j.querySelector(".notas");
    if (!n) { notas.innerHTML = ""; notasDe = null; } else if (notasDe !== n.versao) { notasDe = n.versao; notasHTML(n.notas, notas); }
    let msg = "", erro = false;
    if (ap && ap.fase === "erro") { msg = tr("atu.erro", { erro: ap.erro || "" }); erro = true; }
    else if (ap && ap.fase === "baixando") msg = tr("atu.baixando", { versao: ap.versao, pct: ap.total ? `${Math.min(100, Math.round(100 * ap.feito / ap.total))}%` : "" });
    else if (ap) msg = tr(ap.fase === "instalando" ? "atu.instalando" : "atu.reiniciando", { versao: ap.versao });
    else if (!n) msg = ATU.sem_rede ? tr("atu.sem_rede") : ATU.verificado ? tr("atu.em_dia", { versao: ATU.versao }) : tr("atu.nunca");
    const m = j.querySelector(".msg"); m.textContent = msg; m.classList.toggle("falha", erro);
    const f = j.querySelector(".fonte");
    f.hidden = !(n && fonte); f.innerHTML = n && fonte ? `${esc(tr("atu.fonte"))} <code>git pull</code> (${esc(n.versao)})` : "";
    j.querySelector(".aviso").hidden = !(n && !fonte && !ap);
    const g = j.querySelector(".github"); g.hidden = !(n && n.pagina && /^https?:\/\//.test(n.pagina)); if (!g.hidden) g.href = n.pagina;
    const em = ap && ap.fase !== "erro";
    j.querySelector(".atualizar").hidden = !n || fonte; j.querySelector(".atualizar").disabled = !!em;
    j.querySelector(".depois").textContent = tr(n ? "atu.depois" : "atu.fechar");
    j.querySelector(".procurar").hidden = !!n; j.querySelector(".depois").style.marginLeft = n ? "auto" : ""; j.querySelector("select").value = ATU.canal; j.querySelector("select").disabled = !!em;
  }
  function fechaAtualizacao() { const j = document.getElementById("maisim-atu"); if (j) j.remove(); clearInterval(acompanha); acompanha = null; notasDe = null; }
  // durante o atualizar: a situação a cada segundo; o MaiSim cai e volta (outro processo, a versão nova): a página recarrega
  function acompanhaAtualizacao() {
    if (acompanha) return; const de = ATU && ATU.versao;
    acompanha = setInterval(async () => {
      try { const e = await fetch("/maisim/simu/atualizacao", { cache: "no-store" }).then((r) => r.json());
        if (e.versao !== de) { location.reload(); return; }
        ATU = e; rotulaVersao(); if (!e.aplicando || e.aplicando.fase === "erro") { clearInterval(acompanha); acompanha = null; }
      } catch (err) { /* desligado para atualizar: espera voltar */ }
    }, 1000);
  }
  async function abreAtualizacao() {
    if (document.getElementById("maisim-atu")) return;
    const j = document.createElement("div"); j.id = "maisim-atu";
    j.innerHTML = `<div class="caixa" role="dialog" aria-modal="true" aria-labelledby="maisim-atu-t"><h2 id="maisim-atu-t"></h2><p class="sub"></p>
      <div class="notas"></div><p class="fonte msg" hidden></p><p class="aviso msg" hidden>${esc(tr("atu.aviso"))}</p><p class="msg"></p>
      <div class="pe"><label>${esc(tr("atu.canal"))} <select><option value="estavel">${esc(tr("atu.canal_estavel"))}</option><option value="teste">${esc(tr("atu.canal_teste"))}</option></select></label>
      <a class="github" target="_blank" rel="noopener" hidden>${esc(tr("atu.github"))}</a>
      <button type="button" class="procurar">${esc(tr("atu.procurar"))}</button><button type="button" class="depois"></button><button type="button" class="atualizar prim">${esc(tr("atu.atualizar"))}</button></div></div>`;
    document.body.appendChild(j);
    j.addEventListener("click", (e) => { if (e.target === j) fechaAtualizacao(); });
    j.addEventListener("keydown", (e) => { if (e.key === "Escape") fechaAtualizacao(); });
    j.querySelector(".depois").addEventListener("click", fechaAtualizacao);
    const com = async (p) => { try { const r = await p; if (r && r.versao) ATU = r; if (r && r.erro) { ATU = { ...ATU, aplicando: { fase: "erro", erro: r.erro } }; } } catch (e) { /* fica */ } rotulaVersao(); };
    j.querySelector("select").addEventListener("change", (e) => com(postAtu("canal", { canal: e.target.value })));
    j.querySelector(".procurar").addEventListener("click", async (e) => { e.target.disabled = true; await com(postAtu("verificar")); e.target.disabled = false; });
    j.querySelector(".atualizar").addEventListener("click", async () => { await com(postAtu("aplicar")); if (ATU.aplicando && ATU.aplicando.fase !== "erro") acompanhaAtualizacao(); });
    pintaAtualizacao(); j.querySelector(".depois").focus();
    await situacaoVersao();
    if (ATU && ATU.aplicando && ATU.aplicando.fase !== "erro") acompanhaAtualizacao();
  }
  // (pelos eventos da janela, não pelo aoMudar: valem também quando o motor de verdade chega depois da reserva)
  window.addEventListener("maisim-lingua", rotulaLingua);
  window.addEventListener("maisim-i18n-pronto", rotulaLingua);
  // o sinal de vida (app/pagina.py, /maisim/vivo): a cada 15 s, com a situação da página (à vista, escondida, congelada); ao
  // fechar (ou trocar de página), o aviso pelo sendBeacon. O lançador do "só usar" (--abrir) desliga o MaiSim quando não
  // sobra nenhuma página aberta (Marcelo, 24/10: fechou a janela, fechou o MaiSim; o ícone abre de novo)
  const novaVida = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  let VIVA = novaVida();   // (a página que avisou que fechou não volta com o mesmo id: app/pagina.py ignora um sinal atrasado dela)
  // (a resposta: "vigiada", se há um lançador que desliga o MaiSim quando ela fechar — o aviso de "sem salvar" do simu só então)
  const vivo = (s) => fetch(`/maisim/vivo?id=${VIVA}&s=${s || (document.hidden ? "oculta" : "visivel")}`, { cache: "no-store", keepalive: true })
    .then((r) => r.json()).then((j) => { window.maisimVigiada = !!j.vigiada; }).catch(() => { /* sem a página do MaiSim (a porta do módulo direto): nada */ });
  const fechou = () => { try { navigator.sendBeacon(`/maisim/vivo?id=${VIVA}&fechou=1`); } catch (e) { vivo(); } };
  vivo(); setInterval(vivo, 15000);
  document.addEventListener("visibilitychange", () => vivo());
  document.addEventListener("freeze", () => vivo("congelada"));
  document.addEventListener("resume", () => vivo());
  window.addEventListener("pagehide", fechou);
  window.addEventListener("pageshow", (e) => { if (e.persisted) { VIVA = novaVida(); vivo(); } });   // de volta do cache do navegador (o "voltar")
  // as trocas de página dentro do MaiSim (um link do trilho, da página inicial): não é fechar — o aviso de "sem salvar" do
  // simu (beforeunload) fica só para fechar a janela (o circuito sem salvar está no Gecko: a página seguinte o retoma)
  // (na volta do clique, não na ida: um link que o MaiSim intercepta e abre noutra janela — o Código, o Scope — já chega
  // aqui com o preventDefault e não conta; nem o Ctrl/Shift+clique, que abre outra aba)
  document.addEventListener("click", (e) => { const a = e.target.closest && e.target.closest("a[href]");
    if (a && !e.defaultPrevented && e.button === 0 && !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)
        && a.origin === location.origin && (!a.target || a.target === "_self")) window.maisimNavegando = Date.now(); });
  window.maisimNav = { montar, desmontar, aplicaTema, aplicaEscala, situacaoIA, situacaoVersao, abreAtualizacao };
  const eu = document.currentScript;
  if (!(eu && eu.dataset.manual)) { if (document.body) montar(); else document.addEventListener("DOMContentLoaded", montar); }
})();
