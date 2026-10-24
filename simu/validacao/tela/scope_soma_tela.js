// a linha Σ da medição do scope (página de teste 7200 → scope 7202), Marcelo em 20/10 ("no medir podia ter um somatório"):
// a soma, ponto a ponto, dos sinais da tabela, medida como um sinal. Gravação feita aqui (apagada no fim): três fases de
// 180 V com uma sequência zero conhecida (médias 1, 2 e 3 V; 10 V de 3ª harmônica em fase nas três) → Σ: média 6 V,
// h1 ≈ 0 (as fundamentais se cancelam), h3 = 30 V ∠ 0°. Clicar no nome tira o sinal do Σ (e põe de volta); no Comparar,
// um Σ por gravação. Sem fotos.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const SM = path.resolve(__dirname, "../../.."), PASTA = path.join(__dirname, "..", "tmp_scope_soma");
const B = "http://localhost:7200";
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    fs.mkdirSync(PASTA, { recursive: true });
    const grava = (x, k) => { const arq = path.join(PASTA, `scope_soma_${x}.npz`);
      execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.04, 1e-4); w = 2 * np.pi * 50; z = ${10 + 5 * k} * np.cos(3 * w * t)
meta = {"planta": "gecko-maisim", "rotulo": "soma_${x}", "dt": 1e-4, "Ts": 1e-4, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.04, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(arq)}, meta=np.array(json.dumps(meta)), t=t, Va=1 + 180*np.cos(w*t) + z, Vb=2 + 180*np.cos(w*t-2*np.pi/3) + z, Vc=3 + 180*np.cos(w*t+2*np.pi/3) + z)`]);
      return path.relative(SM, arq); };
    const ra = grava("A", 0), rb = grava("B", 1);
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    const abre = async (url) => {
      await pg.goto(url);
      await pg.waitForFunction(() => typeof paineis === "function" && paineis().some((p) => p.u && p.sinais.includes("Va")), null, { timeout: 30000 });
      await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va"));
        p.sinais = ["Va", "Vb", "Vc"]; criaGrafico(p); p.med.hs = "1, 3"; p.med.comb = "ambos";   // o padrão do combinar é "nenhum"
        if (!p.med.aberto) p.el.querySelector(".b-med").click(); else mudaMed(p); });   // o Medir aberto fica no layout
      await pg.waitForTimeout(500);
    };
    const tabela = () => pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va"));
      return [...p.el.querySelectorAll(".med-tab tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent.trim())); });
    await abre(`${B}/maisim/scope/?a=${encodeURIComponent(ra)}`);
    let t = await tabela();
    const soma = t.find((l) => l[0].startsWith("Σ"));
    const num = (s) => parseFloat(String(s).split("∠")[0]), ang = (s) => parseFloat(String(s).split("∠")[1]);
    ok(t.length === 5 && soma && /3 sinais/.test(soma[0]) && Math.abs(num(soma[1]) - 6) < 1e-6 && num(soma[2]) < 1e-6 && Math.abs(num(soma[3]) - 30) < 1e-6
       && Math.abs(ang(soma[3])) < 0.1 && soma[2] === "0" && soma[4] === "–",
       `Σ de Va, Vb e Vc: ${soma && soma.join(" | ")} (esperado: média 6, h1 = 0 sem fase, h3 = 30 ∠ 0°, THD – : a fundamental é zero)`);
    // a curva Σ(t) no gráfico: Va(t) + Vb(t) + Vc(t) = 6 + 30 cos(3ωt), e o valor dela na legenda
    const curva = () => pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va"));
      const i = p.series.findIndex((se) => se.soma), u = p.u;
      if (i < 0) return null;
      const d = u.data, y = d[i + 1], k = 37, soma = (se) => se.soma.reduce((acc, c) => acc + d[1 + p.series.findIndex((q) => q.canal === c && q.F === se.F && !q.soma)][k], 0);
      u.setCursor({ left: u.valToPos(d[0][k], "x"), top: 20 });
      const leg = [...u.root.querySelectorAll(".u-legend .u-series")].map((tr) => tr.textContent.replace(/\s+/g, " ").trim());
      return { rot: p.series[i].rot, partes: p.series[i].soma, y: y[k], esperado: soma(p.series[i]), t: d[0][k], show: u.series[i + 1].show,
               leg: leg.find((x) => x.startsWith("Σ")) || "", ymax: u.scales.y.max };
    });
    let cv = await curva();
    const w = 2 * Math.PI * 50;
    ok(cv && cv.rot === "Σ" && cv.partes.join() === "Va,Vb,Vc" && Math.abs(cv.y - cv.esperado) < 1e-9 && Math.abs(cv.y - (6 + 30 * Math.cos(3 * w * cv.t / 1e3))) < 1e-6
       && /^Σ:? ?-?[\d.]+/.test(cv.leg), `a curva Σ(t) no gráfico: Σ(${cv && cv.t} ms) = ${cv && cv.y} (6 + 30 cos 3ωt), legenda "${cv && cv.leg}"`);
    // x̄ = Σ/3 (o "combinar" em "Σ e x̄"): na tabela, média 2, h1 0, h3 10 ∠ 0°; no gráfico, a curva x̄(t) = Σ(t)/3
    const xm = t.find((l) => l[0].startsWith("x̄"));
    const cx = await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va"));
      const iS = p.series.findIndex((se) => se.comb === "soma"), iM = p.series.findIndex((se) => se.comb === "media"), k = 37, d = p.u.data;
      const leg = [...p.u.root.querySelectorAll(".u-legend .u-series")].map((tr) => tr.textContent.replace(/\s+/g, " ").trim());
      return iM < 0 ? null : { rot: p.series[iM].rot, ys: d[iS + 1][k], ym: d[iM + 1][k], leg: leg.find((x) => x.startsWith("x̄")) || "", sel: p.el.querySelector(".m-comb").value }; });
    ok(xm && /3 sinais/.test(xm[0]) && Math.abs(num(xm[1]) - 2) < 1e-6 && xm[2] === "0" && Math.abs(num(xm[3]) - 10) < 1e-6 && Math.abs(ang(xm[3])) < 0.1 && xm[4] === "–"
       && cx && cx.sel === "ambos" && cx.rot === "x̄" && Math.abs(cx.ym - cx.ys / 3) < 1e-9 && /^x̄/.test(cx.leg),
       `x̄ (média instantânea, Σ/3): tabela ${xm && xm.join(" | ")}; curva x̄ = ${cx && cx.ym} = Σ/3 (${cx && cx.ys}); legenda "${cx && cx.leg}"; combinar = ${cx && cx.sel}`);
    // só a média: sem a linha nem a curva Σ
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); const sel = p.el.querySelector(".m-comb");
      sel.value = "media"; sel.dispatchEvent(new Event("change")); });
    await pg.waitForTimeout(300);
    t = await tabela();
    const so = await pg.evaluate(() => paineis().find((x) => x.u && x.sinais.includes("Va")).series.filter((se) => se.soma).map((se) => se.rot));
    ok(!t.some((l) => l[0].startsWith("Σ")) && t.some((l) => l[0].startsWith("x̄")) && so.join() === "x̄", `combinar = só x̄: tabela ${t.map((l) => l[0]).join(", ")}; curvas ${so.join(", ")}`);
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); const sel = p.el.querySelector(".m-comb");
      sel.value = "ambos"; sel.dispatchEvent(new Event("change")); });
    await pg.waitForTimeout(300);
    t = await tabela();
    // tirar o Vc do Σ: Va + Vb = 3 + 180∠−60° + 20∠0° na 3ª
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va"));
      [...p.el.querySelectorAll(".med-tab td.nome")].find((td) => td.textContent.includes("Vc")).click(); });
    await pg.waitForTimeout(300);
    t = await tabela();
    let s2 = t.find((l) => l[0].startsWith("Σ"));
    ok(s2 && /2 sinais/.test(s2[0]) && Math.abs(num(s2[1]) - 3) < 1e-6 && Math.abs(num(s2[2]) - 180) < 1e-3 && Math.abs(ang(s2[2]) + 60) < 0.1 && Math.abs(num(s2[3]) - 20) < 1e-6,
       `clique no Vc: o Σ fica com Va + Vb (${s2 && s2.join(" | ")}; esperado 3, 180 ∠ −60°, 20)`);
    cv = await curva();
    const vcVisivel = await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); return p.u.series[1 + p.series.findIndex((se) => se.canal === "Vc" && !se.soma)].show; });
    ok(cv && cv.partes.join() === "Va,Vb" && Math.abs(cv.y - cv.esperado) < 1e-9 && vcVisivel === false,
       `e a curva Σ(t) também: ${cv && cv.partes.join(" + ")}; a curva do Vc some do gráfico (show ${vcVisivel})`);
    // o contrário: esconder na legenda tira do Σ (Marcelo, 20/10: escondidos na legenda, o Σ somava os 20 sinais)
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); p.espFora.clear(); criaGrafico(p); });
    await pg.waitForTimeout(300);
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); p.u.setSeries(1 + p.series.findIndex((se) => se.canal === "Vb" && !se.soma), { show: false }); });
    await pg.waitForTimeout(500);
    cv = await curva();
    t = await tabela();
    const xb = t.find((l) => l[0].startsWith("x̄")), linhaVb = await pg.evaluate(() => paineis().find((x) => x.u && x.sinais.includes("Va")).el.querySelector('.med-tab tr[data-chave="Vb|A"]').className);
    ok(cv && cv.partes.join() === "Va,Vc" && /2 sinais/.test(xb[0]) && Math.abs(num(xb[1]) - 2) < 1e-6 && /fora/.test(linhaVb),
       `Vb escondido na legenda: Σ = ${cv && cv.partes.join(" + ")}, x̄ ${xb && xb.join(" | ")} ((1 + 3)/2 = 2), a linha do Vb apagada na tabela`);
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); p.u.setSeries(1 + p.series.findIndex((se) => se.canal === "Vb" && !se.soma), { show: true }); });
    await pg.waitForTimeout(500);
    cv = await curva();
    ok(cv && cv.partes.join() === "Va,Vb,Vc", `mostrado de novo na legenda: volta ao Σ (${cv && cv.partes.join(" + ")})`);
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); p.espFora.add("Vc|A"); criaGrafico(p); });
    await pg.waitForTimeout(300);
    t = await tabela();
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va"));
      [...p.el.querySelectorAll(".med-tab td.nome")].find((td) => td.textContent.includes("Va")).click(); });
    await pg.waitForTimeout(300);
    t = await tabela(); s2 = t.find((l) => l[0].startsWith("Σ"));
    ok(s2 && /\(1 sinal\)/.test(s2[0]) && /pelo menos 2 sinais/.test(s2[1]) && !(await curva()), `só o Vb: o Σ pede 2 sinais e a curva sai (${s2 && s2.join(" | ")})`);
    // fechar o Medir: a curva sai; abrir: volta
    const fechaAbre = () => pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); p.espFora.clear(); p.el.querySelector(".b-med").click(); });
    await fechaAbre(); await pg.waitForTimeout(300);
    const semMed = await curva();
    await fechaAbre(); await pg.waitForTimeout(400);
    ok(!semMed && (await curva()) !== null, "fechar o Medir tira a curva Σ; abrir põe de volta");
    // três fases equilibradas: o Σ da tabela é 0 limpo (antes, 2,4e-15 | 3,7e-12 ∠ −166,7° | THD 1,56 %)
    const req = path.join(PASTA, "scope_soma_eq.npz");
    execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.04, 1.4e-4); w = 2 * np.pi * 50
meta = {"planta": "gecko-maisim", "rotulo": "soma_eq", "dt": 1.4e-4, "Ts": 1.4e-4, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.04, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(req)}, meta=np.array(json.dumps(meta)), t=t, Va=180*np.cos(w*t + 0.23), Vb=180*np.cos(w*t + 0.23 - 2*np.pi/3), Vc=180*np.cos(w*t + 0.23 + 2*np.pi/3))`]);
    await abre(`${B}/maisim/scope/?a=${encodeURIComponent(path.relative(SM, req))}`);
    t = await tabela();
    const seq = t.find((l) => l[0].startsWith("Σ"));
    const ceq = await curva();
    ok(seq && seq[1] === "0" && seq[2] === "0" && seq[3] === "0" && seq[4] === "–" && ceq && Math.abs(ceq.y) < 1e-9 && /^Σ:? ?0$/.test(ceq.leg),
       `três fases equilibradas, passo de 140 µs: Σ ${seq && seq.join(" | ")} (0, 0, 0, –); na legenda "${ceq && ceq.leg}" (a curva: ${ceq && ceq.y})`);
    // a Σ grande (três sinais de ~200: Σ ~600) escondida na legenda: a escala vertical volta à dos sinais
    const rvc = path.join(PASTA, "scope_soma_vc.npz");
    execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.04, 1e-4); w = 2 * np.pi * 50
