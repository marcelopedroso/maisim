// maisim-ajuda: a ajuda do MaiSim (o "F1"). Em qualquer página do MaiSim, F1 (ou o ? do trilho) abre ao lado o tópico da tela
// em que a pessoa está — a página inicial, o circuito, o código do controle, o scope, a conversa com o Claude — e F1 ou Esc
// fecha. Os tópicos são os pares app/public/ajuda/<tópico>.pt.md / .en.md (o idioma do trilho), escritos para quem usa o
// MaiSim; a busca procura em todos. A ajuda inteira, com o índice, abre numa janela à parte (ajuda.html, o mesmo script no
// modo página: <body data-ajuda-pagina>).
//
// Carregado pelo maisim-nav.js (que todas as páginas já carregam), junto com os rótulos (textos_ajuda.js). Sem biblioteca: o
// markdown dos tópicos é o simples (títulos, parágrafos, listas, tabelas, código, links), e o leitor daqui basta para ele.
// Links entre tópicos: [texto](#ajuda:simu); os outros links abrem noutra aba (a página de trás fica como estava).
(function () {
  "use strict";
  if (window.maisimAjuda) return;
  const I = () => window.maisimI18n;
  const T = (k, p) => (I() ? I().tr(k, p) : k);
  const TOPICOS = ["comecar", "inicio", "simu", "codigo", "scope", "ia", "atalhos"];
  const lingua = () => (I() && I().lingua() === "en" ? "en" : "pt");
  const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ------------------------------------------------------------------ os tópicos (um fetch por tópico e idioma, guardado)
  const guardados = {};
  function texto(t, l) {
    const k = `${t}.${l || lingua()}`;
    if (!guardados[k]) {
      guardados[k] = fetch(`/ajuda/${k}.md`, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      });
      guardados[k].catch(() => { delete guardados[k]; });   // a falha não fica guardada: a próxima vez tenta de novo
    }
    return guardados[k];
  }

  // ------------------------------------------------------------------ o markdown dos tópicos → HTML
  const semAcento = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const ancora = (s) => semAcento(s.replace(/[`*_]/g, "")).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function linha(s) {
    // o código primeiro (o que está dentro dele não vira negrito nem link), guardado à parte e devolvido no fim
    const cods = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { cods.push(`<code>${escH(c)}</code>`); return `\u0000${cods.length - 1}\u0000`; });
    s = escH(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => {
        const u = url.replace(/&amp;/g, "&");
        if (u.startsWith("#ajuda:")) return `<a href="#" data-topico="${escH(u.slice(7).split("#")[0])}" data-ancora="${escH(u.split("#")[2] || "")}">${txt}</a>`;
        if (/^(javascript|data):/i.test(u)) return txt;
        return `<a href="${escH(u)}" target="_blank" rel="noopener">${txt}</a>`;
      });
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => cods[+i]);
  }
  function celulas(l) { return l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|")); }
  function markdown(src) {
    const L = String(src).replace(/\r\n?/g, "\n").split("\n"), out = [];
    let i = 0, par = [];
    const fechaPar = () => { if (par.length) { out.push(`<p>${linha(par.join(" "))}</p>`); par = []; } };
    while (i < L.length) {
      const l = L[i];
      let m;
      if (/^\s*```/.test(l)) {                         // bloco de código
        fechaPar();
        const cod = [];
        for (i++; i < L.length && !/^\s*```/.test(L[i]); i++) cod.push(L[i]);
        out.push(`<pre><code>${escH(cod.join("\n"))}</code></pre>`); i++; continue;
      }
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {          // título
        fechaPar();
        const n = m[1].length;
        out.push(`<h${n} id="${ancora(m[2])}">${linha(m[2])}</h${n}>`); i++; continue;
      }
      if (/^\s*\|/.test(l)) {                           // tabela (a 2ª linha, a dos ---, separa o cabeçalho)
        fechaPar();
        const ls = [];
        while (i < L.length && /^\s*\|/.test(L[i])) ls.push(L[i++]);
        const sep = ls.length > 1 && /^\s*\|?\s*:?-{2,}/.test(ls[1]);
        const cab = sep ? `<thead><tr>${celulas(ls[0]).map((c) => `<th>${linha(c)}</th>`).join("")}</tr></thead>` : "";
        const corpo = (sep ? ls.slice(2) : ls).map((r) => `<tr>${celulas(r).map((c) => `<td>${linha(c)}</td>`).join("")}</tr>`).join("");
        out.push(`<div class="tabela"><table>${cab}<tbody>${corpo}</tbody></table></div>`); continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) {              // lista (aninhada pelo recuo)
        fechaPar();
        const pilha = [];
        while (i < L.length && (/^\s*([-*]|\d+\.)\s+/.test(L[i]) || (/^\s{2,}\S/.test(L[i]) && pilha.length))) {
          const x = L[i], it = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(x);
          if (!it) {                                    // continuação do item de cima (a linha recuada)
            out.push(" " + linha(x.trim())); i++; continue;
          }
          const rec = it[1].length, tipo = /\d/.test(it[2]) ? "ol" : "ul";
          while (pilha.length && rec < pilha[pilha.length - 1].rec) out.push(`</li></${pilha.pop().tipo}>`);
          const topo = pilha[pilha.length - 1];
          if (!topo || rec > topo.rec) { pilha.push({ rec, tipo }); out.push(`<${tipo}><li>`); }
          else out.push("</li><li>");
          out.push(linha(it[3])); i++;
        }
        while (pilha.length) out.push(`</li></${pilha.pop().tipo}>`);
        continue;
      }
      if (/^>\s?/.test(l)) {                            // citação (uma nota)
        fechaPar();
        const q = [];
        while (i < L.length && /^>\s?/.test(L[i])) q.push(L[i++].replace(/^>\s?/, ""));
        out.push(`<blockquote>${markdown(q.join("\n"))}</blockquote>`); continue;
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(l)) { fechaPar(); out.push("<hr>"); i++; continue; }
      if (!l.trim()) { fechaPar(); i++; continue; }
      par.push(l.trim()); i++;
    }
    fechaPar();
    return out.join("");
  }

  // ------------------------------------------------------------------ a busca: os trechos (## seções) de todos os tópicos
  function trechos(t, src) {
    const out = [];
    let atual = null;
    for (const l of src.split("\n")) {
      const m = /^(#{1,3})\s+(.*)$/.exec(l);
      if (m) { atual = { t, titulo: m[2].replace(/[`*]/g, ""), ancora: ancora(m[2]), corpo: "" }; out.push(atual); }
      else if (atual) atual.corpo += l + "\n";
    }
    return out;
  }
  async function busca(q) {
    const alvo = semAcento(q.trim());
    const todos = await Promise.all(TOPICOS.map((t) => texto(t).then((s) => trechos(t, s), () => [])));
    return todos.flat().filter((x) => semAcento(x.titulo + " " + x.corpo).includes(alvo)).map((x) => {
      const plano = x.corpo.replace(/[`*#>|]/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
      const k = semAcento(plano).indexOf(alvo);
      const ini = Math.max(0, k - 60), trecho = k < 0 ? plano.slice(0, 140) : (ini ? "…" : "") + plano.slice(ini, k + alvo.length + 90) + "…";
      return { ...x, trecho };
    });
  }
  function marca(html, q) {                             // realça o procurado no trecho (fora das tags)
    const alvo = semAcento(q.trim());
    if (!alvo) return html;
    const plano = semAcento(html);
    let out = "", i = 0, k;
    while ((k = plano.indexOf(alvo, i)) >= 0) { out += html.slice(i, k) + `<mark>${html.slice(k, k + alvo.length)}</mark>`; i = k + alvo.length; }
    return out + html.slice(i);
  }

  // ------------------------------------------------------------------ em que tela estamos (o tópico que o F1 abre)
  function topicoDaTela() {
    const p = location.pathname, q = new URLSearchParams(location.search);
    if (p === "/" || p === "/index.html") return "inicio";
    if (p.startsWith("/maisim/scope")) return "scope";
    if (p.startsWith("/maisim/simu")) {
      if (/^\/maisim\/simu\/static\/guia/.test(p) || q.get("vista") === "codigo") {
        const cc = document.querySelector("#painel-controle.com-claude");
        return cc && cc.offsetParent ? "ia" : "codigo";
      }
      const cc = document.querySelector("#painel-controle.com-claude");
      if (cc && cc.offsetParent) return "ia";                                    // a conversa com o Claude à vista
      if (document.querySelector(".modal:not([hidden]) [data-tr^='claude.contas'], #contas:not([hidden])")) return "ia";
      if (document.body.classList.contains("doca-controle")) return "codigo";   // a aba Controle aberta embaixo / ao lado
      return "simu";
    }
    return "comecar";
  }

  // ------------------------------------------------------------------ o visual (o painel e a página)
  const CSS = `
  #maisim-ajuda, .maisim-ajuda-pagina { --a-texto:#1f2328; --a-sutil:#59636e; --a-borda:#d1d9e0; --a-fundo:#ffffff; --a-codigo:#f3f4f7;
    --a-link:#6d28d9; --a-realce:#ede9fe; --a-marca:#fde68a; }
  :root[data-tema="escuro"] #maisim-ajuda, :root[data-tema="escuro"] .maisim-ajuda-pagina { --a-texto:#e6e9ee; --a-sutil:#9aa4af;
    --a-borda:#343b45; --a-fundo:#171b21; --a-codigo:#222831; --a-link:#c4b5fd; --a-realce:#2b2440; --a-marca:#854d0e; }
  #maisim-ajuda { position:fixed; top:0; right:0; bottom:0; width:min(460px, 100vw); z-index:2147483001; display:flex; flex-direction:column;
    background:var(--a-fundo); color:var(--a-texto); border-left:1px solid var(--a-borda); box-shadow:-12px 0 32px rgba(0,0,0,.18);
    font:14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; transform:translateX(105%); transition:transform .16s ease-out;
    visibility:hidden; }
  #maisim-ajuda.aberta { transform:none; visibility:visible; }
  #maisim-ajuda .a-cab { display:flex; align-items:center; gap:8px; padding:10px 12px 8px; border-bottom:1px solid var(--a-borda); }
  #maisim-ajuda .a-cab strong { font-size:15px; white-space:nowrap; }
  #maisim-ajuda .a-cab select { flex:1; min-width:0; font:inherit; padding:4px 6px; border-radius:7px; border:1px solid var(--a-borda);
    background:var(--a-fundo); color:var(--a-texto); }
  #maisim-ajuda .a-bt { flex:none; width:30px; height:30px; display:flex; align-items:center; justify-content:center; border-radius:7px;
    border:0; background:transparent; color:var(--a-sutil); cursor:pointer; text-decoration:none; font-size:18px; }
  #maisim-ajuda .a-bt:hover { background:var(--a-realce); color:var(--a-texto); }
  .maisim-ajuda-busca { margin:8px 12px 0; padding:6px 10px; font:inherit; border-radius:8px; border:1px solid var(--a-borda);
    background:var(--a-fundo); color:var(--a-texto); }
  #maisim-ajuda .a-dica { margin:6px 12px 0; color:var(--a-sutil); font-size:12px; }
  .maisim-ajuda-corpo { flex:1; overflow:auto; padding:4px 18px 40px; }
  .maisim-ajuda-corpo h1 { font-size:20px; margin:14px 0 8px; }
  .maisim-ajuda-corpo h2 { font-size:16px; margin:22px 0 6px; padding-bottom:3px; border-bottom:1px solid var(--a-borda); }
  .maisim-ajuda-corpo h3 { font-size:14.5px; margin:16px 0 4px; }
  .maisim-ajuda-corpo p, .maisim-ajuda-corpo li { margin:6px 0; }
  .maisim-ajuda-corpo ul, .maisim-ajuda-corpo ol { padding-left:22px; margin:6px 0; }
  .maisim-ajuda-corpo a { color:var(--a-link); }
  .maisim-ajuda-corpo code { font:12.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background:var(--a-codigo);
    padding:1px 5px; border-radius:4px; }
  .maisim-ajuda-corpo pre { background:var(--a-codigo); padding:10px 12px; border-radius:7px; overflow-x:auto; line-height:1.45; }
  .maisim-ajuda-corpo pre code { background:none; padding:0; }
  .maisim-ajuda-corpo .tabela { overflow-x:auto; }
  .maisim-ajuda-corpo table { border-collapse:collapse; margin:10px 0; font-size:13px; }
  .maisim-ajuda-corpo th, .maisim-ajuda-corpo td { border:1px solid var(--a-borda); padding:5px 8px; vertical-align:top; text-align:left; }
  .maisim-ajuda-corpo th { background:var(--a-codigo); }
  .maisim-ajuda-corpo blockquote { margin:10px 0; padding:4px 12px; border-left:3px solid var(--a-link); background:var(--a-realce); border-radius:0 6px 6px 0; }
  .maisim-ajuda-corpo .a-msg { color:var(--a-sutil); margin:18px 0; }
  .maisim-ajuda-corpo .a-achado { display:block; padding:8px 10px; margin:6px 0; border:1px solid var(--a-borda); border-radius:8px;
    color:inherit; text-decoration:none; }
  .maisim-ajuda-corpo .a-achado:hover { background:var(--a-realce); }
  .maisim-ajuda-corpo .a-achado small { color:var(--a-sutil); display:block; }
  .maisim-ajuda-corpo mark { background:var(--a-marca); color:inherit; border-radius:2px; }
  .maisim-ajuda-corpo .a-alvo { animation:a-pisca 1.4s ease-out; }
  @keyframes a-pisca { from { background:var(--a-marca); } to { background:transparent; } }
  .maisim-ajuda-pagina { display:grid; grid-template-columns:240px minmax(0, 1fr); min-height:100vh; background:var(--a-fundo); color:var(--a-texto);
    font:15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .maisim-ajuda-pagina nav { border-right:1px solid var(--a-borda); padding:18px 12px; position:sticky; top:0; height:100vh; box-sizing:border-box;
    display:flex; flex-direction:column; gap:4px; }
  .maisim-ajuda-pagina nav strong { font-size:16px; margin:0 6px 10px; }
  .maisim-ajuda-pagina nav .maisim-ajuda-busca { margin:0 0 10px; }
  .maisim-ajuda-pagina nav a { padding:6px 10px; border-radius:7px; color:var(--a-texto); text-decoration:none; }
  .maisim-ajuda-pagina nav a:hover { background:var(--a-codigo); } .maisim-ajuda-pagina nav a.ativo { background:var(--a-realce); color:var(--a-link); font-weight:600; }
  .maisim-ajuda-pagina .maisim-ajuda-corpo { max-width:860px; padding:8px 32px 64px; overflow:visible; }
  @media (max-width:720px) { .maisim-ajuda-pagina { grid-template-columns:1fr; } .maisim-ajuda-pagina nav { position:static; height:auto; } }`;
  function estilo() {
    if (document.getElementById("maisim-ajuda-css")) return;
    const s = document.createElement("style"); s.id = "maisim-ajuda-css"; s.textContent = CSS; document.head.appendChild(s);
  }

  // ------------------------------------------------------------------ mostrar um tópico / os achados num corpo
  let atual = "comecar", consulta = "";
  async function mostra(corpo, t, alvo) {
    atual = TOPICOS.includes(t) ? t : "comecar";
    corpo.innerHTML = `<p class="a-msg">${escH(T("ajuda.carregando"))}</p>`;
    try {
      const src = await texto(atual);
      if (atual !== t && TOPICOS.includes(t)) return;   // trocou de tópico enquanto carregava
      corpo.innerHTML = markdown(src);
      corpo.scrollTop = 0;
      if (alvo) {
        const h = corpo.querySelector(`[id="${CSS && alvo.replace(/"/g, "")}"]`);
        if (h) { h.scrollIntoView({ block: "start" }); h.classList.add("a-alvo"); }
      }
    } catch (e) {
      corpo.innerHTML = `<p class="a-msg">${escH(T("ajuda.erro", { erro: e.message || e }))}</p>`;
    }
  }
  async function mostraBusca(corpo, q, aoEscolher) {
    consulta = q;
    const achados = await busca(q);
    if (consulta !== q) return;                         // a pessoa continuou digitando
    corpo.innerHTML = `<p class="a-msg">${escH(achados.length ? T("ajuda.achados", { n: achados.length, q }) : T("ajuda.nada", { q }))}</p>`
      + achados.map((x) => `<a class="a-achado" href="#" data-topico="${x.t}" data-ancora="${escH(x.ancora)}"><small>${escH(T("ajuda.t_" + x.t))}</small>`
        + `<strong>${marca(escH(x.titulo), q)}</strong><br>${marca(escH(x.trecho), q)}</a>`).join("");
    corpo.querySelectorAll("a[data-topico]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); aoEscolher(a.dataset.topico, a.dataset.ancora); }));
  }
  function ligaLinks(corpo, aoEscolher) {               // os links entre tópicos ([…](#ajuda:scope)) ficam na ajuda
    corpo.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a[data-topico]");
      if (a && !a.classList.contains("a-achado")) { e.preventDefault(); aoEscolher(a.dataset.topico, a.dataset.ancora); }
    });
  }
  const opcoes = (sel) => TOPICOS.map((t) => `<option value="${t}"${t === sel ? " selected" : ""}>${escH(T("ajuda.t_" + t))}</option>`).join("");

  // ------------------------------------------------------------------ o painel ao lado (F1)
  let painel = null;
  function monta() {
    if (painel) return painel;
    estilo();
    painel = document.createElement("aside");
    painel.id = "maisim-ajuda";
    painel.setAttribute("role", "complementary");
    painel.innerHTML = `<div class="a-cab"><strong></strong><select class="a-topico"></select>
      <a class="a-bt a-janela" target="maisim-ajuda" href="/ajuda.html">\u2197</a><button class="a-bt a-fechar" type="button">\u00d7</button></div>
      <input class="maisim-ajuda-busca" type="search"><div class="a-dica"></div><div class="maisim-ajuda-corpo"></div>`;
    document.body.appendChild(painel);
    const corpo = painel.querySelector(".maisim-ajuda-corpo"), sel = painel.querySelector(".a-topico"), bq = painel.querySelector(".maisim-ajuda-busca");
    const escolhe = (t, alvo) => { bq.value = ""; consulta = ""; sel.value = t; atualizaJanela(); mostra(corpo, t, alvo); };
    sel.addEventListener("change", () => escolhe(sel.value));
    painel.querySelector(".a-fechar").addEventListener("click", fecha);
    painel.querySelector(".a-janela").addEventListener("click", (e) => {
      e.preventDefault();
      const w = window.open(painel.querySelector(".a-janela").href, "maisim-ajuda", "popup,width=1100,height=860");
      if (w) w.focus(); else location.href = painel.querySelector(".a-janela").href;
    });
    let espera = 0;
    bq.addEventListener("input", () => {
      clearTimeout(espera);
      espera = setTimeout(() => { if (bq.value.trim().length >= 2) mostraBusca(corpo, bq.value, escolhe); else if (!bq.value.trim()) mostra(corpo, sel.value); }, 160);
    });
    ligaLinks(corpo, escolhe);
    rotula();
    return painel;
  }
  function atualizaJanela() {
    if (painel) painel.querySelector(".a-janela").href = `/ajuda.html?t=${atual}`;
  }
  function rotula() {                                   // os rótulos no idioma de agora
    if (!painel) return;
    painel.setAttribute("aria-label", T("ajuda.titulo"));
    painel.querySelector(".a-cab strong").textContent = T("ajuda.curto");
    painel.querySelector(".a-topico").innerHTML = opcoes(atual);
    painel.querySelector(".a-topico").setAttribute("aria-label", T("ajuda.topicos"));
    const j = painel.querySelector(".a-janela"); j.title = T("ajuda.janela"); j.setAttribute("aria-label", T("ajuda.janela"));
    const f = painel.querySelector(".a-fechar"); f.title = T("ajuda.fechar"); f.setAttribute("aria-label", T("ajuda.fechar"));
    painel.querySelector(".maisim-ajuda-busca").placeholder = T("ajuda.buscar_ph");
    painel.querySelector(".a-dica").textContent = T("ajuda.dica_f1");
  }
  let antesDoPainel = null;
  function abre(t) {
    monta();
    const tp = TOPICOS.includes(t) ? t : topicoDaTela();
    antesDoPainel = document.activeElement;
    painel.classList.add("aberta");
    atual = tp; rotula(); atualizaJanela();
    painel.querySelector(".maisim-ajuda-busca").value = ""; consulta = "";
    mostra(painel.querySelector(".maisim-ajuda-corpo"), tp);
    painel.querySelector(".a-topico").focus({ preventScroll: true });
  }
  function fecha() {
    if (!painel || !painel.classList.contains("aberta")) return;
    painel.classList.remove("aberta");
    if (antesDoPainel && antesDoPainel.focus && document.contains(antesDoPainel)) antesDoPainel.focus({ preventScroll: true });
  }
  const aberta = () => !!(painel && painel.classList.contains("aberta"));
  const alterna = (t) => (aberta() ? fecha() : abre(t));

  // ------------------------------------------------------------------ a página inteira (ajuda.html)
  function pagina(raiz) {
    estilo();
    raiz.classList.add("maisim-ajuda-pagina");
    raiz.innerHTML = `<nav><strong></strong><input class="maisim-ajuda-busca" type="search"><div class="a-lista"></div></nav><main class="maisim-ajuda-corpo"></main>`;
    const corpo = raiz.querySelector(".maisim-ajuda-corpo"), bq = raiz.querySelector(".maisim-ajuda-busca"), lista = raiz.querySelector(".a-lista");
    const q0 = new URLSearchParams(location.search).get("t");
    let t0 = TOPICOS.includes(q0) ? q0 : "comecar";
    const desenha = () => {
      document.title = T("ajuda.titulo");
      raiz.querySelector("nav strong").textContent = T("ajuda.titulo");
      bq.placeholder = T("ajuda.buscar_ph");
      lista.innerHTML = TOPICOS.map((t) => `<a href="?t=${t}" data-topico="${t}" class="${t === atual && !consulta ? "ativo" : ""}">${escH(T("ajuda.t_" + t))}</a>`).join("");
      lista.querySelectorAll("a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); escolhe(a.dataset.topico); }));
    };
    const escolhe = (t, alvo) => {
      bq.value = ""; consulta = ""; atual = t;
      history.replaceState(null, "", `?t=${t}`);
      desenha(); mostra(corpo, t, alvo); window.scrollTo(0, 0);
    };
    let espera = 0;
    bq.addEventListener("input", () => {
      clearTimeout(espera);
      espera = setTimeout(() => { if (bq.value.trim().length >= 2) { mostraBusca(corpo, bq.value, escolhe); lista.querySelectorAll("a").forEach((a) => a.classList.remove("ativo")); }
        else if (!bq.value.trim()) escolhe(atual); }, 160);
    });
    ligaLinks(corpo, escolhe);
    atual = t0; desenha(); mostra(corpo, t0);
    const deNovo = () => { desenha(); if (consulta) mostraBusca(corpo, consulta, escolhe); else mostra(corpo, atual); };
    window.addEventListener("maisim-lingua", deNovo);
    window.addEventListener("maisim-i18n-pronto", deNovo);
    window.addEventListener("keydown", (e) => { if (e.key === "F1") { e.preventDefault(); bq.focus(); } }, true);
  }

  // ------------------------------------------------------------------ as teclas: F1 abre e fecha; Esc fecha (antes da página)
  // (na fase de captura, na janela: chega antes do editor de código, o Monaco, que usaria o F1 para a paleta de comandos dele)
  window.addEventListener("keydown", (e) => {
    if (document.body && document.body.dataset.ajudaPagina != null) return;
    if (e.key === "F1" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault(); e.stopPropagation(); alterna(); return;
    }
    if (e.key === "Escape" && aberta() && !e.defaultPrevented) {
      e.preventDefault(); e.stopPropagation(); fecha();
    }
  }, true);
  // o navegador abriria a ajuda dele no F1 (o Chrome no Windows): o "help" também é cancelado
  window.addEventListener("help", (e) => e.preventDefault(), true);
  const outraLingua = () => { rotula(); if (aberta()) { const bq = painel.querySelector(".maisim-ajuda-busca");
    if (consulta && bq.value) mostraBusca(painel.querySelector(".maisim-ajuda-corpo"), consulta, (t, a) => { bq.value = ""; consulta = ""; mostra(painel.querySelector(".maisim-ajuda-corpo"), t, a); });
    else mostra(painel.querySelector(".maisim-ajuda-corpo"), atual); } };
  window.addEventListener("maisim-lingua", outraLingua);
  window.addEventListener("maisim-i18n-pronto", outraLingua);

  window.maisimAjuda = { abre, fecha, alterna, aberta, topicoDaTela, markdown, pagina, TOPICOS };
  const inicia = () => { const r = document.querySelector("[data-ajuda-raiz]"); if (document.body.dataset.ajudaPagina != null && r) pagina(r); };
  if (document.body) inicia(); else document.addEventListener("DOMContentLoaded", inicia);
})();
