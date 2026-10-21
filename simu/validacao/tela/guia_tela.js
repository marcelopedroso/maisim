// o "?" do painel abre o guia renderizado (tabelas, código)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */ const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
  await pg.goto("http://localhost:7201/maisim/simu/");
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado, null, { timeout: 30000 });
  const [guia] = await Promise.all([ctx.waitForEvent("page"), pg.click("#ctl-guia")]);
  await guia.waitForFunction(() => document.querySelectorAll("#guia h2").length > 3, null, { timeout: 20000 });
  const g = await guia.evaluate(() => ({ titulo: document.title, h2: [...document.querySelectorAll("#guia h2")].map((h) => h.textContent), tabelas: document.querySelectorAll("#guia table").length,
    codigo: document.querySelectorAll("#guia pre code").length, largura: document.documentElement.scrollWidth <= innerWidth + 1 }));
  ok(g.titulo === "Guia do Controle" && g.h2.length === 8 && g.tabelas >= 4 && g.codigo >= 3 && g.largura, `guia: ${g.h2.length} seções (${g.h2.join(" · ")}), ${g.tabelas} tabelas, ${g.codigo} blocos de código`);
  await guia.screenshot({ path: "guia.png" });
  await guia.setViewportSize({ width: 390, height: 800 }); await guia.waitForTimeout(200);
  ok(await guia.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no celular (390 px): sem rolagem lateral da página");
  ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
