// cores das medições (instância de teste 8768): V+ vermelho, V− preto, A azul Hall, borda = cor do canal; seletor; meta; salvar/reabrir
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const ARQ = require("os").homedir() + "/.cache/pew_simu_teste/pew/exemplo_controle_pwm.ipes";
  await pg.goto(`http://localhost:8768/pew/simu/?modelo=${encodeURIComponent(ARQ)}`);
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-editar"); await pg.waitForTimeout(500); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-ok"); await pg.waitForTimeout(800); }
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
  await pg.evaluate(() => api("editor/cor", { canal: "v_sw", cor: "" }).then(() => api("editor/cor", { canal: "v_o", cor: "" })).then(() => api("editor/cor", { canal: "i_L", cor: "" })).then((j) => { dados = j; desenha(); }));
  let c = await pg.evaluate(() => dados.cores);
  ok(c.v_sw === "#eab308" && c.v_o === "#06b6d4" && c.i_L === "#0ea5e9", `cores padrão: ${JSON.stringify(c)}`);
  const m = await pg.evaluate(() => [...document.querySelectorAll("#svg g.medido")].map((g) => { const f = g.firstChild; return [f.tagName, f.getAttribute("fill"), f.getAttribute("stroke"), g.querySelector("text").textContent]; }));
  ok(m.some((x) => x[0] === "rect" && x[1] === "#dc2626" && x[3] === "V+") && m.some((x) => x[0] === "rect" && x[1] === "#111827" && x[3] === "V−") && m.some((x) => x[0] === "circle" && x[1] === "#e0f2fe" && x[2] === "#0ea5e9"),
     `marcas: ${JSON.stringify(m)}`);
  await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "VOLT.1"))); await pg.waitForSelector(".cor-canal");
  await pg.click('.cor-canal [data-cor="#d946ef"]'); await pg.waitForFunction(() => dados.cores.v_sw === "#d946ef", null, { timeout: 10000 });
  const t = await pg.evaluate(() => [...document.querySelectorAll("#svg g.tag-scope rect")].map((r) => r.getAttribute("stroke")));
  ok(t.includes("#d946ef"), `seletor: v_sw magenta (bordas das etiquetas ${t.join(" ")})`);
  await pg.screenshot({ path: "cores.png" });
  const j = await pg.evaluate(() => api("editor/rodar", { dt: "1e-6", tfim: "0.0002", nome: "cores", amostras: "100" }));
  await pg.waitForFunction(() => api("editor/rodada").then((r) => r.estado === "fim"), null, { timeout: 60000, polling: 500 }).catch(() => {});
  await pg.waitForTimeout(1500);
  const meta = await pg.evaluate(() => api("editor/rodada").then((r) => r.arquivo));
  ok(!!meta, `rodada feita (${meta})`);
  const sv = await pg.evaluate(() => api("editor/salvar", { nome: "cores_teste", pasta: "pew", sobrescrever: true }));   // uma cópia: o exemplo não muda
  ok(!!sv.salvo, `salvar: ${sv.salvo}`);
  await pg.evaluate(() => api("editor/cor", { canal: "v_sw", cor: "" }));       // muda no trabalho; reabrir o arquivo traz o salvo
  const re = await pg.evaluate((a) => api("editor/abrir", { arq: a, modo: "descartar" }), require("os").homedir() + "/.cache/pew_simu_teste/pew/cores_teste.ipes");
  ok(re.cores.v_sw === "#d946ef" && re.cores_escolhidas.v_sw === "#d946ef", `reabrir traz a cor salva junto: ${re.cores.v_sw}`);
  await pg.evaluate(() => api("editor/cor", { canal: "v_sw", cor: "" }));
  const zerou = await pg.evaluate((a) => api("editor/salvar", { nome: "cores_teste", pasta: "pew", sobrescrever: true }).then(() => api("editor/abrir", { arq: a, modo: "descartar" })), require("os").homedir() + "/.cache/pew_simu_teste/pew/cores_teste.ipes");
  ok(!zerou.cores_escolhidas.v_sw, "todas no padrão + salvar: o .cores.json antigo sai (não volta ao reabrir)");
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
