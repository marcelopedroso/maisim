// girar (instância de teste 5010 → 8768): o Gecko só gira componentes de potência — bloco de controle e subcircuito ficam
// sempre para baixo (RegelBlock.rotiereSymbol() vazio, "control components cannot be rotated at the moment!"; os dois
// forçam a orientação em setComponentDirection). Antes o "girar (R)" aparecia no CONST e não fazia nada (pergunta de
// Marcelo, 19/10: "o CONST tá sempre pra um lado"). Agora: R gira o resistor; no CONST e no subcircuito o botão explica
// e o R avisa, sem pedir nada ao Gecko nem anotar "girado" no histórico
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "0"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:5010/pew/simu/");
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
    // CONST e subcircuito: o botão explica; o R avisa; nada muda e nada vai ao histórico
    for (const n of ["C.1", "SUBCIRCUIT.1"]) {
      await escolhe(n); const a = await el(n), h0 = (await girados()).length;
      const bt = await pg.evaluate(() => ({ gira: !!$("p-gira"), nao: $("p-nao-gira") && $("p-nao-gira").title }));
      ok(!bt.gira && /não gira bloco de controle nem subcircuito/.test(bt.nao || ""), `${n}: sem "girar (R)"; o botão explica ("${bt.nao}")`);
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
