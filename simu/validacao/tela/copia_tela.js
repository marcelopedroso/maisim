// copiar, recortar e colar pela tela (instância de teste 7200 → 7201): Ctrl+C e Ctrl+V com o mouse no desenho (cola onde
// está o mouse, com os parâmetros e sem os rótulos de nó do original), Ctrl+X e colar (o mesmo nome), Ctrl+Z desfaz o
// recorte; um subcircuito com o que tem dentro; um GATE colado noutra folha perde o acoplamento (na mesma, fica); um
// terminal colado dentro do SM vai para a borda; Ctrl+C sem nada selecionado não é do MaiSim.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {   // abre editando; se o
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }                    // servidor perguntar, descarta
    const api = (rota, corpo) => pg.evaluate(([r, c]) => api(r, c), [rota, corpo]);
    const cmd = (op, ...args) => pg.evaluate(async ([op, args]) => { novoEstado(await api("editor/cmd", { op, args })); }, [op, args]);
    await pg.evaluate(async () => { const j = await api("editor/novo", { modo: "descartar" }); ed.novo = "copia"; dados = j; folhaAtual = "0"; seleciona(null); novoEstado(j); });
    await cmd("CREATE", "R.1", 10, 10, "R"); await cmd("SETP", "R.1", "R", 47); await cmd("INNODE", "R.1", 0, "a"); await cmd("OUTNODE", "R.1", 0, "b");
    await pg.evaluate(() => ajusta());                                   // a vista como na tela (ajustar mantém a proporção)
    const tela = (x, y) => pg.evaluate(([gx, gy]) => { const s = $("svg"), m = s.getScreenCTM(), pt = s.createSVGPoint(); pt.x = gx * G; pt.y = gy * G; const q = pt.matrixTransform(m); return [q.x, q.y]; }, [x, y]);
    const el = (n, folha) => pg.evaluate(([n, f]) => { const e = dados.folhas[f || folhaAtual].elementos.find((x) => x.nome === n); return e && { x: e.x, y: e.y, par: e.par, ent: e.entradas, sai: e.saidas, mede: e.mede, uid: e.uid }; }, [n, folha]);
    const mouse = async (x, y) => { const [a, c] = await tela(x, y); await pg.mouse.move(a, c); };
    const nomes = () => pg.evaluate(() => dados.folhas[folhaAtual].elementos.map((e) => e.nome).sort());
    // copiar e colar onde está o mouse
    await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "R.1")));
    await mouse(20, 10); await pg.keyboard.press("Control+c"); await pg.waitForTimeout(800);
    ok(/copiado R\.1/.test(await pg.textContent("#msg")), `Ctrl+C: "${await pg.textContent("#msg")}"`);
    await pg.keyboard.press("Control+v"); await pg.waitForTimeout(2000);
    const r2 = await el("R.2");
    ok(r2 && r2.x === 20 && r2.y === 10 && r2.par.resistance === 47 && !(r2.ent[0] || r2.sai[0]) && (await el("R.1")).ent[0] === "a",
      `Ctrl+V: R.2 onde está o mouse (${r2 && [r2.x, r2.y]}), com R = ${r2 && r2.par.resistance} Ω e sem os rótulos a/b do R.1 (que continua com eles)`);
    await mouse(20, 20); await pg.keyboard.press("Control+v"); await pg.waitForTimeout(2000);
    ok(JSON.stringify(await nomes()) === '["R.1","R.2","R.3"]' && (await el("R.3")).y === 20, `de novo, noutro ponto: R.3 em (20, 20) (${await nomes()})`);
    // recortar e colar: o mesmo nome; Ctrl+Z desfaz o recorte
    await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "R.2")));
    await pg.keyboard.press("Control+x"); await pg.waitForTimeout(2000);
    ok(JSON.stringify(await nomes()) === '["R.1","R.3"]' && /recortado R\.2/.test(await pg.textContent("#msg")), `Ctrl+X: R.2 sai (${await nomes()})`);
    await mouse(15, 16); await pg.keyboard.press("Control+v"); await pg.waitForTimeout(2000);   // um ponto dentro da vista
    const r2b = await el("R.2");
    ok(r2b && r2b.x === 15 && r2b.y === 16 && r2b.par.resistance === 47, `colado de volta com o mesmo nome: R.2 em (${r2b && [r2b.x, r2b.y]})`);
    await pg.evaluate(() => desfazer()); await pg.waitForTimeout(2000);
    ok(JSON.stringify(await nomes()) === '["R.1","R.3"]', `Ctrl+Z desfaz o colar (${await nomes()})`);
    await pg.evaluate(() => desfazer()); await pg.waitForTimeout(2000);
    ok(JSON.stringify(await nomes()) === '["R.1","R.2","R.3"]' && (await el("R.2")).x === 20, `e de novo, desfaz o recorte: R.2 volta a (20, 10) (${await nomes()})`);
    // com o mouse fora do desenho: cola ao lado do original (3 quadrados)
    await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "R.3")));
    await pg.keyboard.press("Control+c"); await pg.waitForTimeout(800);
    await pg.mouse.move(5, 5); await pg.keyboard.press("Control+v"); await pg.waitForTimeout(2000);
    const r4 = await el("R.4");
    ok(r4 && r4.x === 23 && r4.y === 23, `com o mouse fora do desenho: colado ao lado do original, R.4 em (${r4 && [r4.x, r4.y]})`);
    await pg.evaluate(() => desfazer()); await pg.waitForTimeout(2000);
    // Ctrl+C sem nada selecionado: não é do MaiSim (o navegador copia o texto marcado)
    await pg.evaluate(() => seleciona(null)); await pg.evaluate(() => msg("")); await pg.keyboard.press("Control+c"); await pg.waitForTimeout(400);
    ok((await pg.textContent("#msg")) === "", "Ctrl+C sem componente selecionado: o MaiSim não faz nada");
    // subcircuito com o que tem dentro; GATE: noutra folha perde o acoplamento, na mesma fica
    await cmd("CREATE", "SUBCIRCUIT.1", 40, 10, "SUBCIRCUIT");
    await cmd("CREATE", "SUBCIRCUIT.1#CIRCUIT_TERMINAL.1", 1, 9, "CIRCUIT_TERMINAL"); await cmd("CREATE", "SUBCIRCUIT.1#R.1", 20, 20, "R");
    await cmd("CREATE", "S.1", 10, 30, "S"); await cmd("CREATE", "GATE.1", 20, 30, "GATE");
    await pg.evaluate(async () => { novoEstado(await api("editor/mede", { nome: "GATE.1", tipo: "G", componente: "S.1" })); });
    await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "SUBCIRCUIT.1")));
    await pg.keyboard.press("Control+c"); await pg.waitForTimeout(800);
    const mc = await pg.textContent("#msg");
    await mouse(40, 25); await pg.keyboard.press("Control+v"); await pg.waitForTimeout(2500);
    const sub2 = await pg.evaluate(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "SUBCIRCUIT.2"); return e && { pos: [e.x, e.y], dentro: (dados.folhas[e.uid] || { elementos: [] }).elementos.map((x) => x.nome).sort(), bornes: e.terminais.length }; });
    ok(/com os 2 componentes de dentro/.test(mc) && sub2 && JSON.stringify(sub2.dentro) === '["CIRCUIT_TERMINAL.1","R.1"]' && sub2.bornes === 1,
      `subcircuito copiado e colado: SUBCIRCUIT.2 em (${sub2 && sub2.pos}) com ${sub2 && sub2.dentro} dentro e ${sub2 && sub2.bornes} borne`);
    await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "GATE.1")));
    await pg.keyboard.press("Control+c"); await pg.waitForTimeout(800);
    await mouse(25, 30); await pg.keyboard.press("Control+v"); await pg.waitForTimeout(2000);
    const g2 = await el("GATE.2");
    const uid = await pg.evaluate(() => dados.folhas["0"].elementos.find((x) => x.nome === "SUBCIRCUIT.1").uid);
    await pg.evaluate((u) => abre(u), uid); await pg.waitForTimeout(800);
    await mouse(25, 30); await pg.keyboard.press("Control+v"); await pg.waitForTimeout(2000);
    const g3 = await pg.evaluate(() => { const e = dados.folhas[folhaAtual].elementos.find((x) => x.tipo === "GATE"); return e && { nome: e.nome, mede: e.mede }; });
    ok(g2 && g2.mede[0] === "S.1" && g3 && !g3.mede[0], `GATE colado na mesma folha: comanda S.1 (${g2 && g2.mede[0]}); dentro do subcircuito: sem chave (${g3 && g3.nome}: "${g3 && g3.mede[0]}")`);
    // terminal colado dentro do SM: vai para a borda (o borne do bloco), num borne livre
    await pg.evaluate(() => seleciona(dados.folhas[folhaAtual].elementos.find((x) => x.nome === "CIRCUIT_TERMINAL.1")));
    await pg.keyboard.press("Control+c"); await pg.waitForTimeout(800);
    await mouse(10, 9); await pg.keyboard.press("Control+v"); await pg.waitForTimeout(3000);
    const t2 = await pg.evaluate(() => { const e = dados.folhas[folhaAtual].elementos.find((x) => x.nome === "CIRCUIT_TERMINAL.2"); const b = Object.values(dados.folhas).flatMap((f) => f.elementos).find((x) => x.tipo === "SUBCIRCUIT" && x.uid === folhaAtual);
      return e && { pos: [e.x, e.y], bornes: b.terminais.map((t) => [t.x - b.x, t.y - b.y].join(",")) }; });
    ok(t2 && t2.pos[0] === 1 && new Set(t2.bornes).size === t2.bornes.length && t2.bornes.length === 2,
      `terminal colado dentro do SM: CIRCUIT_TERMINAL.2 na borda (${t2 && t2.pos}), bornes diferentes (${t2 && t2.bornes.join(" | ")})`);
    await api("editor/novo", { modo: "descartar" });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
