// o MaiSim sem internet (instância de teste 7201; o passo dos pacotes do instalador e do AppImage): todo pedido que não for
// ao localhost é cortado. Com o Monaco local (simu/vendor.sh), o editor de código do Controle abre o Monaco de verdade,
// com o Python colorido; o guia do "?" sai formatado (o marked local); e nenhum pedido sai para fora.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
    const fora = [];
    await ctx.route((u) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u.href) && !u.href.startsWith("data:") && !u.href.startsWith("blob:"),
      (r) => { fora.push(r.request().url()); r.abort(); });
    const pg = await ctx.newPage(); const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:7201/maisim/simu/");
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado, null, { timeout: 30000 });
    await pg.waitForFunction(() => window.monaco && document.querySelector("#ctl-codigo .monaco-editor, .monaco-editor"), null, { timeout: 30000 }).catch(() => {});
    const m = await pg.evaluate(() => ({ monaco: !!window.monaco, local: typeof MONACO === "string" && MONACO.startsWith(location.origin), editor: !!document.querySelector(".monaco-editor"),
      cores: document.querySelectorAll(".monaco-editor .view-line span[class*='mtk']").length }));
    ok(m.monaco && m.local && m.editor && m.cores > 3, `sem internet: o editor de código é o Monaco local, com o Python colorido (${JSON.stringify(m)})`);
    const [guia] = await Promise.all([ctx.waitForEvent("page"), pg.click("#ctl-guia")]);
    await guia.waitForFunction(() => document.querySelectorAll("#guia h2").length > 3, null, { timeout: 20000 }).catch(() => {});
    const g = await guia.evaluate(() => ({ marked: !!window.marked, h2: document.querySelectorAll("#guia h2").length, tabelas: document.querySelectorAll("#guia table").length }));
    ok(g.marked && g.h2 > 3 && g.tabelas > 0, `sem internet: o guia formatado pelo marked local (${JSON.stringify(g)})`);
    ok(!fora.length, `nenhum pedido para fora do localhost ${fora.slice(0, 3).join(" ")}`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message); }
  if (b) await b.close();
  process.exit(falhas ? 1 : 0);
})();
