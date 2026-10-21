// subcircuito criado do zero pela tela (instância de teste 7200 → 7201): pôr o bloco (aba Subcircuit), entrar nele vazio
// (duplo clique; antes, a folha de um SM vazio não existia e não dava para entrar), pôr dois terminais e um resistor,
// rotular os bornes de fora, ligar uma fonte e simular: a corrente tem de ser V/R. Depois, salvar na biblioteca.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const B = "http://localhost:7200/maisim/simu/";
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    const api = (rota, corpo) => pg.evaluate(([r, c]) => fetch(r, c ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) } : {}).then((x) => x.json()), [rota, corpo]);
    await pg.goto(B); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    await pg.click("#bt-editar"); await pg.waitForTimeout(600); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-extra, .modal .m-ok"); await pg.waitForTimeout(800); }
    await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
    // folha em branco, como o botão "novo" (entrar na edição abre no editor o circuito que a tela mostrava)
    const nv = await api("editor/novo", { modo: "descartar" });
    await pg.evaluate((j) => { ed.novo = "sub_novo"; dados = Object.assign(j, { arq: "sub_novo" }); folhaAtual = "0"; seleciona(null); novoEstado(j); }, nv);
    ok(await pg.evaluate(() => dados.folhas["0"].elementos.length === 0), "folha em branco");
    // clica na folha no ponto (x, y) da grade
    const clicaGrade = async (x, y) => { const p = await pg.evaluate(([gx, gy]) => { const s = $("svg"), m = s.getScreenCTM(), pt = s.createSVGPoint();
      pt.x = gx * G; pt.y = gy * G; const q = pt.matrixTransform(m); return [q.x, q.y]; }, [x, y]); await pg.mouse.click(p[0], p[1]); await pg.waitForTimeout(900); };
    const poe = async (id, x, y) => { await pg.click(`#itens .item[data-id="${id}"]`); await clicaGrade(x, y); };
    await pg.click('#abas button:text-is("Subcircuit")'); await pg.waitForTimeout(300);
    await poe("SUBCIRCUIT", 20, 10);
    const sm = await pg.evaluate(() => { const l = dados.folhas["0"].elementos.filter((x) => x.tipo === "SUBCIRCUIT"), e = l[0];
      return e && l.length === 1 && { nome: e.nome, uid: e.uid, folha: !!dados.folhas[e.uid] }; });
    ok(sm && sm.nome === "SUBCIRCUIT.1" && sm.folha, `bloco posto (${sm && sm.nome}), com a folha de dentro mesmo vazio`);
    // entrar com duplo clique
    const el = await pg.evaluateHandle(() => document.querySelector(`#svg .el[data-i="${dados.folhas["0"].elementos.findIndex((x) => x.tipo === "SUBCIRCUIT")}"]`));
    await el.dblclick(); await pg.waitForTimeout(600);
    ok(await pg.evaluate((u) => folhaAtual === u && /Sub\.1/.test($("trilha").textContent), sm.uid), "duplo clique: entra no subcircuito vazio (trilha Main › Sub.1)");
    await pg.click('#abas button:text-is("Subcircuit")'); await pg.waitForTimeout(200);
    await poe("CIRCUIT_TERMINAL", 3, 6); await poe("CIRCUIT_TERMINAL", 3, 14);
    await pg.click('#abas button:text-is("Circuit")'); await pg.waitForTimeout(200);
    await poe("R", 15, 10);
    const dentro = await pg.evaluate(() => dados.folhas[folhaAtual].elementos.map((x) => `${x.nome}:${x.tipo}`));
    ok(dentro.length === 3 && dentro.filter((x) => x.endsWith(":TERM")).length === 2 && dentro.some((x) => x.endsWith(":R")), `dentro: ${dentro.join(", ")}`);
    // ligações dentro (rótulos) e de fora (bornes), como pelo painel de propriedades
    const [t1, t2] = dentro.filter((x) => x.endsWith(":TERM")).map((x) => x.split(":")[0]);
    const r = dentro.find((x) => x.endsWith(":R")).split(":")[0];
    for (const [op, args] of [["INNODE", [`SUBCIRCUIT.1#${t1}`, 0, "a"]], ["INNODE", [`SUBCIRCUIT.1#${t2}`, 0, "b"]], ["INNODE", [`SUBCIRCUIT.1#${r}`, 0, "a"]],
      ["OUTNODE", [`SUBCIRCUIT.1#${r}`, 0, "b"]], ["SETP", [`SUBCIRCUIT.1#${r}`, "R", 10.0]]]) await api("editor/cmd", { op, args });
    await pg.evaluate((j) => novoEstado(j), await api("editor/estado"));   // como a tela faz depois de cada mudança
    await pg.click("#volta"); await pg.waitForTimeout(600);
    await pg.screenshot({ path: "sub_novo_main.png" });
    const bornes = await pg.evaluate(() => dados.folhas["0"].elementos.find((x) => x.tipo === "SUBCIRCUIT").terminais.map((t) => t.interno));
    ok(bornes.length === 2, `de volta ao Main: o bloco tem 2 bornes (${bornes.join(", ")})`);
    for (const [op, args] of [["INNODE", ["SUBCIRCUIT.1", 0, "x"]], ["INNODE", ["SUBCIRCUIT.1", 1, "gnd"]], ["CREATE", ["U.1", 5, 10, "U"]], ["SETP", ["U.1", "uDC", 100.0]],
      ["INNODE", ["U.1", 0, "x"]], ["OUTNODE", ["U.1", 0, "gnd"]], ["CREATE", ["AMP.1", 30, 20, "AMP"]]]) await api("editor/cmd", { op, args });
    await api("editor/mede", { nome: "AMP.1", tipo: "I", componente: "U.1" }); await api("editor/cmd", { op: "OUTNODE", args: ["AMP.1", 0, "i_U"] });
    let j = await api("editor/rodar", { dt: "1e-06", tfim: "0.001", nome: "sub_novo_tela", amostras: "1000" });
    for (let k = 0; k < 120 && ["rodando", "pausada", "preparando"].includes(j.estado); k++) { await pg.waitForTimeout(500); j = await api("editor/rodada"); }
    const i = require("child_process").execFileSync("python3", ["-c", `import numpy as np; d=np.load(${JSON.stringify(j.arquivo || "")}); i=d["i_U"]; print(float(np.mean(i[len(i)//2:])))`]).toString().trim();
    ok(j.estado === "fim" && Math.abs(Math.abs(+i) - 10) < 1e-6, `simulado: |i| = ${Math.abs(+i).toFixed(6)} A (100 V / 10 Ω = 10 A)`);
    // nomes de dentro levam o nome do subcircuito (não "SM": subcircuito é qualquer coisa): Sub_1_… e, renomeado, filtro_…
    await api("editor/cmd", { op: "CREATE", args: ["SUBCIRCUIT.1#VOLT.1", 25, 10, "VOLT"] });
    await api("editor/mede", { nome: "VOLT.1", tipo: "V", no1: "a", no2: "b", folhas: [sm.uid] });
    await api("editor/cmd", { op: "OUTNODE", args: ["SUBCIRCUIT.1#VOLT.1", 0, "v_R"] });
    const ent1 = (await api("editor/controle")).entradas;
    await pg.evaluate((j) => novoEstado(j), await api("editor/estado"));
    const rot1 = await pg.evaluate(() => [...document.querySelectorAll("#svg text")].map((t) => t.textContent).filter((t) => /^(Sub|SM)\.\d/.test(t)));
    ok(ent1.includes("Sub_1_v_R") && !ent1.some((x) => /^SM_/.test(x)) && rot1.includes("Sub.1") && !rot1.some((t) => /^SM/.test(t)),
      `padrão do Gecko: o bloco aparece como ${rot1.join(", ")} e o medidor de dentro é ${ent1.filter((x) => /v_R/.test(x)).join(", ")}`);
    await api("editor/cmd", { op: "RENAME", args: ["SUBCIRCUIT.1", "filtro"] });
    const ent2 = (await api("editor/controle")).entradas;
    await pg.evaluate((j) => novoEstado(j), await api("editor/estado"));
    const rot2 = await pg.evaluate(() => [...document.querySelectorAll("#svg text")].some((t) => t.textContent === "filtro"));
    ok(ent2.includes("filtro_v_R") && rot2, `renomeado para filtro: o bloco mostra "filtro" e o medidor vira ${ent2.filter((x) => /v_R/.test(x)).join(", ")}`);
    await api("editor/cmd", { op: "RENAME", args: ["filtro", "SUBCIRCUIT.1"] });
    // salvar na biblioteca (o subcircuito novo vira reutilizável)
    const lib = await api("editor/biblioteca", { acao: "salvar", nome: "SUBCIRCUIT.1", nome_lib: "teste_sub_novo", sobrescrever: true });
    ok(!lib.erro, `salvo na biblioteca: ${lib.erro || "ok"}`);
    require("fs").rmSync(require("path").join(require("os").homedir(), ".cache/maisim_teste/subcircuitos/teste_sub_novo.ipes"), { force: true });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
