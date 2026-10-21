// a dica (tooltip) do PEW na instância de teste 5010: depois de uma dica curta colada na borda direita, a do "testar" não pode ficar espremida (ela era medida no lugar da anterior)
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  await pg.goto("http://localhost:5010/pew/simu/"); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-ctl"); await pg.waitForTimeout(1500);
  const larg = async (sel) => { await pg.hover(sel); await pg.waitForTimeout(600); const r = await pg.evaluate(() => { const c = document.getElementById("dica-ui").getBoundingClientRect(); return [Math.round(c.width), Math.round(c.left), Math.round(c.right)]; }); await pg.mouse.move(5, 5); await pg.waitForTimeout(200); return r; };
  await pg.evaluate(() => { const x = document.createElement("button"); x.id = "curta"; x.title = "ok"; x.textContent = "·";
    Object.assign(x.style, { position: "fixed", right: "0px", top: "300px", zIndex: 99 }); document.body.appendChild(x); });   // uma dica curta colada na borda direita
  const a = await larg("#curta"), t = await larg("#ctl-testar");
  console.log("dica curta na borda:", a, "· dica do testar depois:", t, "· largura da tela 1500");
  console.log(t[0] >= 250 && t[2] <= 1500 - 7 ? "OK   a dica do testar tem a largura dela (não espremida) e cabe na tela" : "FALHA dica espremida ou fora da tela");
  await b.close();
})();
