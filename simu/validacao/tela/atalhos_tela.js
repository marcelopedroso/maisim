// atalhos do editor no PC (instância de teste 7200 → 7201), pedidos a Marcelo (04/11): a roda clicada (botão do meio) e
// arrastar move a tela, em qualquer modo e sem clicar em nada; segurando uma peça (o botão apertado nela), Espaço gira e
// X ou Y vira — o Gecko não espelha (só 4 rotações): com dois terminais, virar no eixo da peça é girar 180° (os bornes
// trocam), no outro eixo não muda nada (avisa); com 3 ou mais terminais avisa. Soltar depois de girar põe a peça onde o
// mouse está (o X numa peça em pé deita, e o Y numa deitada põe em pé). Sem peça segura, Espaço, X e Y não fazem nada novo. E o R na referência térmica (TREF), que o Gecko não
// gira, avisa em vez de pedir um giro que não acontece
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "0"); localStorage.setItem("maisim-lingua", "pt"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async () => { const j = await api("editor/novo", { modo: "descartar" }); ed.novo = "atalhos"; dados = j; folhaAtual = "0"; seleciona(null); novoEstado(j);
      for (const [n, x, t] of [["R.1", 6, "R"], ["D.1", 14, "D"], ["Trans.1", 24, "Trans"], ["TREF.1", 34, "TREF"]]) novoEstado(await api("editor/cmd", { op: "CREATE", args: [n, x, 8, t] }));
      ajusta(); });
    await pg.waitForTimeout(800);
    const el = (n) => pg.evaluate((n) => { const e = dados.folhas["0"].elementos.find((x) => x.nome === n);
      return { x: e.x, y: e.y, dir: e.dir, t: e.terminais.map((u) => [u.x - e.x, u.y - e.y]), nos: e.entradas.length + e.saidas.length }; }, n);
    const centro = (n) => pg.evaluate((n) => { const f = dados.folhas["0"], i = f.elementos.findIndex((x) => x.nome === n);
      const g = document.querySelector(`#svg .el[data-i="${i}"] .corpo`) || document.querySelector(`#svg .el[data-i="${i}"]`), r = g.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2]; }, n);
    const vb = () => pg.evaluate(() => document.getElementById("svg").getAttribute("viewBox"));
    const limpaMsg = () => pg.evaluate(() => { $("msg").textContent = ""; });
    const segura = async (n, tecla, solta = [0, 0]) => {            // aperta o botão na peça, a tecla, e solta (deslocado em px)
      const [cx, cy] = await centro(n); await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.waitForTimeout(150);
      await pg.keyboard.press(tecla); await pg.waitForTimeout(1800);
      if (solta[0] || solta[1]) { await pg.mouse.move(cx + solta[0] / 2, cy + solta[1] / 2, { steps: 4 }); await pg.mouse.move(cx + solta[0], cy + solta[1], { steps: 4 }); }
      await pg.mouse.up(); await pg.waitForTimeout(1500);
    };

    // a roda clicada e arrastar: a viewBox anda, e nada é selecionado
    await pg.evaluate(() => seleciona(null)); const v0 = await vb();
    await pg.mouse.move(700, 600); await pg.mouse.down({ button: "middle" }); await pg.mouse.move(760, 640, { steps: 6 }); await pg.mouse.up({ button: "middle" }); await pg.waitForTimeout(400);
    const v1 = await vb(), sel1 = await pg.evaluate(() => ed.sel);
    ok(v1 !== v0 && !sel1, `a roda clicada e arrastar move a tela (viewBox ${v0} → ${v1}), sem selecionar nada`);
    // e em cima de uma peça: também só move a tela (a peça fica)
    const rA = await el("R.1"), [rx, ry] = await centro("R.1"), v2 = await vb();
    await pg.mouse.move(rx, ry); await pg.mouse.down({ button: "middle" }); await pg.mouse.move(rx + 80, ry, { steps: 6 }); await pg.mouse.up({ button: "middle" }); await pg.waitForTimeout(600);
    const rB = await el("R.1");
    ok(await vb() !== v2 && rB.x === rA.x && rB.y === rA.y, `a roda clicada em cima de uma peça move a tela, não a peça (R.1 em ${rB.x},${rB.y})`);
    await pg.evaluate(() => ajusta()); await pg.waitForTimeout(400);

    // segurar + Espaço: gira; soltar mais à direita põe a peça lá (girada)
    const r0 = await el("R.1");
    await segura("R.1", "Space", [60, 0]);
    const r1 = await el("R.1");
    ok(r1.dir !== r0.dir && r1.x > r0.x, `segurar R.1 + Espaço gira (${r0.dir} → ${r1.dir}) e soltar o põe onde o mouse está (x ${r0.x} → ${r1.x})`);

    // segurar o diodo deitado + X: 180° (os bornes trocam de lado); + Y: avisa e nada muda
    await pg.evaluate(async () => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "D.1"); if (e.dir !== 502 && e.dir !== 504) novoEstado(await api("editor/cmd", { op: "ROTATE", args: ["D.1"] })); });
    await pg.waitForTimeout(600);
    const d0 = await el("D.1"); await segura("D.1", "x");
    const d1 = await el("D.1");
    ok((d0.dir === 502 || d0.dir === 504) && d1.dir !== d0.dir && (d1.dir === 502 || d1.dir === 504) && JSON.stringify(d1.t) === JSON.stringify([d0.t[1], d0.t[0]]),
      `segurar o diodo deitado + X: vira de lado (${d0.dir} → ${d1.dir}, bornes ${JSON.stringify(d0.t)} → ${JSON.stringify(d1.t)})`);
    const nVirado = await pg.evaluate(() => historico.filter((h) => /^espelhado D\.1/.test(h.t)).length);
    ok(nVirado === 1, `virar é uma mudança só no histórico (um Desfazer volta): ${nVirado}`);
    // Y no diodo deitado: põe em pé; Y de novo (em pé): vira de cima para baixo; X nele em pé: deita (Marcelo, 04/11: "junta tudo")
    await segura("D.1", "y"); const d2 = await el("D.1");
    ok(d2.t.every(([dx]) => dx === 0) && d2.t.some(([, dy]) => dy !== 0), `segurar o diodo deitado + Y: fica em pé (${d1.dir} → ${d2.dir}, bornes ${JSON.stringify(d2.t)})`);
    await segura("D.1", "y"); const d3 = await el("D.1");
    ok(JSON.stringify(d3.t) === JSON.stringify([d2.t[1], d2.t[0]]) && d3.t.every(([dx]) => dx === 0), `segurar o diodo em pé + Y: vira de cima para baixo (bornes ${JSON.stringify(d2.t)} → ${JSON.stringify(d3.t)})`);
    await segura("D.1", "x"); const d4 = await el("D.1");
    ok(d4.t.every(([, dy]) => dy === 0), `segurar o diodo em pé + X: deita (bornes ${JSON.stringify(d4.t)})`);

    // 3 ou mais terminais: avisa
    const t0 = await el("Trans.1"); await limpaMsg(); await segura("Trans.1", "x");
    const t1 = await el("Trans.1"), mT = await pg.textContent("#msg");
    ok(t0.nos > 2 && t1.dir === t0.dir && /não espelha/.test(mT), `segurar o transformador (${t0.nos} nós) + X: avisa ("${mT}")`);

    // sem peça segura: Espaço, X e Y não mudam nada (e o Espaço não pausa nada sem simulação)
    const antes = await pg.evaluate(() => JSON.stringify(dados.folhas["0"].elementos.map((e) => [e.nome, e.x, e.y, e.dir])));
    await pg.mouse.move(5, 300); for (const k of ["Space", "x", "y"]) { await pg.keyboard.press(k); await pg.waitForTimeout(400); }
    ok(antes === await pg.evaluate(() => JSON.stringify(dados.folhas["0"].elementos.map((e) => [e.nome, e.x, e.y, e.dir]))), "sem peça segura, Espaço, X e Y não mudam nada");

    // R na referência térmica: avisa (o Gecko não gira), sem "girado" no histórico
    await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "TREF.1"))); await pg.waitForTimeout(300); await limpaMsg();
    const g0 = await pg.evaluate(() => historico.filter((h) => /^girado TREF/.test(h.t)).length);
    await pg.mouse.move(5, 300); await pg.keyboard.press("r"); await pg.waitForTimeout(1000);
    const mR = await pg.textContent("#msg"), g1 = await pg.evaluate(() => historico.filter((h) => /^girado TREF/.test(h.t)).length);
    ok(/referência térmica/.test(mR) && g1 === g0, `R na referência térmica avisa ("${mR}") e não pede giro`);
    // o trilho: Atalhos abre a janela com tudo isso (o X e o Y incluídos); Esc fecha
    await pg.click("#maisim-nav .item.atalhos"); await pg.waitForTimeout(400);
    const jan = await pg.locator("#maisim-atalhos").isVisible() ? await pg.locator("#maisim-atalhos").innerText() : "";
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
    ok(/Segurar a peça \+ X/.test(jan) && /Roda clicada/.test(jan) && /Ctrl\+Enter/.test(jan) && !(await pg.locator("#maisim-atalhos").count()), "o trilho tem Atalhos: a janela lista o mouse e o teclado (o X, o Y, a roda clicada…), e o Esc fecha");
    ok(!erros.length, `sem erros na página${erros.length ? ": " + erros.join(" · ") : ""}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
