// o divisor entre o código e a conversa do Claude (instância de teste 5010 → 8768), pedido de Marcelo em 19/10: arrastar
// muda o espaço da conversa (ao lado: largura; embaixo: altura), o divisor fica onde o mouse soltou (também com o zoom de
// 110 % do PEW), o código fica com pelo menos 300 px, fica guardado ao recarregar, duplo clique volta ao padrão
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 2300, height: 1000 } });
    const pg = await ctx.newPage(); const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); if (!sessionStorage.getItem("ja")) { localStorage.setItem("pew-escala", "1.1");
      localStorage.removeItem("pew-simu-cc-w"); localStorage.removeItem("pew-simu-cc-h"); localStorage.setItem("pew-simu-claude-lugar", "lado"); sessionStorage.setItem("ja", "1"); } } catch (e) { /* ok */ } });
    const abre = async () => { await pg.goto("http://localhost:5010/pew/simu/"); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
      await pg.evaluate(() => mostraDoca("controle")); await pg.waitForFunction(() => typeof ctl !== "undefined" && ctl.carregado && ctl.editor, null, { timeout: 30000 });
      if (!(await pg.evaluate(() => $("painel-controle").classList.contains("com-claude")))) await pg.click("#ctl-claude-bt");
      await pg.waitForTimeout(600); };
    await abre();
    const med = () => pg.evaluate(() => { const ed = $("ctl-editor").getBoundingClientRect(), dv = $("cc-divisor").getBoundingClientRect();
      return { cw: Math.round($("ctl-claude").offsetWidth), ch: Math.round($("ctl-claude").offsetHeight), ew: Math.round(ed.width), dx: dv.left + dv.width / 2, dy: dv.top + dv.height / 2,
        zoom: document.documentElement.style.zoom, embaixo: $("painel-controle").classList.contains("cc-embaixo") }; });
    const arrasta = async (de, para) => { await pg.mouse.move(...de); await pg.mouse.down(); for (let k = 1; k <= 10; k++) await pg.mouse.move(de[0] + (para[0] - de[0]) * k / 10, de[1] + (para[1] - de[1]) * k / 10); await pg.mouse.up(); await pg.waitForTimeout(400); };
    // ao lado: a largura da conversa
    let a = await med();
    ok(!a.embaixo, "com a doca larga, a conversa fica ao lado do código");
    await arrasta([a.dx, 400], [a.dx - 100, 400]);
    let d = await med();
    ok(a.zoom === "1.1" && d.cw > a.cw + 80 && d.ew < a.ew - 80 && Math.abs(d.dx - (a.dx - 100)) < 4,
      `ao lado (zoom ${a.zoom}): arrastar 100 px para a esquerda alarga a conversa de ${a.cw} para ${d.cw} px e o código encolhe; o divisor fica onde o mouse soltou (${Math.round(d.dx)} × ${Math.round(a.dx - 100)})`);
    await arrasta([d.dx, 400], [80, 400]);                      // longe demais: o código fica com pelo menos 300 px
    const lim = await pg.evaluate(() => Math.round($("ctl-editor").getBoundingClientRect().width / parseFloat(document.documentElement.style.zoom || 1)));
    ok(lim >= 290, `arrastado até a outra ponta: o código fica com ${lim} px (o mínimo é 300)`);
    await arrasta([(await med()).dx, 400], [d.dx, 400]); d = await med();
    await abre(); const r = await med();
    ok(Math.abs(r.cw - d.cw) <= 2, `recarregado: a conversa continua com ${r.cw} px (guardado)`);
    await pg.dblclick("#cc-divisor"); await pg.waitForTimeout(400);
    ok(Math.abs((await med()).cw - a.cw) <= 2, "duplo clique: volta à largura padrão");
    // embaixo: a altura
    await pg.click("#cc-lugar"); await pg.waitForTimeout(500);
    a = await med();
    await arrasta([a.dx, a.dy], [a.dx, a.dy - 120]);
    d = await med();
    ok(a.embaixo && d.ch > a.ch + 80 && Math.abs(d.dy - (a.dy - 120)) < 4, `embaixo: arrastar 120 px para cima aumenta a conversa de ${a.ch} para ${d.ch} px, o divisor onde o mouse soltou`);
    await pg.click("#cc-lugar"); await pg.evaluate(() => { localStorage.removeItem("pew-simu-cc-w"); localStorage.removeItem("pew-simu-cc-h"); localStorage.removeItem("pew-escala"); });
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
