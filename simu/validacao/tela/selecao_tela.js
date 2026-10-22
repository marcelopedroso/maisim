// seleção de vários pela tela (instância de teste 7200 → 7201): Shift + arrastar no vazio (retângulo) seleciona componentes
// e conexões; arrastar um deles move o grupo e a conexão de dentro continua ligada; Shift + clique põe e tira; Ctrl+C e
// Ctrl+V colam o grupo onde está o mouse (com a conexão, já selecionado); Delete apaga o grupo; Ctrl+Z volta; Esc tira.
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
    await pg.evaluate(async () => {
      const j = await api("editor/novo", { modo: "descartar" }); ed.novo = "selecao"; dados = j; folhaAtual = "0"; seleciona(null); novoEstado(j);
      for (const a of [["R.1", 10, 10, "R"], ["L.1", 20, 10, "L"], ["C.1", 40, 10, "C"]]) novoEstado(await api("editor/cmd", { op: "CREATE", args: a }));
      novoEstado(await api("editor/fio", { acao: "novo", dom: "LK", cantos: [[10, 12], [10, 14], [20, 14], [20, 12]] }));
      ver = { x: -2 * G, y: 0, w: 60 * G, h: 60 * G * $("svg").clientHeight / $("svg").clientWidth }; aplicaVer(); });   // a vista na proporção da tela
    const tela = (x, y) => pg.evaluate(([gx, gy]) => { const s = $("svg"), m = s.getScreenCTM(), pt = s.createSVGPoint(); pt.x = gx * G; pt.y = gy * G; const q = pt.matrixTransform(m); return [q.x, q.y]; }, [x, y]);
    const est = () => pg.evaluate(() => ({ multi: [...ed.multi].sort(), fios: ed.multiFios.size, els: Object.fromEntries(dados.folhas[folhaAtual].elementos.map((e) => [e.nome, [e.x, e.y]])),
      ws: dados.folhas[folhaAtual].fios.map((w) => `${w.pts[0]}→${w.pts[w.pts.length - 1]}`), props: $("props").textContent }));
    const arrasta = async (de, para, shift) => { const [a0, b0] = await tela(...de), [a1, b1] = await tela(...para);
      if (shift) await pg.keyboard.down("Shift"); await pg.mouse.move(a0, b0); await pg.mouse.down();
      for (let k = 1; k <= 8; k++) await pg.mouse.move(a0 + (a1 - a0) * k / 8, b0 + (b1 - b0) * k / 8);
      await pg.mouse.up(); if (shift) await pg.keyboard.up("Shift"); await pg.waitForTimeout(2000); };
    // 1. Shift + arrastar no vazio: o retângulo pega R.1, L.1 e a conexão entre eles (não o C.1)
    await arrasta([7, 5], [23, 16], true);
    let s1 = await est();
    ok(JSON.stringify(s1.multi) === '["L.1","R.1"]' && s1.fios === 1 && /2 componente\(s\) e 1 conexão/.test(s1.props), `Shift + arrastar: ${s1.multi} e ${s1.fios} conexão (o painel: "${s1.props.slice(0, 50)}…")`);
    // 2. arrastar um deles: o grupo anda, e a conexão continua nos terminais (nada se solta)
    await arrasta([10, 10], [15, 13], false);
    s1 = await est();
    const term = await pg.evaluate(() => { const f = dados.folhas["0"], t = (n, k) => { const e = f.elementos.find((x) => x.nome === n); return `${e.terminais[k].x},${e.terminais[k].y}`; };
      const w = f.fios[0]; return { r: [t("R.1", 0), t("R.1", 1)], l: [t("L.1", 0), t("L.1", 1)], ponta: [w.pts[0].join(","), w.pts[w.pts.length - 1].join(",")] }; });
    ok(s1.els["R.1"].join() === "15,13" && s1.els["L.1"].join() === "25,13" && s1.els["C.1"].join() === "40,10" && term.ponta.every((p) => term.r.includes(p) || term.l.includes(p)),
      `arrastado o R.1: R.1 (15, 13), L.1 (25, 13), C.1 fica; a conexão segue nos terminais (${term.ponta.join(" → ")})`);
    await pg.evaluate(() => desfazer()); await pg.waitForTimeout(2000);
    ok((await est()).els["R.1"].join() === "10,10", "Ctrl+Z: o grupo volta de uma vez (um passo só)");
    await arrasta([7, 5], [23, 16], true);
    // 3. Shift + clique põe e tira
    const [cx, cy] = await tela(40, 10);
    await pg.keyboard.down("Shift"); await pg.mouse.click(cx, cy); await pg.keyboard.up("Shift"); await pg.waitForTimeout(300);
    const com = (await est()).multi; await pg.keyboard.down("Shift"); await pg.mouse.click(cx, cy); await pg.keyboard.up("Shift"); await pg.waitForTimeout(300);
    ok(com.includes("C.1") && !(await est()).multi.includes("C.1"), `Shift + clique no C.1: entra (${com}) e sai`);
    // 4. Ctrl+C e Ctrl+V: o grupo colado onde está o mouse (o canto de cima à esquerda), com a conexão, já selecionado
    await pg.keyboard.press("Control+c"); await pg.waitForTimeout(800);
    const [mx, my] = await tela(30, 20); await pg.mouse.move(mx, my); await pg.keyboard.press("Control+v"); await pg.waitForTimeout(2500);
    s1 = await est();
    ok(s1.els["R.2"] && s1.els["R.2"].join() === "30,20" && s1.els["L.2"].join() === "40,20" && s1.ws.length === 2 && JSON.stringify(s1.multi) === '["L.2","R.2"]' && s1.fios === 1,
      `Ctrl+V: R.2 (30, 20) e L.2 (40, 20), com a conexão entre eles (${s1.ws.join(" · ")}), e o colado fica selecionado`);
    // 5. Delete apaga o grupo (uma pergunta); Ctrl+Z volta
    await pg.keyboard.press("Delete"); await pg.waitForSelector(".modal .m-ok"); const pergunta = await pg.textContent(".modal");
    await pg.click(".modal .m-ok"); await pg.waitForTimeout(2500);
    s1 = await est();
    ok(/2<\/b>|2 componente/.test(pergunta) && !s1.els["R.2"] && !s1.els["L.2"] && s1.ws.length === 1 && s1.els["R.1"], `Delete: pergunta uma vez ("${pergunta.slice(0, 60)}…") e apaga R.2, L.2 e a conexão deles`);
    await pg.evaluate(() => desfazer()); await pg.waitForTimeout(2000);
    ok(!!(await est()).els["R.2"], "Ctrl+Z traz o grupo apagado de volta");
    // 6. Esc tira a seleção
    await arrasta([7, 5], [23, 16], true); await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
    ok((await est()).multi.length === 0 && (await pg.evaluate(() => folhaAtual)) === "0", "Esc tira a seleção (e não sai da folha)");
    // 7. o painel da direita recolhido: o 1º clique só seleciona; clicar de novo no selecionado abre o painel (Marcelo, 22/10)
    const fechado = () => pg.evaluate(() => document.body.classList.contains("props-fechado"));
    await pg.click("#aba-props"); await pg.waitForTimeout(300); const rec = await fechado();
    const [qx, qy] = await tela(40, 10); await pg.mouse.click(qx, qy); await pg.waitForTimeout(400);
    const um = await fechado(), sel = await pg.evaluate(() => ed.sel);
    await pg.mouse.click(qx, qy); await pg.waitForTimeout(400);
    ok(rec && um && sel === "C.1" && !(await fechado()) && /C\.1/.test((await est()).props), `recolhido, o 1º clique seleciona o C.1 e o painel fica fechado; o 2º abre o painel com o C.1`);
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
