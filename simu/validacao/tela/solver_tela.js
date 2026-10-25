// o campo "Integração" do ⚙ (instância de teste 7200 → 7201 e o scope dela 7202), o PR B dos fundamentos numéricos: o
// método de integração do Gecko (o solverType do .ipes: 0 Euler implícito, 1 trapézio, 2 Gear). O ⚙ mostra o do arquivo
// aberto; escolher outro vale ao iniciar (a rodada diz qual no meta e no resumo.md, e o Gecko fica com ele); reabrir o ⚙
// mostra o escolhido. No scope, o Comparar avisa quando A e B usaram métodos diferentes (e não avisa com o mesmo, nem com
// rodadas de antes, que não dizem). O circuito: exemplos/exemplo_buck.ipes (solverType 0); no fim, reaberto como estava.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const ARQ = "exemplos/exemplo_buck.ipes", S = "http://localhost:7201/maisim/simu/";
const SM = path.resolve(__dirname, "../../.."), PASTA = path.join(__dirname, "..", "tmp_solver");
const abre = () => fetch(S + "editor/abrir", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ arq: ARQ, modo: "descartar" }) }).then((r) => r.text());
// uma gravação de mentira com o solver no meta (null: uma rodada de antes, sem ele)
const grava = (nome, solver) => { const arq = path.join(PASTA, `scope_${nome}.npz`);
  execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.01 + 1e-12, 1e-4)
meta = {"planta": "gecko-maisim", "rotulo": "${nome}", "modelo": "circuito_teste.ipes", "dt": 1e-4, "Ts": 1e-4, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.01,
        "sinais": [{"canal": "Va", "elemento": "VOLT.1"}], "acionamentos": []${solver ? `, "solver": "${solver}"` : ""}}
