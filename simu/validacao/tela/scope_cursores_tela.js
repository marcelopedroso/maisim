// os cursores A e B do Medir (instância de teste 7200 → scope 7202), pedido de Marcelo em 23/10 ("mostrar Δt e Δy, arrastar
// as pontas e medir de um ponto ao outro"): numa gravação com um seno conhecido (1 kHz, amplitude 2), ligar mostra A e B;
// um período entre eles dá Δt = 1 ms, 1/Δt = 1 kHz, Δy ≈ 0; do pico ao vale, Δy ≈ −4; arrastar a linha a move sem dar zoom;
// os cursores ficam no layout (recarregada, voltam) e o PNG sai com Δt
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const PASTA = path.join(__dirname, "..", "tmp_scope_cursores"), RAIZ = path.resolve(__dirname, "../../..");
fs.mkdirSync(PASTA, { recursive: true });
const NPZ = path.join(PASTA, "scope_cursores.npz");
require("child_process").execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.01, 1e-6)
meta = {"planta": "gecko-maisim", "rotulo": "cursores", "modelo": "x/circuito_cursores.ipes", "dt": 1e-6, "Ts": 1e-6, "tfim": 0.01, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(NPZ)}, meta=np.array(json.dumps(meta)), t=t, v_o=2 * np.sin(2 * np.pi * 1000 * t))`]);
const URL = "http://localhost:7200/maisim/scope/?a=" + encodeURIComponent(path.relative(RAIZ, NPZ));
(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem("ja")) { sessionStorage.setItem("ja", "1");
      localStorage.setItem("maisim-scope-layout-v5:x/circuito_cursores.ipes", JSON.stringify({ itens: [{ titulo: "Seno", sinais: ["v_o"] }] })); } });
    const pg = await ctx.newPage(); const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    const abre = async () => { await pg.goto(URL); await pg.waitForFunction(() => typeof A !== "undefined" && A && A.dados && paineis().some((p) => p.u), null, { timeout: 20000 }); await pg.waitForTimeout(300); };
    const leitura = () => pg.evaluate(() => { const el = document.querySelector(".med-cur");
      return { dt: el.querySelector(".cur-dt").textContent, linha: [...el.querySelectorAll("tbody td")].map((t) => t.textContent), nome: el.querySelector("tbody td.nome").innerHTML }; });
    const poe = (a, b2) => pg.evaluate(([x, y]) => { const p = paineis()[0]; p.med.cur.a = x; p.med.cur.b = y; p.u.redraw(false, false); }, [a, b2]);
    await abre();
    await pg.click(".cartao .b-med"); await pg.waitForSelector(".medicao .m-modo");
    const modos0 = await pg.$$eval(".medicao .m-modo", (bs) => bs.map((b) => b.dataset.k + (b.classList.contains("ativo") ? "+" : "")).join(" "));
    await pg.click('.medicao .m-modo[data-k="ct"]'); await pg.waitForTimeout(200);
    const lig = await pg.evaluate(() => { const c = paineis()[0].med.cur; return { on: c.on, a: c.a, b: c.b, vis: !!document.querySelector(".med-cur .cur-dt") }; });
    ok(modos0 === "fourier+ ct cy" && lig.on && lig.vis && lig.a > 0 && lig.b > lig.a,
      `o Medir abre só com o Fourier (${modos0}); "Cursores t" liga A e B no terço e nos dois terços do visível (${lig.a.toFixed(2)} e ${lig.b.toFixed(2)} ms) e a leitura embaixo`);
    // um período (do pico ao pico seguinte): Δt = 1 ms, 1/Δt = 1 kHz, Δy ≈ 0; o nome em notação
    await poe(2.25, 3.25); await pg.waitForTimeout(150);
    const l1 = await leitura();
    ok(/Δt = 1 ms/.test(l1.dt) && /1\/Δt = 1 kHz/.test(l1.dt) && Math.abs(+l1.linha[1] - 2) < 0.01 && Math.abs(+l1.linha[3]) < 0.01 && /<sub>o<\/sub>/.test(l1.nome),
      `um período: ${l1.dt.replace(/\s+/g, " ")}; y(A) = ${l1.linha[1]}, Δy = ${l1.linha[3]} (v_o em notação)`);
    // do pico ao vale: Δy ≈ −4
    await poe(2.25, 2.75); await pg.waitForTimeout(150);
    const l2 = await leitura();
    ok(/Δt = 500 µs/.test(l2.dt) && Math.abs(+l2.linha[3] + 4) < 0.01, `do pico ao vale: ${l2.dt.replace(/\s+/g, " ")}; Δy = ${l2.linha[3]}`);
    // arrastar a linha A: ela anda, o zoom não muda
    const antes = await pg.evaluate(() => { const p = paineis()[0]; const r = p.u.over.getBoundingClientRect();
      return { x: r.left + p.u.valToPos(p.med.cur.a, "x"), y: r.top + r.height / 2, esc: [p.u.scales.x.min, p.u.scales.x.max], a: p.med.cur.a }; });
    await pg.mouse.move(antes.x, antes.y); await pg.mouse.down(); await pg.mouse.move(antes.x + 60, antes.y, { steps: 6 }); await pg.mouse.up(); await pg.waitForTimeout(200);
    const depois = await pg.evaluate(() => { const p = paineis()[0]; return { esc: [p.u.scales.x.min, p.u.scales.x.max], a: p.med.cur.a }; });
    ok(depois.a > antes.a + 0.05 && Math.abs(depois.esc[0] - antes.esc[0]) < 1e-9 && Math.abs(depois.esc[1] - antes.esc[1]) < 1e-9,
      `arrastar a linha A: ${antes.a.toFixed(3)} → ${depois.a.toFixed(3)} ms, sem zoom`);
    // guardados fora do que está à vista (outra rodada, outro zoom): desligar e ligar os traz de volta para a tela
    await pg.evaluate(() => { const p = paineis()[0]; p.med.cur.a = 100; p.med.cur.b = 120; });
    await pg.click('.medicao .m-modo[data-k="ct"]'); await pg.click('.medicao .m-modo[data-k="ct"]'); await pg.waitForTimeout(150);
    const volta = await pg.evaluate(() => { const p = paineis()[0], c = p.med.cur; return c.on && c.a >= p.u.scales.x.min && c.b <= p.u.scales.x.max; });
    ok(volta, "cursores guardados fora da tela: ao religar, voltam ao que está à vista");
    // os cursores y (C e D, horizontais): os níveis e o Δy; arrastar a linha C a sobe ou desce
    await pg.click('.medicao .m-modo[data-k="cy"]'); await pg.waitForTimeout(150);
    await pg.evaluate(() => { const p = paineis()[0]; p.med.cur.ya = -1; p.med.cur.yb = 1.5; p.u.redraw(false, false); }); await pg.waitForTimeout(150);
    const ly = await pg.evaluate(() => document.querySelector(".med-cur .cur-y").textContent.replace(/\s+/g, " "));
    const cy = await pg.evaluate(() => { const p = paineis()[0], r = p.u.over.getBoundingClientRect(); return { x: r.left + r.width * 0.9, y: r.top + p.u.valToPos(-1, "y"), ya: p.med.cur.ya }; });
    await pg.mouse.move(cy.x, cy.y); await pg.mouse.down(); await pg.mouse.move(cy.x, cy.y - 30, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(150);
    const ya2 = await pg.evaluate(() => paineis()[0].med.cur.ya);
    ok(/C -1/.test(ly) && /D 1.5/.test(ly) && /Δy = 2.5/.test(ly) && ya2 > cy.ya + 0.1, `cursores y: ${ly}; arrastar C para cima: ${cy.ya} → ${ya2.toFixed(2)}`);
    // o Fourier desligado: somem a tabela e os campos; os cursores continuam
    await pg.click('.medicao .m-modo[data-k="fourier"]'); await pg.waitForTimeout(150);
    const semF = await pg.evaluate(() => ({ tab: getComputedStyle(document.querySelector(".med-tab")).display, cab: getComputedStyle(document.querySelector(".med-cab")).display,
      cur: !!document.querySelector(".med-cur .cur-dt"), cy: !!document.querySelector(".med-cur .cur-y") }));
    ok(semF.tab === "none" && semF.cab === "none" && semF.cur && semF.cy, "Fourier desligado: a tabela e os campos somem; os cursores t e y ficam");
    // o "combinar" (Σ e x̄) não é do Fourier: fica no topo, com o Fourier desligado continua; "nenhum" tira as curvas
    const comb0 = await pg.evaluate(() => ({ topo: !!document.querySelector(".med-topo .m-comb"), vis: getComputedStyle(document.querySelector(".m-comb")).display !== "none" }));
    await pg.selectOption(".medicao .m-comb", "nenhum"); await pg.waitForTimeout(200);
    const somas = await pg.evaluate(() => paineis()[0].series.filter((se) => se.soma).length);
    ok(comb0.topo && comb0.vis && somas === 0, "o combinar fica no topo do Medir (à vista sem o Fourier); \"nenhum\" tira Σ e x̄");
    // ficam no layout; o PNG sai
    await abre();
    const volta2 = await pg.evaluate(() => { const m = paineis()[0].med, c = m.cur; return c.on && c.yon && !m.fourier && c.b > c.a; });
    const fig = await pg.evaluate(() => { const c = canvasPainel(paineis()[0]); return c.width > 100 && c.height > 100; });
    ok(volta2 && fig, "recarregada, os cursores e os modos voltam (no layout do painel); o PNG sai");
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
