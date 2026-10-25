// o painel XY do scope (Marcelo, 25/10: no lugar do "Space Vector Diagram" e do "U-Z*i Diagram" do Gecko), na instância de
// teste (simu 7201 → scope 7202): roda o inversor trifásico do exemplo (carga RL em estrela, 60 Hz), põe um painel XY no
// vetor espacial das correntes i_a, i_b, i_c (um círculo em volta da origem: o raio quase constante), o mesmo em dq com
// θ = 2π·f·t no sentido do giro (um ponto: o espalhamento pequeno perto do raio), um U–Z·i (v_an contra 10 Ω·i_a), confere Clarke e Park nos
// números, e que o layout (recarregar; exportar e importar as visões) guarda os painéis XY. As fotos: scope_xy_*.png
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const SIMU = "http://localhost:7201/maisim/simu/", SCOPE = "http://localhost:7202/maisim/scope/";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "scope_xy_"));
const api = async (rota, corpo) => (await fetch(SIMU + rota, corpo === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
(async () => {
  let b;
  try {
    // 1. a rodada: o exemplo do inversor trifásico, 50 ms (o Δt dele, 1 µs), 10 000 amostras
    const ab = await api("editor/abrir", { arq: "exemplos/exemplo_inversor_trifasico.ipes", modo: "descartar" });
    let r = await api("editor/rodar", { dt: "1e-6", tfim: "0.05", nome: "xy_trifasico", amostras: "10000" });
    for (let k = 0; k < 600 && ["preparando", "rodando", "pausada"].includes(r.estado); k++) { await new Promise((s) => setTimeout(s, 500)); r = await api("editor/rodada"); }
    ok(!ab.ERRO && r.estado === "fim" && r.arquivo, `a rodada do inversor trifásico: ${r.estado} (${r.arquivo || r.erro || ""})`);
    const lst = await (await fetch(SCOPE + "rodadas")).json(), base = path.basename(path.dirname(r.arquivo || "x/x"));
    const rod = lst.find((x) => x.arq.includes(base) && x.arq.endsWith(".npz"));
    ok(!!rod, `a rodada na lista do scope (${rod && rod.arq})`);
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
    const pg = await ctx.newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.addInitScript(() => { new MutationObserver(() => { const m = document.querySelector(".sc-modal");   // as perguntas do scope: aceita
      if (m && !m.dataset.visto) { m.dataset.visto = 1; setTimeout(() => m.querySelector(".sc-ok").click(), 50); } }).observe(document, { childList: true, subtree: true }); });
    const URL_A = SCOPE + "?a=" + encodeURIComponent(rod.arq);
    const abre = async () => { await pg.goto(URL_A); await pg.waitForFunction(() => typeof A !== "undefined" && A && A.dados && A.dados.t && itens.length, null, { timeout: 30000 }); await pg.waitForTimeout(400); };
    await abre();
    // 2. Clarke e Park nos números (as funções do scope): a fase a sozinha, um conjunto equilibrado, e o dq dele
    const num = await pg.evaluate(() => {
      let e = 0; const d = (u, v) => { e = Math.max(e, Math.abs(u[0] - v[0]), Math.abs(u[1] - v[1])); };
      d(clarke(1, -0.5, -0.5), [1, 0]); d(clarke(0, Math.sqrt(3) / 2, -Math.sqrt(3) / 2), [0, 1]); d(clarke(2, 2, 2), [0, 0]);   // a sequência zero some
      for (let k = 0; k < 24; k++) { const th = k * Math.PI / 12, V = 7.5, f = 0.3;
        const ab = clarke(V * Math.cos(th + f), V * Math.cos(th + f - 2 * Math.PI / 3), V * Math.cos(th + f + 2 * Math.PI / 3));
        d(ab, [V * Math.cos(th + f), V * Math.sin(th + f)]); d(park(ab[0], ab[1], th), [V * Math.cos(f), V * Math.sin(f)]); }
      d(park(0, 1, Math.PI / 2), [1, 0]);
      return e; });
    ok(num < 1e-12, `Clarke (α = (2a − b − c)/3, β = (b − c)/√3) e Park (d = α cos θ + β sin θ, q = −α sin θ + β cos θ) nos números: erro máximo ${num.toExponential(2)}`);
    // 3. + Painel XY: o vetor espacial das correntes (achadas pelos nomes i_a, i_b, i_c), nos últimos 2 períodos de 60 Hz
    await pg.click("#bt-painel-xy"); await pg.waitForTimeout(400);
    const xy = () => pg.evaluate(() => paineis().filter((p) => p.xy).map((p) => ({ xy: p.xy, stat: p.xyStat, n: (p.curvas || []).map((c) => c.x.length), u: !!p.u,
      sx: p.u && [p.u.scales.x.min, p.u.scales.x.max], sy: p.u && [p.u.scales.y.min, p.u.scales.y.max], w: p.u && p.u.bbox.width, h: p.u && p.u.bbox.height })));
    let X = await xy();
    ok(X.length === 1 && X[0].xy.modo === "vetor" && X[0].xy.a === "i_a" && X[0].xy.b === "i_b" && X[0].xy.c === "i_c" && X[0].u,
       `o painel XY novo: vetor espacial de ${X[0] && [X[0].xy.a, X[0].xy.b, X[0].xy.c].join(", ")}`);
    const cartao = () => pg.locator(".cartao.xy").last();
    const menu = async () => { if (!(await cartao().locator(".menu-xy").count())) await cartao().locator(".b-xy").click(); return cartao().locator(".menu-xy"); };
    await (await menu()).locator(".xy-jan").selectOption("ultimos");
    await (await menu()).locator(".xy-n").fill("2"); await (await menu()).locator(".xy-n").dispatchEvent("change");
    await (await menu()).locator(".xy-f0").fill("60"); await (await menu()).locator(".xy-f0").dispatchEvent("change");
    await pg.waitForTimeout(300); X = await xy();
    const s = X[0].stat, sx = X[0].sx, sy = X[0].sy, upx = (sx[1] - sx[0]) / X[0].w, upy = (sy[1] - sy[0]) / X[0].h;
    ok(s && s.r > 5 && s.rdp / s.r < 0.05 && Math.hypot(s.cx, s.cy) < 0.05 * s.r && X[0].n[0] > 500,
       `αβ das correntes (últimos 2 períodos, ${X[0].n[0]} pontos): círculo de raio ${s && s.r.toFixed(2)} A, desvio ${s && (100 * s.rdp / s.r).toFixed(2)} %, centro a ${s && (100 * Math.hypot(s.cx, s.cy) / s.r).toFixed(2)} % do raio`);
    ok(Math.abs(upx / upy - 1) < 1e-6, `a mesma escala nos dois eixos: ${upx.toPrecision(4)} e ${upy.toPrecision(4)} A/px`);
    await pg.mouse.move(0, 0);
    await cartao().locator(".b-xyi").click();
    const aj = await cartao().locator(".xy-ajuda").innerText();
    ok(/α = \(2a − b − c\)\/3/.test(aj) && /β = \(b − c\)\/√3/.test(aj), `o ⓘ explica o vetor espacial: "${aj.slice(0, 70)}…"`);
    await cartao().locator(".b-xyi").click();
    if (await cartao().locator(".menu-xy").count()) await cartao().locator(".menu-xy .menu-fecha").click();
    await cartao().screenshot({ path: path.join(__dirname, "scope_xy_vetor.png") });
    // 4. dq com θ = 2π·f·t: na frequência e no sentido do giro (o do exemplo é o horário: a sequência negativa, f = −60 Hz), o
    // conjunto equilibrado vira um ponto (o espalhamento pequeno perto do raio); no sentido errado, um círculo do mesmo raio (2ω)
    const giro = await pg.evaluate(() => { const cv = paineis().find((p) => p.xy).curvas[0]; let s = 0;
      for (let k = 1; k < cv.x.length; k++) s += cv.x[k - 1] * cv.y[k] - cv.y[k - 1] * cv.x[k]; return Math.sign(s); });
    await (await menu()).locator(".xy-dq").check(); await pg.waitForTimeout(200);
    const dq = async (f) => { await (await menu()).locator(".xy-f").fill(String(f)); await (await menu()).locator(".xy-f").dispatchEvent("change");
      await pg.waitForTimeout(300); return (await xy())[0]; };
    const errado = (await dq(-giro * 60)).stat;
    ok(errado.rdp / errado.r < 0.05 && Math.abs(errado.r - s.r) < 0.05 * s.r, `dq com θ girando ao contrário (f = ${-giro * 60} Hz): um círculo de raio ${errado.r.toFixed(2)} A`);
    X = [await dq(giro * 60)]; const q = X[0].stat;
    ok(X[0].xy.dq && q && q.espalha / s.r < 0.12 && Math.abs(Math.hypot(q.cx, q.cy) - s.r) < 0.05 * s.r,
       `dq com θ = 2π·(${giro * 60} Hz)·t: um ponto em (${q && q.cx.toFixed(2)}, ${q && q.cy.toFixed(2)}) A, |dq| = ${q && Math.hypot(q.cx, q.cy).toFixed(2)} (o raio do αβ: ${s.r.toFixed(2)}), espalhado em ${q && (100 * q.espalha / s.r).toFixed(1)} % do raio`);
    await (await menu()).locator(".menu-fecha").click();
    await cartao().screenshot({ path: path.join(__dirname, "scope_xy_dq.png") });
    // 5. outro painel XY, no modo U–Z·i: v_an contra 10 Ω · i_a (a carga é 10 Ω + 10 mH: uma elipse inclinada)
    await pg.click("#bt-painel-xy"); await pg.waitForTimeout(400);
    await (await menu()).locator('[data-modo="uzi"]').click(); await pg.waitForTimeout(200);
    await (await menu()).locator(".xy-u.xy-0").selectOption("v_an"); await (await menu()).locator(".xy-i.xy-0").selectOption("i_a");
    await (await menu()).locator(".xy-z.xy-0").fill("10"); await (await menu()).locator(".xy-z.xy-0").dispatchEvent("change");
    await (await menu()).locator(".xy-media").fill("200"); await (await menu()).locator(".xy-media").dispatchEvent("change");   // a média do Gecko: tira o PWM do v_an
    await pg.waitForTimeout(300);
    const uz = await pg.evaluate(() => { const p = paineis().filter((x) => x.xy).pop(), cv = p.curvas[0], g = (c) => grossa(A, c);
      let ymx = 0, imx = 0; for (let k = 0; k < cv.y.length; k++) ymx = Math.max(ymx, Math.abs(cv.y[k]));
      const ia = g("i_a"); for (let k = 0; k < ia.length; k++) imx = Math.max(imx, Math.abs(ia[k]));
      const px = (() => { const c = p.u.ctx.canvas, d = p.u.ctx.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 90 && d[i + 2] < 90) n++; return n; })();
      return { modo: p.xy.modo, n: p.curvas.length, pts: cv.x.length, ymx, imx, px, rot: cv.rot, ax: p.u.axes.map((a) => a.label) }; });
    ok(uz.modo === "uzi" && uz.n === 1 && uz.pts > 1000 && uz.px > 300 && Math.abs(uz.ymx / (10 * uz.imx) - 1) < 0.05 && uz.ax[0] === "u (V)" && uz.ax[1] === "Z·i (V)",
       `U–Z·i: ${uz.rot}, ${uz.pts} pontos, ${uz.px} pixels em vermelho (a cor do Gecko), |Z·i| máx ${uz.ymx.toFixed(1)} V ≈ 10·|i_a| máx ${(10 * uz.imx).toFixed(1)}; eixos ${uz.ax.join(" × ")}`);
    await (await menu()).locator(".menu-fecha").click();
    await cartao().locator(".b-xyi").click();
    const aj2 = await cartao().locator(".xy-ajuda").innerText();
    ok(/U-Z\*i Diagram/.test(aj2) && /Z·i/.test(aj2), "o ⓘ explica o U–Z·i do Gecko");
    await cartao().screenshot({ path: path.join(__dirname, "scope_xy_uzi.png") });
    // 6. o layout: recarregar mantém os dois painéis XY (com o modo, o dq, a janela e o par)
    const confere = (Y, txt) => ok(Y.length === 2 && Y[0].xy.modo === "vetor" && Y[0].xy.dq && Y[0].xy.jan.tipo === "ultimos" && Math.abs(Y[0].xy.th.f) === 60 &&
      Y[1].xy.modo === "uzi" && Y[1].xy.pares[0].u === "v_an" && Y[1].xy.pares[0].z === 10 && Y[1].xy.media === 200 && Y.every((y) => y.u && y.n[0] > 100),
      `${txt}: ${Y.map((y) => `${y.xy.modo}${y.xy.dq ? " dq" : ""} (${y.n[0]} pontos)`).join(", ")}`);
    await abre(); confere(await xy(), "recarregado, os painéis XY voltam");
    // exportar as visões, voltar ao automático, importar: os painéis XY voltam
    const [down] = await Promise.all([pg.waitForEvent("download"), pg.click("#bt-exportar")]);
    const arq = path.join(TMP, down.suggestedFilename()); await down.saveAs(arq);
    const v = JSON.parse(fs.readFileSync(arq, "utf8"));
    ok(v.layout.itens.filter((x) => x.xy).length === 2, `exportado com os 2 painéis XY (${v.layout.itens.length} itens)`);
    await pg.click("#bt-layout"); await pg.click("#bt-padrao"); await pg.waitForTimeout(400);
    const semXY = (await xy()).length;
    await pg.setInputFiles("#arq-visoes", arq); await pg.waitForTimeout(1200);
    ok(semXY === 0, "o layout automático: sem painel XY"); confere(await xy(), "importadas as visões, os painéis XY voltam");
    // 7. o cursor de um painel do tempo marca o instante nas trajetórias (tCursor)
    const tp = pg.locator(".cartao:not(.xy) .u-over").first(), bx = await tp.boundingBox();
    await pg.mouse.move(bx.x + bx.width * 0.6, bx.y + bx.height / 2); await pg.waitForTimeout(200);
    const tc = await pg.evaluate(() => tCursor);
    ok(tc > 0 && tc < 50, `o cursor de tempo chega aos painéis XY (t = ${tc && tc.toFixed(3)} ms)`);
    ok(!erros.length, `sem erros na página (${erros.join(" | ")})`);
  } catch (e) { ok(false, "exceção: " + (e.stack || e)); }
  finally { if (b) await b.close(); fs.rmSync(TMP, { recursive: true, force: true }); }
  console.log(falhas ? `${falhas} FALHA(S)` : "tudo OK");
  process.exit(falhas ? 1 : 0);
})();