np.savez(${JSON.stringify(arq)}, meta=np.array(json.dumps(meta)), t=t, Va=np.sin(2 * np.pi * 50 * t))`]); return path.relative(SM, arq); };
(async () => {
  let b;
  try {
    await abre();
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } }); const pg = await ctx.newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent(ARQ));
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor && ed.ligado)); k++) {
      if (await pg.$(".modal .m-ok")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    const campo = () => pg.evaluate(() => { const s = document.querySelector(".modal .m-solver");
      return s && { v: s.value, ops: [...s.options].map((o) => `${o.value}:${o.textContent}`).join("|"), rot: s.closest("label").querySelector("span").firstChild.textContent,
                    dica: (s.closest("label").querySelector(".ctl-i") || {}).title || "", nativa: s.title || s.closest("label").title }; });
    const abreEngrenagem = async () => { await pg.evaluate(() => { parametrosSim(); }); await pg.waitForSelector(".modal .m-solver", { timeout: 20000 }); };

    // 1. o ⚙ mostra o solverType do arquivo (o exemplo: 0, Euler implícito), com os três métodos e a dica
    await abreEngrenagem();
    let c = await campo();
    ok(c && c.rot === "Integração" && c.v === "0" && c.ops === "0:Euler implícito|1:trapézio|2:Gear (BDF2)",
      `o campo "${c && c.rot}" mostra o do arquivo (${c && c.v}): ${c && c.ops}`);
    ok(c && /trapézio/.test(c.dica) && /oscila/.test(c.dica) && !c.nativa, `a explicação fica no ⓘ ao lado do nome (não no title do campo): "${c && c.dica.slice(0, 80)}…"`);
    // a foto do ⚙ (o campo no padrão dos seletores do MaiSim e a dica do ⓘ, no lugar da caixinha do navegador)
    await pg.hover(".modal .m-solver"); await pg.waitForTimeout(400);
    const dicaNoCampo = await pg.evaluate(() => { const d = document.getElementById("dica-ui"); return !!d && d.classList.contains("vis"); });
    ok(!dicaNoCampo, "passar o mouse no seletor não abre dica por cima da lista");
    await pg.hover(".modal label:has(.m-solver) .ctl-i"); await pg.waitForTimeout(700);
    const dicaI = await pg.evaluate(() => { const d = document.getElementById("dica-ui"); return d && d.classList.contains("vis") ? d.textContent : ""; });
    ok(/oscila/.test(dicaI), `o ⓘ mostra a dica do MaiSim: "${dicaI.slice(0, 60)}…"`);
    if (process.env.FOTO_SOLVER) await pg.screenshot({ path: process.env.FOTO_SOLVER });
    // 2. trapézio + um tempo final curto; Guardar: a mensagem diz a integração e o sim.par guarda (o localStorage também)
    await pg.selectOption(".modal .m-solver", "1");
    await pg.fill('.modal input[name="tfim"]', "0.002"); await pg.fill('.modal input[name="nome"]', "solver_tela");
    await pg.click(".modal .m-ok");
    await pg.waitForFunction(() => sim.par.solver === "1", null, { timeout: 10000 }).catch(() => {});
    const par = await pg.evaluate(() => ({ s: sim.par.solver, ls: JSON.parse(localStorage.getItem("maisim-simu-sim") || "{}").solver, msg: document.querySelector("#msg") ? document.querySelector("#msg").textContent : "" }));
    ok(par.s === "1" && par.ls === "1", `escolher trapézio: sim.par.solver = ${par.s} (guardado: ${par.ls})`);
    ok(/integração: trapézio/.test(par.msg), `a mensagem diz: "${par.msg}"`);
    // 3. ▶: a rodada usa o trapézio (meta, resumo.md) e o Gecko fica com ele
    await pg.evaluate(() => iniciaSim());
    await pg.waitForFunction(() => sim.estado === "fim" || sim.estado === "erro", null, { timeout: 120000 }).catch(() => {});
    const rod = await pg.evaluate(async () => api("editor/rodada"));
    const pastaRod = rod.arquivo ? path.dirname(rod.arquivo) : "";
    const resumo = pastaRod && fs.existsSync(path.join(pastaRod, "resumo.md")) ? fs.readFileSync(path.join(pastaRod, "resumo.md"), "utf8") : "";
    const meta = rod.arquivo ? JSON.parse(execFileSync("python3", ["-c", `import numpy as np; print(str(np.load(${JSON.stringify(rod.arquivo)})["meta"]))`]).toString()) : {};
    ok(rod.estado === "fim" && meta.solver === "trapezoidal" && /integração \(solverType do Gecko\): trapézio/.test(resumo),
      `a rodada: ${rod.estado}, meta.solver = ${meta.solver}; resumo.md: "${(resumo.match(/.*integração.*/) || [""])[0]}"`);
    const est = await pg.evaluate(async () => (await api("editor/estado")).simulacao);
    ok(est && est.solver === 1, `o Gecko ficou com o trapézio (simulacao = ${JSON.stringify(est)})`);
    // 4. reabrir o ⚙: o escolhido; fechar sem mudar não diz nada
    await abreEngrenagem(); c = await campo();
    ok(c && c.v === "1", `reabrir o ⚙: o campo mostra ${c && c.v} (trapézio)`);
    await pg.click(".modal .m-ok");

    // 5. o Comparar do scope: A e B com métodos diferentes → aviso; o mesmo, ou uma rodada sem o solver → nada
    fs.mkdirSync(PASTA, { recursive: true });
    const be = grava("be", "backward-euler"), trz = grava("trz", "trapezoidal"), be2 = grava("be2", "backward-euler"), velha = grava("velha", null);
    const sc = await ctx.newPage(); sc.on("pageerror", (e) => erros.push("scope: " + e.message));
    const compara = async (a, bb) => { await sc.goto(`http://localhost:7200/maisim/scope/?so=rodada&a=${encodeURIComponent(a)}&b=${encodeURIComponent(bb)}`);
      await sc.waitForFunction(() => [...document.querySelectorAll(".cartao")].some((c) => c._painel && c._painel.u), null, { timeout: 30000 }); await sc.waitForTimeout(500);
      return sc.textContent("#status"); };
    let st = await compara(be, trz);
    ok(/integração diferente \(A Euler implícito, B trapézio\): parte da diferença pode ser do método/.test(st), `A Euler × B trapézio: "${st.slice(-90)}"`);
    st = await compara(be, be2);
    ok(!/integração diferente/.test(st), `A × B no mesmo método: sem aviso ("${st.slice(-60)}")`);
    st = await compara(velha, trz);
    ok(!/integração diferente/.test(st), "uma rodada de antes (sem o solver no meta): sem aviso");
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally {
    try { await abre(); } catch (e) { console.log("(limpeza: " + e.message + ")"); }   // o exemplo de novo: o Gecko volta ao solverType 0
    fs.rmSync(PASTA, { recursive: true, force: true });
    try { for (const d of fs.readdirSync(path.join(require("os").homedir(), ".cache/maisim_teste/rodadas")).filter((d) => d.endsWith("_solver_tela")))
      fs.rmSync(path.join(require("os").homedir(), ".cache/maisim_teste/rodadas", d), { recursive: true, force: true }); } catch (e) { /* ok */ }
    if (b) await b.close();
  }
  process.exit(falhas ? 1 : 0);
})();
