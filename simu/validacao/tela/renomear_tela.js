// um sinal que o controle usa muda de nome, pela tela (instância de teste 5010 → 8768), pedido de Marcelo em 19/10
// ("quando a gente muda uma variável de nome e ela está sendo usada em algum código, tem como mudar todos os lugares? ou
// pelo menos alertar num modal e confirmar"): o rótulo da saída do CONST mudado no painel → o modal diz de → para e onde;
// "renomear no controle também" troca no código aberto no editor e nas atuações; "desfazer a mudança" volta o circuito;
// "deixar como está" avisa que o controle ficou com o nome antigo
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const COD = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    # u1: a chave\n    v = m["v_med"]\n    return {"u1": v}\n';
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1700, height: 1000 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-ctl-vista", "arq"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:5010/pew/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async (cod) => {
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      const c = (op, args) => api("editor/cmd", { op, args });
      await c("CREATE", ["C1", 10, 5, "CONST"]); await c("OUTNODE", ["C1", 0, "u1"]); await c("CREATE", ["C2", 20, 5, "CONST"]); await c("OUTNODE", ["C2", 0, "v_med"]);
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: ["u1"], parametros: [], acionamentos: [], codigo: cod, arquivos: {},
        controladores: [{ nome: "controle", arquivo: "controle.py", todas: false, medidas: ["v_med"], atuacoes: ["u1"], subcircuitos: [] }] } });
      novoEstado(await api("editor/estado")); await recarregaControle(); mostraDoca("controle"); }, COD);
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(800);
    const muda = async (valor) => { await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "C1"))); await pg.waitForTimeout(400);
      await pg.evaluate((v) => { const i = document.querySelector('#props [data-out="0"]'); i.value = v; i.dispatchEvent(new Event("change")); }, valor);
      await pg.waitForSelector(".modal", { timeout: 15000 }).catch(() => null); await pg.waitForTimeout(300); };
    const md = () => pg.evaluate(() => { const m = document.querySelector(".modal"); return m && { t: m.querySelector("h3").textContent, txt: m.innerText }; });
    const saida = () => pg.evaluate(() => dados.folhas["0"].elementos.find((x) => x.nome === "C1").saidas[0]);
    // 1. renomear no controle também
    await muda("u_novo");
    let m = await md();
    ok(m && /O controle usa o nome antigo/.test(m.t) && /u1 → u_novo/.test(m.txt) && /controle\.py:8, atuações/.test(m.txt),
      `o modal: "${m && m.t}" — ${m && m.txt.split("\n").filter((l) => /→|controle\.py/.test(l)).join(" | ")}`);
    await pg.click(".modal .m-ok"); await pg.waitForTimeout(2500);
    const est = await pg.evaluate(() => ({ cod: ctl.modelos["controle.py"].getValue(), atu: ctl.dados.controle.atuacoes, msg: $("msg").textContent,
      avisos: ctl.dados.erros_controladores || [] }));
    ok(/return \{"u_novo": v\}/.test(est.cod) && /# u1: a chave/.test(est.cod) && est.atu.join() === "u_novo" && !est.avisos.length && /renomeado no controle: u1 → u_novo/.test(est.msg),
      `"renomear no controle também": no editor de código e nas atuações marcadas (${est.atu}); o comentário fica; "${est.msg}"`);
    // 2. desfazer a mudança
    await muda("u3");
    ok(!!(await md()), "renomear de novo (u_novo → u3): o modal");
    await pg.click('.modal .m-extra'); await pg.waitForTimeout(2500);
    ok(await saida() === "u_novo" && !(await md()), `"desfazer a mudança": o CONST volta a u_novo (${await saida()}), sem outro modal`);
    // 3. deixar como está
    await muda("u4");
    await pg.click(".modal .m-cancela"); await pg.waitForTimeout(1500);
    const fim = await pg.evaluate(() => ({ cod: ctl.modelos["controle.py"].getValue(), msg: $("msg").textContent }));
    ok(await saida() === "u4" && /"u_novo"/.test(fim.cod) && /o controle ficou com o nome antigo \(u_novo\)/.test(fim.msg), `"deixar como está": o circuito com u4, o código com u_novo; "${fim.msg}"`);
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
