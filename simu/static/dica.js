// MaiSim / simu — dicas (tooltips) no padrão do MaiSim, no lugar da caixinha nativa do navegador.
// Vale para todo elemento com title: ao passar o mouse, o title vai para data-dica (o navegador não mostra a dele) e volta ao
// sair — o código que lê ou troca .title continua funcionando; se o title mudar com o mouse em cima, a dica acompanha.
// Atalhos entre parênteses viram teclas: "pausar (Espaço)" → pausar [Espaço].
(function () {
  const caixa = document.createElement("div");
  caixa.id = "dica-ui"; caixa.setAttribute("role", "tooltip");
  document.body.appendChild(caixa);
  const TECLA = /\((Ctrl\+[^()\s]+|Shift\+[^()\s]+|Alt\+[^()\s]+|Espaço|Space|Esc|Enter|Delete|Del|[A-Z0-9])\)/g;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let alvo = null, timer = null, obs = null;

  function texto() { return alvo ? alvo.dataset.dica || "" : ""; }
  function posiciona() {
    if (!alvo || !alvo.isConnected) { esconde(); return; }
    // mede com a caixa encostada à esquerda: no lugar da dica anterior (perto da borda direita) a largura encolheria até
    // caber no que sobra da tela (uma palavra por linha)
    caixa.style.left = "0px"; caixa.style.top = "0px";
    const r = alvo.getBoundingClientRect(), c = caixa.getBoundingClientRect(), m = 8;
    let x = r.left + r.width / 2 - c.width / 2, y = r.bottom + m;
    if (alvo.closest("#maisim-nav")) { x = r.right + m; y = r.top + r.height / 2 - c.height / 2; }   // no trilho do MaiSim: ao lado, como as dele
    // sem espaço embaixo, ou no quarto de baixo da tela (a caixa de pedido da conversa): em cima. Só a conta do espaço não
    // bastava: com a janela do navegador passando por baixo da barra do Windows, a dica ia para baixo e ficava escondida
    // (Marcelo, 21/10: a dica do seletor de IA)
    else if (y + c.height > innerHeight - m || r.bottom > innerHeight * 0.75 || alvo.closest(".cc-entrada")) y = r.top - m - c.height;
    x = Math.max(m, Math.min(x, innerWidth - c.width - m));
    caixa.style.left = `${Math.round(x)}px`; caixa.style.top = `${Math.round(Math.max(m, y))}px`;
  }
  function mostra() {
    const t = texto(); if (!t) return;
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
    }
    alvo = null;
  }
  function pega(el) {
    alvo = el; el.dataset.dica = el.getAttribute("title"); el.removeAttribute("title");
    obs = new MutationObserver(() => {                   // o código trocou o title com o mouse em cima: a dica acompanha
      const t = alvo && alvo.getAttribute("title");
      if (t === null || t === undefined) return;
      alvo.dataset.dica = t; alvo.removeAttribute("title");
      if (caixa.classList.contains("vis")) { if (t) mostra(); else caixa.classList.remove("vis"); }
    });
    obs.observe(el, { attributes: true, attributeFilter: ["title"] });
    timer = setTimeout(mostra, 350);
  }
  addEventListener("pointerover", (ev) => {
    const el = ev.target instanceof Element ? ev.target.closest("[title], [data-dica]") : null;
    if (el === alvo) return;
    esconde();
    if (el && el.getAttribute("title") && el.tagName !== "IFRAME") pega(el);   // o iframe do scope: o title é só para acessibilidade
  }, true);
  addEventListener("pointerout", (ev) => { if (alvo && !(ev.relatedTarget instanceof Node && alvo.contains(ev.relatedTarget))) esconde(); }, true);
  // clicar, teclar ou rolar some com a dica. Num seletor (select), o title só volta quando o mouse sai: devolvê-lo com a
  // lista aberta fazia o navegador mostrar a caixinha dele por cima (Marcelo, 21/10: o seletor de IA da conversa)
  function apaga() { clearTimeout(timer); timer = null; caixa.classList.remove("vis"); }
  const some = () => (alvo && alvo.tagName === "SELECT" ? apaga() : esconde());
  for (const t of ["pointerdown", "keydown", "wheel"]) addEventListener(t, some, true);
  addEventListener("scroll", esconde, true); addEventListener("blur", esconde); addEventListener("resize", esconde);
})();
