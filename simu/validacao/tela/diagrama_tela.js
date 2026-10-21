// o diagrama da arquitetura do controle (instância de teste 5010 → 8768), pedido de Marcelo em 19/10 ("um diagrama, tipo
// um flow, mostrando o que ele lê e o que sai dele, o que sai de um e entra no outro"): o botão na aba arquivos mostra o
// diagrama no lugar do código; os DSPs em colunas pela ordem das mensagens; as medidas de cada um (a de um DSP só, encostada
// nele); as mensagens com o que vai e a latência (um rótulo só quando vai o mesmo a vários); as atuações à direita, com o
// que comandam; "todas as medidas" vira um bloco; clicar num DSP abre o código; o código muda e o diagrama acompanha
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const CTL = (corpo = "    pass\n") => `def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n${corpo}    return {}\n`;
const ORQ = CTL('    envia("dsp_a", {"theta": 1.0})\n    envia("dsp_b", {"theta": 1.0})\n');
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 2300, height: 1000 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-ctl-vista", "arq"); localStorage.removeItem("pew-simu-ctl-tabelas"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:5010/pew/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    const monta = (todasB) => pg.evaluate(async ([orq, ctl0, todasB]) => {
      const q = (nome, arquivo, medidas, atuacoes, todas = false) => ({ nome, arquivo, todas, medidas, atuacoes, subcircuitos: [] });
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: ["s05", "s06"], parametros: [], acionamentos: [], codigo: orq,
        arquivos: { "dsp_a.py": ctl0, "dsp_b.py": ctl0 }, rede: { latencia: 2e-5 },
        controladores: [q("controle", "controle.py", ["s01", "s02"], []), q("dsp_a", "dsp_a.py", ["s03"], ["s05"]), q("dsp_b", "dsp_b.py", todasB ? [] : ["s04"], ["s06"], todasB)] } });
      await recarregaControle(); }, [ORQ, CTL(), todasB]);
    await pg.evaluate(async () => {                       // 6 CONST: cada saída é medida e atuação
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      for (let k = 1; k <= 6; k++) { await api("editor/cmd", { op: "CREATE", args: [`C${k}`, 5 + 4 * k, 5, "CONST"] }); await api("editor/cmd", { op: "OUTNODE", args: [`C${k}`, 0, `s0${k}`] }); }
      novoEstado(await api("editor/estado")); mostraDoca("controle"); });
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });   // o editor pronto antes de trocar o controle
    await monta(false); await pg.waitForTimeout(600);
    await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(500);
    const le = () => pg.evaluate(() => { const svg = $("ctl-diag-svg"), bb = (g) => { const r = g.querySelector("rect").getBBox(); return { x: r.x, y: r.y, w: r.width }; };
      return { vis: !$("ctl-diagrama").hidden && $("ctl-editor").style.display === "none", bt: $("ctl-diag-bt").classList.contains("ativo"),
        dsps: Object.fromEntries([...svg.querySelectorAll(".dsp")].map((g) => [g.dataset.nos, bb(g)])),
        meds: Object.fromEntries([...svg.querySelectorAll(".med")].map((g) => [g.querySelector("text").textContent, bb(g)])),
        atus: Object.fromEntries([...svg.querySelectorAll(".atu")].map((g) => [g.querySelector("text").textContent, Object.assign(bb(g), { dest: (g.querySelector("text.dest") || {}).textContent || "" })])),
        msgs: svg.querySelectorAll("path.msg").length, rots: [...svg.querySelectorAll("text.rot")].map((t) => t.textContent), lats: [...svg.querySelectorAll("text.lat")].map((t) => t.textContent) }; });
    let v = await le();
    ok(v.vis && v.bt && Object.keys(v.dsps).sort().join() === "controle,dsp_a,dsp_b", `o botão mostra o diagrama no lugar do código, com os DSPs ${Object.keys(v.dsps).join(", ")}`);
    ok(v.dsps.controle.x < v.dsps.dsp_a.x && v.dsps.dsp_a.x === v.dsps.dsp_b.x, "colunas pela ordem das mensagens: o controle antes de dsp_a e dsp_b (na mesma coluna)");
    ok(v.meds.s01.x + v.meds.s01.w < v.dsps.controle.x && v.meds.s03.x > v.dsps.controle.x + v.dsps.controle.w && v.meds.s03.x + v.meds.s03.w < v.dsps.dsp_a.x,
      "medidas: as do controle à esquerda dele; a s03 (só do dsp_a) encostada no dsp_a");
    ok(v.msgs === 2 && JSON.stringify(v.rots) === '["theta"]' && JSON.stringify(v.lats) === '["fibra 20 µs"]', `mensagens: ${v.msgs} setas, um rótulo "${v.rots}" (${v.lats})`);
    ok(v.atus.s05 && v.atus.s06 && v.atus.s05.x > v.dsps.dsp_a.x + v.dsps.dsp_a.w && /^→ nada ligado$/.test(v.atus.s05.dest), `atuações à direita: s05 "${v.atus.s05 && v.atus.s05.dest}", s06`);
    // "todas as medidas" vira um bloco
    await monta(true); await pg.waitForTimeout(800);
    v = await le();
    ok(Object.keys(v.meds).some((k) => /^todas as medidas \(6\)$/.test(k)) && !("s04" in v.meds), `dsp_b lendo todas: um bloco "${Object.keys(v.meds).find((k) => /todas/.test(k))}"`);
    // o código muda: sem o envia ao dsp_b, uma seta só
    await pg.evaluate(() => { const m = ctl.modelos["controle.py"]; m.setValue(m.getValue().replace('    envia("dsp_b", {"theta": 1.0})\n', "")); });
    await pg.waitForTimeout(1800);
    v = await le();
    ok(v.vis && v.msgs === 1, `o código sem o envia ao dsp_b: ${v.msgs} seta (o diagrama acompanha)`);
    // clicar num DSP abre o código dele
    await pg.click('#ctl-diag-svg .dsp[data-arq="dsp_a.py"] rect'); await pg.waitForTimeout(400);
    v = await le();
    ok(!v.vis && !v.bt && await pg.evaluate(() => ctl.arq) === "dsp_a.py", "clicar no dsp_a abre o código dele (o diagrama sai)");
    // o botão de novo e o ✕
    await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(300); await pg.click("#cd-fecha"); await pg.waitForTimeout(300);
    v = await le();
    ok(!v.vis && await pg.evaluate(() => $("ctl-editor").style.display !== "none"), "✕ fecha o diagrama e o código volta");
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
