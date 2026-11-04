// girar (instância de teste 7200 → 7201): o resistor gira; o bloco de controle também, desde o patch 0012 do Gecko do MaiSim
// (o original não gira: RegelBlock.rotiereSymbol() vazio; Marcelo, 04/11: "podemos rotacionar no nosso") — o R e o "girar
// (R)" do painel giram o CONST, com os bornes girados (o desenho em pé: gira_controle_api confere que o fio liga); o
// subcircuito continua sem girar (o Gecko força a orientação): o botão explica e o R avisa, sem pedir nada ao Gecko nem anotar
// "girado" no histórico
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "0"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async () => { const j = await api("editor/novo", { modo: "descartar" }); ed.novo = "giro"; dados = j; folhaAtual = "0"; seleciona(null); novoEstado(j);
      for (const [n, x, t] of [["R.1", 6, "R"], ["C.1", 14, "CONST"], ["SUBCIRCUIT.1", 22, "SUBCIRCUIT"]]) novoEstado(await api("editor/cmd", { op: "CREATE", args: [n, x, 6, t] })); });
    const el = (n) => pg.evaluate((n) => { const e = dados.folhas["0"].elementos.find((x) => x.nome === n); return { dir: e.dir, t: e.terminais.map((u) => [u.x - e.x, u.y - e.y]) }; }, n);
    const escolhe = async (n) => { await pg.evaluate((n) => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === n)), n); await pg.waitForTimeout(300); };
    const girados = () => pg.evaluate(() => historico.filter((h) => /^girado/.test(h.t)).map((h) => h.t));
    // resistor: girar (R) aparece e o R gira
    await escolhe("R.1"); const r0 = await el("R.1");
    ok(!!(await pg.$("#p-gira")) && !(await pg.$("#p-nao-gira")), "resistor: o painel tem \"girar (R)\"");
    await pg.mouse.move(5, 300); await pg.keyboard.press("r"); await pg.waitForTimeout(1500);
    const r1 = await el("R.1");
    ok(r1.dir !== r0.dir && JSON.stringify(r1.t) !== JSON.stringify(r0.t), `R no resistor gira (orientação ${r0.dir} → ${r1.dir}, bornes ${JSON.stringify(r0.t)} → ${JSON.stringify(r1.t)})`);
    // o CONST (bloco de controle): girar (R) no painel, e o R gira, com os bornes girados
    await escolhe("C.1"); const c0 = await el("C.1");
    ok(!!(await pg.$("#p-gira")) && !(await pg.$("#p-nao-gira")), "CONST: o painel tem \"girar (R)\" (o Gecko do MaiSim gira bloco de controle)");
    await pg.mouse.move(5, 300); await pg.keyboard.press("r"); await pg.waitForTimeout(1500);
    const c1 = await el("C.1");
    ok(c1.dir !== c0.dir && JSON.stringify(c1.t) !== JSON.stringify(c0.t), `R no CONST gira (orientação ${c0.dir} → ${c1.dir}, bornes ${JSON.stringify(c0.t)} → ${JSON.stringify(c1.t)})`);
    const caixa = await pg.evaluate(() => { const i = dados.folhas["0"].elementos.findIndex((x) => x.nome === "C.1"), r = document.querySelector(`#svg .el[data-i="${i}"] .corpo`);
      const perna = document.querySelector(`#svg .el[data-i="${i}"] line`); return { w: +r.getAttribute("width"), h: +r.getAttribute("height"),
        perna: perna ? +perna.getAttribute("x1") === +perna.getAttribute("x2") : null }; });
    ok(caixa.h > caixa.w && caixa.perna === true, `o CONST girado é desenhado em pé (caixa ${caixa.w}×${caixa.h}, a perna da saída na vertical)`);
    // o SIGNAL com as entradas externas, girado: continua dizendo o que cada entrada dá (Â, f, …; Codex, #215)
    const ext = await pg.evaluate(async () => { novoEstado(await api("editor/cmds", { cmds: [{ op: "CREATE", args: ["SIGNAL.1", 30, 14, "SIGNAL"] }, { op: "SETP", args: ["SIGNAL.1", "useExternal", 1] }, { op: "ROTATE", args: ["SIGNAL.1"] }] }));
      await new Promise((ok) => setTimeout(ok, 300)); const e = dados.folhas["0"].elementos.find((x) => x.nome === "SIGNAL.1"), i = dados.folhas["0"].elementos.indexOf(e);
      return { dir: e.dir, n: e.terminais.filter((t) => t.lado === "e").length, rot: [...document.querySelectorAll(`#svg .el[data-i="${i}"] .pino-ext`)].map((x) => x.textContent) }; });
    ok(ext.dir === 504 && ext.n === 5 && ext.rot.length === 5 && ext.rot.includes("f"), `o SIGNAL com entradas externas girado mostra o que cada uma dá (${ext.rot.join(" ")})`);
    // subcircuito: o botão explica; o R avisa; nada muda e nada vai ao histórico
    for (const n of ["SUBCIRCUIT.1"]) {
      await escolhe(n); const a = await el(n), h0 = (await girados()).length;
      const bt = await pg.evaluate(() => ({ gira: !!$("p-gira"), nao: $("p-nao-gira") && $("p-nao-gira").title }));
      ok(!bt.gira && /não gira subcircuito/.test(bt.nao || ""), `${n}: sem "girar (R)"; o botão explica ("${bt.nao}")`);
      await pg.click("#p-nao-gira"); await pg.waitForTimeout(200);
      const m1 = await pg.textContent("#msg");
      await pg.evaluate(() => { $("msg").textContent = ""; }); await pg.mouse.move(5, 300); await pg.keyboard.press("r"); await pg.waitForTimeout(1500);
      const m2 = await pg.textContent("#msg"), d = await el(n);
      ok(/mesmo rótulo/.test(m1) && /não gira/.test(m2) && d.dir === a.dir && JSON.stringify(d.t) === JSON.stringify(a.t) && (await girados()).length === h0,
        `${n}: o clique e o R avisam ("${m2}"); orientação e bornes iguais; nada de "girado" no histórico`);
    }
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
