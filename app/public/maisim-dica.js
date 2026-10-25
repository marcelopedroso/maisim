// MaiSim — dicas (tooltips) no padrão do MaiSim, no lugar da caixinha nativa do navegador, em todas as páginas: um arquivo só
// (app/public), servido pela página inicial em /maisim-dica.js e pelo simu e pelo scope em static/maisim-dica.js (abertos direto
// na porta deles também); o maisim-nav.js o carrega nas páginas que não o pedem (a inicial, a do Gecko).
// Vale para todo elemento com title: ao passar o mouse (ou chegar pelo Tab), o title vai para data-dica (o navegador não mostra a
// dele) e volta ao sair — o código que lê ou troca .title continua funcionando; se o title mudar com o mouse em cima, a dica acompanha.
// Atalhos entre parênteses viram teclas: "pausar (Espaço)" → pausar [Espaço]. No toque (celular, tablet): nada (o title fica).
// E os seletores (select) de todas as páginas no padrão do MaiSim (o CSS logo abaixo).
(function () {
  if (window.maisimDica) return;                       // já carregada (pela página e pelo trilho)
  window.maisimDica = true;
  // os seletores (select) de todas as páginas no padrão do MaiSim (o da conversa com a IA, simu): cantos redondos, a seta
  // própria, o acento da página ao passar e no foco. A lista aberta fica a do sistema: com o appearance: base-select (o da
  // conversa) a largura passa a ser a da opção escolhida, e os seletores mudariam de tamanho (o A e o B do scope: de 360 para 88
  // px). Largura, fonte e o resto ficam com cada página; a seta e o espaço dela à direita, com !important (as páginas põem
  // background e padding nos seus selects). Fora: listas (multiple, size) e o editor (Monaco)
  const CSS = `
  #dica-ui { position:fixed; z-index:2147483600; max-width:320px; max-height:60vh; overflow:hidden; padding:6px 9px; border-radius:7px; background:#1e293b; color:#f8fafc;
    font:500 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; box-shadow:0 8px 24px rgba(15,23,42,.28); pointer-events:none; box-sizing:border-box;
    white-space:pre-line; overflow-wrap:break-word; text-align:left; opacity:0; transform:translateY(-2px); transition:opacity .12s, transform .12s; left:-9999px; top:0; }
  html[data-tema="escuro"] #dica-ui { border:1px solid #334155; box-shadow:0 8px 24px rgba(0,0,0,.5); }
  #dica-ui.vis { opacity:1; transform:none; }
  #dica-ui kbd { display:inline-block; margin:0 1px; padding:0 5px; border-radius:4px; background:rgba(248,250,252,.14); border:1px solid rgba(248,250,252,.22);
    font:600 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color:#f8fafc; }
  select:not([multiple]):not([size]):not(.monaco-editor select) { appearance:none !important; -webkit-appearance:none !important; border-radius:7px; cursor:pointer;
    text-overflow:ellipsis; padding-right:22px !important; transition:border-color .12s, box-shadow .12s, background-color .12s;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%238a939d' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") !important;
    background-repeat:no-repeat !important; background-position:right 6px center !important; background-size:11px !important; }
  select:not([multiple]):not([size]):not(.monaco-editor select):not(:disabled):hover { border-color:var(--acento-borda, color-mix(in srgb, var(--acento, #6d28d9) 35%, transparent)) !important;
    background-color:var(--acento-suave, color-mix(in srgb, var(--acento, #6d28d9) 9%, var(--campo, var(--cartao, #fff)))) !important; }
  select:not([multiple]):not([size]):not(.monaco-editor select):focus-visible { outline:none; border-color:var(--acento, #6d28d9) !important;
    box-shadow:0 0 0 3px var(--acento-suave, color-mix(in srgb, var(--acento, #6d28d9) 18%, transparent)); }
  select:not([multiple]):not([size]):disabled { cursor:default; }`;
  const caixa = document.createElement("div");
  caixa.id = "dica-ui"; caixa.setAttribute("role", "tooltip");
  function monta() {
    if (!document.getElementById("maisim-dica-css")) {
      const s = document.createElement("style"); s.id = "maisim-dica-css"; s.textContent = CSS; (document.head || document.documentElement).appendChild(s);
    }
    if (!caixa.isConnected) document.body.appendChild(caixa);
  }
  if (document.body) monta(); else document.addEventListener("DOMContentLoaded", monta);
  const TECLA = /\((Ctrl\+[^()\s]+|Shift\+[^()\s]+|Alt\+[^()\s]+|Espaço|Space|Esc|Enter|Delete|Del|[A-Z0-9])\)/g;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let alvo = null, timer = null, obs = null, descrita = false;

  function texto() { return alvo ? alvo.dataset.dica || "" : ""; }
  function posiciona() {
    if (!alvo || !alvo.isConnected) { esconde(); return; }
    // o tamanho do MaiSim (zoom do CSS no <html>, maisim-nav.js): as medidas vêm na tela, o left/top da caixa vale × zoom
    const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const W = innerWidth, H = innerHeight;
    // mede com a caixa encostada à esquerda: no lugar da dica anterior (perto da borda direita) a largura encolheria até
    // caber no que sobra da tela (uma palavra por linha)
    caixa.style.left = "0px"; caixa.style.top = "0px";
    const r = alvo.getBoundingClientRect(), c = caixa.getBoundingClientRect(), m = 8;
    let x = r.left + r.width / 2 - c.width / 2, y = r.bottom + m;
    if (alvo.closest("#maisim-nav")) { x = r.right + m; y = r.top + r.height / 2 - c.height / 2; }   // no trilho do MaiSim: ao lado, como as dele
    // sem espaço embaixo, ou no quarto de baixo da tela (a caixa de pedido da conversa): em cima. Só a conta do espaço não
    // bastava: com a janela do navegador passando por baixo da barra do Windows, a dica ia para baixo e ficava escondida
    // (Marcelo, 21/10: a dica do seletor de IA)
    else if (y + c.height > H - m || r.bottom > H * 0.75 || alvo.closest(".cc-entrada")) y = r.top - m - c.height;
    x = Math.max(m, Math.min(x, W - c.width - m));
    caixa.style.left = `${Math.round(x / z)}px`; caixa.style.top = `${Math.round(Math.max(m, y) / z)}px`;
  }
  function mostra() {
    const t = texto(); if (!t) return;
    monta();
    caixa.innerHTML = esc(t).replace(TECLA, (_, k) => `<kbd>${k}</kbd>`);
    caixa.classList.add("vis"); posiciona();
  }
  function esconde() {
    clearTimeout(timer); timer = null;
    caixa.classList.remove("vis");
    if (obs) { obs.disconnect(); obs = null; }
    if (alvo) {                                          // devolve o title (se ninguém pôs outro enquanto isso)
      if (!alvo.hasAttribute("title") && alvo.dataset.dica !== undefined) alvo.setAttribute("title", alvo.dataset.dica);
      delete alvo.dataset.dica;
      if (descrita) alvo.removeAttribute("aria-describedby");
    }
    alvo = null; descrita = false;
  }
  function pega(el) {
    alvo = el; el.dataset.dica = el.getAttribute("title"); el.removeAttribute("title");
    // o leitor de tela: sem o title, a descrição passa a ser a dica (só se o elemento não tinha outra)
    descrita = !el.hasAttribute("aria-describedby"); if (descrita) el.setAttribute("aria-describedby", "dica-ui");
    obs = new MutationObserver(() => {                   // o código trocou o title com o mouse em cima: a dica acompanha
      const t = alvo && alvo.getAttribute("title");
      if (t === null || t === undefined) return;
      alvo.dataset.dica = t; alvo.removeAttribute("title");
      if (caixa.classList.contains("vis")) { if (t) mostra(); else caixa.classList.remove("vis"); }
    });
    obs.observe(el, { attributes: true, attributeFilter: ["title"] });
    timer = setTimeout(mostra, 350);
  }
  // o iframe (o scope no simu): o title é só para acessibilidade; o <option>: a lista aberta é do sistema
  const serve = (el) => el && el.getAttribute("title") && el.tagName !== "IFRAME" && el.tagName !== "OPTION";
  addEventListener("pointerover", (ev) => {
    if (ev.pointerType === "touch") return;
    const el = ev.target instanceof Element ? ev.target.closest("[title], [data-dica]") : null;
    if (el === alvo) return;
    esconde();
    if (serve(el)) pega(el);
  }, true);
  addEventListener("pointerout", (ev) => { if (alvo && !(ev.relatedTarget instanceof Node && alvo.contains(ev.relatedTarget))) esconde(); }, true);
  // pelo teclado (Tab): a dica do elemento que recebeu o foco; o foco pelo clique ou pelo código não mostra nada
  let tab = 0;
  addEventListener("focusin", (ev) => {
    if (Date.now() - tab > 600) return;
    const el = ev.target instanceof Element ? ev.target : null;
    if (!el || el === alvo) return;
    esconde();
    if (serve(el)) pega(el);
  }, true);
  addEventListener("focusout", (ev) => { if (alvo && ev.target === alvo) esconde(); }, true);
  // clicar, teclar ou rolar some com a dica. Num seletor (select), o title só volta quando o mouse sai: devolvê-lo com a
  // lista aberta fazia o navegador mostrar a caixinha dele por cima (Marcelo, 21/10: o seletor de IA da conversa)
  function apaga() { clearTimeout(timer); timer = null; caixa.classList.remove("vis"); }
  const some = () => (alvo && alvo.tagName === "SELECT" ? apaga() : esconde());
  addEventListener("keydown", (ev) => { if (ev.key === "Tab") tab = Date.now(); some(); }, true);
  for (const t of ["pointerdown", "wheel"]) addEventListener(t, some, true);
  addEventListener("scroll", esconde, true); addEventListener("blur", esconde); addEventListener("resize", esconde);
})();
