// a tag (scope e controle) pela tela (instância de teste 7200 → 7201), no PI do exemplo (congelado em validacao/dados):
// pela paleta (Measure), ligada ao i_L pelo rótulo, com o nome "corrente": aparece no scope com esse nome e é igual ao i_L,
// é uma medida do controle (m["corrente"]); dentro de um subcircuito, ganha o prefixo dele (como os medidores)
const { chromium } = require("playwright");
const path = require("path");
const { execFileSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const PI = require("os").homedir() + "/.cache/maisim_teste/circuitos/exemplo_controle_pi.ipes";
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent(PI));
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {   // abre editando
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async (pi) => { novoEstado(await api("editor/abrir", { arq: pi, modo: "descartar" })); ajusta(); }, PI);
    const tela = (x, y) => pg.evaluate(([gx, gy]) => { const s = $("svg"), m = s.getScreenCTM(), pt = s.createSVGPoint(); pt.x = gx * G; pt.y = gy * G; const q = pt.matrixTransform(m); return [q.x, q.y]; }, [x, y]);
    const lim = await pg.evaluate(() => dados.folhas["0"].limites);
    const px = Math.round((lim[0] + lim[2]) / 2), py = lim[3] + 2;                     // embaixo do circuito, dentro da vista
    await pg.click('#abas button:text-is("Measure")'); await pg.waitForTimeout(200);
    ok(await pg.isVisible('#itens .item[data-id="TAG"]'), "a tag está na paleta (Measure)");
    await pg.click('#itens .item[data-id="TAG"]'); const [x, y] = await tela(px, py); await pg.mouse.click(x, y); await pg.waitForTimeout(1500);
    let t = await pg.evaluate(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "TAG.1"); return e && { tipo: e.tipo, sai: e.saidas[0], sel: ed.sel }; });
    ok(t && t.tipo === "GAIN" && t.sai === "tag_1" && t.sel === "TAG.1", `posta: TAG.1 (um ganho 1 do Gecko), sinal tag_1, selecionada · "${await pg.textContent("#msg")}"`);
    // ligar ao i_L pelo rótulo e dar o nome "corrente", pelo painel
    await pg.waitForSelector('#props input[data-in="0"]');
    await pg.fill('#props input[data-in="0"]', "i_L"); await pg.press('#props input[data-in="0"]', "Tab"); await pg.waitForTimeout(1500);
    await pg.fill('#props input[data-out="0"]', "corrente"); await pg.press('#props input[data-out="0"]', "Tab"); await pg.waitForTimeout(1500);
    const vis = await pg.evaluate(() => { const i = dados.folhas["0"].elementos.findIndex((x) => x.nome === "TAG.1"); const g = document.querySelector(`#svg .el[data-i="${i}"]`);
      return { corpo: [...g.querySelectorAll("text")].map((x) => x.textContent), pilula: [...document.querySelectorAll("#svg text")].some((x) => x.textContent === "corrente"), painel: $("props").textContent,
        params: $("p-params").textContent }; });   /* o r0 só na área dos parâmetros: o painel inteiro tem "desfazer08:40" de manhã */
    ok(vis.corpo.includes("tag") && vis.pilula && /tag \(scope e controle\)/.test(vis.painel) && !/\br0\b/.test(vis.params), `no desenho, "tag" e a etiqueta do scope "corrente"; o painel não mostra o r0`);
    const pn = await pg.evaluate(() => api("editor/controle"));
    ok(pn.entradas.includes("corrente"), `é medida do controle: m["corrente"] (medidas: ${pn.entradas.join(", ")})`);
    // simular: a coluna "corrente" é o i_L
    const j = await pg.evaluate(async () => { let r = await api("editor/rodar", { dt: "1e-06", tfim: "0.005", nome: "tag_tela", amostras: "1000" });
      for (let k = 0; k < 120 && ["rodando", "pausada", "preparando"].includes(r.estado); k++) { await new Promise((ok) => setTimeout(ok, 300)); r = await api("editor/rodada"); } return r; });
    const cmp = j.estado === "fim" ? execFileSync("python3", ["-c", `import numpy as np, os; p=${JSON.stringify(j.arquivo)}; p=p if os.path.isabs(p) else os.path.join(${JSON.stringify(path.resolve(__dirname, "../../.."))}, p); d=np.load(p, allow_pickle=True); print(int(np.array_equal(d['corrente'], d['i_L'])), len(d['corrente']), float(np.max(np.abs(d['i_L']))))`]).toString().trim() : "0";
    ok(cmp.startsWith("1 "), `simulado: a coluna "corrente" no scope é igual ao i_L (iguais, amostras, |i_L| máx: ${cmp}) ${j.erro || ""}`);
    // dentro de um subcircuito: o prefixo dele (como os medidores)
    const r = await pg.evaluate(async () => { novoEstado(await api("editor/cmd", { op: "CREATE", args: ["SUBCIRCUIT.1", 70, 10, "SUBCIRCUIT"] }));
      novoEstado(await api("editor/cmds", { cmds: [{ op: "CREATE", args: ["SUBCIRCUIT.1#TAG.2", 10, 10, "GAIN"] }, { op: "OUTNODE", args: ["SUBCIRCUIT.1#TAG.2", 0, "vc"] }] }));
      return (await api("editor/controle")).entradas; });
    ok(r.includes("Sub_1_vc"), `uma tag dentro do subcircuito: Sub_1_vc (o prefixo dele, como nos medidores)`);
    // para onde vai o sinal: as duas caixinhas no painel (a tag de dentro do SM), "→ Scope" e "→ Controle"
    const uidSM = await pg.evaluate(() => dados.folhas["0"].elementos.find((x) => x.nome === "SUBCIRCUIT.1").uid);
    await pg.evaluate((u) => { abre(u); seleciona(dados.folhas[u].elementos.find((x) => x.nome === "TAG.2")); }, uidSM); await pg.waitForTimeout(500);
    const estadoTag = () => pg.evaluate(async () => ({ ent: (await api("editor/controle")).entradas, cls: (document.querySelector("#svg .tag-scope") || {}).className?.baseVal || "",
      dica: (document.querySelector("#svg .tag-scope title") || {}).textContent || "", cor: !!$("props").querySelector(".cor-canal"), msg: $("msg").textContent }));
    await pg.uncheck("#p-scope"); await pg.waitForTimeout(1500);
    let fo = await estadoTag();
    ok(fo.ent.includes("Sub_1_vc") && /so-controle/.test(fo.cls) && /só no controle/.test(fo.dica) && !fo.cor && /só no controle/.test(fo.msg),
      `só "→ Controle": Sub_1_vc continua nas medidas, a etiqueta fica tracejada ("${fo.dica}") e o painel sem a cor do canal (${fo.msg})`);
    await pg.uncheck("#p-controle"); await pg.waitForTimeout(1500);
    fo = await estadoTag();
    ok(!fo.ent.includes("Sub_1_vc") && / fora/.test(fo.cls) && /fora do scope/.test(fo.msg), `as duas desmarcadas: Sub_1_vc sai das medidas e a etiqueta fica apagada (${fo.msg})`);
    await pg.check("#p-scope"); await pg.waitForTimeout(1500);
    fo = await estadoTag();
    ok(!fo.ent.includes("Sub_1_vc") && /so-scope/.test(fo.cls) && fo.cor && /só no scope/.test(fo.msg), `só "→ Scope": fora das medidas, a etiqueta cheia e a cor do canal no painel (${fo.msg})`);
    await pg.check("#p-controle"); await pg.waitForTimeout(1500);
    ok((await pg.evaluate(async () => (await api("editor/controle")).entradas)).includes("Sub_1_vc"), "as duas marcadas de novo: Sub_1_vc volta");
    // entrar no subcircuito com o bloco selecionado e voltar: o painel não fica com o bloco de outra folha; renomear funciona
    await pg.evaluate(() => { abre("0"); seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "SUBCIRCUIT.1")); });
    await pg.evaluate((u) => abre(u), uidSM); await pg.waitForTimeout(400);
    ok(await pg.evaluate(() => !ed.sel && !$("p-nome")), "entrar no subcircuito tira a seleção do bloco (o painel não fica com ele)");
    await pg.evaluate(() => { abre("0"); seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "SUBCIRCUIT.1")); }); await pg.waitForTimeout(400);
    await pg.fill("#p-nome", "braco"); await pg.press("#p-nome", "Tab"); await pg.waitForTimeout(1500);
    ok(await pg.evaluate(() => dados.folhas["0"].elementos.some((x) => x.nome === "braco") && !/Could not find/.test($("msg").textContent)), `renomear o subcircuito pelo painel: "braco" (${await pg.textContent("#msg")})`);
    await pg.evaluate(async (pi) => { await api("editor/abrir", { arq: pi, modo: "descartar" }); }, PI);
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
