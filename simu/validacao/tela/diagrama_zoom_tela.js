// o diagrama da arquitetura como no Figma (instância de teste 5010 → 8768), pedido de Marcelo em 19/10 ("clicar e arrastar,
// dar zoom + −"): abre inteiro na vista; + aumenta 25 % no meio; Ctrl + roda dá zoom no ponto do mouse (o que está embaixo
// dele fica parado); arrastar move (e soltar em cima de um DSP não abre o código); a roda rola; clicar num DSP sem arrastar
// abre o código; reaberto, a vista fica onde foi deixada; "ajustar" cabe inteiro de novo; % volta a 100 %
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const CTL = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {}\n';
const ORQ = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    envia("dsp_a", {"theta": 1.0})\n    envia("dsp_b", {"theta": 1.0})\n    return {}\n';
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1800, height: 1000 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-ctl-vista", "arq"); localStorage.removeItem("pew-simu-ctl-tabelas"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:5010/pew/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async ([orq, ctl0]) => {
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      for (let k = 1; k <= 6; k++) { await api("editor/cmd", { op: "CREATE", args: [`C${k}`, 5 + 4 * k, 5, "CONST"] }); await api("editor/cmd", { op: "OUTNODE", args: [`C${k}`, 0, `s0${k}`] }); }
      const q = (nome, arquivo, medidas, atuacoes) => ({ nome, arquivo, todas: false, medidas, atuacoes, subcircuitos: [] });
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: ["s05", "s06"], parametros: [], acionamentos: [], codigo: orq,
        arquivos: { "dsp_a.py": ctl0, "dsp_b.py": ctl0 }, controladores: [q("controle", "controle.py", ["s01"], []), q("dsp_a", "dsp_a.py", ["s03"], ["s05"]), q("dsp_b", "dsp_b.py", ["s04"], ["s06"])] } });
      novoEstado(await api("editor/estado")); await recarregaControle(); mostraDoca("controle"); }, [ORQ, CTL]);
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(600);
    await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(600);
    const v = () => pg.evaluate(() => { const r = $("ctl-diag-svg").parentElement.getBoundingClientRect(), s = $("ctl-diag-svg").getBoundingClientRect(),
      a = document.querySelector('#ctl-diag-svg .dsp[data-arq="dsp_a.py"] rect').getBoundingClientRect();
      return { k: vistaDiag.k, x: vistaDiag.x, y: vistaDiag.y, mexida: vistaDiag.mexida, z: $("cd-zoom").textContent, rolo: [r.left, r.top, r.right, r.bottom], svg: [s.left, s.top, s.right, s.bottom],
        a: [a.left + a.width / 2, a.top + a.height / 2], vis: !$("ctl-diagrama").hidden }; });
    let a0 = await v();
    ok(a0.vis && a0.k <= 1 && a0.svg[0] >= a0.rolo[0] - 1 && a0.svg[2] <= a0.rolo[2] + 1 && a0.svg[1] >= a0.rolo[1] - 1 && a0.svg[3] <= a0.rolo[3] + 1 && a0.z === `${Math.round(a0.k * 100)}%`,
      `abre inteiro na vista (zoom ${a0.z})`);
    await pg.click("#cd-mais"); await pg.waitForTimeout(200);
    let a1 = await v();
    ok(Math.abs(a1.k - a0.k * 1.25) < 1e-6 && a1.z === `${Math.round(a1.k * 100)}%` && a1.mexida, `+: ${a0.z} → ${a1.z}`);
    // Ctrl + roda no dsp_a: ele fica embaixo do mouse
    await pg.mouse.move(a1.a[0], a1.a[1]); await pg.keyboard.down("Control"); await pg.mouse.wheel(0, -300); await pg.keyboard.up("Control"); await pg.waitForTimeout(300);
    let a2 = await v();
    ok(a2.k > a1.k && Math.hypot(a2.a[0] - a1.a[0], a2.a[1] - a1.a[1]) < 3, `Ctrl + roda no dsp_a: ${a1.z} → ${a2.z}, e ele fica embaixo do mouse (${a2.a.map((x) => x.toFixed(0))} × ${a1.a.map((x) => x.toFixed(0))})`);
    // arrastar começando em cima do dsp_a: move, e soltar não abre o código
    await pg.mouse.move(a2.a[0], a2.a[1]); await pg.mouse.down();
    for (let k = 1; k <= 6; k++) await pg.mouse.move(a2.a[0] - 20 * k, a2.a[1] + 10 * k);
    await pg.mouse.up(); await pg.waitForTimeout(400);
    let a3 = await v();
    ok(a3.vis && Math.abs(a3.a[0] - (a2.a[0] - 120)) < 3 && Math.abs(a3.a[1] - (a2.a[1] + 60)) < 3, `arrastar (−120, +60): o desenho vai junto (${(a3.a[0] - a2.a[0]).toFixed(0)}, ${(a3.a[1] - a2.a[1]).toFixed(0)}); soltar em cima do dsp_a não abre o código`);
    // a roda rola
    await pg.mouse.wheel(0, 100); await pg.waitForTimeout(300);
    let a4 = await v();
    ok(Math.abs(a4.y - (a3.y - 100)) < 1 && a4.k === a3.k, `a roda rola: y ${a3.y.toFixed(0)} → ${a4.y.toFixed(0)} (zoom igual)`);
    // clicar sem arrastar abre o código
    await pg.mouse.click(a4.a[0], a4.a[1]); await pg.waitForTimeout(400);
    ok(!(await v()).vis && await pg.evaluate(() => ctl.arq) === "dsp_a.py", "clicar no dsp_a sem arrastar abre o código");
    // reaberto: a vista fica; ajustar cabe inteiro; % volta a 100 %
    await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(500);
    let a5 = await v();
    ok(a5.mexida && Math.abs(a5.k - a4.k) < 1e-6 && Math.abs(a5.x - a4.x) < 1, `reaberto: a vista fica onde estava (${a5.z})`);
    await pg.click("#cd-ajusta"); await pg.waitForTimeout(300);
    let a6 = await v();
    ok(!a6.mexida && Math.abs(a6.k - a0.k) < 1e-6 && a6.svg[0] >= a6.rolo[0] - 1 && a6.svg[3] <= a6.rolo[3] + 1, `ajustar: inteiro de novo (${a6.z})`);
    await pg.click("#cd-zoom"); await pg.waitForTimeout(300);
    ok((await v()).z === "100%", "clicar no % volta a 100 %");
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
