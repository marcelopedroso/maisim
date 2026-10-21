// Comparar com intervalos diferentes (instância isolada: Vite 7210 → scope de teste 7211; ../sobe_fila.sh), achado de
// Marcelo em 19/10: a mesma senoide de 50 Hz gravada com 100 µs (A) e com 200 µs (B). Antes, a amostra k da B ia no
// instante da k da A (a B no dobro da velocidade); agora cada uma nos seus instantes, com o aviso, a medição da B com o
// intervalo dela e a lista com o circuito e o intervalo. Com os mesmos instantes, nada muda (sem aviso)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const SM = path.resolve(__dirname, "../../.."), PASTA = path.join(__dirname, "..", "tmp_comparar");
const grava = (nome, dt) => { const arq = path.join(PASTA, `scope_${nome}.npz`);
  execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.04 + 1e-12, ${dt}); w = 2 * np.pi * 50
meta = {"planta": "gecko-maisim", "rotulo": "${nome}", "modelo": "circuito_teste.ipes", "dt": ${dt}, "Ts": ${dt}, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.04,
        "sinais": [{"canal": "Va", "elemento": "VOLT.1"}], "acionamentos": []}
np.savez(${JSON.stringify(arq)}, meta=np.array(json.dumps(meta)), t=t, Va=180*np.cos(w*t))`]); return path.relative(SM, arq); };
(async () => {
  let b;
  try {
    fs.mkdirSync(PASTA, { recursive: true });
    const A = grava("cem", 1e-4), B = grava("duzentos", 2e-4);
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    const abre = async (a, bb) => { await pg.goto(`http://localhost:7210/maisim/scope/?so=rodada&a=${encodeURIComponent(a)}&b=${encodeURIComponent(bb)}`);
      await pg.waitForFunction(() => [...document.querySelectorAll(".cartao")].some((c) => c._painel && c._painel.u), null, { timeout: 30000 }); await pg.waitForTimeout(500); };
    await abre(A, B);
    const st = await pg.textContent("#status");
    ok(/intervalos diferentes \(A 100 µs, B 200 µs\): cada uma nos seus instantes/.test(st), `aviso: "${st.slice(-80)}"`);
    // cada série nos seus instantes: o valor da B em t (ms) é 180·cos(2π·50·t) — não o da amostra k da A
    const r = await pg.evaluate(() => { const p = [...document.querySelectorAll(".cartao")].map((c) => c._painel).find((q) => q.u); const u = p.u;
      const ib = p.series.findIndex((se) => se.F === B) + 1, ia = p.series.findIndex((se) => se.F === A) + 1;
      const err = (i) => { let m = 0, n = 0; for (let k = 0; k < u.data[0].length; k++) { const v = u.data[i][k]; if (v == null) continue; n++;
        m = Math.max(m, Math.abs(v - 180 * Math.cos(2 * Math.PI * 50 * u.data[0][k] / 1e3))); } return [m, n]; };
      return { a: err(ia), b: err(ib), x: u.data[0].length }; });
    ok(r.b[0] < 1e-6 && r.a[0] < 1e-6 && r.b[1] === 201 && r.a[1] === 401, `B nos instantes dela: erro máx ${r.b[0].toExponential(1)} V em ${r.b[1]} pontos (A: ${r.a[0].toExponential(1)} V em ${r.a[1]}); eixo com ${r.x} instantes`);
    // a medição da B usa o intervalo dela
    const dts = await pg.evaluate(() => [amostras(A, "Va", 0, 0.02).dt, amostras(B, "Va", 0, 0.02).dt, amostras(B, "Va", 0, 0.02).x.length]);
    ok(dts[0] === 1e-4 && dts[1] === 2e-4 && dts[2] === 100, `medição: A com ${dts[0] * 1e6} µs, B com ${dts[1] * 1e6} µs (${dts[2]} amostras num período de 20 ms)`);
    // a lista: o circuito e o intervalo
    const ops = await pg.evaluate(() => [...document.querySelectorAll("#sel-a option")].map((o) => o.textContent).filter((x) => /cem|duzentos/.test(x)));
    ok(ops.some((x) => /^MaiSim \/ simu · circuito_teste · cem · .* · 100 µs$/.test(x)) && ops.some((x) => / · duzentos · .* · 200 µs$/.test(x)), `lista: ${ops.join(" | ")}`);
    // os mesmos instantes: como sempre, sem aviso
    await abre(A, A);
    ok(!/intervalos diferentes/.test(await pg.textContent("#status")) && await pg.evaluate(() => uniao === null), "A × A: os mesmos instantes, sem aviso (casar pela amostra, o de sempre)");
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
