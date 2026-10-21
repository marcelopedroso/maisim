// a saída do "▷ testar" fecha (instância de teste 5010 → 8768), pergunta de Marcelo em 19/10 ("depois de testar, como
// fechar o console?"): o ✕ no canto esconde a saída e devolve o espaço ao código; o ▷ testar abre de novo; o ✕ não cobre
// o texto (a primeira linha continua inteira à vista)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const S = process.argv[2];
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:5010/pew/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async () => { const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j); await recarregaControle(); mostraDoca("controle"); });
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    const med = () => pg.evaluate(() => { const c = $("ctl-saida-caixa"), x = $("ctl-saida-fecha").getBoundingClientRect();
      return { aberta: c.offsetParent !== null, h: Math.round(c.offsetHeight), ed: Math.round($("ctl-editor").offsetHeight), x: [x.left, x.top, x.width, x.height].map(Math.round) }; });
    const antes = await med();
    ok(!antes.aberta, "antes do teste: sem a saída");
    await pg.click("#ctl-testar"); await pg.waitForFunction(() => /^teste/.test($("ctl-saida").textContent), null, { timeout: 30000 });
    const aberta = await med();
    // o ✕ não pode cobrir o texto: a primeira linha termina antes dele (o pre tem margem à direita para o botão)
    const cobre = await pg.evaluate(() => { const pre = $("ctl-saida"), r = document.createRange(), x = $("ctl-saida-fecha").getBoundingClientRect();
      r.selectNodeContents(pre); return [...r.getClientRects()].some((q) => q.top < x.bottom && q.bottom > x.top && q.right > x.left && q.left < x.right); });
    ok(aberta.aberta && aberta.h > 40 && aberta.ed < antes.ed && !cobre, `▷ testar: a saída abre (${aberta.h} px; o código fica com ${aberta.ed} px) e o ✕ não cobre o texto`);
    if (S) await pg.screenshot({ path: S + "/saida_aberta.png", clip: { x: 0, y: 500, width: 1600, height: 450 } });
    await pg.click("#ctl-saida-fecha"); await pg.waitForTimeout(400);
    const fechada = await med();
    ok(!fechada.aberta && Math.abs(fechada.ed - antes.ed) < 3, `✕: a saída fecha e o código volta ao tamanho de antes (${fechada.ed} × ${antes.ed} px)`);
    await pg.click("#ctl-testar"); await pg.waitForFunction(() => $("ctl-saida-caixa").offsetParent !== null && /^teste/.test($("ctl-saida").textContent), null, { timeout: 30000 });
    ok((await med()).aberta, "▷ testar de novo: a saída volta");
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
