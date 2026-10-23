// a notação matemática no scope (instância de teste 7200 → scope 7202), pedido de Marcelo em 23/10 ("fontes do LaTeX"):
// desligada, os nomes como vêm do circuito; ligada, v_o → v itálico com o "o" subscrito na legenda, no título do painel
// (o clique no título abre a caixa de texto) e no PNG; "saida_x" e as palavras longas ficam como estão; a escolha fica
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
// uma gravação própria (a pasta do teste está em MAISIM_SCOPE_PASTAS; apagada no fim)
const PASTA = path.join(__dirname, "..", "tmp_scope_notacao"), RAIZ = path.resolve(__dirname, "../../..");
fs.mkdirSync(PASTA, { recursive: true });
const NPZ = path.join(PASTA, "scope_notacao.npz");
require("child_process").execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.01, 1e-4)
meta = {"planta": "gecko-maisim", "rotulo": "notacao", "modelo": "x/circuito_notacao.ipes", "dt": 1e-4, "Ts": 1e-4, "tfim": 0.01, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(NPZ)}, meta=np.array(json.dumps(meta)), t=t, v_o=np.sin(t), i_Lf_a=np.cos(t), portadora=t)`]);
const URL = "http://localhost:7200/maisim/scope/?a=" + encodeURIComponent(path.relative(RAIZ, NPZ));
(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1300, height: 850 } });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem("ja")) { sessionStorage.setItem("ja", "1");
      localStorage.setItem("maisim-scope-layout-v5:x/circuito_notacao.ipes", JSON.stringify({ itens: [{ titulo: "v_o e i_Lf_a na saida_x", sinais: ["v_o", "i_Lf_a", "portadora"] }] })); } });
    const pg = await ctx.newPage(); const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    const abre = async () => { await pg.goto(URL); await pg.waitForFunction(() => typeof A !== "undefined" && A && A.dados && paineis().some((p) => p.u), null, { timeout: 20000 }); await pg.waitForTimeout(300); };
    const leg = () => pg.evaluate(() => [...paineis()[0].u.root.querySelectorAll(".u-legend .u-series .u-label")].slice(1).map((l) => l.innerHTML));
    const tit = () => pg.evaluate(() => { const c = paineis()[0].el.querySelector(".cab");
      return { input: getComputedStyle(c.querySelector("input.titulo")).display, mat: getComputedStyle(c.querySelector(".titulo-mat")).display, html: c.querySelector(".titulo-mat").innerHTML }; });
    await abre();
    const l0 = await leg(), t0 = await tit();
    ok(l0.join("|") === "v_o|i_Lf_a|portadora" && t0.input !== "none" && t0.mat === "none", `desligada: os nomes como vêm (${l0.join(", ")}), o título na caixa de texto`);
    await pg.click("#ck-mat"); await pg.waitForTimeout(200);
    const l1 = await leg(), t1 = await tit();
    ok(/^<span class="mat"><span class="mb">v<\/span><sub>o<\/sub><\/span>$/.test(l1[0]) && /<span class="mb">i<\/span><sub>Lf,a<\/sub>/.test(l1[1]) && l1[2] === "portadora",
      `ligada, a legenda: v_o → v com "o" subscrito, i_Lf_a → i com "Lf,a"; portadora fica (${l1.join(" | ")})`);
    ok(t1.input === "none" && t1.mat !== "none" && /<sub>o<\/sub>/.test(t1.html) && /<sub>Lf,a<\/sub>/.test(t1.html) && /saida_x/.test(t1.html),
      `ligada, o título em notação ("saida_x", palavra longa, fica): ${t1.html.replace(/<[^>]+>/g, "")}`);
    await pg.click(".cartao .titulo-mat"); await pg.waitForTimeout(150);
    const ed = await pg.evaluate(() => document.activeElement && document.activeElement.matches("input.titulo"));
    await pg.fill(".cartao input.titulo", "só v_o"); await pg.press(".cartao input.titulo", "Enter"); await pg.click("#paineis", { position: { x: 5, y: 5 } }).catch(() => {}); await pg.waitForTimeout(200);
    const t2 = await tit();
    ok(ed && t2.mat !== "none" && /só <span class="mat">/.test(t2.html), `clicar no título abre a caixa de texto; o título novo volta em notação (${t2.html.replace(/<[^>]+>/g, "")})`);
    const fig = await pg.evaluate(() => { const c = canvasPainel(paineis()[0]); return c.width > 100 && c.height > 100; });
    await abre();
    const l3 = await leg();
    ok(fig && await pg.evaluate(() => $("ck-mat").checked) && /<sub>o<\/sub>/.test(l3[0]), "o PNG sai; recarregada, a notação continua ligada (fica guardada)");
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
