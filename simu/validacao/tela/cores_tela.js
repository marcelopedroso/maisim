// cores das medições (instância de teste 7201): V+ vermelho, V− preto, A azul Hall, borda = cor do canal; seletor; meta; salvar/reabrir
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const ARQ = require("os").homedir() + "/.cache/maisim_teste/circuitos/exemplo_controle_pwm.ipes";
  await pg.goto(`http://localhost:7201/maisim/simu/?modelo=${encodeURIComponent(ARQ)}`);
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-editar"); await pg.waitForTimeout(500); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-ok"); await pg.waitForTimeout(800); }
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
  await pg.evaluate(() => api("editor/cor", { canal: "v_sw", cor: "" }).then(() => api("editor/cor", { canal: "v_o", cor: "" })).then(() => api("editor/cor", { canal: "i_L", cor: "" })).then((j) => { dados = j; desenha(); }));
  let c = await pg.evaluate(() => dados.cores);
  ok(c.v_sw === "#eab308" && c.v_o === "#06b6d4" && c.i_L === "#0ea5e9", `cores padrão: ${JSON.stringify(c)}`);
  const m = await pg.evaluate(() => [...document.querySelectorAll("#svg g.medido")].map((g) => { const f = g.firstChild; return [f.tagName, f.getAttribute("fill"), f.getAttribute("stroke"), g.querySelector("text").textContent]; }));
  ok(m.some((x) => x[0] === "rect" && x[1] === "#dc2626" && x[3] === "V+") && m.some((x) => x[0] === "rect" && x[1] === "#111827" && x[3] === "V−") && m.some((x) => x[0] === "circle" && x[1] === "#e0f2fe" && x[2] === "#0ea5e9"),
     `marcas: ${JSON.stringify(m)}`);
  // clicar na marca de um medidor (o "A" no componente, o "V+" no nó) abre o medidor (Marcelo, 22/10: "clicar na bolinha do sensor e ele abrir os dados")
  const clicaMarca = async (sel) => { const r = await (await pg.$(sel)).boundingBox(); await pg.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await pg.waitForTimeout(400); return pg.evaluate(() => ed.sel); };
  const meds = await pg.evaluate(() => [...document.querySelectorAll("#svg g.medido")].map((g) => [g.querySelector("text").textContent, g.dataset.medidor]));
  const amp = meds.find((x) => x[0] === "A"), selA = await clicaMarca('#svg g.medido[data-medidor] circle'), selV = await clicaMarca('#svg g.medido[data-medidor] rect');
  const ampEl = await pg.evaluate(() => (dados.folhas["0"].elementos.find((x) => x.tipo === "AMP") || {}).nome);
  ok(amp && amp[1] === ampEl && selA === ampEl && /^VOLT\./.test(selV || "") && await pg.evaluate(() => /mede/i.test($("props").textContent)),
    `clicar na marca abre o medidor: o "A" → ${selA}, o "V+" → ${selV} (as marcas: ${JSON.stringify(meds)})`);
  // o histórico diz qual rótulo mudou (Marcelo, 22/10: só "rótulo mudado" não dizia de quem)
  await pg.evaluate((n) => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === n)), ampEl); await pg.waitForSelector('#props [data-out="0"]');
  const antes = await pg.inputValue('#props [data-out="0"]');
  const semRenomear = async () => { if (await pg.$(".modal .m-cancela")) { await pg.click(".modal .m-cancela"); await pg.waitForTimeout(300); } };   // "o controle usa o nome antigo": deixar como está
  await pg.fill('#props [data-out="0"]', "i_L_teste"); await pg.press('#props [data-out="0"]', "Tab"); await pg.waitForTimeout(800); await semRenomear();
  const h1 = await pg.evaluate((n) => (historico.find((x) => x.t.startsWith(`${n}: `)) || {}).t, ampEl);
  await pg.evaluate((n) => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === n)), ampEl); await pg.waitForSelector('#props [data-out="0"]');
  await pg.fill('#props [data-out="0"]', antes); await pg.press('#props [data-out="0"]', "Tab"); await pg.waitForTimeout(800); await semRenomear();
  ok((h1 || "").startsWith(`${ampEl}: sinal ${antes ? `“${antes}”` : "(vazio)"} → “i_L_teste”`),
    `o histórico diz o rótulo: "${h1}" (e voltou ao "${antes}")`);
  await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "VOLT.1"))); await pg.waitForSelector(".cor-canal");
  await pg.click('.cor-canal [data-cor="#d946ef"]'); await pg.waitForFunction(() => dados.cores.v_sw === "#d946ef", null, { timeout: 10000 });
  const t = await pg.evaluate(() => [...document.querySelectorAll("#svg g.tag-scope rect")].map((r) => r.getAttribute("stroke")));
  ok(t.includes("#d946ef"), `seletor: v_sw magenta (bordas das etiquetas ${t.join(" ")})`);
  // a cor escolhida no circuito vai também para o scope (a cor do sinal lá, no navegador); "Padrão" tira
  const noScope = await pg.evaluate(() => JSON.parse(localStorage.getItem("maisim-scope-cores") || "{}").v_sw);
  await pg.click(".cor-canal .padrao"); await pg.waitForFunction(() => !(dados.cores_escolhidas || {}).v_sw, null, { timeout: 10000 }).catch(() => {});
  const semScope = await pg.evaluate(() => JSON.parse(localStorage.getItem("maisim-scope-cores") || "{}").v_sw);
  await pg.click('.cor-canal [data-cor="#d946ef"]'); await pg.waitForFunction(() => dados.cores.v_sw === "#d946ef", null, { timeout: 10000 });
  ok(noScope === "#d946ef" && semScope === undefined, `a cor vale no scope também (${noScope}); "Padrão" a tira de lá (${semScope})`);
  // ao abrir o circuito (as cores escolhidas dele), elas vão para o scope sem precisar escolher de novo
  await pg.evaluate(() => localStorage.removeItem("maisim-scope-cores"));
  await pg.evaluate(() => { coresSincronizadas = null; desenha(); });   // o mesmo caminho de quando o circuito é aberto (o desenho novo)
  const aoAbrir = await pg.evaluate(() => JSON.parse(localStorage.getItem("maisim-scope-cores") || "{}").v_sw);
  ok(aoAbrir === "#d946ef", `ao abrir o circuito, a cor escolhida nele vai para o scope (${aoAbrir})`);
  await pg.screenshot({ path: "cores.png" });
  const j = await pg.evaluate(() => api("editor/rodar", { dt: "1e-6", tfim: "0.0002", nome: "cores", amostras: "100" }));
  await pg.waitForFunction(() => api("editor/rodada").then((r) => r.estado === "fim"), null, { timeout: 60000, polling: 500 }).catch(() => {});
  await pg.waitForTimeout(1500);
  const meta = await pg.evaluate(() => api("editor/rodada").then((r) => r.arquivo));
  ok(!!meta, `rodada feita (${meta})`);
  const sv = await pg.evaluate(() => api("editor/salvar", { nome: "cores_teste", pasta: "circuitos", sobrescrever: true }));   // uma cópia: o exemplo não muda
  ok(!!sv.salvo, `salvar: ${sv.salvo}`);
  await pg.evaluate(() => api("editor/cor", { canal: "v_sw", cor: "" }));       // muda no trabalho; reabrir o arquivo traz o salvo
  const re = await pg.evaluate((a) => api("editor/abrir", { arq: a, modo: "descartar" }), require("os").homedir() + "/.cache/maisim_teste/circuitos/cores_teste.ipes");
  ok(re.cores.v_sw === "#d946ef" && re.cores_escolhidas.v_sw === "#d946ef", `reabrir traz a cor salva junto: ${re.cores.v_sw}`);
  await pg.evaluate(() => api("editor/cor", { canal: "v_sw", cor: "" }));
  const zerou = await pg.evaluate((a) => api("editor/salvar", { nome: "cores_teste", pasta: "circuitos", sobrescrever: true }).then(() => api("editor/abrir", { arq: a, modo: "descartar" })), require("os").homedir() + "/.cache/maisim_teste/circuitos/cores_teste.ipes");
  ok(!zerou.cores_escolhidas.v_sw, "todas no padrão + salvar: o .cores.json antigo sai (não volta ao reabrir)");
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
