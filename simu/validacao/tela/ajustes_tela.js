// itens da revisão do cabeçalho (instância de teste: 7201 direto e a página de teste 7200 → 7201): atalhos mudos ao digitar o
// controle.py; a dica não pega o title do iframe do scope; o desenho reajusta quando o cabeçalho quebra; o plano B do trilho
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } }); const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  await pg.goto("http://localhost:7201/maisim/simu/?modelo=exemplos%2Fexemplo_controle_pi.ipes");
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-editar"); await pg.waitForTimeout(600); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-extra, .modal .m-ok"); await pg.waitForTimeout(800); }
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
  // 1. digitar no controle.py: w, 0, r não disparam conexão, ajustar nem girar
  await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
  const verAntes = await pg.evaluate(() => JSON.stringify(ver));
  await pg.click("#ctl-editor"); await pg.keyboard.type("# wr0w"); await pg.waitForTimeout(300);
  const d1 = await pg.evaluate(() => ({ fio: ed.fio.modo, ver: JSON.stringify(ver) }));
  ok(!d1.fio && d1.ver === verAntes, `digitando "wr0w" no controle.py: modo conexão ${d1.fio}, vista ${d1.ver === verAntes ? "igual" : "mudou"}`);
  await pg.keyboard.press("Control+z"); await pg.keyboard.press("Control+z");
  // 2. a dica não pega o iframe do scope (o title dele fica)
  await pg.click("#bt-scope"); await pg.waitForTimeout(1200);
  const ifr = await pg.$("#painel-scope iframe");
  if (ifr) { const bx = await ifr.boundingBox(); await pg.mouse.move(bx.x + 40, bx.y + 40); await pg.waitForTimeout(600);
    const d2 = await pg.evaluate(() => ({ vis: $("dica-ui").classList.contains("vis"), title: document.querySelector("#painel-scope iframe").getAttribute("title") }));
    ok(!d2.vis && d2.title !== null, `mouse no scope: sem dica presa, o iframe guarda o title ("${d2.title}")`); }
  else ok(false, "não achei o iframe do scope");
  await pg.mouse.move(700, 600);
  // 3. cabeçalho quebra em linhas: o desenho reajusta a proporção
  for (const w of [1500, 1000]) {
    await pg.setViewportSize({ width: w, height: 850 }); await pg.waitForTimeout(500);
    const a = await pg.evaluate(() => { const r = $("svg").getBoundingClientRect(); return { svg: r.width / r.height, ver: ver.w / ver.h, cab: document.querySelector("header").offsetHeight }; });
    ok(Math.abs(a.svg - a.ver) < 0.01, `${w} px (cabeçalho ${a.cab} px): proporção do desenho ${a.ver.toFixed(3)} = da área ${a.svg.toFixed(3)}`);
  }
  ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  // 4. plano B do trilho (página de teste 7200 → 7201): a 1ª carga do maisim-nav.js falha; ele monta mesmo assim
  const pg2 = await ctx.newPage(); await pg2.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */ let vezes = 0;
  await pg2.route("**/maisim-nav.js*", (r) => { vezes++; if (vezes === 1) r.abort(); else r.continue(); });
  await pg2.goto("http://localhost:7200/maisim/simu/?modelo=exemplos%2Fexemplo_controle_pi.ipes"); await pg2.waitForTimeout(3500);
  const t = await pg2.evaluate(() => ({ nav: !!document.getElementById("maisim-nav"), w: getComputedStyle(document.documentElement).getPropertyValue("--maisim-nav-w") }));
  ok(t.nav && t.w.trim() === "56px" && vezes === 2, `1ª carga do trilho falhou, a 2ª montou (${vezes} pedidos, largura ${t.w.trim()})`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
