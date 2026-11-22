// O que vários testes de tela fazem para começar, esperando pela condição em vez de um prazo fixo (no Windows o abrir no
// servidor demora mais: a pergunta das mudanças não salvas chegava depois dos 500–800 ms em que o teste a procurava, ficava
// aberta e o teste esperava a edição até estourar o prazo).

// o caminho de um arquivo como o servidor o diz (relativo(): sempre com "/"): o ?modelo= da página só abre um arquivo da lista
// de modelos, comparado como texto; no Windows o path.join e o os.homedir() dão "\"
exports.caminho = (p) => String(p).replace(/\\/g, "/");

// o estado da página, para a linha de FALHA dizer onde parou
const estado = (pg) => pg.evaluate(() => ({
  arq: typeof dados !== "undefined" && dados ? dados.arq : null, editor: !!(typeof dados !== "undefined" && dados && dados.editor),
  ligado: typeof ed !== "undefined" ? ed.ligado : null, novo: typeof ed !== "undefined" ? ed.novo : null,
  modelo: document.getElementById("sel-modelo") ? document.getElementById("sel-modelo").value : null,
  modal: (document.querySelector(".modal") || {}).innerText || "", msg: (document.getElementById("msg") || {}).textContent || "",
  url: location.search })).catch((e) => ({ erro: e.message }));
exports.estado = estado;

// responde às janelas que aparecerem (o botão `ok`: "Descartar" na das mudanças não salvas, "Criar" no nome do novo) até
// `pronto` valer na página com nenhuma janela aberta; senão, o erro diz o que a página mostrava
async function ate(pg, pronto, { ok = ".modal .m-ok", prazo = 90000, arg, oque = "a página", antes } = {}) {
  const fim = Date.now() + prazo;
  while (Date.now() < fim) {
    if (await pg.$(".modal-fundo")) { await pg.click(ok, { timeout: 5000 }).catch(() => {}); await pg.waitForTimeout(300); continue; }
    if (await pg.evaluate(pronto, arg).catch(() => false)) {
      await pg.waitForTimeout(150);                       // uma janela que abre logo depois (a pergunta vem da resposta do servidor)
      if (!(await pg.$(".modal-fundo"))) return;
      continue;
    }
    if (antes) await antes();
    await pg.waitForTimeout(200);
  }
  throw new Error(`${oque} não ficou pronta em ${prazo / 1000} s: ${JSON.stringify(await estado(pg))}`);
}
exports.ate = ate;

// o cadeado aberto e o circuito aberto no editor do servidor (dados.editor: o que o editor/abrir devolve; o circuito só para
// ver não tem). Clica no cadeado uma vez, se a página não o abriu sozinha
exports.entraNaEdicao = async (pg, op = {}) => {
  let clicou = false;
  await ate(pg, () => typeof dados !== "undefined" && dados && dados.editor && ed.ligado, {
    oque: "a edição", ...op,
    antes: async () => { if (!clicou && !(await pg.evaluate(() => typeof ed !== "undefined" && ed.ligado))) { clicou = true; await pg.click("#bt-editar"); } } });
};

// o ?novo=1: a paleta, o nome do novo respondido e o circuito novo aberto no editor
exports.esperaNovo = (pg, op = {}) => ate(pg, () => typeof ed !== "undefined" && ed.catalogo && ed.ligado && document.querySelectorAll("#abas button").length
  && !new URLSearchParams(location.search).has("novo") && /^circuito_\d+$/.test(ed.novo || "") && dados && dados.editor, { oque: "o circuito novo", ...op });
