const { chromium } = require("playwright");
const fs = require("fs"), os = require("os");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const rodadas = () => fs.readdirSync(os.homedir() + "/.cache/maisim_teste/rodadas").length;
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  await pg.goto("http://localhost:7201/maisim/simu/");
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-modelo"); await pg.waitForSelector(".lista-abrir .op"); await pg.fill(".busca-abrir", "exemplo_controle_pi"); await pg.keyboard.press("Enter");
  await pg.waitForFunction(() => /exemplo_controle_pi/.test($("bt-modelo").textContent) && document.querySelectorAll("#svg .el").length >= 6, null, { timeout: 90000 });
  await pg.click("#bt-editar"); await pg.waitForTimeout(500); if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok");
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 60000 });
  await pg.evaluate(() => { sim.par.dt = "1e-6"; sim.par.tfim = "0.01"; sim.par.nome = "revisao_tela"; sim.par.amostras = "1000"; });
  await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(400);
  // (b) texto inválido no tempo de um acionamento: marcado, não grava, ▶ não roda com a configuração velha
  await pg.evaluate(() => mostraTabela("ac")); await pg.waitForTimeout(300);     // os acionamentos ficam numa tabela, numa aba (19/10)
  const campo = '#ctl-ac .ctl-ac:first-child [data-k="t"]';
  await pg.fill(campo, "10m"); await pg.press(campo, "Tab"); await pg.waitForTimeout(900);
  const b1 = await pg.evaluate((sel) => ({ marcado: document.querySelector(sel).classList.contains("invalido"), estado: $("ctl-estado").textContent }), campo);
  const srv = (await pg.evaluate(() => api("editor/controle"))).controle.acionamentos[0].t;
  ok(b1.marcado && /valor inválido/.test(b1.estado) && srv === 0.012, `"10m" no tempo: campo marcado, "${b1.estado}", servidor continua com ${srv}`);
  const nAntes = rodadas();
  await pg.click("#bt-play"); await pg.waitForTimeout(1500);
  ok(rodadas() === nAntes && /não foi gravado/.test(await pg.textContent("#msg")), `▶ com valor inválido: não rodou (${(await pg.textContent("#msg")).trim()})`);
  await pg.fill(campo, "0,012"); await pg.press(campo, "Tab"); await pg.waitForFunction(() => $("ctl-estado").textContent.startsWith("guardado"), null, { timeout: 10000 });
  ok(!(await pg.evaluate((sel) => document.querySelector(sel).classList.contains("invalido"), campo)), "corrigido para 0,012 (vírgula): guardado, sem marca");
  // ▶ duas vezes seguidas: uma rodada só; (c) durante a rodada, "modelo" e os campos desabilitados
  const n0 = rodadas();
  await pg.evaluate(() => { $("bt-play").click(); $("bt-play").click(); });
  await pg.waitForFunction(() => sim.estado === "rodando", null, { timeout: 30000 });
  const trava = await pg.evaluate(() => ({ modelo: $("ctl-modelo").disabled, novo: $("ctl-ac-novo").disabled, ts: $("ctl-ts").disabled, leitura: ctl.editor.getOption(monaco.editor.EditorOption.readOnly) }));
  ok(trava.modelo && trava.novo && trava.ts && trava.leitura, `rodando: botão "modelo", "+ acionamento", Ts e editor travados (${JSON.stringify(trava)})`);
  await pg.waitForFunction(() => sim.estado === "fim" || sim.estado === "erro", null, { timeout: 120000 });
  ok(rodadas() === n0 + 1, `dois cliques no ▶: ${rodadas() - n0} rodada`);
  ok(await pg.evaluate(() => !$("ctl-modelo").disabled && !$("ctl-ts").disabled), "no fim: destravado");
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
