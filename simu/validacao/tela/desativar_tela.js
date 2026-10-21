// desativar um componente pela tela (instância de teste 7200 → 7201), pedido de Marcelo em 19/10 ("um check: preparado no
// circuito, mas desabilitado, na cor cinza"): a caixinha "desativado" no painel do componente (ao lado do girar) manda o
// enabled = 0 ao Gecko; o desenho fica cinza, com a dica; desmarcar volta; Ctrl+Z volta; vale para bloco de controle;
// no terminal de subcircuito não aparece
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const S = process.argv[2];
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async () => { const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; seleciona(null); novoEstado(j);
      for (const [n, x, t] of [["R.1", 8, "R"], ["GAIN.1", 18, "GAIN"]]) novoEstado(await api("editor/cmd", { op: "CREATE", args: [n, x, 8, t] })); ajusta(); });
    const escolhe = async (n) => { await pg.evaluate((n) => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === n)), n); await pg.waitForTimeout(300); };
    const est = (n) => pg.evaluate((n) => { const i = dados.folhas["0"].elementos.findIndex((x) => x.nome === n), g = document.querySelector(`#svg .el[data-i="${i}"]`);
      return { ativo: dados.folhas["0"].elementos[i].ativo, cinza: g.classList.contains("desativado"), op: getComputedStyle(g).opacity, dica: (g.querySelector("title") || {}).textContent || "", caixa: $("p-desat") ? $("p-desat").checked : null }; }, n);
    await escolhe("R.1");
    let e = await est("R.1");
    ok(e.ativo && !e.cinza && e.caixa === false, "R.1: a caixinha \"desativado\" no painel, desmarcada");
    await pg.check("#p-desat"); await pg.waitForTimeout(1500);
    e = await est("R.1");
    ok(e.ativo === false && e.cinza && +e.op <= 0.6 && /desativado \(o Gecko simula como se não existisse\)/.test(e.dica) && e.caixa === true,
      `marcada: o R.1 fica cinza (opacidade ${e.op}, selecionado), com a dica "${e.dica}"`);
    if (S) await pg.screenshot({ path: S + "/desativado.png", clip: { x: 300, y: 60, width: 1300, height: 500 } });
    await pg.evaluate(() => desfazer()); await pg.waitForTimeout(1500);
    e = await est("R.1");
    ok(e.ativo && !e.cinza, "Ctrl+Z: o R.1 volta ativo, na cor normal");
    await escolhe("GAIN.1"); await pg.check("#p-desat"); await pg.waitForTimeout(1500);
    e = await est("GAIN.1");
    ok(e.ativo === false && e.cinza, "bloco de controle (GAIN.1): desativa e fica cinza");
    await pg.uncheck("#p-desat"); await pg.waitForTimeout(1500);
    e = await est("GAIN.1");
    ok(e.ativo && !e.cinza, "desmarcar: o GAIN.1 volta");
    const hist = await pg.evaluate(() => historico.map((h) => h.t).filter((t) => /desativado|ativado de novo/.test(t)));
    ok(hist.some((t) => /GAIN\.1 desativado/.test(t)) && hist.some((t) => /GAIN\.1 ativado de novo/.test(t)), `no histórico: ${hist.slice(0, 3).join(" | ")}`);
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
