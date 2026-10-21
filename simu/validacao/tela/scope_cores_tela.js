// cores do scope (instância isolada: Vite 7210 → scope de teste 7211, ../sobe_fila.sh; só lê as gravações): no Comparar,
// B na cor do mesmo sinal, mais clara e tracejada; a cor de cada sinal pela paleta clássica, por #hex ou de volta ao
// padrão, lembrada no navegador e igual em todos os painéis. As duas gravações são do próprio teste (apagadas no fim):
// antes ele usava as duas mais recentes do simu, que podem ser de circuitos diferentes, sem sinal em comum (aconteceu em
// 19/10: o Comparar não tinha B no painel e o teste esperava até cair)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const SM = path.resolve(__dirname, "../../.."), PASTA = path.join(__dirname, "..", "tmp_scope_cores");
const B7210 = "http://localhost:7210";
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    fs.mkdirSync(PASTA, { recursive: true });
    const [ra, rb] = ["A", "B"].map((x, k) => { const arq = path.join(PASTA, `scope_cores_${x}.npz`);
      execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.04, 1e-4); w = 2 * np.pi * 50; a = ${180 - 10 * k}
meta = {"planta": "gecko-maisim", "rotulo": "cores_${x}", "dt": 1e-4, "Ts": 1e-4, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.04, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(arq)}, meta=np.array(json.dumps(meta)), t=t, Va=a*np.cos(w*t), Vb=a*np.cos(w*t-2.0944), Vc=a*np.cos(w*t+2.0944))`]);
      return { arq: path.relative(SM, arq) }; });
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } }); const pg = await ctx.newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    const abre = async () => {
      await pg.goto(`${B7210}/maisim/scope/?a=${encodeURIComponent(ra.arq)}&b=${encodeURIComponent(rb.arq)}`);
      await pg.waitForFunction(() => typeof paineis === "function" && paineis().some((p) => p.series && p.series.some((se) => se.F === B)), null, { timeout: 30000 });
    };
    await abre();
    const series = () => pg.evaluate(() => { const p = paineis().find((x) => x.series && x.series.some((se) => se.F === B));
      return { sinais: p.sinais, s: p.series.map((se) => ({ c: se.canal, ab: se.F === A ? "A" : "B", cor: se.cor, dash: se.dash || null })) }; });
    const s0 = await series();
    const pa = s0.s.filter((x) => x.ab === "A"), pb = s0.s.filter((x) => x.ab === "B");
    const claras = await pg.evaluate((ps) => ps.map((x) => corClara(x.cor)), pa);
    ok(pa.length >= 2 && pa.every((x, k) => x.cor === "#1f77b4,#d62728,#2ca02c,#ff7f0e,#9467bd,#8c564b,#e377c2,#17becf".split(",")[s0.sinais.indexOf(x.c) % 8]),
      `A pela paleta, na ordem: ${pa.map((x) => `${x.c} ${x.cor}`).join(", ")}`);
    ok(pb.length >= 2 && pb.every((x, k) => x.cor === claras[pa.findIndex((y) => y.c === x.c)] && x.cor !== "#111" && JSON.stringify(x.dash) === "[6,4]"),
      `B na cor do mesmo sinal, mais clara e tracejada: ${pb.map((x) => `${x.c} ${x.cor}`).join(", ")} (antes: tudo #111)`);
    await pg.screenshot({ path: "scope_cores_comparar.png" });
    // escolher a cor de um sinal pela paleta
    const canal = pa[0].c;
    const painel = await pg.evaluateHandle(() => paineis().find((x) => x.series && x.series.some((se) => se.F === B)).el);
    await (await painel.$(".b-sinais")).click(); await pg.waitForSelector(".menu");
    await pg.click(`.menu button.cor-sinal[data-c="${canal}"]`); await pg.waitForSelector(".menu .paleta");
    ok(await pg.evaluate(() => document.querySelectorAll(".menu .paleta .amostra").length) === 14, "a paleta das clássicas (14 cores), mais #hex, o seletor livre e padrão");
    await pg.click('.menu .paleta .amostra[data-cor="#8b0000"]'); await pg.waitForTimeout(400);
    let s1 = await series(); let a1 = s1.s.find((x) => x.c === canal && x.ab === "A"), b1 = s1.s.find((x) => x.c === canal && x.ab === "B");
    ok(a1.cor === "#8b0000" && b1.cor === (await pg.evaluate(() => corClara("#8b0000"))), `vermelho escuro: A ${a1.cor}, B ${b1.cor} (o mesmo, mais claro)`);
    ok(JSON.parse(await pg.evaluate(() => localStorage.getItem("maisim-scope-cores")))[canal] === "#8b0000", "guardada no navegador");
    // #hex
    await pg.fill(".menu .paleta input.hex", "#123ABC"); await pg.press(".menu .paleta input.hex", "Enter"); await pg.waitForTimeout(400);
    s1 = await series(); a1 = s1.s.find((x) => x.c === canal && x.ab === "A");
    ok(a1.cor === "#123abc", `qualquer cor por #hex: ${a1.cor}`);
    await pg.fill(".menu .paleta input.hex", "#zz1"); await pg.press(".menu .paleta input.hex", "Enter"); await pg.waitForTimeout(300);
    s1 = await series(); a1 = s1.s.find((x) => x.c === canal && x.ab === "A");
    ok(a1.cor === "#123abc" && await pg.evaluate(() => document.querySelector(".menu .paleta input.hex").classList.contains("ruim")), "#hex inválido: marcado, a cor não muda");
    // padrão
    await pg.click(".menu .paleta button.padrao"); await pg.waitForTimeout(400);
    s1 = await series(); a1 = s1.s.find((x) => x.c === canal && x.ab === "A");
    ok(a1.cor === pa[0].cor && !(canal in JSON.parse(await pg.evaluate(() => localStorage.getItem("maisim-scope-cores")))), `padrão: volta à cor da ordem (${a1.cor})`);
    // lembrada ao recarregar
    if (!(await pg.$(".menu .paleta"))) await pg.click(`.menu button.cor-sinal[data-c="${canal}"]`);   // depois de "padrão" a paleta continua aberta
    await pg.waitForSelector(".menu .paleta"); await pg.click('.menu .paleta .amostra[data-cor="#006400"]'); await pg.waitForTimeout(300);
    await abre();
    const s2 = await series();
    ok(s2.s.find((x) => x.c === canal && x.ab === "A").cor === "#006400", "ao recarregar, a cor escolhida continua");
    await pg.screenshot({ path: "scope_cores_escolhida.png" });
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
