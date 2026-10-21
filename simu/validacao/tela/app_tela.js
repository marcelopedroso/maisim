// o PEW instalável como app (PWA), na instância de teste 5010: o manifesto em cada página do trilho (início, simu, scope) e o
// próprio Chrome dizendo que dá para instalar (Page.getInstallabilityErrors, do protocolo de depuração) — instalado, o PEW
// abre como programa, com as janelas (código, scope) sem barra de endereço
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1300, height: 850 } });
    /* o Gecko saiu do trilho (18/10) e a página dele depende do PEW do Marcelo no ar (a instância de teste não tem tela do Gecko) */
    for (const [nome, url] of [["início", "/"], ["simu", "/pew/simu/"], ["scope", "/pew/scope/"]]) {
      const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); } catch (e) { /* ok */ } });
      await pg.goto("http://localhost:5010" + url, { waitUntil: "load" }); await pg.waitForTimeout(1500);
      const cdp = await ctx.newCDPSession(pg);
      const man = await cdp.send("Page.getAppManifest");
      const inst = await cdp.send("Page.getInstallabilityErrors");
      const m = man.data ? JSON.parse(man.data) : {};
      ok(m.short_name === "PEW" && m.display === "standalone" && !(man.errors || []).length && !inst.installabilityErrors.length,
        `${nome}: manifesto ${man.url ? man.url.replace(/^https?:\/\/[^/]+/, "") : "?"} (${m.short_name}, ${m.display}) · instalável: ${inst.installabilityErrors.length ? JSON.stringify(inst.installabilityErrors.map((x) => x.errorId)) : "sim"}`);
      await pg.close();
    }
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
