// as dicas do MaiSim (app/public/maisim-dica.js) em todas as páginas, no lugar da caixinha nativa do navegador (Marcelo, 25/10:
// "estilo Windows 98"): na inicial, no simu (pelo MaiSim e direto na porta dele) e no scope — com o mouse em cima, a dica do
// MaiSim com o texto e sem o title (o navegador não mostra a dele); ao sair, o title de volta. E no tamanho do MaiSim (zoom) e no
// tema escuro, a caixa junto do botão (instância de teste)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 860 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
  const erros = [];
  const abre = async (url, sel, espera) => {
    const pg = await ctx.newPage(); pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => d.dismiss());
    await pg.goto(url); if (espera) await pg.waitForFunction(espera, null, { timeout: 30000 });
    await pg.waitForSelector(sel, { state: "visible", timeout: 30000 }); await pg.waitForTimeout(2000);   // (o cabeçalho do scope ainda se rearruma: o botão sairia de baixo do mouse)
    return pg;
  };
  // passa o mouse em sel: a dica do MaiSim com o texto, sem o title; ao sair, o title de volta
  const confere = async (pg, sel, nome, foto) => {
    const t = await pg.$eval(sel, (e) => e.getAttribute("title"));
    ok(!!t, `${nome}: ${sel} tem title ("${t}")`);
    await pg.hover(sel); await pg.waitForTimeout(700);
    const d = await pg.evaluate((s) => { const e = document.querySelector(s), c = document.getElementById("dica-ui");
      const r = e.getBoundingClientRect(), k = c && c.getBoundingClientRect();
      return { title: e.getAttribute("title"), dica: e.dataset.dica, desc: e.getAttribute("aria-describedby"), vis: !!c && c.classList.contains("vis"),
        txt: c ? c.textContent : "", bg: c ? getComputedStyle(c).backgroundColor : "", perto: !!k && k.top < r.bottom + 40 && k.bottom > r.top - 40 && k.right > r.left - 40 && k.left < r.right + 40,
        dentro: !!k && k.left >= 0 && k.right <= innerWidth && k.top >= 0 && k.bottom <= innerHeight }; }, sel);
    const limpo = (s) => String(s || "").replace(/[()]/g, "");
    ok(d.vis && limpo(d.txt) === limpo(t), `${nome}: a dica do MaiSim à vista, com o texto ("${d.txt}")`);
    ok(d.title === null && d.dica === t, `${nome}: sem o title com o mouse em cima (o navegador não mostra a caixinha dele)`);
    ok(d.desc === "dica-ui", `${nome}: aria-describedby na dica enquanto ela está à vista`);
    ok(d.perto && d.dentro, `${nome}: a caixa junto do botão e dentro da tela`);
    ok(d.bg === "rgb(30, 41, 59)", `${nome}: no estilo do MaiSim (${d.bg})`);
    if (foto) await pg.screenshot({ path: foto });
    await pg.mouse.move(700, 600); await pg.waitForTimeout(250);
    const f = await pg.evaluate((s) => { const e = document.querySelector(s); return { title: e.getAttribute("title"), dica: e.dataset.dica, desc: e.getAttribute("aria-describedby"),
      vis: document.getElementById("dica-ui").classList.contains("vis") }; }, sel);
    ok(f.title === t && f.dica === undefined && f.desc === null && !f.vis, `${nome}: ao sair, o title de volta e a dica escondida`);
  };
  const SIMU = () => typeof dados !== "undefined" && dados && dados.folhas;
  let pg = await abre("http://localhost:7200/", "#bt-importar");
  await confere(pg, "#bt-importar", "início", "dicas_inicio.png");
  ok(await pg.evaluate(() => document.querySelectorAll("#dica-ui").length === 1 && document.querySelectorAll("#maisim-dica-css").length === 1), "início: uma dica só (o trilho a trouxe)");
  // pelo teclado (Tab): a dica do elemento com o foco
  await pg.evaluate(() => { const x = document.createElement("button"); x.id = "tab-dica"; x.title = "pelo teclado"; x.textContent = "·"; document.querySelector("main").prepend(x);
    const y = document.createElement("button"); y.id = "tab-antes"; y.textContent = "·"; document.querySelector("main").prepend(y); y.focus(); });
  await pg.keyboard.press("Tab"); await pg.waitForTimeout(700);
  ok(await pg.evaluate(() => document.activeElement.id === "tab-dica" && document.getElementById("dica-ui").classList.contains("vis") && document.getElementById("dica-ui").textContent === "pelo teclado"), "início: pelo Tab, a dica do elemento com o foco");
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(200);
  ok(await pg.evaluate(() => !document.getElementById("dica-ui").classList.contains("vis") && document.getElementById("tab-dica").title === "pelo teclado"), "início: Esc esconde a dica e devolve o title");
  // o foco pelo código (sem Tab) não mostra nada
  await pg.evaluate(() => { document.body.focus(); document.getElementById("tab-dica").focus(); }); await pg.waitForTimeout(600);
  ok(await pg.evaluate(() => !document.getElementById("dica-ui").classList.contains("vis") && document.getElementById("tab-dica").title === "pelo teclado"), "início: o foco pelo código não mexe no title");
  // no tamanho 125 % e no tema escuro: a caixa continua junto do botão
  await pg.evaluate(() => { localStorage.setItem("maisim-escala", "1.25"); localStorage.setItem("maisim-tema", "escuro"); }); await pg.reload(); await pg.waitForSelector("#bt-importar"); await pg.waitForTimeout(800);
  await confere(pg, "#bt-importar", "início a 125 % e escuro");
  await pg.evaluate(() => { localStorage.removeItem("maisim-escala"); localStorage.removeItem("maisim-tema"); }); await pg.close();

  pg = await abre("http://localhost:7200/maisim/simu/", "#bt-play", SIMU);
  await confere(pg, "#bt-play", "simu", "dicas_simu.png");
  ok(await pg.evaluate(() => document.querySelectorAll("#dica-ui").length === 1), "simu: uma dica só (a da página e a do trilho não se repetem)");
  await pg.close();
  pg = await abre("http://localhost:7201/maisim/simu/", "#bt-play", SIMU);   // direto na porta do simu, sem o trilho
  await confere(pg, "#bt-play", "simu na porta dele");
  await pg.close();
  pg = await abre("http://localhost:7200/maisim/scope/", "#bt-indice");
  await confere(pg, "#bt-indice", "scope", "dicas_scope.png");
  await pg.close();
  ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
