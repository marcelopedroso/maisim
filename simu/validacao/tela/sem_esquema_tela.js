// a variável do código que não existe no esquema, pela tela (instância de teste 7200 → 7201), pedido de Marcelo em 19/10
// ("tem que ser algo tipo variável do código não existe no esquema"; "quando tiver uma variável no código que não existe,
// ter uma lista para tentar colocar outra"): o aviso com o arquivo:linha (clicar abre o código ali); "trocar por…" abre a
// lista do que existe, o mais parecido primeiro, com filtro; Enter troca no código (o editor acompanha) e o aviso sai;
// o cartão segue o código (o nome que sumiu do esquema sai dele sozinho)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const ORQ = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {}\n';
const DSP = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    x = m["vc_smap_1"]\n    return {"SM_ap_1_S": x}\n';
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1900, height: 1000 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-ctl-vista", "arq"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async ([orq, dsp]) => {
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      const c = (op, args) => api("editor/cmd", { op, args });
      for (const [k, [n, r]] of [["S", "SM_ap_1_S"], ["V1", "SM_ap_1_vCSm"], ["V2", "SM_an_1_vCSm"], ["V3", "Va"]].entries()) { await c("CREATE", [n, 10 + 8 * k, 5, "CONST"]); await c("OUTNODE", [n, 0, r]); }
      const q = (nome, arquivo, medidas, atuacoes, todas = false) => ({ nome, arquivo, todas, medidas, atuacoes, subcircuitos: [] });
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: ["sm_ap_1_s"], parametros: [], acionamentos: [], codigo: orq, arquivos: { "sm_ap_1.py": dsp },
        controladores: [q("controle", "controle.py", [], [], true), q("sm_ap_1", "sm_ap_1.py", ["vc_smap_1"], ["sm_ap_1_s"])] } });
      novoEstado(await api("editor/estado")); await recarregaControle(); mostraDoca("controle"); }, [ORQ, DSP]);
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(800);
    const av = () => pg.evaluate(() => [...document.querySelectorAll("#ctl-avisos .ctl-sem")].map((x) => x.innerText.replace(/\s+/g, " ").trim()));
    let a = await av();
    const card = await pg.evaluate(() => { const q = ctl.dados.controle.controladores.find((x) => x.nome === "sm_ap_1"); return { le: q.medidas, esc: q.atuacoes, todos: (ctl.dados.avisos || []).join(" | ") }; });
    ok(a.length === 1 && /a variável vc_smap_1 do código \(sm_ap_1\.py:6\) não existe no esquema/.test(a[0]) && !/sm_ap_1_s|lê vc_smap_1/.test(card.todos),
      `o aviso: "${a[0]}"; sem os avisos de cartão`);
    ok(card.le.join() === "" && card.esc.join() === "SM_ap_1_S", `o cartão segue o código: lê ${card.le.join() || "nada"} (vc_smap_1 saiu), escreve ${card.esc} (sm_ap_1_s saiu, SM_ap_1_S entrou)`);
    // clicar no arquivo:linha abre o código ali
    await pg.click("#ctl-avisos .ctl-sem a"); await pg.waitForTimeout(500);
    const pos = await pg.evaluate(() => ({ arq: ctl.arq, linha: ctl.editor.getPosition().lineNumber }));
    ok(pos.arq === "sm_ap_1.py" && pos.linha === 6, `clicar em sm_ap_1.py:6 abre o código ali (${pos.arq}:${pos.linha})`);
    // trocar por…
    await pg.click("#ctl-avisos .ctl-sem [data-troca]"); await pg.waitForSelector(".modal .m-lista", { timeout: 10000 }); await pg.waitForTimeout(300);
    const lst = await pg.evaluate(() => [...document.querySelectorAll(".modal .m-lista label")].map((l) => l.innerText.trim()));
    ok(lst[0] === "SM_ap_1_vCSm" && lst.length === 4 && await pg.evaluate(() => document.activeElement.classList.contains("m-filtro")),
      `a lista do que existe, o mais parecido primeiro: ${lst.join(", ")} (o foco no filtro)`);
    await pg.fill(".modal .m-filtro", "an_1"); await pg.waitForTimeout(200);
    const vis = await pg.evaluate(() => [...document.querySelectorAll(".modal .m-lista label:not([hidden])")].map((l) => l.innerText.trim() + (l.querySelector("input").checked ? "✓" : "")));
    ok(vis.join() === "SM_an_1_vCSm✓", `filtro "an_1": ${vis.join(", ")}`);
    await pg.fill(".modal .m-filtro", "ap_1_v"); await pg.waitForTimeout(200);
    await pg.press(".modal .m-filtro", "Enter"); await pg.waitForTimeout(2500);
    const fim = await pg.evaluate(() => ({ cod: ctl.modelos["sm_ap_1.py"].getValue(), le: ctl.dados.controle.controladores.find((x) => x.nome === "sm_ap_1").medidas,
      modal: !!document.querySelector(".modal"), estado: $("ctl-estado").textContent }));
    a = await av();
    ok(!fim.modal && /m\["SM_ap_1_vCSm"\]/.test(fim.cod) && !a.length && fim.le.join() === "SM_ap_1_vCSm",
      `Enter: trocado no código (o editor acompanha), o aviso sai, o cartão lê ${fim.le}; "${fim.estado}"`);
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
