// a telinha de escolha do que um controlador lê e escreve (instância de teste 7200 → 7201), pedido de Marcelo em 19/10
// ("com centenas de variáveis fica ruim de clicar… um dropdown com filtro e multiselect; e clicar no .py abre o código"):
// clicar em "lê …" abre a telinha junto da linha (também com o zoom de 110 %); filtrar; marcar os filtrados de uma vez
// (um guardar só); desmarcar um; em "escreve", a atuação de outro controlador aparece "(de …)" e marcar tira de lá;
// o resumo curto ("s10, s11, s12 +1"); Esc e clique fora fecham; clicar no .py abre o código
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const CTL = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {}\n';
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1900, height: 1000 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-ctl-vista", "arq"); localStorage.setItem("maisim-escala", "1.1"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async (ctl0) => {                  // 12 CONST: cada saída é uma medida (e uma atuação)
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      for (let k = 1; k <= 12; k++) { const n = `s${String(k).padStart(2, "0")}`; await api("editor/cmd", { op: "CREATE", args: [`C${k}`, 5 + 4 * k, 5, "CONST"] }); await api("editor/cmd", { op: "OUTNODE", args: [`C${k}`, 0, n] }); }
      const q = (nome, arquivo, medidas, atuacoes) => ({ nome, arquivo, todas: false, medidas, atuacoes, subcircuitos: [] });
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: ["s01", "s02", "s03"], parametros: [], acionamentos: [], codigo: ctl0,
        arquivos: { "dsp_a.py": ctl0, "dsp_b.py": ctl0 }, controladores: [{ nome: "controle", arquivo: "controle.py", todas: true, medidas: [], atuacoes: [], subcircuitos: [] },
          q("dsp_a", "dsp_a.py", ["s05"], ["s01"]), q("dsp_b", "dsp_b.py", [], ["s02"])] } });
      novoEstado(await api("editor/estado")); await recarregaControle(); mostraDoca("controle"); }, CTL);
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(800);
    const cfg = () => pg.evaluate(() => api("editor/controle").then((r) => Object.fromEntries(r.controle.controladores.map((q) => [q.nome, q]))));
    const sum = (nome, g) => `#ctl-ctls .ctl-ctl[data-nome="${nome}"] details[data-g="${g}"] > summary`;
    const pk = () => pg.evaluate(() => { const p = $("ctl-pick"); if (!p) return null;
      return { n: p.querySelector(".n").textContent, itens: [...p.querySelectorAll(".lista label")].map((l) => l.innerText.replace(/\s+/g, " ").trim() + (l.querySelector("input").checked ? "✓" : "")) }; });
    // 1. "lê" do dsp_a: a telinha junto da linha
    await pg.click(sum("dsp_a", "le")); await pg.waitForTimeout(300);
    let p = await pk();
    const pos = await pg.evaluate((s) => { const a = document.querySelector(s).getBoundingClientRect(), b = $("ctl-pick").getBoundingClientRect(); return { dy: b.top - a.bottom, dx: b.left - a.left, h: b.height, fundo: b.bottom <= innerHeight }; }, sum("dsp_a", "le"));
    ok(p && p.n === "1 de 12" && p.itens.length === 12 && p.itens.includes("s05✓") && !(await pg.evaluate((s) => document.querySelector(s).parentElement.open, sum("dsp_a", "le"))),
      `clicar em "lê": a telinha com as 12 medidas (${p && p.n}), sem abrir a lista no cartão`);
    ok(Math.abs(pos.dx) < 3 && pos.dy >= 0 && pos.dy < 12 && pos.fundo, `junto da linha, com o zoom de 110 % (${pos.dx.toFixed(1)}, ${pos.dy.toFixed(1)} px)`);
    const rol = await pg.evaluate(() => { const l = document.querySelector("#ctl-pick .lista"), r = l.querySelector("label").offsetHeight; return { linhas: l.clientHeight / r, rola: l.scrollHeight > l.clientHeight + 2 }; });
    ok(rol.linhas > 5 && rol.linhas < 6.2 && rol.rola, `a lista mostra ${rol.linhas.toFixed(1)} linhas e rola o resto (12 medidas)`);
    // 2. filtrar e marcar os filtrados (um guardar só)
    await pg.fill("#ctl-pick .filtro", "s1"); await pg.waitForTimeout(200);
    p = await pk();
    ok(p.itens.join() === "s10,s11,s12", `filtro "s1": ${p.itens.join(", ")}`);
    const posts = []; pg.on("request", (r) => { if (r.method() === "POST" && /editor\/controle$/.test(r.url())) posts.push(1); });
    await pg.click('#ctl-pick [data-pk-tudo="1"]'); await pg.waitForTimeout(1500);
    let c = await cfg();
    ok(c.dsp_a.medidas.slice().sort().join() === "s05,s10,s11,s12" && posts.length === 1, `marcar os filtrados: dsp_a lê ${c.dsp_a.medidas.join(", ")} (${posts.length} gravação)`);
    // 3. desmarcar um; a telinha continua aberta e com o filtro
    await pg.uncheck('#ctl-pick [data-pk="s11"]'); await pg.waitForTimeout(1500);
    c = await cfg(); p = await pk();
    ok(!c.dsp_a.medidas.includes("s11") && p && p.itens.join() === "s10✓,s11,s12✓" && await pg.inputValue("#ctl-pick .filtro") === "s1", `desmarcar s11: guardado; a telinha segue aberta, com o filtro (${p && p.itens.join(", ")})`);
    // 4. o resumo curto no cartão
    const res = await pg.evaluate((s) => document.querySelector(s).innerText, sum("dsp_a", "le"));
    ok(/lê s05, s10, s12$/.test(res) || /lê .+ \+\d+$/.test(res), `o resumo: "${res}"`);
    // 5. Esc fecha
    await pg.press("#ctl-pick .filtro", "Escape"); await pg.waitForTimeout(200);
    ok(!(await pk()), "Esc fecha a telinha");
    // 6. "escreve" do dsp_b: s01 é do dsp_a; marcar tira de lá
    await pg.click(sum("dsp_b", "esc")); await pg.waitForTimeout(300);
    p = await pk();
    ok(p.itens.join() === "s01 (de dsp_a),s02✓,s03", `escreve do dsp_b: ${p.itens.join(", ")}`);
    await pg.check('#ctl-pick [data-pk="s01"]'); await pg.waitForTimeout(1500);
    c = await cfg();
    ok(c.dsp_b.atuacoes.slice().sort().join() === "s01,s02" && !c.dsp_a.atuacoes.includes("s01"), `marcar s01 no dsp_b: tira do dsp_a (dsp_a ${c.dsp_a.atuacoes.join(",") || "nada"}, dsp_b ${c.dsp_b.atuacoes.join(",")})`);
    // 7. clique fora fecha; clicar no .py abre o código
    const fora = await pg.evaluate(() => { const r = $("ctl-editor").getBoundingClientRect(), k = $("ctl-pick").getBoundingClientRect(); return [Math.max(r.left + 20, k.right + 40), r.bottom - 40]; });
    await pg.mouse.click(...fora); await pg.waitForTimeout(200);
    ok(!(await pk()), "clique fora fecha a telinha");
    await pg.click('#ctl-ctls .ctl-no[data-abre="dsp_b.py"] .nome'); await pg.waitForTimeout(300);
    ok(await pg.evaluate(() => ctl.arq) === "dsp_b.py", "clicar no dsp_b.py abre o código");
    await pg.evaluate(async () => { localStorage.removeItem("maisim-escala"); await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
