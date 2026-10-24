// a Potência na medição do scope (página de teste 7200 → scope 7202), Marcelo em 24/10 ("medição de potência no Medir"):
// os pares v/i pelos nomes, a curva p(t) = v(t)·i(t) e a tabela (P, V_rms, I_rms, S, λ, P₁, Q₁) na janela do Fourier.
// Gravação feita aqui (apagada no fim): v_a = 100 sin ωt, i_a = 10 sin(ωt − 30°) → P = P₁ = 433,0 W, Q₁ = 250 VAr,
// S = 70,71 · 7,071 = 500 VA, λ = 0,866; v_b = 100 sin(ωt − 120°), i_b = 5 sin(ωt − 60°) → P = 125 W, Q₁ = −216,5 VAr
// (a corrente adiantada). Uma em CC (V_dc · I_dc), um par fora do padrão dos nomes (v_o, i_L) e o Comparar. Sem fotos.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const SM = path.resolve(__dirname, "../../.."), PASTA = path.join(__dirname, "..", "tmp_scope_potencia");
const B = "http://localhost:7200";
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const perto = (a, b, tol) => Math.abs(a - b) <= tol;
(async () => {
  let b;
  try {
    fs.mkdirSync(PASTA, { recursive: true });
    const grava = (x, ia) => { const arq = path.join(PASTA, `scope_pot_${x}.npz`);
      execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.04, 1e-4); w = 2 * np.pi * 50; r = np.pi / 180
meta = {"planta": "gecko-maisim", "rotulo": "pot_${x}", "dt": 1e-4, "Ts": 1e-4, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.04, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(arq)}, meta=np.array(json.dumps(meta)), t=t, v_a=100*np.sin(w*t), i_a=${ia}*np.sin(w*t - 30*r),
         v_b=100*np.sin(w*t - 120*r), i_b=5*np.sin(w*t - 60*r), v_o=100*np.sin(w*t), i_L=${ia}*np.sin(w*t - 30*r),
         V_dc=300 + 0*t, I_dc=2 + 0.5*np.cos(3*w*t))`]);
      return path.relative(SM, arq); };
    const ra = grava("A", 10), rb = grava("B", 20);
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    // o painel do teste: o 1º com a v_a ao abrir (ou o da Potência ligada, recarregada), guardado em window.__painel
    const ev = (f, arg) => pg.evaluate(new Function("arg", `const p = window.__painel; return (${f})(p, arg);`), arg);
    const abre = async (url, sinais) => {
      await pg.goto(url);
      await pg.waitForFunction(() => typeof paineis === "function" && paineis().some((p) => p.u && p.sinais.includes("v_a")), null, { timeout: 30000 });
      await pg.evaluate(() => { window.__painel = paineis().find((x) => x.u && x.med.pot.on) || paineis().find((x) => x.u && x.sinais.includes("v_a")); });
      if (sinais) await pg.evaluate((ss) => { const p = window.__painel;
        p.sinais = ss; criaGrafico(p);
        if (!p.med.aberto) p.el.querySelector(".b-med").click(); else mudaMed(p);
        if (!p.med.pot.on) p.el.querySelector('.m-modo[data-k="pot"]').click(); }, sinais);
      await pg.waitForTimeout(500);
    };
    const tabela = () => ev((p) => [...p.el.querySelectorAll(".med-pot tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent.trim())));
    const pares = () => ev((p) => [...p.el.querySelectorAll(".pot-par")].map((s) => [s.querySelector(".pot-v").value, s.querySelector(".pot-i").value]));
    const num = (s) => parseFloat(String(s));
    await abre(`${B}/maisim/scope/?a=${encodeURIComponent(ra)}`, ["v_a", "v_b", "i_b", "i_a"]);
    // os pares pelo sufixo (não pela ordem): v_a ↔ i_a, v_b ↔ i_b
    let pr = await pares();
    ok(JSON.stringify(pr) === JSON.stringify([["v_a", "i_a"], ["v_b", "i_b"]]), `os pares pelos nomes: ${JSON.stringify(pr)}`);
    let t = await tabela();
    const la = t.find((l) => l[0] === "pa"), lb = t.find((l) => l[0] === "pb");
    ok(la && /W$/.test(la[1]) && perto(num(la[1]), 433.0, 0.05) && perto(num(la[2]), 70.71, 0.005) && perto(num(la[3]), 7.071, 0.0005) && /VA$/.test(la[4]) && perto(num(la[4]), 500, 0.05)
       && perto(num(la[5]), 0.866, 0.0005) && perto(num(la[6]), 433.0, 0.05) && /VAr$/.test(la[7]) && perto(num(la[7]), 250, 0.05) && perto(num(la[8]), 30, 0.05) && /^200/.test(la[9]),
       `p_a: ${la && la.join(" | ")} (esperado P 433,0 W, 70,71 V, 7,071 A, S 500 VA, λ 0,866, P₁ 433,0 W, Q₁ 250 VAr, φ₁ 30°, N 200)`);
    ok(lb && perto(num(lb[1]), 125, 0.05) && perto(num(lb[4]), 250, 0.05) && perto(num(lb[5]), 0.5, 0.0005) && perto(num(lb[7]), -216.5, 0.05) && perto(num(lb[8]), -60, 0.05),
       `p_b (corrente adiantada): ${lb && lb.join(" | ")} (esperado P 125 W, S 250 VA, λ 0,5, Q₁ −216,5 VAr, φ₁ −60°)`);
    // a curva p(t) no gráfico: p = v·i amostra a amostra, o nome p_a na notação (p com o "a" subscrito) e o valor na legenda
    const curva = (nome) => ev((p, nome) => {
      const i = p.series.findIndex((se) => se.pot && se.canal === nome), u = p.u, d = u.data, k = 37;
      if (i < 0) return null;
      const iv = p.series.findIndex((se) => se.canal === p.series[i].pot[0] && !se.pot), ii = p.series.findIndex((se) => se.canal === p.series[i].pot[1] && !se.pot);
      u.setCursor({ left: u.valToPos(d[0][k], "x"), top: 20 });
      const lin = [...u.root.querySelectorAll(".u-legend .u-series")][i + 1];
      return { y: d[i + 1][k], vi: iv >= 0 && ii >= 0 ? (d[iv + 1][k] / p.series[iv].ganho) * (d[ii + 1][k] / p.series[ii].ganho) : null, t: d[0][k], show: u.series[i + 1].show,
               rot: p.series[i].rot, html: lin ? lin.querySelector(".u-label").innerHTML : "", leg: lin ? lin.textContent.replace(/\s+/g, " ").trim() : "", cor: p.series[i].cor, ymax: u.scales.y.max,
               escala: u.series[i + 1].scale, pmax: u.scales.p ? u.scales.p.max : null, eixoP: u.axes.some((a) => a.scale === "p") };
    }, nome);
    let cv = await curva("p_a");
    const w = 2 * Math.PI * 50, pa = (ms) => 100 * Math.sin(w * ms / 1e3) * 10 * Math.sin(w * ms / 1e3 - Math.PI / 6);
    ok(cv && cv.rot === "p_a" && Math.abs(cv.y - cv.vi) < 1e-9 && Math.abs(cv.y - pa(cv.t)) < 1e-6 && /<sub>a<\/sub>/.test(cv.html) && />p</.test(cv.html) && /^pa:? ?-?[\d.]+/.test(cv.leg),
       `a curva p_a(t): p(${cv && cv.t} ms) = ${cv && cv.y} = v·i (${cv && cv.vi}); legenda "${cv && cv.leg}"`);
    // o eixo da potência (Marcelo, 24/10: com v ~ 100 V e p ~ 1 kW no mesmo eixo, um dos dois ficava espremido): as curvas p(t)
    // na escala "p", com o eixo à direita em W, a faixa cobrindo p; o eixo da esquerda (v, i) com a mesma faixa de sem a Potência
    const eixos = () => ev((p) => { const u = p.u, d = u.data, k = u.axes.findIndex((a) => a.scale === "p"), ax = u.axes[k];
      const fx = (f) => { let lo = Infinity, hi = -Infinity; p.series.forEach((se, i) => { if (!f(se) || !u.series[i + 1].show) return;
        for (const v of d[i + 1]) if (v != null && v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }); return [lo, hi]; };
      return { y: [u.scales.y.min, u.scales.y.max], p: u.scales.p && u.scales.p.min != null ? [u.scales.p.min, u.scales.p.max] : null,
               ax: ax ? { side: ax.side, label: ax.label, vals: (ax._values || []).filter(Boolean), cor: ax.stroke && ax.stroke() } : null,
               pot: fx((se) => se.pot), vi: fx((se) => !se.pot), escalas: p.series.map((se, i) => [se.canal, u.series[i + 1].scale]) }; });
    const e1 = await eixos();
    await ev((p) => p.el.querySelector('.m-modo[data-k="pot"]').click()); await pg.waitForTimeout(400);
    const e0 = await eixos();
    await ev((p) => p.el.querySelector('.m-modo[data-k="pot"]').click()); await pg.waitForTimeout(400);
    const cobre = (r, f) => r && r[0] <= f[0] && r[1] >= f[1];
    ok(e1.ax && e1.ax.side === 1 && e1.ax.label === "potência p(t)" && e1.ax.vals.length >= 2 && e1.ax.vals.every((v) => / k?W$/.test(v))
       && e1.escalas.every(([c, s]) => s === (/^p_/.test(c) ? "p" : "y")) && cobre(e1.p, e1.pot) && e1.pot[1] > 900 && e1.p[1] < 1.2 * e1.pot[1],
       `o eixo da potência: à direita (side ${e1.ax && e1.ax.side}), "${e1.ax && e1.ax.label}", marcas ${e1.ax && e1.ax.vals.join(" · ")}; p de ${e1.pot.map((v) => v.toFixed(0)).join(" a ")} W na faixa ${e1.p && e1.p.map((v) => v.toFixed(0)).join(" … ")}`);
    ok(!e0.ax && !e0.p && cobre(e1.y, e1.vi) && e1.y[1] < 150 && Math.abs(e1.y[0] - e0.y[0]) < 1e-9 && Math.abs(e1.y[1] - e0.y[1]) < 1e-9,
       `o eixo de v e i: ${e1.y.map((v) => v.toFixed(1)).join(" … ")} com a Potência, ${e0.y.map((v) => v.toFixed(1)).join(" … ")} sem ela (o eixo da potência some: ${!e0.ax})`);
    // Y fixo: o eixo da potência também (em branco, automático); Automática solta os dois
    await ev((p) => p.el.querySelector(".b-y").click());
    const temCampos = await ev((p) => !!p.el.querySelector(".menu-y .p-max"));
    await ev((p) => { const m = p.el.querySelector(".menu-y"); m.querySelector(".y-min").value = -200; m.querySelector(".y-max").value = 200;
      m.querySelector(".p-min").value = -500; m.querySelector(".p-max").value = 1500; m.querySelector(".y-ok").click(); });
    await pg.waitForTimeout(300);
    const ef = await eixos(), pf = await ev((p) => p.pFixo);
    await ev((p) => p.el.querySelector(".b-y").click()); await ev((p) => p.el.querySelector(".menu-y .y-auto").click()); await pg.waitForTimeout(300);
    const ea = await eixos();
    ok(temCampos && ef.y[0] === -200 && ef.y[1] === 200 && ef.p[0] === -500 && ef.p[1] === 1500 && JSON.stringify(pf) === "[-500,1500]"
       && Math.abs(ea.y[1] - e1.y[1]) < 1e-9 && Math.abs(ea.p[1] - e1.p[1]) < 1e-9,
       `Y fixo: v/i ${ef.y.join(" … ")}, p ${ef.p.join(" … ")} W (no layout: ${JSON.stringify(pf)}); Automática: ${ea.y[1].toFixed(1)} e ${ea.p[1].toFixed(0)} W de novo`);
    // o ×2 da tela na v_a não muda nem a curva nem a tabela (valores reais)
    await ev((p) => { p.ganhos = { v_a: 2 }; criaGrafico(p); });
    await pg.waitForTimeout(300);
    const cg = await curva("p_a"); t = await tabela();
    ok(cg && Math.abs(cg.y - pa(cg.t)) < 1e-6 && perto(num(t.find((l) => l[0] === "pa")[1]), 433.0, 0.05), `com v_a ×2 na tela: p_a(t) = ${cg && cg.y} e P = ${t[0][1]} (os reais)`);
    await ev((p) => { p.ganhos = {}; criaGrafico(p); });
    // escondida na legenda: a escala da potência volta (a de v e i não muda) e fica escondida no gráfico refeito (no layout);
    // escondidas as duas, o eixo da potência sai; uma de volta, ele volta
    const c1 = await curva("p_a"), esconde = (nome, show) => ev((p, [nome, show]) => p.u.setSeries(1 + p.series.findIndex((se) => se.pot && se.canal === nome), { show }), [nome, show]);
    await esconde("p_a", false); await pg.waitForTimeout(400);
    await ev((p) => criaGrafico(p)); await pg.waitForTimeout(300);
    const ch = await curva("p_a"), oc = await ev((p) => p.med.oculta["pot:p_a"]);
    ok(c1.escala === "p" && c1.pmax > 900 && ch && !ch.show && oc === true && ch.pmax < 450 && Math.abs(ch.ymax - c1.ymax) < 1e-9,
       `p_a escondida na legenda: o eixo da potência de ${c1.pmax && c1.pmax.toFixed(0)} para ${ch && ch.pmax.toFixed(0)} W, o de v e i fica em ${ch && ch.ymax.toFixed(1)}; refeito, continua escondida`);
    await esconde("p_b", false); await pg.waitForTimeout(400);
    const semEixo = !(await curva("p_a")).eixoP;
    await esconde("p_a", true); await pg.waitForTimeout(400);
    const cv2 = await curva("p_a");
    await esconde("p_b", true); await pg.waitForTimeout(300);
    ok(semEixo && cv2.eixoP && cv2.show && cv2.pmax > 900, `as duas escondidas: sem o eixo da potência (${semEixo}); p_a de volta: o eixo volta (${cv2.eixoP}, até ${cv2.pmax && cv2.pmax.toFixed(0)} W)`);
    // trocar a corrente do 1º par (v_a com i_b): o nome vira p_{a,b}, e os números os do par novo (φ₁ = 60°: 125 W, 216,5 VAr)
    await ev((p) => { const s = p.el.querySelector('.pot-par[data-k="0"] .pot-i'); s.value = "i_b"; s.dispatchEvent(new Event("change")); });
    await pg.waitForTimeout(400);
    pr = await pares(); t = await tabela();
    const lab = t.find((l) => l[0] === "pa,b"), tem = await ev((p) => ({ pares: p.med.pot.pares, auto: !!p.el.querySelector(".pot-auto"), curva: p.series.filter((se) => se.pot).map((se) => se.canal) }));
    ok(JSON.stringify(pr) === JSON.stringify([["v_a", "i_b"], ["v_b", "i_b"]]) && lab && perto(num(lab[1]), 125, 0.05) && perto(num(lab[7]), 216.5, 0.05) && tem.auto
       && tem.curva.join() === "p_a_b,p_b", `v_a com i_b: ${lab && lab.join(" | ")}; pares ${JSON.stringify(tem.pares)}; curvas ${tem.curva.join(", ")}`);
    // recarregada: os pares escolhidos e a Potência ligada estão no layout
    await abre(`${B}/maisim/scope/?a=${encodeURIComponent(ra)}`);
    pr = await pares();
    const lig = await ev((p) => ({ on: p.med.pot.on, aberto: p.med.aberto, ativo: p.el.querySelector('.m-modo[data-k="pot"]').classList.contains("ativo") }));
    ok(JSON.stringify(pr) === JSON.stringify([["v_a", "i_b"], ["v_b", "i_b"]]) && lig.on && lig.aberto && lig.ativo, `a página recarregada: ${JSON.stringify(pr)}, Potência ligada (${JSON.stringify(lig)})`);
    // Automático: de volta aos pares pelos nomes; ✕ tira um par; + par põe outro
    await ev((p) => p.el.querySelector(".pot-auto").click()); await pg.waitForTimeout(300);
    const pAuto = await pares(), semAuto = await ev((p) => !p.el.querySelector(".pot-auto"));
    await ev((p) => p.el.querySelector('.pot-par[data-k="1"] .pot-rem').click()); await pg.waitForTimeout(300);
    const pRem = await pares(), cRem = await ev((p) => p.series.filter((se) => se.pot).map((se) => se.canal));
    await ev((p) => p.el.querySelector(".pot-add").click()); await pg.waitForTimeout(300);
    const pAdd = await pares();
    ok(JSON.stringify(pAuto) === JSON.stringify([["v_a", "i_a"], ["v_b", "i_b"]]) && semAuto && JSON.stringify(pRem) === JSON.stringify([["v_a", "i_a"]]) && cRem.join() === "p_a"
       && JSON.stringify(pAdd) === JSON.stringify([["v_a", "i_a"], ["v_b", "i_b"]]),
       `Automático ${JSON.stringify(pAuto)}; ✕ no 2º ${JSON.stringify(pRem)} (curvas ${cRem.join(", ")}); + par ${JSON.stringify(pAdd)}`);
    // o Fourier desligado: a janela (t₀, n, f₀) continua à vista, sem os campos do Fourier; a tabela da potência também
    await ev((p) => p.el.querySelector('.m-modo[data-k="fourier"]').click()); await pg.waitForTimeout(300);
    const sf = await ev((p) => ({ cab: getComputedStyle(p.el.querySelector(".med-cab")).display, hs: getComputedStyle(p.el.querySelector(".m-hs").parentElement).display,
                                  tab: getComputedStyle(p.el.querySelector(".med-tab")).display, pot: getComputedStyle(p.el.querySelector(".med-pot")).display, fourier: p.med.fourier }));
    t = await tabela();
    ok(!sf.fourier && sf.cab !== "none" && sf.hs === "none" && sf.tab === "none" && sf.pot !== "none" && perto(num(t[0][1]), 433.0, 0.05),
       `sem o Fourier: a janela à vista (${sf.cab}), os harmônicos não (${sf.hs}), a tabela do Fourier não (${sf.tab}), a da potência sim (P ${t[0][1]})`);
    // os cursores t: p_a(A) e p_a(B) na leitura, iguais a v·i
    await ev((p) => { p.el.querySelector('.m-modo[data-k="ct"]').click(); p.med.cur.a = 2.5; p.med.cur.b = 7.5; p.u.redraw(false, false); });
    await pg.waitForTimeout(300);
    const lc = await ev((p) => [...p.el.querySelectorAll(".med-cur tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent.trim())).find((l) => l[0] === "pa"));
    ok(lc && perto(num(lc[1]), pa(2.5), 0.02) && perto(num(lc[2]), pa(7.5), 0.02), `cursores: p_a(A = 2,5 ms) = ${lc && lc[1]} (${pa(2.5).toFixed(3)}), p_a(B = 7,5 ms) = ${lc && lc[2]} (${pa(7.5).toFixed(3)})`);
    await ev((p) => { p.el.querySelector('.m-modo[data-k="ct"]').click(); p.el.querySelector('.m-modo[data-k="fourier"]').click(); });
    // janela além da gravação: janela incompleta, como no Fourier
    await ev((p) => { p.med.t0 = 35; mudaMed(p); }); await pg.waitForTimeout(300);
    t = await tabela();
    ok(t.length && /janela incompleta/.test(t[0][1]), `t₀ = 35 ms (a gravação vai até 40): ${t[0] && t[0].slice(0, 2).join(" | ")}`);
    await ev((p) => { p.med.t0 = 0; mudaMed(p); }); await pg.waitForTimeout(300);
    // o idioma: os textos da Potência trocam
    await pg.evaluate(() => maisimI18n.muda("en")); await pg.waitForTimeout(500);
    const en = await ev((p) => ({ bt: p.el.querySelector('.m-modo[data-k="pot"]').textContent.trim(), cab: [...p.el.querySelectorAll(".med-pot th")].map((th) => th.textContent.trim()),
                                  pares: p.el.querySelector(".pot-pares b").textContent, add: p.el.querySelector(".pot-add").textContent,
                                  eixo: (p.u.axes.find((a) => a.scale === "p") || {}).label }));
    await pg.evaluate(() => maisimI18n.muda("pt")); await pg.waitForTimeout(500);
    const pt = await ev((p) => ({ bt: p.el.querySelector('.m-modo[data-k="pot"]').textContent.trim(), cab0: p.el.querySelector(".med-pot th").textContent.trim(), add: p.el.querySelector(".pot-add").textContent,
                                  eixo: (p.u.axes.find((a) => a.scale === "p") || {}).label }));
    ok(en.bt === "Power" && en.cab[0] === "pair" && /mean of p/.test(en.cab[1]) && en.pares === "v · i pairs" && en.add === "+ pair" && en.eixo === "power p(t)"
       && pt.bt === "Potência" && pt.cab0 === "par" && pt.add === "+ par" && pt.eixo === "potência p(t)",
       `em inglês: ${en.bt}, "${en.cab.slice(0, 2).join(" / ")}", "${en.pares}", "${en.add}", eixo "${en.eixo}"; de volta: ${pt.bt}, "${pt.cab0}", eixo "${pt.eixo}"`);
    // fora do padrão dos nomes (v_o com i_L): a 1ª tensão com a 1ª corrente, a curva p_{o,L}
    await ev((p) => { p.sinais = ["v_o", "i_L"]; criaGrafico(p); mudaMed(p); }); await pg.waitForTimeout(300);
    pr = await pares(); t = await tabela();
    ok(JSON.stringify(pr) === JSON.stringify([["v_o", "i_L"]]) && t[0] && t[0][0] === "po,L" && perto(num(t[0][1]), 433.0, 0.05), `v_o e i_L: ${JSON.stringify(pr)}, ${t[0] && t[0].slice(0, 2).join(" | ")}`);
    // CC: P = média de v·i = 300 · 2 = 600 W; sem fundamental: P₁ = Q₁ = 0; I_rms = √(4 + 0,5²/2) = 2,031 A
    await ev((p) => { p.sinais = ["V_dc", "I_dc"]; criaGrafico(p); mudaMed(p); }); await pg.waitForTimeout(300);
    t = await tabela();
    const dc = t[0];
    ok(dc && dc[0] === "pdc" && perto(num(dc[1]), 600, 0.05) && perto(num(dc[2]), 300, 0.05) && perto(num(dc[3]), 2.031, 0.0005) && dc[6] === "0 W" && dc[7] === "0 VAr",
       `CC (V_dc · I_dc): ${dc && dc.join(" | ")} (esperado 600 W, 300 V, 2,031 A, P₁ 0 W, Q₁ 0 VAr)`);
    // Comparar: um p por gravação (B com i_a de 20 A: P = 866 W), a curva da B tracejada
    await ev((p) => { p.sinais = ["v_a", "i_a"]; criaGrafico(p); mudaMed(p); });
    await abre(`${B}/maisim/scope/?a=${encodeURIComponent(ra)}&b=${encodeURIComponent(rb)}`);
    t = await tabela();
    const ca = t.find((l) => l[0] === "pa · A"), cb = t.find((l) => l[0] === "pa · B");
    const tr = await ev((p) => p.series.filter((se) => se.pot).map((se) => [se.rot, !!se.dash]));
    ok(ca && cb && perto(num(ca[1]), 433.0, 0.05) && perto(num(cb[1]), 866.0, 0.05) && JSON.stringify(tr) === JSON.stringify([["p_a · A", false], ["p_a · B", true]]),
       `Comparar: ${ca && ca.slice(0, 2).join(" ")} e ${cb && cb.slice(0, 2).join(" ")}; curvas ${JSON.stringify(tr)}`);
    // canais do passo fino com ondulação correlacionada (o Codex, no #68): v = 10 ± 2 e i = 1 ± 0,5 em fase, trocando a cada
    // passo fino (50 kHz, acima da janela de controle de 100 µs): P = média de v·i = 10 + 2·0,5 = 11 W, não 10 · 1 = 10. A tabela
    // mede no passo fino; a curva, sem o zoom fino, é a média do produto em cada janela (11), e com o zoom fino o produto (18 e 4)
    const rf = path.join(PASTA, "scope_pot_F.npz");
    execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.04, 1e-4); w = 2 * np.pi * 50; q = (-1.0) ** np.arange(len(t) * 10)
meta = {"planta": "gecko-maisim", "rotulo": "pot_F", "dt": 1e-5, "Ts": 1e-4, "n_fino": 10, "dt_gecko": 1e-6, "tfim": 0.04, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(rf)}, meta=np.array(json.dumps(meta)), t=t, v_a=100*np.sin(w*t), i_a=10*np.sin(w*t - np.pi/6), fino_VDC=10 + 2*q, fino_IA=1 + 0.5*q)`]);
    await abre(`${B}/maisim/scope/?a=${encodeURIComponent(path.relative(SM, rf))}`, ["fino_VDC", "fino_IA"]);
    pr = await pares(); t = await tabela();
    const lf = t[0];
    const media = (x0, x1) => ev((p, [x0, x1]) => { const i = p.series.findIndex((se) => se.pot), d = p.u.data; let s = 0, c = 0;
      for (let k = 0; k < d[0].length; k++) if (d[0][k] >= x0 - 1e-9 && d[0][k] < x1 - 1e-9 && d[i + 1][k] === d[i + 1][k]) { s += d[i + 1][k]; c++; }
      return { m: s / c, c, fino: modoFino(p), max: Math.max(...Array.from(d[i + 1]).filter((v) => v === v)) }; }, [x0, x1]);
    const mg = await media(0, 20);
    ok(JSON.stringify(pr) === JSON.stringify([["fino_VDC", "fino_IA"]]) && lf && perto(num(lf[1]), 11, 0.005) && perto(num(lf[2]), Math.sqrt(104), 0.005) && perto(num(lf[3]), Math.sqrt(1.25), 0.0005)
       && /^2000/.test(lf[9]) && !mg.fino && mg.c === 200 && perto(mg.m, 11, 1e-9) && perto(mg.max, 11, 1e-9),
       `passo fino, ondulação em fase: tabela ${lf && lf.slice(0, 4).join(" | ")} (11 W, 10,20 V, 1,118 A, N ${lf && lf[9]}); curva sem zoom: média ${mg.m} em ${mg.c} janelas (11, não 10)`);
    await ev((p) => mudaX(p, [0, 5])); await pg.waitForTimeout(500);
    const mf = await media(0, 5);
    ok(mf.fino && perto(mf.m, 11, 1e-9) && perto(mf.max, 18, 1e-9), `com o zoom fino (0 … 5 ms): o produto no passo fino (máx ${mf.max} = 12 · 1,5), média ${mf.m} em ${mf.c} pontos = P`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
