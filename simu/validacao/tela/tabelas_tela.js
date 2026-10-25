// variáveis em tabelas (instância de teste 7200 → 7201), pedido de Marcelo em 19/10: "a barra com atuações, medidas,
// parâmetros e acionamentos vai ficar ruim com muita coisa… mesma dinâmica dos arquivos". A coluna "variáveis" é o índice
// (com quanto tem e os ⚠); a tabela aparece no lugar do código, sem aba ("nem precisa abrir nas abas"): um arquivo, o
// item de novo ou o ✕ voltam ao código; "No código" leva à linha; ordenar e filtrar só mudam a vista (a ordem guardada é
// a do painel); a tabela à vista fica ao recarregar. E a etiqueta do atuador fica em cima do bloco CONST (Marcelo: na
// saída ela cobria o que se liga ali)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const S = process.argv[2];
const COD = 'import leitura\nimport escrita\n\n\ndef iniciar(p, e):\n    e["leitura"], e["escrita"] = leitura.iniciar(p), escrita.iniciar(p)\n    e["integral"] = 0.0\n\n\n' +
  'def passo(t, m, p, e):\n    x = leitura.passo(m, p, e["leitura"])\n    erro = p["i_ref"] - x["i_L"]   # p["nao_usado"] num comentário não conta\n    e["integral"] += erro * p["Ts"]\n' +
  '    u = {"u_ctrl": p["Kp"] * erro + p["Ki"] * e["integral"]}\n    return escrita.passo(u, p, e["escrita"])\n';
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1900, height: 950 } });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("ja")) { localStorage.removeItem("maisim-simu-ctl-tabelas"); localStorage.setItem("maisim-simu-ctl-vista", "var"); sessionStorage.setItem("ja", "1"); } } catch (e) { /* ok */ } });
    const pg = await ctx.newPage(); const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    const entra = async () => { await pg.goto("http://localhost:7200/maisim/simu/");
      for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); } };
    await entra();
    await pg.evaluate(async (cod) => {                  // RL com fonte controlada pelo CONST u_ctrl, i_L medida; o controle em módulos
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      const c = (op, args) => api("editor/cmd", { op, args });
      for (const a of [["U.1", 10, 10, "U"], ["R.1", 20, 10, "R"], ["L.1", 30, 10, "L"], ["CONST.1", 40, 6, "CONST"], ["AMP.1", 40, 12, "AMP"]]) await c("CREATE", a);
      for (const [n, i, o] of [["U.1", "a", "gnd"], ["R.1", "a", "b"], ["L.1", "b", "gnd"]]) { await c("INNODE", [n, 0, i]); await c("OUTNODE", [n, 0, o]); }
      await c("OUTNODE", ["CONST.1", 0, "u_ctrl"]); await api("editor/fonte_sinal", { nome: "U.1", sinal: "u_ctrl" });
      await c("OUTNODE", ["AMP.1", 0, "i_L"]); await api("editor/mede", { nome: "AMP.1", tipo: "I", componente: "L.1" });
      const r0 = await api("editor/controle");
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: [], codigo: cod, arquivos: r0.controle.arquivos, controladores: [],
        parametros: [{ nome: "Kp", valor: 62.8, unidade: "V/A" }, { nome: "Ki", valor: 1256, unidade: "V/(A·s)" }, { nome: "i_ref", valor: 5, unidade: "A" }, { nome: "nao_usado", valor: 3, unidade: "" }],
        acionamentos: [{ t: 0.005, alvo: "p:i_ref", valor: 8 }, { t: 0.002, alvo: "CONST:u_ctrl", valor: 0 }] } });
      novoEstado(await api("editor/estado")); await recarregaControle(); mostraDoca("controle"); }, COD);
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(800);
    const cfg = () => pg.evaluate(() => api("editor/controle").then((r) => r.controle));
    const vista = () => pg.evaluate(() => ({ editor: $("ctl-editor").offsetParent !== null, tabela: $("ctl-tabela").hidden ? null : ctl.tabela,
      abas: [...document.querySelectorAll("#ctl-abas .aba[data-tabela]")].length, arq: (document.querySelector("#ctl-abas .aba.ativa[data-arq]") || {}).dataset?.arq || "",
      indice: Object.fromEntries([...document.querySelectorAll("#ctl-var-lista .ctl-vi")].map((x) => [x.dataset.tabela, x.querySelector(".n").textContent])) }));
    // 1. o índice
    let v = await vista();
    ok(v.editor && !v.tabela && JSON.stringify(v.indice) === '{"ent":"2","par":"4","atu":"⚠ 0/1","ac":"2"}',
      `índice na coluna: ${JSON.stringify(v.indice)} (⚠: o código escreve u_ctrl, não marcada; medidas: i_L e a saída do CONST); o código à vista`);
    // 2. parâmetros: abre numa aba, no lugar do código; onde é usado
    await pg.click('#ctl-var-lista [data-tabela="par"]'); await pg.waitForTimeout(400);
    v = await vista();
    const linhasPar = () => pg.evaluate(() => [...document.querySelectorAll("#ctl-par .ctl-par")].filter((r) => r.style.display !== "none")
      .map((r) => `${r.querySelector('[data-k="nome"]').value}=${r.querySelector('[data-k="valor"]').value}:${r.querySelector(".ct-uso, td:nth-child(4)").textContent.trim()}`));
    let lp = await linhasPar();
    ok(!v.editor && v.tabela === "par" && v.abas === 0 && !v.arq, `parâmetros: a tabela fica no lugar do código, sem aba nova (nenhum arquivo ativo: "${v.arq}")`);
    ok(lp.join(" | ") === "Kp=62.8:controle.py:14 | Ki=1256:controle.py:14 | i_ref=5:controle.py:12 | nao_usado=3:sem uso",
      `onde é usado: ${lp.join(" | ")} (o p["nao_usado"] do comentário não conta)`);
    if (S) await pg.screenshot({ path: S + "/tabelas_par.png" });
    // 3. editar na tabela grava
    await pg.fill('#ctl-par .ctl-par[data-i="0"] [data-k="valor"]', "70"); await pg.press('#ctl-par .ctl-par[data-i="0"] [data-k="valor"]', "Tab"); await pg.waitForTimeout(1200);
    let c = await cfg();
    ok(c.parametros[0].nome === "Kp" && c.parametros[0].valor === 70, `Kp = 70 na tabela: gravado (${c.parametros.map((q) => `${q.nome}=${q.valor}`).join(", ")})`);
    // 4. ordenar por valor (decrescente) muda a vista, não a ordem guardada
    await pg.click('table[data-t="par"] th[data-col="valor"]'); await pg.waitForTimeout(300);
    await pg.click('table[data-t="par"] th[data-col="valor"]'); await pg.waitForTimeout(300);
    lp = await linhasPar();
    await pg.fill('#ctl-par .ctl-par[data-i="2"] [data-k="valor"]', "6"); await pg.press('#ctl-par .ctl-par[data-i="2"] [data-k="valor"]', "Tab"); await pg.waitForTimeout(1200);
    c = await cfg();
    ok(lp.map((x) => x.split("=")[0]).join() === "Ki,Kp,i_ref,nao_usado" && c.parametros.map((q) => q.nome).join() === "Kp,Ki,i_ref,nao_usado" && c.parametros[2].valor === 6,
      `valor ▼: a vista fica ${lp.map((x) => x.split("=")[0]).join(", ")}; a ordem guardada continua ${c.parametros.map((q) => q.nome).join(", ")} (e i_ref = 6 foi para o lugar certo)`);
    // 5. filtrar
    await pg.fill("#ct-filtro", "k"); await pg.waitForTimeout(200);
    lp = await linhasPar();
    ok(lp.map((x) => x.split("=")[0]).join() === "Ki,Kp", `filtro "k": ${lp.map((x) => x.split("=")[0]).join(", ")}`);
    await pg.fill("#ct-filtro", ""); await pg.waitForTimeout(200);
    // 6. clicar no "onde é usado" leva ao código, na linha
    await pg.click('#ctl-par .ctl-par[data-i="2"] [data-vai]'); await pg.waitForTimeout(500);
    v = await vista(); const pos = await pg.evaluate(() => ({ arq: ctl.arq, linha: ctl.editor.getPosition().lineNumber }));
    ok(v.editor && !v.tabela && v.arq === "controle.py" && pos.arq === "controle.py" && pos.linha === 12, `i_ref → controle.py, linha ${pos.linha}: o código à vista, a aba ${v.arq} ativa`);
    // 7. atuações: marcar na tabela; o alerta some
    await pg.click('#ctl-var-lista [data-tabela="atu"]'); await pg.waitForTimeout(400);
    const linha = (tr) => [...tr.cells].filter((td) => td.getClientRects().length).map((td) => td.innerText.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");   // só as células à vista
    const atu = await pg.evaluate((f) => [...document.querySelectorAll("#ctl-atu .ctl-item")].map(eval(f)), linha.toString());
    ok(atu.length === 1 && /u_ctrl CONST\.1 → fonte U\.1.* controle\.py:14 t = 0\.002 s → 0$/.test(atu[0]), `atuações: ${atu[0]}`);
    await pg.check('#ctl-atu [data-atu="u_ctrl"]'); await pg.waitForTimeout(1500);
    c = await cfg(); v = await vista();
    ok(c.atuacoes.join() === "u_ctrl" && v.indice.atu === "1/1" && v.indice.ac === "⚠ 2", `marcada na tabela: gravada (${c.atuacoes}); o índice mostra ${v.indice.atu}, sem ⚠; e acionamentos ${v.indice.ac} (um cai num CONST que o código escreve)`);
    // 8. a etiqueta do atuador em cima do bloco CONST (não na saída)
    const tag = await pg.evaluate(() => { const t = document.querySelector("#svg .tag-atuador").getBBox(), m = document.querySelector("#svg .tag-atuador").transform.baseVal.consolidate().matrix;
      const e = dados.folhas["0"].elementos.find((x) => x.nome === "CONST.1"), s = e.terminais.find((q) => q.lado === "s");
      return { x0: (m.e + t.x) / G, x1: (m.e + t.x + t.width) / G, y1: (m.f + t.y + t.height) / G, bx: e.x, by: e.y, sx: s.x }; });
    ok(tag.y1 <= tag.by - 0.5 + 0.01 && Math.abs((tag.x0 + tag.x1) / 2 - tag.bx) < 0.05 && tag.x1 < tag.sx,
      `etiqueta ⚙ u_ctrl em cima do CONST: de x ${tag.x0.toFixed(2)} a ${tag.x1.toFixed(2)} (meio no bloco, x = ${tag.bx}), embaixo em y ${tag.y1.toFixed(2)} (topo do bloco ${tag.by - 0.5}); a saída (x = ${tag.sx}) fica livre`);
    // 9. medidas: o nome numa lista de nomes conta ("Va", "Vb"…, o leitura.py do Marcelo); a chave do dicionário de saída, não
    await pg.click('#ctl-var-lista [data-tabela="ent"]'); await pg.waitForTimeout(400);
    const med = await pg.evaluate((f) => [...document.querySelectorAll("#ctl-ent tr")].map(eval(f)), linha.toString());
    ok(med.length === 2 && med.includes("iL i_L controle.py:12") && med.includes("uctrl u_ctrl sem uso") && !(await pg.$("#ctl-ent [data-ins]")),
      `medidas: ${med.join(" | ")} (um controlador só: sem a coluna do controlador; sem o ↳; o nome em notação e o do código ao lado)`);
    // 9b. a notação nas tabelas (como no desenho e no scope): i_L → i itálico com o L subscrito; o nome do código ao lado, em
    // monoespaçada; o filtro casa o nome do código (i_l), não o desenhado (il)
    const nota = (sel) => pg.evaluate((s) => [...document.querySelectorAll(s)].filter((r) => r.style.display !== "none").map((r) => {
      const m = r.querySelector(".ct-mat"), l = m && m.querySelector(".mat-l, .mat-b"), sub = m && m.querySelector("sub"), cod = r.querySelector("code.ct-cod, input[data-k=nome]");
      return `${l ? l.textContent : "?"}|${sub ? sub.textContent : "?"}|${cod ? cod.value || cod.textContent : "?"}`; }), sel);
    const nMed = await nota("#ctl-ent tr");
    await pg.fill("#ct-filtro", "i_l"); await pg.waitForTimeout(200); const fMed = await nota("#ctl-ent tr");
    await pg.fill("#ct-filtro", "il"); await pg.waitForTimeout(200); const fMed2 = await nota("#ctl-ent tr");
    await pg.fill("#ct-filtro", ""); await pg.waitForTimeout(200);
    await pg.evaluate(() => mostraTabela("par")); await pg.waitForTimeout(300); const nPar = await nota("#ctl-par .ctl-par");
    await pg.evaluate(() => mostraTabela("atu")); await pg.waitForTimeout(300); const nAtu = await nota("#ctl-atu .ctl-item");
    await pg.evaluate(() => mostraTabela("diag")); await pg.waitForTimeout(500);
    const dAtu = await pg.evaluate(() => [...document.querySelectorAll("#ctl-diag-svg .atu text:not(.dest)")].map((t) => `${t.dataset.txt}:${[...t.querySelectorAll("tspan")].map((x) => x.textContent).join("|")}`));
    ok(nMed.slice().sort().join() === "i|L|i_L,u|ctrl|u_ctrl" && fMed.join() === "i|L|i_L" && !fMed2.length && nPar.includes("i|ref|i_ref") && nAtu.join() === "u|ctrl|u_ctrl"
       && dAtu.join() === "u_ctrl:u|ctrl|\u200b",
      `notação: medidas ${nMed.join(", ")}; filtro "i_l" ${fMed.join()} e "il" ${fMed2.length} linhas; parâmetro ${nPar.find((x) => /ref/.test(x))}; atuação ${nAtu}; no diagrama ${dAtu.join().replace("\u200b", "")} (o nome do código no data-txt)`);
    // 10. acionamentos: + e ×; ordenar por t
    await pg.click('#ctl-var-lista [data-tabela="ac"]'); await pg.waitForTimeout(400);
    await pg.click('table[data-t="ac"] th[data-col="t"]'); await pg.waitForTimeout(300);
    const ac = await pg.evaluate(() => [...document.querySelectorAll("#ctl-ac .ctl-ac")].map((r) => r.querySelector('[data-k="t"]').value));
    const obs = await pg.evaluate(() => [...document.querySelectorAll("#ctl-ac .ctl-ac")].map((r) => r.cells[3].innerText));
    ok(/^⚠ o código também escreve/.test(obs[0]) && /^o parâmetro muda/.test(obs[1]), `observação: ${obs.map((x) => x.slice(0, 50)).join(" | ")}`);
    await pg.click("#ctl-ac-novo"); await pg.waitForTimeout(1200);
    let n = (await cfg()).acionamentos.length;
    await pg.evaluate(() => [...document.querySelectorAll("#ctl-ac .ctl-ac")].find((r) => r.querySelector('[data-k="t"]').value === "0").querySelector("[data-rm-ac]").click()); await pg.waitForTimeout(1200);
    c = await cfg();
    ok(ac.join() === "0.002,0.005" && n === 3 && c.acionamentos.length === 2 && c.acionamentos.map((q) => q.t).join() === "0.002,0.005",
      `acionamentos: t ▲ mostra ${ac.join(", ")}; + dá 3; o × do novo volta a 2 (${c.acionamentos.map((q) => q.t).join(", ")}: o servidor guarda por t)`);
    // 11. voltar ao código: o item de novo, o ✕ da tabela, um arquivo; a tabela à vista fica ao recarregar
    await pg.click('#ctl-var-lista [data-tabela="ac"]'); await pg.waitForTimeout(300);
    const v1 = await vista();
    await pg.click('#ctl-var-lista [data-tabela="ent"]'); await pg.waitForTimeout(300); await pg.click("#ct-fecha"); await pg.waitForTimeout(300);
    const v2 = await vista();
    await pg.click('#ctl-var-lista [data-tabela="par"]'); await pg.waitForTimeout(300); await pg.click('#ctl-abas .aba[data-arq="leitura.py"]'); await pg.waitForTimeout(300);
    const v2b = await vista();
    ok(v1.editor && !v1.tabela && v2.editor && !v2.tabela && v2b.editor && !v2b.tabela && v2b.arq === "leitura.py" && v1.abas + v2.abas + v2b.abas === 0,
      `volta ao código: o item de novo (Acionamentos), o ✕ (Medidas) e um arquivo (leitura.py ativo); nenhuma aba de tabela`);
    await pg.click('#ctl-var-lista [data-tabela="ent"]'); await pg.waitForTimeout(300);
    await entra(); await pg.evaluate(() => mostraDoca("controle")); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(600);
    const v3 = await vista();
    ok(v3.tabela === "ent" && !v3.editor && v3.abas === 0, `recarregado: a tabela Medidas continua à vista`);
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
