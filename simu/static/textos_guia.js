// MaiSim / simu — os textos da página do guia do controle (static/guia.html), em português e inglês (maisim-i18n.js:
// tr("chave"), data-tr* no HTML). O guia em si é o GUIA_CONTROLE.md / GUIA_CONTROLE.en.md, que a rota /guia escolhe pelo idioma.
// Todo texto novo entra aqui com os dois idiomas lado a lado (a trava: simu/validacao/lingua_offline.py).
maisimI18n.add({
  "guia.titulo": { pt: "Guia do Controle", en: "Control Guide" },
  "guia.carregando": { pt: "carregando o guia…", en: "loading the guide…" },
  "guia.erro": { pt: "não consegui carregar o guia ({erro})", en: "could not load the guide ({erro})" },
});
