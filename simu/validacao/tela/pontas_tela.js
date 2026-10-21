// pontas do voltímetro no componente escolhido (instância de teste 8768, com uma cópia do circuito do Marcelo)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const ARQ = require("os").homedir() + "/.cache/pew_simu_teste/pew/pontas_teste.ipes";
  // o circuito do teste, montado aqui: antes era uma cópia de um circuito do Marcelo, só na pasta de teste — e um teste
  // rodando junto com outro (19/10) o sobrescreveu com um circuito vazio. Fonte U.1 e resistor R.1 em paralelo (nós + e
  // −, como no circuito dele), o voltímetro VOLT.1 entre eles; salvo como pontas_teste (o resto do teste abre, mexe e salva por cima)
  const S = "http://localhost:8768/pew/simu/", post = (r, c) => fetch(S + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) }).then((x) => x.json());
  await post("editor/novo", { modo: "descartar" });
  for (const a of [["U.1", 10, 10, "U"], ["R.1", 20, 10, "R"], ["VOLT.1", 30, 10, "VOLT"]]) await post("editor/cmd", { op: "CREATE", args: a });
  for (const n of ["U.1", "R.1"]) { await post("editor/cmd", { op: "INNODE", args: [n, 0, "+"] }); await post("editor/cmd", { op: "OUTNODE", args: [n, 0, "-"] }); }
  await post("editor/mede", { nome: "VOLT.1", tipo: "V", no1: "+", no2: "-" });
  const mont = await post("editor/salvar", { nome: "pontas_teste", pasta: "pew", sobrescrever: true });
  if (!mont.salvo) { console.log("FALHA não deu para montar o circuito do teste", JSON.stringify(mont).slice(0, 200)); process.exit(1); }
  await pg.goto(`http://localhost:8768/pew/simu/?modelo=${encodeURIComponent(ARQ)}`);
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
  // o campo com busca do PEW (não o <select> nativo): ao clicar, as sugestões (até 5); digitar filtra
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
  const esperado = [`translate(${u.x * G},${(u.y - 0.5) * G})`, `translate(${u2.x * G},${(u2.y + 1.2) * G})`];   // V+ acima do terminal de cima, V− abaixo do de baixo
  ok(JSON.stringify(antes) !== JSON.stringify(depois) && depois.some((m) => m[0] === "V+" && m[1] === esperado[0]) && depois.some((m) => m[0] === "V−" && m[1] === esperado[1]),
     `marcas: antes (automático) ${JSON.stringify(antes)} → depois (U.1) ${JSON.stringify(depois)}`);
  await pg.screenshot({ path: "pontas.png" });
  const sv = await pg.evaluate(() => api("editor/salvar", { nome: "pontas_teste", pasta: "pew", sobrescrever: true }));
  const re = await pg.evaluate((a) => api("editor/abrir", { arq: a, modo: "descartar" }), ARQ);
  const canal = await pg.evaluate(() => canalScope(dados.folhas["0"].elementos.find((x) => x.nome === "VOLT.1")));
  ok(re.pontas[canal] && re.pontas[canal]["+"] === "U.1" && re.pontas[canal]["-"] === "U.1", `salvar e reabrir: ${JSON.stringify(re.pontas)}`);
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
