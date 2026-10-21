// o tema no scope (página de teste 5010: simu 8768, scope 8776), Marcelo em 20/10: "a aba scope não está respeitando os
// temas" — o simu escuro e o scope dentro dele branco. Agora o scope lê o tema do PEW (localStorage "pew-tema") antes de
// pintar e acompanha as trocas (o trilho de outra página grava; aqui chega o evento storage): a página, os eixos e a grade
// do uPlot e o espectro. Uma gravação feita aqui (apagada no fim). Sem fotos.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const SM = path.resolve(__dirname, "../../.."), PASTA = path.join(__dirname, "..", "tmp_scope_tema");
const B = "http://localhost:5010";
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const ESCURO = { fundo: "rgb(15, 17, 21)", cartao: "rgb(23, 26, 33)" }, CLARO = { fundo: "rgb(247, 248, 250)", cartao: "rgb(255, 255, 255)" };
const estado = (f) => f.evaluate(() => {
  const p = paineis().find((x) => x.u), cs = (el) => getComputedStyle(el).backgroundColor;
  const bt = document.querySelector("header select, header button"), v = (x) => (typeof x === "function" ? x(p.u, 1) : x);
  return { tema: document.documentElement.dataset.tema, fundo: cs(document.body), cartao: p ? cs(p.el) : null, campo: bt ? cs(bt) : null,
    eixo: p ? v(p.u.axes[1].stroke) : null, grade: p ? v(p.u.axes[1].grid.stroke) : null, marca: p ? !!p.u._marca : null, temaDesenhado };
});
(async () => {
  let b;
  try {
    fs.mkdirSync(PASTA, { recursive: true });
    const arq = path.join(PASTA, "scope_tema_A.npz");
    execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.04, 1e-4); w = 2 * np.pi * 50
meta = {"planta": "gecko-pew", "rotulo": "tema_A", "dt": 1e-4, "Ts": 1e-4, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.04, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(arq)}, meta=np.array(json.dumps(meta)), t=t, Va=180*np.cos(w*t), Vb=180*np.cos(w*t-2.0944), Vc=180*np.cos(w*t+2.0944))`]);
    const url = `${B}/pew/scope/?a=${encodeURIComponent(path.relative(SM, arq))}`;
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1500, height: 900 }, colorScheme: "light" });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("tema-posto")) { localStorage.setItem("pew-tema", "escuro"); sessionStorage.setItem("tema-posto", "1"); } } catch (e) { /* ok */ } });
    const erros = [];
    // 1) o scope sozinho: escuro desde o começo; outra página do PEW troca para claro → ele acompanha e redesenha
    const pg = await ctx.newPage(); pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto(url);
    await pg.waitForFunction(() => typeof paineis === "function" && paineis().some((p) => p.u), null, { timeout: 30000 });
    let e1 = await estado(pg);
    ok(e1.tema === "escuro" && e1.fundo === ESCURO.fundo && e1.cartao === ESCURO.cartao && e1.campo !== CLARO.cartao && e1.eixo === "#aab3bf"
       && e1.grade === "rgba(255,255,255,.08)", `scope sozinho, tema escuro: página ${e1.fundo}, painel ${e1.cartao}, campo ${e1.campo}, eixo ${e1.eixo}, grade ${e1.grade}`);
    await pg.evaluate(() => { for (const p of paineis()) if (p.u) p.u._marca = 1; });
    const outra = await ctx.newPage();
    await outra.goto(`${B}/pew/scope/`);
    await outra.evaluate(() => localStorage.setItem("pew-tema", "claro"));
    await pg.waitForFunction(() => document.documentElement.dataset.tema === "claro", null, { timeout: 5000 }).catch(() => {});
    await pg.waitForTimeout(300);
    e1 = await estado(pg);
    ok(e1.tema === "claro" && e1.fundo === CLARO.fundo && e1.cartao === CLARO.cartao && e1.eixo === "#3d4550" && e1.grade === "rgba(0,0,0,.07)" && !e1.marca,
       `outra página grava "claro": o scope fica claro (${e1.fundo}, eixo ${e1.eixo}) e os gráficos são refeitos (marca ${e1.marca})`);
    await outra.close(); await pg.close();
    // 2) dentro do simu (a aba scope): o simu escuro → o scope escuro; o botão de tema do trilho → os dois mudam juntos
    const ps = await ctx.newPage(); ps.on("pageerror", (e) => erros.push(e.message));
    await ps.addInitScript(() => { try { localStorage.setItem("pew-tema", "escuro"); } catch (e) { /* ok */ } });
    await ps.goto(`${B}/pew/simu/?modelo=` + encodeURIComponent(require("os").homedir() + "/.cache/pew_simu_teste/pew/exemplo_controle_pwm.ipes"));
    await ps.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas && document.getElementById("pew-nav"), null, { timeout: 30000 });
    await ps.evaluate((u) => mostraScope(true, u), url);
    let fr = null;
    for (let k = 0; k < 60 && !fr; k++) { fr = ps.frames().find((f) => f.url().includes("/pew/scope/")); if (!fr) await ps.waitForTimeout(250); }
    await fr.waitForFunction(() => typeof paineis === "function" && paineis().some((p) => p.u), null, { timeout: 30000 });
    let e2 = await estado(fr);
    const simu = await ps.evaluate(() => document.documentElement.dataset.tema);
    ok(simu === "escuro" && e2.tema === "escuro" && e2.fundo === ESCURO.fundo && e2.eixo === "#aab3bf", `no simu escuro, a aba scope escura (${e2.fundo}, eixo ${e2.eixo})`);
    await ps.click("#pew-nav .tema");                    // escuro → como o sistema (aqui, claro)
    await fr.waitForFunction(() => document.documentElement.dataset.tema === "claro", null, { timeout: 5000 }).catch(() => {});
    await ps.waitForTimeout(300);
    e2 = await estado(fr);
    const simu2 = await ps.evaluate(() => document.documentElement.dataset.tema);
    ok(simu2 === "claro" && e2.tema === "claro" && e2.fundo === CLARO.fundo && e2.eixo === "#3d4550" && e2.temaDesenhado === "claro",
       `o botão do trilho (escuro → sistema claro): simu ${simu2}, scope ${e2.tema} (${e2.fundo}, eixo ${e2.eixo})`);
    await ps.click("#pew-nav .tema");                    // → claro (já estava): nada muda; → escuro
    await ps.click("#pew-nav .tema");
    await fr.waitForFunction(() => document.documentElement.dataset.tema === "escuro", null, { timeout: 5000 }).catch(() => {});
    e2 = await estado(fr);
    ok(e2.tema === "escuro" && e2.fundo === ESCURO.fundo && e2.eixo === "#aab3bf", `e de volta ao escuro pelo trilho: scope ${e2.tema} (${e2.fundo})`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
