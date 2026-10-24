// maisim-i18n: o MaiSim em português e inglês (Marcelo, 24/10/2026: "publicar como open source… pt-br e inglês, e dali pra
// frente tudo ser assim"). Um arquivo só, carregado no <head> de todas as páginas (a página inicial pelo Vite; o simu e o
// scope em static/maisim-i18n.js, servido de app/public pelos servidores deles).
//
// Os textos ficam nos dicionários de cada página (textos_*.js), os dois idiomas lado a lado — difícil esquecer um:
//   maisimI18n.add({ "simu.salvo_em": { pt: "salvo em {arq}", en: "saved to {arq}" },
//                    "scope.n_rodadas": { pt: { one: "{n} rodada", other: "{n} rodadas" }, en: { one: "{n} run", other: "{n} runs" } } });
// tr("simu.salvo_em", { arq }) devolve o texto no idioma escolhido. Chaves que terminam em _html: os parâmetros são escapados
// (o texto é HTML). No HTML: data-tr (texto), data-tr-html (HTML), data-tr-title, data-tr-ph (placeholder), data-tr-aria,
// data-tr-msg (o data-msg dos textos de CSS ::after) — o português fica no próprio HTML, e aplica() troca pelo do dicionário.
//
// O idioma: o escolhido (localStorage maisim-lingua) ou o do navegador (português → pt, o resto → en). Vai também num cookie
// (maisim-lingua), para os servidores responderem no mesmo idioma, e no <html lang>. Trocar (o botão do trilho) vale na hora
// para todas as janelas do MaiSim (o evento storage, como o tema).
(function () {
  "use strict";
  if (window.maisimI18n && !window.maisimI18n.reserva) return;
  const antes = (window.maisimI18n && window.maisimI18n.dicionario && window.maisimI18n.dicionario()) || {};   // o que a reserva já juntou
  const LINGUAS = ["pt", "en"];
  const LOCAL = { pt: "pt-BR", en: "en-US" };
  // a 1ª vez pelo idioma do navegador: ligado só quando tudo estiver traduzido (o último PR); até lá, português
  const DETECTA_NAVEGADOR = false;
  const dic = Object.assign({}, antes);
  const ouvintes = [];
  const pseudo = /[?&]lingua=xx\b/.test(location.search);       // testes: todo texto traduzido aparece como ⟦…⟧
  const valida = (l) => (LINGUAS.includes(l) ? l : null);
  // o escolhido: o localStorage desta porta; senão o cookie (o mesmo em todas as portas do localhost: uma página aberta direto
  // no simu ou no scope segue o idioma das outras janelas, em vez de impor o padrão)
  const doCookie = () => { const m = /(?:^|;\s*)maisim-lingua=(pt|en)\b/.exec(document.cookie || ""); return m ? m[1] : null; };
  const salva = () => { let l = null; try { l = valida(localStorage.getItem("maisim-lingua")); } catch (e) { /* ok */ } return l || doCookie(); };
  const doNavegador = () => (DETECTA_NAVEGADOR ? (/^pt\b/i.test(navigator.language || "") ? "pt" : "en") : "pt");
  let atual = salva() || doNavegador();

  const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function tr(chave, p) {
    const e = dic[chave];
    let v = e ? (e[atual] != null ? e[atual] : e.pt) : null;
    if (v == null) return chave;
    if (typeof v === "object") v = (p && p.n === 1 ? v.one : v.other) || v.other || "";
    if (p) { const html = /_html$/.test(chave);
      v = v.replace(/\{(\w+)\}/g, (m, k) => (k in p ? (html ? escH(p[k]) : String(p[k])) : m)); }
    return pseudo ? `⟦${v}⟧` : v;
  }
  const tem = (chave) => chave in dic;

  // o HTML estático: o dicionário manda (nos dois sentidos: trocar de volta para o português também). Só o texto do elemento
  // muda: os filhos (o ícone de um botão) ficam — troca o 1º pedaço de texto que tem letras
  const ATRS = [["data-tr-title", "title"], ["data-tr-ph", "placeholder"], ["data-tr-aria", "aria-label"], ["data-tr-msg", "data-msg"]];
  function aplica(raiz) {
    const r = raiz || document;
    r.querySelectorAll("[data-tr]").forEach((el) => { const k = el.getAttribute("data-tr"); if (!tem(k)) return;
      if (!el.children.length) { el.textContent = tr(k); return; }
      const n = [...el.childNodes].find((x) => x.nodeType === 3 && /\S/.test(x.nodeValue));
      if (n) n.nodeValue = n.nodeValue.replace(/\S[\s\S]*\S|\S/, tr(k)); else el.appendChild(document.createTextNode(tr(k))); });
    r.querySelectorAll("[data-tr-html]").forEach((el) => { const k = el.getAttribute("data-tr-html"); if (tem(k)) el.innerHTML = tr(k); });
    for (const [a, alvo] of ATRS) r.querySelectorAll(`[${a}]`).forEach((el) => { const k = el.getAttribute(a); if (tem(k)) el.setAttribute(alvo, tr(k)); });
  }

  function poeMarcas() {
    document.documentElement.lang = LOCAL[atual];
    try { document.cookie = `maisim-lingua=${atual}; path=/; SameSite=Lax; max-age=31536000`; } catch (e) { /* ok */ }
  }
  function avisa() {
    poeMarcas(); aplica();
    for (const f of ouvintes) try { f(atual); } catch (e) { console.error(e); }
    window.dispatchEvent(new CustomEvent("maisim-lingua", { detail: atual }));
  }
  function muda(l) {
    l = valida(l); if (!l) return;
    try { localStorage.setItem("maisim-lingua", l); } catch (e) { /* só nesta página */ }
    if (l === atual) return;
    atual = l; avisa();
  }
  // outra janela do MaiSim trocou (o storage chega também ao scope dentro do simu); ao voltar à aba, o cookie é o desta
  window.addEventListener("storage", (e) => { if (e.key !== "maisim-lingua") return; const l = valida(e.newValue) || doNavegador();
    if (l !== atual) { atual = l; avisa(); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poeMarcas(); });

  // datas e números no idioma (no lugar do "pt-BR" fixo)
  const data = (d, o) => new Date(d).toLocaleString(LOCAL[atual], o);
  const hora = (d, o) => new Date(d).toLocaleTimeString(LOCAL[atual], o || { hour: "2-digit", minute: "2-digit" });
  const num = (x, o) => Number(x).toLocaleString(LOCAL[atual], o);

  window.maisimI18n = { add: (d) => Object.assign(dic, d), tr, tem, lingua: () => atual, local: () => LOCAL[atual], LINGUAS,
    muda, aoMudar: (f) => ouvintes.push(f), aplica, data, hora, num, escH, dicionario: () => dic };
  window.tr = tr;
  poeMarcas();
  // em inglês, a página fica escondida até os textos trocarem (sem piscar o português do HTML); no máximo 1,5 s
  let espera = null;
  if (atual !== "pt" && document.readyState === "loading") {
    espera = document.createElement("style"); espera.textContent = "html{visibility:hidden}";
    (document.head || document.documentElement).appendChild(espera);
    setTimeout(() => { if (espera) { espera.remove(); espera = null; } }, 1500);
  }
  const pronto = () => { if (atual !== "pt") aplica(); if (espera) { espera.remove(); espera = null; } };   // em português, o HTML já está
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pronto);
  else pronto();
})();
