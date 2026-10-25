// o diagrama da arquitetura do controle (instância de teste 7200 → 7201), pedido de Marcelo em 19/10 ("um diagrama, tipo
// um flow, mostrando o que ele lê e o que sai dele, o que sai de um e entra no outro"): o botão na aba arquivos mostra o
// diagrama no lugar do código; os DSPs em colunas pela ordem das mensagens; as medidas de cada um (a de um DSP só, encostada
// nele); as mensagens com o que vai e a latência (um rótulo só quando vai o mesmo a vários); as atuações à direita, com o
// que comandam; "todas as medidas" vira um bloco; clicar num DSP abre o código; o código muda e o diagrama acompanha;
// mensagens em ciclo (21/10: o MMC) em duas colunas, o "ajustar" à vista, o mouse acendendo os ligados
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
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-ctl-vista", "arq"); localStorage.removeItem("maisim-simu-ctl-tabelas"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:7200/maisim/simu/");
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
    // mensagens em ciclo (Marcelo, 21/10, o MMC: o controle manda a todos e alguns respondem — cada volta empurrava todos uma
    // coluna; os DSPs iam para a última de muitas colunas vazias e o "ajustar" mostrava o vazio): o controle numa coluna, os
    // outros na seguinte; o "ajustar" mostra o desenho; a atuação na altura do DSP; o mouse acende os ligados
    await pg.evaluate(async ([orq, a, b_]) => {
      const q = (nome, arquivo, medidas, atuacoes) => ({ nome, arquivo, todas: false, medidas, atuacoes, subcircuitos: [] });
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: ["s05", "s06"], parametros: [], acionamentos: [], codigo: orq,
        arquivos: { "dsp_a.py": a, "dsp_b.py": b_ }, rede: { latencia: 0 },
        controladores: [q("controle", "controle.py", ["s01", "s02"], []), q("dsp_a", "dsp_a.py", ["s03"], ["s05"]), q("dsp_b", "dsp_b.py", ["s04"], ["s06"])] } });
      await recarregaControle(); },
    [ORQ, CTL('    envia("controle", {"x": 1.0})\n    envia("dsp_b", {"y": 1.0})\n'), CTL('    envia("dsp_a", {"z": 1.0})\n')]);
    await pg.waitForTimeout(600); await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(500); await pg.click("#cd-ajusta"); await pg.waitForTimeout(300);
    v = await le();
    const cic = await pg.evaluate(() => { const svg = $("ctl-diag-svg"), R = svg.parentElement.getBoundingClientRect(), dentro = (g) => { const r = g.getBoundingClientRect(); return r.left >= R.left && r.right <= R.right && r.top >= R.top && r.width > 20; };
      const cy = (s) => { const r = svg.querySelector(s).getBBox(); return r.y + r.height / 2; };
      const cx = (n) => svg.querySelector(`.dsp[data-nos="${n}"] rect`).getBBox();
      const lados = [...svg.querySelectorAll("path.msg")].map((p) => { const [de, para] = p.dataset.nos.split("|"), n = p.getTotalLength(), i = p.getPointAtLength(0), f = p.getPointAtLength(n);
        return { m: p.dataset.nos, sai: Math.abs(i.x - (cx(de).x + cx(de).width)) < 1, entra: Math.abs(f.x - (cx(para).x - 2)) < 1 }; });
      return { W: +svg.getAttribute("width"), vistos: [...svg.querySelectorAll(".dsp")].every(dentro), k: vistaDiag.k, lados,
        alinhada: Math.abs(cy('.atu[data-nos^="s05"] rect') - cy('.dsp[data-nos="dsp_a"] rect')) < 12 }; });
    ok(v.dsps.controle.x < v.dsps.dsp_a.x && v.dsps.dsp_a.x === v.dsps.dsp_b.x && cic.W < 1300 && cic.vistos && cic.alinhada,
      `em ciclo: o controle numa coluna, dsp_a e dsp_b na seguinte (largura ${Math.round(cic.W)} px); "ajustar" (${Math.round(cic.k * 100)} %) deixa os DSPs à vista; a s05 na altura do dsp_a`);
    ok(cic.lados.length === 5 && cic.lados.every((l) => l.sai && l.entra),     // Marcelo, 21/10: "entrar sempre num lado e sair do outro"
      `toda mensagem sai pela direita de quem manda e entra pela esquerda de quem recebe (para a frente, na mesma coluna e a de volta ao controle): ${cic.lados.map((l) => `${l.m} ${l.sai && l.entra ? "✓" : "✗"}`).join(", ")}`);
    await pg.hover('#ctl-diag-svg .dsp[data-nos="dsp_b"] rect'); await pg.waitForTimeout(200);
    const foco = await pg.evaluate(() => { const svg = $("ctl-diag-svg"), ap = (s) => svg.querySelector(s).classList.contains("apagado");
      return { dspA: ap('.dsp[data-nos="dsp_a"]'), ctl: ap('.dsp[data-nos="controle"]'), s04: ap('.med[data-nos^="s04"]'), s06: ap('.atu[data-nos^="s06"]'), s01: ap('.med[data-nos^="s01"]'),
        ligadas: [...svg.querySelectorAll("path.ligado")].map((p) => p.dataset.nos).sort(), outra: ap('path.msg[data-nos="controle|dsp_a"]') }; });
    ok(!foco.dspA && !foco.ctl && !foco.s04 && !foco.s06 && foco.s01 && foco.outra && foco.ligadas.includes("dsp_a|dsp_b") && foco.ligadas.includes("controle|dsp_b") && foco.ligadas.includes("dsp_b|dsp_a"),
      `o mouse no dsp_b: acesos ele, o dsp_a e o controle (ligados por mensagem), a s04 e a s06; apagados a s01 e a mensagem controle → dsp_a; linhas grossas: ${foco.ligadas.join(", ")}`);
    await pg.waitForTimeout(500);                         // a dica do MaiSim (maisim-dica.js), não a caixinha do navegador (o <title> do SVG)
    const dc = await pg.evaluate(() => ({ vis: $("dica-ui").classList.contains("vis"), txt: $("dica-ui").textContent, titles: $("ctl-diag-svg").querySelectorAll("title").length }));
    ok(dc.vis && /^dsp_b \(dsp_b\.py\) · lê s04/.test(dc.txt) && dc.titles === 0, `a dica do MaiSim no dsp_b ("${dc.txt.slice(0, 60)}…"), nenhum <title> no SVG`);
    // separar / juntar as linhas (Marcelo, 21/10: "cada entrada ter uma linha… um botão para agrupar ou explodir"): separadas,
    // cada ligação com o seu ponto (chega à esquerda, sai à direita, sem dois no mesmo lugar); juntas, um ponto por caixa
    const pontas = () => pg.evaluate(() => { const svg = $("ctl-diag-svg"), ps = [...svg.querySelectorAll("path.msg, path.lig, path.esc")];
      const ini = (p) => Math.round(p.getPointAtLength(0).y), fim = (p) => Math.round(p.getPointAtLength(p.getTotalLength()).y);
      const de = (n) => ps.filter((p) => p.dataset.nos.split("|")[0] === n).map(ini), para = (n) => ps.filter((p) => p.dataset.nos.split("|")[1] === n).map(fim);
      const retas = (sel) => [...svg.querySelectorAll(sel)].every((p) => Math.abs(ini(p) - fim(p)) <= 1);
      return { saiCtl: de("controle"), chegaB: para("dsp_b"), chegaCtl: para("controle"), bt: $("cd-linhas").textContent, guardado: localStorage.getItem("maisim-simu-diag-linhas"),
        medRetas: retas("path.lig"), locRetas: retas('path.lig[data-nos^="s03|"], path.lig[data-nos^="s04|"]'),
        pontaFixa: [...svg.querySelectorAll("marker")].every((m) => m.getAttribute("markerUnits") === "userSpaceOnUse") }; });
    const distintos = (l) => new Set(l).size === l.length;
    await pg.mouse.move(2, 2); await pg.click("#cd-linhas"); await pg.waitForTimeout(400);
    const sep = await pontas(), ladosSep = await pg.evaluate(() => { const svg = $("ctl-diag-svg"), cx = (n) => svg.querySelector(`.dsp[data-nos="${n}"] rect`).getBBox();
      return [...svg.querySelectorAll("path.msg")].every((p) => { const [de, para] = p.dataset.nos.split("|"), i = p.getPointAtLength(0), f = p.getPointAtLength(p.getTotalLength());
        return Math.abs(i.x - (cx(de).x + cx(de).width)) < 1 && Math.abs(f.x - (cx(para).x - 2)) < 1; }); });
    await pg.click("#cd-linhas"); await pg.waitForTimeout(400);
    const jun = await pontas();
    ok(sep.bt === "Juntar linhas" && sep.guardado === "separadas" && distintos(sep.saiCtl) && sep.saiCtl.length === 2 && distintos(sep.chegaB) && sep.chegaB.length === 3
       && distintos(sep.chegaCtl) && sep.chegaCtl.length === 3 && ladosSep && jun.bt === "Separar linhas" && jun.guardado === "juntas" && new Set(jun.saiCtl).size === 1,
      `separar linhas: cada ligação no seu ponto (o controle sai em ${JSON.stringify(sep.saiCtl)}, chegam ao dsp_b em ${JSON.stringify(sep.chegaB)}, ao controle em ${JSON.stringify(sep.chegaCtl)}), ainda entrando pela esquerda e saindo pela direita, guardado; juntar: o controle sai de um ponto só (${JSON.stringify(jun.saiCtl)})`);
    // o que foi nas mensagens (Marcelo, 22/10: envia("controle", c["sobe"]) com o dicionário montado num laço aparecia só como
    // "mensagem"): depois do "testar", o rótulo traz as chaves de verdade (até 3 + quantas mais) e a dica diz de onde vieram;
    // o código mudou depois, a dica avisa
    await pg.click("#cd-fecha");
    await pg.evaluate(async (cod) => { const c = (await api("editor/controle")).controle; c.arquivos["dsp_b.py"] = cod;
      await api("editor/controle", { controle: c }); await recarregaControle(); },
      CTL('    d = {}\n    for k in range(5):\n        d["x%d" % k] = 1.0\n    envia("dsp_a", d)\n'));
    await pg.waitForTimeout(500); await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(500);
    const rotB = () => pg.evaluate(() => { const g = document.querySelector('#ctl-diag-svg g[data-nos="dsp_b|dsp_a"]'); return g ? { rot: g.querySelector("text.rot").textContent, dica: g.getAttribute("title") || g.dataset.dica || "" } : null; });
    const r0 = await rotB();
    await pg.click("#cd-fecha"); await pg.evaluate(() => testaControle()); await pg.waitForFunction(() => !$("ctl-testar").disabled, null, { timeout: 30000 }); await pg.waitForTimeout(1200);
    await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(500);
    const r1 = await rotB();
    await pg.click("#cd-fecha");
    await pg.evaluate(async () => { const c = (await api("editor/controle")).controle; c.arquivos["dsp_b.py"] += "\n# mudou\n"; await api("editor/controle", { controle: c }); await recarregaControle(); });
    await pg.waitForTimeout(500); await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(500);
    const r2 = await rotB();
    ok(r0 && r0.rot === "mensagem" && r1 && r1.rot === "x0, x1, x2 +2" && /x0, x1, x2, x3, x4/.test(r1.dica) && /do último “testar”/.test(r1.dica) && !/mudou depois/.test(r1.dica)
       && r2 && r2.rot === "x0, x1, x2 +2" && /o código mudou depois/.test(r2.dica),
      `o que foi nas mensagens: antes do "testar" "${r0 && r0.rot}"; depois "${r1 && r1.rot}" (a dica: ${(r1 && r1.dica || "").split("\n").slice(0, 2).join(" / ")}); com o código mudado, a dica avisa`);
    // Marcelo, 21/10: as linhas das medidas faziam curvas estranhas e a ponta da seta crescia no destaque
    ok(sep.medRetas && jun.locRetas && jun.pontaFixa, `as medidas entram retas (separadas: todas; juntas: as encostadas no DSP); a ponta das setas com tamanho fixo (não cresce no destaque)`);
    await pg.click("#cd-fecha");
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
