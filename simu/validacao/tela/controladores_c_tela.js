// vários controladores em C pela tela (instância de teste 7200 → 7201), pedido de Marcelo em 06/11 ("reaproveitar o leitura.c
// em vários DSPs"): na visão C, cada controlador da lista aparece pelo .c com o nome do .py dele, com o cartão dele; o que
// ainda não tem o .c aparece como "falta: criar" e um clique cria do modelo; o Diagrama mostra os .c e a mensagem lida do
// maisim_envia; a visão Python continua com os .py
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const AQ_C = '#include "maisim_controle.h"\nsize_t maisim_tamanho_estado(void) { return 8; }\n' +
  'void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *estado) { (void)p; (void)estado; }\n' +
  'void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado, maisim_real u[MAISIM_N_U]) {\n' +
  '    (void)t; (void)m; (void)p; (void)estado; (void)u;\n    maisim_envia("controle", "i", 1.0);  /* maisim_envia("ninguem", "x", 0) */\n}\n';
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 }, locale: "pt-BR" })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    // dois controladores (aquisicao.py, controle.py); em C, só o controle.c por enquanto
    await pg.evaluate(async () => {
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      const r = await api("editor/controle"), cfg = r.controle;
      cfg.arquivos = { ...cfg.arquivos, "aquisicao.py": 'def passo(t, m, p, e):\n    envia("controle", {"i": 1.0})\n' };
      cfg.controladores = [{ nome: "aquisicao", arquivo: "aquisicao.py", todas: false, medidas: [], atuacoes: [], subcircuitos: [] },
                           { nome: "controle", arquivo: "controle.py", todas: false, medidas: [], atuacoes: [], subcircuitos: [] }];
      cfg.c = { ...cfg.c, usar: true, arquivos: { "controle.c": r.modelo_c } };
      await api("editor/controle", { controle: cfg }); await recarregaControle(); mostraDoca("controle");
    });
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    await pg.click('#ctl-vistas [data-vista="arq"]'); await pg.waitForTimeout(600);
    const arv = () => pg.evaluate(() => ({
      raizes: [...document.querySelectorAll("#ctl-ctls > .ctl-no")].map((x) => x.dataset.abre || `falta:${x.dataset.criaC}`),
      cartoes: [...document.querySelectorAll("#ctl-ctls .ctl-ctl")].map((x) => x.dataset.nome),
      desliga: !!document.querySelector("#ctl-ctls [data-desliga]") }));
    // 1. a visão C: o aquisicao.c que falta (com o cartão: a lista dos controladores vem dos cartões) e o controle.c
    let a = await arv();
    ok(a.raizes.join(",") === "falta:aquisicao.c,controle.c" && a.cartoes.join(",") === "aquisicao,controle" && !a.desliga,
      `visão C: ${a.raizes.join(", ")} · cartões: ${a.cartoes.join(", ")} · sem "virar módulo": ${!a.desliga}`);
    // 2. um clique no que falta: cria o aquisicao.c do modelo, guarda e abre
    await pg.click('#ctl-ctls [data-cria-c="aquisicao.c"]'); await pg.waitForTimeout(1800);
    const srv = await pg.evaluate(async () => Object.keys((await api("editor/controle")).controle.c.arquivos).sort());
    a = await arv();
    ok(srv.join(",") === "aquisicao.c,controle.c" && a.raizes.join(",") === "aquisicao.c,controle.c" && await pg.evaluate(() => ctl.arq) === "aquisicao.c"
      && a.cartoes.join(",") === "aquisicao,controle", `criado: ${srv.join(", ")} · árvore: ${a.raizes.join(", ")} · cartões: ${a.cartoes.join(", ")}`);
    // 3. o Diagrama na visão C: os .c e a mensagem do maisim_envia (o comentário não conta)
    await pg.evaluate((cod) => { poeCodigo(cod, "aquisicao.c"); }, AQ_C); await pg.waitForTimeout(2500);
    await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(1200);
    const dg = await pg.evaluate(() => ({ dsps: [...document.querySelectorAll("#ctl-diag-svg g.dsp")].map((g) => g.dataset.arq).sort(),
      rotulos: [...document.querySelectorAll("#ctl-diag-svg text.rot")].map((x) => x.textContent) }));
    ok(dg.dsps.join(",") === "aquisicao.c,controle.c" && dg.rotulos.includes("i") && !dg.rotulos.some((r) => /x/.test(r)),
      `Diagrama em C: ${dg.dsps.join(", ")} · mensagens: ${dg.rotulos.join(" | ")}`);
    await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(400);
    // 4. a visão Python: os .py de sempre
    await pg.evaluate(() => poeVisao(false)); await pg.waitForTimeout(800);
    a = await arv();
    ok(a.raizes.join(",") === "controle.py,aquisicao.py" || a.raizes.join(",") === "aquisicao.py,controle.py", `visão Python: ${a.raizes.join(", ")}`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message); }
  if (b) await b.close();
  process.exit(falhas ? 1 : 0);
})();
