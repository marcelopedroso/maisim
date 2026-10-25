// o tamanho do MaiSim (+ e − no pé do trilho; página de teste 7200 → 7201 e a página inicial da 7200): de 80 % a 140 %,
// guardado no navegador e aplicado antes de pintar; o desenho acerta o clique com o zoom; o scope embutido não escala de
// novo; o seminário (sem trilho) fica sem o zoom; o ícone novo do simu no trilho
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const URL = "http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent(require("os").homedir() + "/.cache/maisim_teste/circuitos/exemplo_controle_pwm.ipes");
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } }); const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    const carrega = async (u) => { await pg.goto(u); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas && document.getElementById("maisim-nav"), null, { timeout: 30000 }); };
    await pg.goto("http://localhost:7200/maisim-nav.js"); await pg.evaluate(() => { localStorage.removeItem("maisim-escala"); });
    await carrega(URL);
    const est = () => pg.evaluate(() => ({ zoom: document.documentElement.style.zoom || "1", pct: document.querySelector("#maisim-nav .escala .pct").textContent,
      mais: document.querySelector("#maisim-nav .mais").disabled, menos: document.querySelector("#maisim-nav .menos").disabled, guardado: localStorage.getItem("maisim-escala") }));
    const e0 = await est();
    ok(e0.zoom === "1" && e0.pct === "100%" && !e0.mais && !e0.menos, `começa em 100% (+ e − no pé do trilho)`);
    ok(await pg.evaluate(() => /M2\.5 8h4\.3/.test(document.querySelector('#maisim-nav a[href="/maisim/simu/"]').innerHTML)), "ícone novo do simu no trilho (circuito com resistor e o simular)");
    await pg.click("#maisim-nav .mais"); await pg.click("#maisim-nav .mais"); await pg.waitForTimeout(300);
    const e1 = await est();
    ok(e1.zoom === "1.25" && e1.pct === "125%" && e1.guardado === "1.25", `+ + → ${e1.pct} (zoom ${e1.zoom}, guardado)`);
    await pg.click("#maisim-nav .mais"); await pg.waitForTimeout(200);
    const e2 = await est();
    ok(e2.pct === "140%" && e2.mais, "até 140% (o + desliga no limite)");
    for (let k = 0; k < 6; k++) await pg.click("#maisim-nav .menos").catch(() => {});
    const e3 = await est();
    ok(e3.pct === "80%" && e3.menos && !e3.mais, "até 80% (o − desliga no limite)");
    await pg.click("#maisim-nav .mais"); await pg.click("#maisim-nav .mais"); await pg.click("#maisim-nav .mais"); await pg.click("#maisim-nav .mais"); await pg.waitForTimeout(200);
    ok((await est()).pct === "125%", "de volta a 125%");
    // recarregar: aplicado antes de pintar (o script do <head>), antes do trilho
    await pg.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { window.__zoomCedo = document.documentElement.style.zoom; }); });
    await carrega(URL);
    ok(await pg.evaluate(() => window.__zoomCedo) === "1.25" && (await est()).pct === "125%", "ao recarregar: 125% já no começo da página (sem piscar em 100%)");
    // o desenho acerta o clique com o zoom
    await pg.click("#bt-editar"); await pg.waitForTimeout(600); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-extra, .modal .m-ok"); await pg.waitForTimeout(800); }
    await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
    await pg.click('#abas button[data-aba="Circuit"]');
    const alvo = await pg.evaluate(() => { const gx = Math.round((ver.x + ver.w * 0.5) / G), gy = Math.round((ver.y + ver.h * 0.85) / G);
      const s = $("svg"), c = document.createElementNS("http://www.w3.org/2000/svg", "circle"); c.setAttribute("cx", gx * G); c.setAttribute("cy", gy * G); c.setAttribute("r", 1); s.appendChild(c);
      const r = c.getBoundingClientRect(); c.remove(); return { gx, gy, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const antes = await pg.evaluate(() => dados.folhas["0"].elementos.map((x) => x.nome));
    await pg.click('#itens .item[data-id="C"]'); await pg.mouse.click(alvo.x, alvo.y); await pg.waitForTimeout(1000);
    const novo = await pg.evaluate((a) => dados.folhas["0"].elementos.filter((x) => !a.includes(x.nome)).map((x) => [x.nome, x.x, x.y]), antes);
    ok(novo.length === 1 && novo[0][1] === alvo.gx && novo[0][2] === alvo.gy, `com 125%, o capacitor cai no ponto clicado (${alvo.gx}, ${alvo.gy}) → ${JSON.stringify(novo)}`);
    if (novo.length) { await pg.evaluate(async (n) => { await fetch("editor/cmd", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "DELETE", args: [n] }) }); }, novo[0][0]); }
    // o scope embutido (iframe) não escala por cima do simu
    await pg.click("#bt-scope"); await pg.waitForTimeout(2500);
    const fr = pg.frames().find((f) => /\/maisim\/scope\//.test(f.url()));
    ok(fr && (await fr.evaluate(() => document.documentElement.style.zoom || "1")) === "1", "o scope embutido não escala de novo (o simu já escala)");
    // a página inicial escala, e o cartão do simu leva a ele com o mesmo tamanho
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#maisim-nav", { timeout: 20000 }); await pg.waitForTimeout(500);
    ok(await pg.evaluate(() => document.documentElement.style.zoom) === "1.25", "página inicial: 125%");
    await pg.click("#cartao-novo"); await pg.waitForURL(/\/maisim\/simu\//);   // "+ Novo circuito" (22/10: no lugar do cartão Simu)
    await pg.waitForFunction(() => document.getElementById("maisim-nav"), null, { timeout: 20000 }); await pg.waitForTimeout(500);
    ok(await pg.evaluate(() => document.documentElement.style.zoom) === "1.25", "cartão + Novo circuito da página inicial: abre o simu, 125%");
    await pg.goto("http://localhost:7200/maisim-nav.js"); await pg.evaluate(() => localStorage.removeItem("maisim-escala"));
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