meta = {"planta": "gecko-maisim", "rotulo": "soma_vc", "dt": 1e-4, "Ts": 1e-4, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.04, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(rvc)}, meta=np.array(json.dumps(meta)), t=t, Va=200 + 10*np.cos(w*t), Vb=195 + 10*np.cos(w*t), Vc=205 + 10*np.cos(w*t))`]);
    await abre(`${B}/maisim/scope/?a=${encodeURIComponent(path.relative(SM, rvc))}`);
    const y1 = (await curva()).ymax;
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); p.u.setSeries(p.series.findIndex((se) => se.soma) + 1, { show: false }); });
    await pg.waitForTimeout(400);
    const c2 = await curva();
    ok(y1 > 600 && c2 && !c2.show && c2.ymax < 250, `Σ ~600 com sinais ~200: escala até ${y1 && y1.toFixed(0)}; escondida na legenda, até ${c2 && c2.ymax.toFixed(0)}`);
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); p.med.t0 = 0; mudaMed(p); });   // refeito: continua escondida
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); criaGrafico(p); });
    await pg.waitForTimeout(300);
    const c3 = await curva();
    ok(c3 && !c3.show && c3.ymax < 250, "o gráfico refeito: a Σ continua escondida");
    await abre(`${B}/maisim/scope/?a=${encodeURIComponent(path.relative(SM, rvc))}`);     // recarregada: está no layout
    const c4 = await curva();
    ok(c4 && !c4.show && c4.ymax < 250, `a página recarregada: a Σ continua escondida (escala até ${c4 && c4.ymax.toFixed(0)})`);
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); p.u.setSeries(p.series.findIndex((se) => se.soma) + 1, { show: true }); });
    // Comparar: um Σ por gravação (B tem 15 V de 3ª: Σ h3 = 45)
    await abre(`${B}/maisim/scope/?a=${encodeURIComponent(ra)}&b=${encodeURIComponent(rb)}`);
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); p.espFora.clear(); mede(p); });
    await pg.waitForTimeout(300);
    t = await tabela();
    const sa = t.find((l) => l[0].startsWith("Σ · A")), sb = t.find((l) => l[0].startsWith("Σ · B"));
    ok(sa && sb && Math.abs(num(sa[3]) - 30) < 1e-6 && Math.abs(num(sb[3]) - 45) < 1e-6, `Comparar: Σ · A h3 ${sa && sa[3]}, Σ · B h3 ${sb && sb[3]}`);
    // passo que não divide o período (380 µs, como numa rodada longa do simu): antes, "janela incompleta: 685 de 684"
    const r380 = path.join(PASTA, "scope_soma_380.npz");
    execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.3, 380e-6); w = 2 * np.pi * 50
meta = {"planta": "gecko-maisim", "rotulo": "soma_380", "dt": 380e-6, "Ts": 380e-6, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.3, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(r380)}, meta=np.array(json.dumps(meta)), t=t, Va=5 + 180*np.cos(w*t + np.pi/6) + 20*np.cos(3*w*t), Vb=180*np.cos(w*t - np.pi/2), Vc=180*np.cos(w*t + 5*np.pi/6))`]);
    await abre(`${B}/maisim/scope/?a=${encodeURIComponent(path.relative(SM, r380))}`);
    await pg.evaluate(() => { const p = paineis().find((x) => x.u && x.sinais.includes("Va")); p.med.t0 = 0; p.med.n = 13; p.espFora.clear(); mede(p); });
    await pg.waitForTimeout(300);
    t = await tabela();
    const va = t.find((l) => l[0] === "Va"), s3 = t.find((l) => l[0].startsWith("Σ"));
    ok(va && Math.abs(num(va[1]) - 5) < 1e-3 && Math.abs(num(va[2]) - 180) < 1e-2 && Math.abs(ang(va[2]) - 30) < 0.05 && Math.abs(num(va[3]) - 20) < 1e-3
       && Math.abs(parseFloat(va[4]) - 11.11) < 0.01 && /^≈ \d+/.test(va[5]),
       `passo de 380 µs, 13 períodos (684,2 amostras; antes "janela incompleta"): Va ${va && va.join(" | ")} (esperado 5, 180 ∠ 30°, 20, THD 11,11 %, N com ≈)`);
    ok(s3 && Math.abs(num(s3[1]) - 5) < 1e-3 && num(s3[2]) < 1e-6 && Math.abs(num(s3[3]) - 20) < 1e-3 && s3[4] === "–",
       `e o Σ das três: ${s3 && s3.join(" | ")} (média 5, h1 = 0, h3 = 20, THD –)`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
