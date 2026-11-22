// O que o teste de fumaça confere pelas telas de um MaiSim já no ar, num navegador de verdade (Chromium, pelo Playwright),
// igual no Linux e no Windows: a página inicial com os exemplos, as etiquetas e o filtro; o editor com o circuito do
// exemplo aberto; o painel do controle (o editor de código, o dropdown Controlador digital, o Ts tirado dos registradores,
// os arquivos em C); uma rodada pelo botão ▶ até o fim, com o Scope ao lado; o inglês. Falha com qualquer erro de JavaScript.
// uso: node pacote/fumaca_tela.js <porta da página>     (precisa do playwright: NODE_PATH ou node_modules)
const { chromium } = require("playwright");
const B = `http://localhost:${process.argv[2]}`;
let falhas = 0;
const ok = (c, txt) => { console.log(`fumaça (telas): ${c ? "ok   " : "FALHA"} ${txt}`); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch();
  try {
    const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 }, locale: "pt-BR" })).newPage();
    // "Canceled": a promessa cancelada do Monaco quando o painel troca os arquivos (sem efeito na tela)
    const erros = []; pg.on("pageerror", (e) => { if (e.message !== "Canceled") erros.push(e.message); });
    pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    // 1. a página inicial: os exemplos, a etiqueta e o filtro
    await pg.goto(B + "/"); await pg.waitForSelector("#cartao-exemplos:not([hidden])", { timeout: 60000 });
    await pg.evaluate(() => { if (maisimI18n.lingua() !== "pt") maisimI18n.muda("pt"); }); await pg.waitForTimeout(1500);
    await pg.waitForSelector("#cartao-exemplos:not([hidden])", { timeout: 60000 });
    await pg.click("#cartao-exemplos"); await pg.waitForTimeout(300);
    const ini = await pg.evaluate(() => ({ n: document.querySelectorAll("#exemplos .ex").length, tag: document.querySelectorAll("#exemplos .ex .ex-tag").length,
      t0: (document.querySelector("#exemplos .ex b") || {}).textContent }));
    await pg.click('#exemplos .ex-filtro [data-f="digital"]'); await pg.waitForTimeout(150);
    const vis = await pg.evaluate(() => [...document.querySelectorAll("#exemplos .ex")].filter((a) => a.getClientRects().length).length);
    await pg.click('#exemplos .ex-filtro [data-f="todos"]');
    ok(ini.n >= 19 && ini.tag >= 5 && vis === ini.tag && ini.t0 === "Buck", `a página inicial: ${ini.n} exemplos, ${ini.tag} com a etiqueta "controlador digital"; o filtro mostra ${vis}`);
    // 2. o editor com o exemplo do buck com controle digital
    await pg.goto(B + "/maisim/simu/?modelo=" + encodeURIComponent("exemplos/exemplo_controle_pwm.ipes"));
    for (let k = 0; k < 240 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor && typeof ed !== "undefined" && ed.ligado)); k++) {
      if (await pg.$(".modal-fundo .m-ok")) await pg.click(".modal .m-ok");
      await pg.waitForTimeout(500); }
    const circ = await pg.evaluate(() => ({ el: document.querySelectorAll("#svg .el").length, editor: !!(dados && dados.editor), arq: dados && dados.arq }));
    ok(circ.editor && circ.el >= 10 && /exemplo_controle_pwm/.test(circ.arq || ""), `o editor abre o exemplo: ${circ.el} elementos desenhados (${circ.arq})`);
    // 3. o painel do controle
    await pg.evaluate(() => mostraDoca("controle"));
    await pg.waitForFunction(() => ctl.carregado && (ctl.editor || ctl.texto) && ctl.lista.includes("pwm.c"), null, { timeout: 90000 }); await pg.waitForTimeout(800);
    const c = await pg.evaluate(() => ({ roda: $("ctl-roda").value, rotulo: document.querySelector(".ctl-ativo span").textContent, lista: ctl.lista, arq: ctl.arq, monaco: !!ctl.editor,
      ts: $("ctl-ts").value, tsSoLeitura: $("ctl-ts").readOnly, cod: textoDe("controle.c").length, coberto: getComputedStyle($("ctl-de-outro")).display !== "none" }));
    ok(c.roda === "c" && c.rotulo === "Controlador digital" && c.arq === "controle.c" && c.lista.includes("pwm.h") && c.cod > 500 && !c.coberto,
      `o painel do controle: ${c.rotulo} = ${c.roda}, aberto ${c.arq} (${c.cod} caracteres), arquivos ${c.lista.join(", ")}`);
    ok(c.monaco, "o editor de código é o Monaco");
    ok(c.tsSoLeitura && Math.abs(Number(c.ts) - 1e-4) < 1e-12, `o Ts tirado dos registradores do PWM: ${c.ts} s, só leitura`);
    // 4. uma rodada pelo botão ▶, até o fim, com o Scope
    await pg.click("#bt-play");
    await pg.waitForFunction(() => sim.estado === "rodando" || sim.estado === "fim" || sim.estado === "erro", null, { timeout: 120000 });
    await pg.waitForFunction(() => sim.estado !== "rodando" && sim.estado !== "preparando", null, { timeout: 300000 });
    await pg.waitForTimeout(2500);
    const r = await pg.evaluate(() => ({ estado: sim.estado, msg: $("msg").textContent, scope: $("if-scope").getAttribute("src") || "" }));
    const quadro = pg.frames().find((f) => /scope/.test(f.url()) && f !== pg.mainFrame());
    const telas = quadro ? await quadro.evaluate(() => document.querySelectorAll("canvas, svg").length).catch(() => -1) : -1;
    ok(r.estado === "fim" && r.scope && telas > 0, `a rodada pelo ▶ termina (${r.estado}) e o Scope abre com os gráficos (${telas} telas; "${r.msg.slice(0, 80)}")`);
    // 5. em inglês
    await pg.evaluate(() => maisimI18n.muda("en")); await pg.waitForTimeout(1500);
    const en = await pg.evaluate(() => document.querySelector(".ctl-ativo span").textContent);
    ok(en === "Digital controller", `em inglês: "${en}"`);
    await pg.evaluate(() => maisimI18n.muda("pt")); await pg.waitForTimeout(800);
    await pg.evaluate(() => api("editor/novo", { modo: "descartar" })).catch(() => {});   // nada fica sem salvar (o --parar recusaria)
    ok(!erros.length, `sem erros de JavaScript ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message); }
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
