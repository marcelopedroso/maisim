// MaiSim — dicas (tooltips) no padrão do MaiSim, no lugar da caixinha nativa do navegador, em todas as páginas: um arquivo só
// (app/public), servido pela página inicial em /maisim-dica.js e pelo simu e pelo scope em static/maisim-dica.js (abertos direto
// na porta deles também); o maisim-nav.js o carrega nas páginas que não o pedem (a inicial, a do Gecko).
// Vale para todo elemento com title: ao passar o mouse (ou chegar pelo Tab), o title vai para data-dica (o navegador não mostra a
// dele) e volta ao sair — o código que lê ou troca .title continua funcionando; se o title mudar com o mouse em cima, a dica acompanha.
// Atalhos entre parênteses viram teclas: "pausar (Espaço)" → pausar [Espaço]. No toque (celular, tablet): nada (o title fica).
// E os seletores (select) de todas as páginas no padrão do MaiSim: a caixa fechada (o CSS logo abaixo) e a lista aberta (a lista
// do MaiSim, no fim do arquivo, no lugar da do sistema).
(function () {
  if (window.maisimDica) return;                       // já carregada (pela página e pelo trilho)
  window.maisimDica = true;
  // os seletores (select) de todas as páginas no padrão do MaiSim (o da conversa com a IA, simu): cantos redondos, a seta
  // própria, o acento da página ao passar e no foco. A lista aberta é a do MaiSim (#maisim-lista, no fim), não o
  // appearance: base-select: com ele a largura passa a ser a da opção escolhida (o A e o B do scope: de 360 para 88 px), e
  // fica só no Chrome 135+. Largura, fonte e o resto ficam com cada página; a seta e o espaço dela à direita, com !important
  // (as páginas põem background e padding nos seus selects). Fora: listas (multiple, size) e o editor (Monaco)
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
  select:not([multiple]):not([size]):disabled { cursor:default; }
  #maisim-lista { --ml-fundo:var(--cartao, #fff); --ml-texto:var(--texto, #1b1f24); --ml-borda:var(--borda, #d9dde3); --ml-sutil:var(--sutil, #5b6470);
    --ml-acento:var(--acento, #6d28d9); --ml-passa:var(--suave, color-mix(in srgb, var(--ml-texto) 7%, transparent));
    --ml-marcada:var(--acento-suave, color-mix(in srgb, var(--ml-acento) 12%, transparent));
    position:fixed; z-index:2147483500; box-sizing:border-box; margin:0; padding:4px; overflow-y:auto; overscroll-behavior:contain;
    border:1px solid var(--ml-borda); border-radius:10px; background:var(--ml-fundo); color:var(--ml-texto); color-scheme:inherit;
    box-shadow:0 10px 28px var(--sombra, rgba(15,23,42,.18)); font:400 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; text-align:left;
    animation:ml-abre .1s ease-out; }
  html[data-tema="escuro"] #maisim-lista { --ml-fundo:var(--cartao, #171a21); --ml-texto:var(--texto, #e6e8ec); --ml-borda:var(--borda, #2c323c);
    --ml-sutil:var(--sutil, #9aa3ae); --ml-acento:var(--acento, #8b5cf6); box-shadow:0 10px 28px var(--sombra, rgba(0,0,0,.5)); }
  @keyframes ml-abre { from { opacity:0; transform:translateY(-3px); } to { opacity:1; transform:none; } }
  #maisim-lista .ml-op { display:flex; align-items:center; gap:6px; padding:5px 12px 5px 6px; border-radius:6px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; user-select:none; }
  #maisim-lista .ml-op::before { content:""; flex:0 0 14px; text-align:center; font-weight:700; color:var(--ml-acento); }
  #maisim-lista .ml-op.marcada::before { content:"✓"; }
  #maisim-lista .ml-op.ativa { background:var(--ml-passa); }
  #maisim-lista .ml-op.marcada { color:var(--ml-acento); font-weight:600; background:var(--ml-marcada); }
  #maisim-lista .ml-op.marcada.ativa { background:color-mix(in srgb, var(--ml-acento) 20%, transparent); }
  #maisim-lista .ml-op.desligada { opacity:.45; cursor:default; }
  #maisim-lista .ml-grupo { padding:6px 8px 2px; font-size:11px; font-weight:600; color:var(--ml-sutil); text-transform:uppercase; letter-spacing:.03em; user-select:none; }
  #maisim-lista .ml-op.agrupada { padding-left:12px; }`;
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
  // o iframe (o scope no simu): o title é só para acessibilidade; o <option>: o da lista do sistema (a do MaiSim mostra o dela)
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

  // ------------------------------------------------ a lista aberta dos seletores no padrão do MaiSim (Marcelo, 25/10: "o
  // quadrado azul" do sistema no solver do ⚙). O <select> de verdade fica onde está, com o valor, o selectedIndex e os eventos:
  // o código das páginas e os testes (selectOption, .value) não mudam. Ao abrir (clique ou teclado), a lista sai das opções de
  // agora (as que o código pôs depois também), desenhada aqui; escolher troca o selectedIndex e dispara input e change, como o
  // navegador. Fora: multiple/size, o Monaco, data-nativo, o toque (no celular, a lista do sistema é a melhor) e o desligado
  const lista = document.createElement("div");
  lista.id = "maisim-lista"; lista.setAttribute("role", "listbox");
  let sel = null, ativa = -1, itens = [], vigia = null, busca = "", buscaT = 0, toque = false;
  const serveSel = (el) => el instanceof HTMLSelectElement && !el.multiple && !el.hasAttribute("size") && !el.disabled
    && !el.closest("[data-nativo], .monaco-editor");
  function desenha() {
    lista.textContent = ""; itens = [];
    for (const o of sel.options) {
      if (o.hidden) continue;
      const g = o.parentElement && o.parentElement.tagName === "OPTGROUP" ? o.parentElement : null;
      if (g && (!itens.length || itens[itens.length - 1].g !== g)) {
        const h = document.createElement("div"); h.className = "ml-grupo"; h.textContent = g.label; lista.appendChild(h);
      }
      const d = document.createElement("div");
      d.className = "ml-op" + (o.selected ? " marcada" : "") + (o.disabled || (g && g.disabled) ? " desligada" : "") + (g ? " agrupada" : "");
      d.textContent = o.label || o.text || " "; d.setAttribute("role", "option"); d.setAttribute("aria-selected", o.selected ? "true" : "false");
      if (o.title) d.title = o.title;
      d.id = `ml-op-${itens.length}`; d.dataset.i = o.index; lista.appendChild(d); itens.push({ d, o, g });
    }
    ativa = itens.findIndex((x) => x.o.selected);
  }
  function poe() {                                     // embaixo do seletor (ou em cima, sem espaço), dentro da tela, no zoom do MaiSim
    const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1, m = 6;
    const r = sel.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    lista.style.fontSize = `${Math.max(12, Math.min(14, parseFloat(getComputedStyle(sel).fontSize) || 13))}px`;
    lista.style.minWidth = `${r.width / z}px`; lista.style.maxWidth = `${(W - 2 * m) / z}px`; lista.style.maxHeight = "none";
    lista.style.left = "0px"; lista.style.top = "0px";
    const c = lista.getBoundingClientRect(), baixo = H - r.bottom - m, cima = r.top - m;
    const vaiCima = c.height > baixo && cima > baixo, alt = Math.min(c.height, Math.max(80, vaiCima ? cima : baixo), 360 * z);
    lista.style.maxHeight = `${alt / z}px`;
    const x = Math.max(m, Math.min(r.left, W - c.width - m)), y = vaiCima ? r.top - 3 - alt : r.bottom + 3;
    lista.style.left = `${x / z}px`; lista.style.top = `${Math.max(m, y) / z}px`;
  }
  function marca(i, rola) {
    if (ativa >= 0 && itens[ativa]) itens[ativa].d.classList.remove("ativa");
    ativa = i;
    if (i >= 0 && itens[i]) { itens[i].d.classList.add("ativa"); if (rola) itens[i].d.scrollIntoView({ block: "nearest" }); }
    if (sel) { if (i >= 0 && itens[i]) sel.setAttribute("aria-activedescendant", itens[i].d.id); else sel.removeAttribute("aria-activedescendant"); }   // o leitor de tela anuncia a opção ativa
  }
  function abre(s) {
    fecha(); sel = s; monta(); apaga();
    sel.setAttribute("aria-expanded", "true"); sel.setAttribute("aria-controls", "maisim-lista");
    desenha(); document.body.appendChild(lista); poe(); marca(ativa, true);
    // o código trocou as opções (ou desligou o seletor, ou o tirou da página) com a lista aberta: a lista acompanha
    vigia = new MutationObserver((ms) => { if (ms.every((x) => x.target === sel && /^aria-/.test(x.attributeName || ""))) return;   // os aria-* que a própria lista põe
      if (!sel || !serveSel(sel) || !sel.isConnected) { fecha(); return; } desenha(); poe(); marca(ativa, true); });
    vigia.observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
  }
  function fecha() {
    if (vigia) { vigia.disconnect(); vigia = null; }
    if (sel) for (const a of ["aria-expanded", "aria-controls", "aria-activedescendant"]) sel.removeAttribute(a);
    lista.remove(); sel = null; itens = []; ativa = -1;
  }
  function escolhe(i) {
    const s = sel, x = itens[i];
    if (!s || !x || x.d.classList.contains("desligada")) return;
    fecha();
    if (s.selectedIndex !== x.o.index) {
      s.selectedIndex = x.o.index;
      s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true }));
    }
    s.focus({ preventScroll: true });
  }
  const anda = (de, passo) => {                        // a próxima opção que se escolhe (pula as desligadas)
    for (let i = de + passo; i >= 0 && i < itens.length; i += passo) if (!itens[i].d.classList.contains("desligada")) return i;
    return de;
  };
  const sem = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function procura(k) {                                // digitar com a lista aberta: a opção que começa com o digitado
    busca = Date.now() - buscaT > 700 ? k : busca + k; buscaT = Date.now();
    const b = sem(busca), n = itens.length, ini = busca.length === 1 ? ativa + 1 : Math.max(ativa, 0);
    for (let j = 0; j < n; j++) {
      const i = (ini + j) % n;
      if (!itens[i].d.classList.contains("desligada") && sem(itens[i].d.textContent).startsWith(b)) { marca(i, true); return; }
    }
  }
  addEventListener("pointerdown", (ev) => { toque = ev.pointerType === "touch"; }, true);
  addEventListener("mousedown", (ev) => {
    if (sel && lista.contains(ev.target)) { ev.preventDefault(); return; }        // o foco fica no seletor
    const s = ev.target instanceof Element ? ev.target.closest("select") : null;
    if (sel && s === sel) { ev.preventDefault(); fecha(); return; }               // o clique no seletor aberto fecha a lista
    if (sel) fecha();                                                            // fora: fecha
    if (ev.button !== 0 || toque || !serveSel(s)) return;
    ev.preventDefault();                                                         // sem a lista do sistema
    s.focus({ preventScroll: true }); abre(s);
  }, true);
  lista.addEventListener("click", (ev) => { const d = ev.target.closest(".ml-op"); if (d) escolhe(itens.findIndex((x) => x.d === d)); });
  lista.addEventListener("mousemove", (ev) => { const d = ev.target.closest(".ml-op"); const i = d ? itens.findIndex((x) => x.d === d) : -1; if (i !== ativa && i >= 0) marca(i, false); });
  addEventListener("keydown", (ev) => {
    if (!sel) {                                // fechado: as teclas que abririam a do sistema (o Enter não: é o OK dos diálogos)
      const s = ev.target;
      if (!serveSel(s) || ev.ctrlKey || ev.metaKey) return;
      const k = ev.key;
      if (k === " " || k === "F4" || ((k === "ArrowDown" || k === "ArrowUp") && (ev.altKey || /Mac/.test(navigator.platform)))) {
        ev.preventDefault(); ev.stopImmediatePropagation(); abre(s);
      }
      return;
    }
    const k = ev.key, pag = Math.max(1, Math.floor(lista.clientHeight / 28));
    let feito = true;
    if (k === "ArrowDown") marca(anda(ativa, 1), true);
    else if (k === "ArrowUp") { if (ev.altKey) escolhe(ativa); else marca(anda(ativa, -1), true); }
    else if (k === "Home") marca(anda(-1, 1), true);
    else if (k === "End") marca(anda(itens.length, -1), true);
    else if (k === "PageDown") marca(anda(Math.min(itens.length - 1, ativa + pag - 1), 1), true);
    else if (k === "PageUp") marca(anda(Math.max(0, ativa - pag + 1), -1), true);
    else if (k === "Enter" || (k === " " && !busca) || (k === " " && Date.now() - buscaT > 700)) escolhe(ativa);
    else if (k === "Escape") { const s = sel; fecha(); s.focus({ preventScroll: true }); }
    else if (k === "Tab") { fecha(); feito = false; }
    else if (k.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) procura(k);
    else feito = false;
    if (feito) { ev.preventDefault(); ev.stopImmediatePropagation(); }             // o Esc não fecha o diálogo de baixo
  }, true);
  addEventListener("focusout", (ev) => { if (sel && ev.target === sel) setTimeout(() => { if (sel && document.activeElement !== sel) fecha(); }, 0); }, true);
  addEventListener("scroll", (ev) => { if (sel && !(ev.target instanceof Node && lista.contains(ev.target))) fecha(); }, true);
  addEventListener("resize", () => { if (sel) fecha(); }); addEventListener("blur", () => { if (sel) fecha(); });
})();
