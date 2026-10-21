// a página do PEW não passa da largura da tela (21/10: a 1366 px, a barra do código — IA, testar, modelo, quebra de linha,
// ? — passava 78 px e a página rolava para o lado): com o painel do controle e com a conversa aberta, em 1280, 1366 e 1600
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch();
  try {
    for (const w of [1280, 1366, 1600]) {
      const pg = await (await b.newContext({ viewport: { width: w, height: 800 } })).newPage();
      await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); } catch (e) { /* ok */ } });
      await pg.goto("http://localhost:8768/pew/simu/"); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
      const mede = () => pg.evaluate(() => { const d = document.documentElement, bar = $("ctl-barra"), g = $("ctl-guia").getBoundingClientRect();
        return { pag: d.scrollWidth - d.clientWidth, barra: bar.scrollWidth - bar.clientWidth, guia: g.right <= d.clientWidth && g.width > 0 }; });
      await pg.evaluate(() => mostraDoca("controle")); await pg.waitForTimeout(1200);
      const a = await mede();
      await pg.evaluate(() => ccAbre(true)); await pg.waitForTimeout(1200);
      const c = await mede();
      ok(a.pag <= 0 && a.barra <= 0 && a.guia && c.pag <= 0 && c.barra <= 0 && c.guia,
        `${w} px: a página e a barra do código cabem (painel: sobra ${-a.pag}/${-a.barra}; com a conversa: ${-c.pag}/${-c.barra}), o ? à vista`);
      await pg.close();
    }
  } catch (e) { ok(false, `o teste parou: ${e.message.split("\n")[0]}`); }
  await b.close(); process.exit(falhas ? 1 : 0);
})();
