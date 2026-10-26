// pontas do voltímetro no componente escolhido (instância de teste 7201, com uma cópia do circuito do Marcelo)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const ARQ = require("os").homedir() + "/.cache/maisim_teste/circuitos/pontas_teste.ipes";
  // o circuito do teste, montado aqui: antes era uma cópia de um circuito do Marcelo, só na pasta de teste — e um teste
  // rodando junto com outro (19/10) o sobrescreveu com um circuito vazio. Fonte U.1 e resistor R.1 em paralelo (nós + e
  // −, como no circuito dele), o voltímetro VOLT.1 entre eles; salvo como pontas_teste (o resto do teste abre, mexe e salva por cima)
  const S = "http://localhost:7201/maisim/simu/", post = (r, c) => fetch(S + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) }).then((x) => x.json());
  await post("editor/novo", { modo: "descartar" });
  for (const a of [["U.1", 10, 10, "U"], ["R.1", 20, 10, "R"], ["VOLT.1", 30, 10, "VOLT"]]) await post("editor/cmd", { op: "CREATE", args: a });
  for (const n of ["U.1", "R.1"]) { await post("editor/cmd", { op: "INNODE", args: [n, 0, "+"] }); await post("editor/cmd", { op: "OUTNODE", args: [n, 0, "-"] }); }
  await post("editor/mede", { nome: "VOLT.1", tipo: "V", no1: "+", no2: "-" });
  const mont = await post("editor/salvar", { nome: "pontas_teste", pasta: "circuitos", sobrescrever: true });
  if (!mont.salvo) { console.log("FALHA não deu para montar o circuito do teste", JSON.stringify(mont).slice(0, 200)); process.exit(1); }
  await pg.goto(`http://localhost:7201/maisim/simu/?modelo=${encodeURIComponent(ARQ)}`);
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-editar"); await pg.waitForTimeout(600); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-ok"); await pg.waitForTimeout(800); }
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
  await pg.evaluate(async () => { const canal = canalScope(dados.folhas["0"].elementos.find((x) => x.nome === "VOLT.1"));   // em sequência (o mesmo arquivo)
    for (const s of ["+", "-"]) await api("editor/ponta", { canal, sinal: s, componente: "" }); dados = await api("editor/estado"); desenha(); });
  const nos = await pg.evaluate(() => dados.nos_medidos["0"]);
  ok(JSON.stringify(Object.fromEntries(Object.entries(nos).map(([k, v]) => [k, v.map((c) => c.nome)]))) === JSON.stringify({ "+": ["U.1", "R.1"], "-": ["U.1", "R.1"] }), `nós medidos: ${JSON.stringify(Object.fromEntries(Object.entries(nos).map(([k, v]) => [k, v.map((c) => c.nome)])))}`);
  const marcas = () => pg.evaluate(() => [...document.querySelectorAll("#svg g.medido")].filter((g) => g.querySelector("rect")).map((g) => [g.querySelector("text").textContent, g.getAttribute("transform")]));
  const antes = await marcas();
  await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "VOLT.1"))); await pg.waitForSelector('input[data-ponta="+"]');
  // o campo com busca do MaiSim (não o <select> nativo): ao clicar, as sugestões (até 5); digitar filtra
  await pg.click('input[data-ponta="+"]'); await pg.waitForTimeout(200);
  const sug = () => pg.$$eval('input[data-ponta="+"] + .sugestoes .sug b', (l) => l.map((x) => x.textContent));
  const s1 = await sug();
  ok(s1.join("|") === "automático|U.1|R.1" && await pg.$eval('input[data-ponta="+"]', (x) => x.tagName) === "INPUT", `ponta (+): campo com busca, sugestões ${s1.join(" · ")}`);
  await pg.keyboard.type("R"); await pg.waitForTimeout(150);
  const s2 = await sug(); ok(s2.join("|") === "R.1", `digitar "R" filtra: ${s2.join(" · ")}`);
  await pg.fill('input[data-ponta="+"]', ""); await pg.keyboard.type("U.1"); await pg.waitForTimeout(150);
  await pg.click('input[data-ponta="+"] + .sugestoes .sug'); await pg.waitForTimeout(900);
  await pg.click('input[data-ponta="-"]'); await pg.waitForTimeout(200);
  await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("Enter"); await pg.waitForTimeout(900);   // automático → U.1
  const depois = await marcas();
  const u = nos["+"].find((c) => c.nome === "U.1"), u2 = nos["-"].find((c) => c.nome === "U.1"), G = await pg.evaluate(() => G);
  // V+ acima do terminal de cima, V− abaixo do de baixo, na coluna do U.1 (o rótulo do borne, sem conexão, é um conector:
  // a bandeirinha sai do borne e a marca fica do lado de fora dela — acima da de cima, abaixo da de baixo)
  const xy = (m) => m[1].match(/translate\(([-\d.]+),([-\d.]+)\)/).slice(1).map((v) => +v / G);
  const mMais = depois.find((m) => m[0] === "V+"), mMenos = depois.find((m) => m[0] === "V−");
  ok(JSON.stringify(antes) !== JSON.stringify(depois) && mMais && mMenos && xy(mMais)[0] === u.x && xy(mMais)[1] - 0.32 < u.y && xy(mMais)[1] > u.y - 2.5
     && xy(mMenos)[0] === u2.x && xy(mMenos)[1] - 1.13 > u2.y && xy(mMenos)[1] < u2.y + 3.5,
     `marcas: antes (automático) ${JSON.stringify(antes)} → depois (U.1, terminais em y ${u.y} e ${u2.y}) ${JSON.stringify(depois)}`);
  await pg.screenshot({ path: "pontas.png" });
  const sv = await pg.evaluate(() => api("editor/salvar", { nome: "pontas_teste", pasta: "circuitos", sobrescrever: true }));
  const re = await pg.evaluate((a) => api("editor/abrir", { arq: a, modo: "descartar" }), ARQ);
  const canal = await pg.evaluate(() => canalScope(dados.folhas["0"].elementos.find((x) => x.nome === "VOLT.1")));
  ok(re.pontas[canal] && re.pontas[canal]["+"] === "U.1" && re.pontas[canal]["-"] === "U.1", `salvar e reabrir: ${JSON.stringify(re.pontas)}`);
  // duas pontas no mesmo nó (Marcelo, 24/10: "uma ponteira ficou por baixo da outra"): o − de v_a no R.1 (embaixo dele) e o
  // + de v_b no R.2 (em cima dele), com o R.2 logo abaixo do R.1 (um fio curto entre os dois, pelo rótulo m); e o mesmo com
  // dois resistores deitados (R.3, R.4: as marcas ao lado dos terminais, quase no mesmo ponto). Nenhuma marca cobre outra
  await post("editor/novo", { modo: "descartar" });
  for (const a of [["R.1", 40, 10, "R"], ["R.2", 40, 16, "R"], ["R.3", 40, 30, "R"], ["R.4", 46, 30, "R"],
    ["VOLT.1", 60, 10, "VOLT"], ["VOLT.2", 60, 14, "VOLT"], ["VOLT.3", 60, 18, "VOLT"], ["VOLT.4", 60, 22, "VOLT"]]) await post("editor/cmd", { op: "CREATE", args: a });
  for (const n of ["R.3", "R.4"]) await post("editor/cmd", { op: "ROTATE", args: [n] });
  for (const [n, i, o] of [["R.1", "a", "m"], ["R.2", "m", "b"], ["R.3", "c", "n"], ["R.4", "n", "d"]]) { await post("editor/cmd", { op: "INNODE", args: [n, 0, i] }); await post("editor/cmd", { op: "OUTNODE", args: [n, 0, o] }); }
  for (const [v, a, c, canal] of [["VOLT.1", "a", "m", "v_a"], ["VOLT.2", "m", "b", "v_b"], ["VOLT.3", "c", "n", "v_c"], ["VOLT.4", "n", "d", "v_d"]]) {
    await post("editor/mede", { nome: v, tipo: "V", no1: a, no2: c }); await post("editor/cmd", { op: "OUTNODE", args: [v, 0, canal] }); }
  for (const [canal, sinal, comp] of [["v_a", "-", "R.1"], ["v_b", "+", "R.2"], ["v_c", "-", "R.3"], ["v_d", "+", "R.4"]]) await post("editor/ponta", { canal, sinal, componente: comp });
  await pg.evaluate(async () => { dados = await api("editor/estado"); folhaAtual = "0"; desenha(); });
  // a caixa de cada marca: o retângulo V± e o nome do sinal ao lado (o texto com data-txt)
  const cx = await pg.evaluate(() => [...document.querySelectorAll("#svg g.medido")].filter((g) => g.querySelector("rect")).map((g) => {
    const r = g.querySelector("rect").getBoundingClientRect(), t = g.querySelector("[data-txt]"), q = t ? t.getBoundingClientRect() : r;
    return { m: g.querySelector("text").textContent, canal: t ? t.dataset.txt : "", e: Math.min(r.left, q.left), d: Math.max(r.right, q.right), cima: Math.min(r.top, q.top), baixo: Math.max(r.bottom, q.bottom), rcima: r.top }; }));
  const cobre = [];
  cx.forEach((a, i) => cx.slice(i + 1).forEach((b) => { if (a.e < b.d - 1 && b.e < a.d - 1 && a.cima < b.baixo - 1 && b.cima < a.baixo - 1) cobre.push(`${a.m} ${a.canal} × ${b.m} ${b.canal}`); }));
  await pg.evaluate(() => ajusta()); await pg.waitForTimeout(300); await pg.screenshot({ path: "pontas_no.png" });
  const vm = cx.find((c) => c.m === "V−" && c.canal === "v_a"), vp = cx.find((c) => c.m === "V+" && c.canal === "v_b");
  ok(cx.length === 8 && !cobre.length && vm && vp && vm.rcima < vp.rcima,
     `pontas no mesmo nó (em pé e deitados): ${cx.length} marcas, nenhuma cobre outra${cobre.length ? " — cobrem: " + cobre.join(", ") + " " + JSON.stringify(cx.map((c) => [c.m, c.canal, Math.round(c.cima), Math.round(c.baixo), Math.round(c.rcima)])) : ""}; o V− do R.1 acima do V+ do R.2`);
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
