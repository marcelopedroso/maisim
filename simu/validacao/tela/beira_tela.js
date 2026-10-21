// a beira da folha principal pela tela (instância de teste 7200 → 7201): fontes em x = 1 (o caso do Marcelo, 18/10); arrastar
// uma para a esquerda, além da beira, a deixa onde foi solta — o circuito todo anda para caber (o Gecko não aceita x < 1) e a
// vista anda junto: na tela nada pula; a mensagem explica; Ctrl+Z volta tudo
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async () => { const j = await api("editor/novo", { modo: "descartar" }); ed.novo = "beira"; dados = j; folhaAtual = "0"; seleciona(null); novoEstado(j);
      for (const [n, y] of [["Va", 1], ["Vb", 5], ["Vc", 9]]) novoEstado(await api("editor/cmd", { op: "CREATE", args: [n, 1, y, "U"] }));
      ver = { x: -20 * G, y: -6 * G, w: 60 * G, h: 60 * G * $("svg").clientHeight / $("svg").clientWidth }; aplicaVer(); });   // a vista com espaço à esquerda, como na tela dele
    const tela = (x, y) => pg.evaluate(([gx, gy]) => { const s = $("svg"), m = s.getScreenCTM(), pt = s.createSVGPoint(); pt.x = gx * G; pt.y = gy * G; const q = pt.matrixTransform(m); return [q.x, q.y]; }, [x, y]);
    const el = (n) => pg.evaluate((n) => { const e = dados.folhas["0"].elementos.find((x) => x.nome === n); return [e.x, e.y]; }, n);
    const [a0, b0] = await tela(1, 5), [a1, b1] = await tela(-5, 3);           // Vb: 6 para a esquerda, 2 para cima
    await pg.mouse.move(a0, b0); await pg.mouse.down(); for (let k = 1; k <= 8; k++) await pg.mouse.move(a0 + (a1 - a0) * k / 8, b0 + (b1 - b0) * k / 8);
    await pg.mouse.up(); await pg.waitForTimeout(3000);
    const p = { va: await el("Va"), vb: await el("Vb"), vc: await el("Vc") }, onde = await tela(...p.vb), m = await pg.textContent("#msg");
    ok(p.vb[0] === p.va[0] - 6 && p.vb[1] === p.va[1] + 2 && p.vc[1] - p.va[1] === 8, `Vb solto 6 à esquerda e 2 acima: fica assim em relação às outras (Va ${p.va}, Vb ${p.vb}, Vc ${p.vc})`);
    ok(Math.abs(onde[0] - a1) < 2 && Math.abs(onde[1] - b1) < 2, `na tela, Vb ficou onde o mouse soltou (${onde.map(Math.round)} × ${[a1, b1].map(Math.round)}): nada pulou`);
    ok(/a folha do Gecko começa em \(1, 1\): o circuito andou 6 para a direita/.test(m), `a mensagem explica: "${m}"`);
    await pg.evaluate(() => desfazer()); await pg.waitForTimeout(2500);
    ok(JSON.stringify([await el("Va"), await el("Vb"), await el("Vc")]) === "[[1,1],[1,5],[1,9]]", "Ctrl+Z: as três voltam a x = 1");
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
