// o Claude do MaiSim propõe controladores, pela tela (servidor de teste 7201, claude de mentira, cenário "controladores"),
// pedido de Marcelo em 19/10 ("3 DSPs… por fibra óptica… uma trava no Claude"): o cartão diz os controladores novos e a
// rede; a janela da diferença também; aplicar põe os 3 controladores no painel (a árvore com dsp_a.py e dsp_b.py na raiz)
// e no servidor, com a atuação marcada; ↶ voltar ao de antes tira os controladores
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const pid = execSync(`ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1`).toString().trim();
const ENV = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`).toString().split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
if (!(ENV.MAISIM_CLAUDE_BIN || "").endsWith("claude_falso.py") || !/maisim_teste|\/tmp\//.test(ENV.MAISIM_CLAUDE_DIR || "")) { console.log("FALHA suba o servidor de teste com o claude de mentira (reinicia_servidor_teste.sh)"); process.exit(1); }
const CONF = ENV.MAISIM_CLAUDE_DIR;
fs.mkdirSync(CONF, { recursive: true }); fs.writeFileSync(path.join(CONF, "falso_cenario"), "controladores"); fs.writeFileSync(path.join(CONF, "falso_logado"), "");
const limpa = () => { for (const f of ["falso_cenario", "falso_logado"]) fs.rmSync(path.join(CONF, f), { force: true }); };
const ORQ = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    envia("dsp_a", {"x": 2.0})\n    envia("dsp_b", {"x": 3.0})\n    return {}\n';
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 2300, height: 1000 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-ctl-vista", "arq"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:7201/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async (orq) => {
      await api("editor/novo", { modo: "descartar" }); await apiClaude("nova", {});
      const c = (op, args) => api("editor/cmd", { op, args });
      for (const a of [["U.1", 10, 10, "U"], ["R.1", 20, 10, "R"], ["L.1", 30, 10, "L"], ["CONST.1", 40, 6, "CONST"], ["AMP.1", 40, 12, "AMP"]]) await c("CREATE", a);
      for (const [n, i, o] of [["U.1", "a", "gnd"], ["R.1", "a", "b"], ["L.1", "b", "gnd"]]) { await c("INNODE", [n, 0, i]); await c("OUTNODE", [n, 0, o]); }
      await c("OUTNODE", ["CONST.1", 0, "u_ctrl"]); await api("editor/fonte_sinal", { nome: "U.1", sinal: "u_ctrl" });
      await c("OUTNODE", ["AMP.1", 0, "i_L"]); await api("editor/mede", { nome: "AMP.1", tipo: "I", componente: "L.1" });
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-5, atuacoes: [], parametros: [], acionamentos: [], controladores: [], codigo: orq, arquivos: {} } });
      const j = await api("editor/estado"); dados = j; folhaAtual = "0"; novoEstado(j); await recarregaControle(); mostraDoca("controle"); }, ORQ);
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    await pg.click("#ctl-claude-bt");
    await pg.waitForFunction(() => typeof cla !== "undefined" && cla.estado && cla.estado.logado && cc.estado && !$("cc-texto").disabled, null, { timeout: 30000 });
    await pg.fill("#cc-texto", "crie 3 DSPs: o controle manda pela fibra para dsp_a e dsp_b"); await pg.press("#cc-texto", "Control+Enter");
    await pg.waitForSelector(".cc-prop", { timeout: 30000 }); await pg.waitForTimeout(500);
    const card = await pg.evaluate(() => document.querySelector(".cc-prop").innerText);
    ok(/\+ controlador dsp_a \(dsp_a\.py; lê nada; escreve u_ctrl\)/.test(card) && /\+ controlador dsp_b/.test(card) && /\+ controlador controle \(controle\.py; lê todas/.test(card)
       && /rede: latência 0 s → 20 µs/.test(card) && /marca a atuação u_ctrl/.test(card), `cartão:\n${card.split("\n").filter((l) => /controlador|rede|marca/.test(l)).join("\n")}`);
    await pg.click("#cc-ver"); await pg.waitForSelector(".cc-dif"); await pg.waitForTimeout(500);
    const dif = await pg.evaluate(() => (document.querySelector(".cc-dif-par") || {}).innerText || "");
    ok(/controladores/.test(dif) && /\+ controlador dsp_a/.test(dif), "a janela da diferença lista os controladores");
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
    await pg.click("#cc-aplicar"); await pg.waitForTimeout(2500);
    const ap = await pg.evaluate(async () => ({ r: await api("editor/controle"), raizes: [...document.querySelectorAll("#ctl-ctls > .ctl-no")].map((x) => x.dataset.abre) }));
    const cs = ap.r.controle.controladores;
    ok(cs.map((q) => q.nome).join() === "controle,dsp_a,dsp_b" && cs[1].atuacoes.join() === "u_ctrl" && ap.r.controle.rede.latencia === 2e-5 && ap.r.controle.atuacoes.join() === "u_ctrl"
       && !ap.r.erros.length && !(ap.r.erros_controladores || []).length && ap.raizes.join() === "controle.py,dsp_a.py,dsp_b.py",
      `aplicada: controladores ${cs.map((q) => q.nome).join(", ")} no servidor (rede ${ap.r.controle.rede.latencia} s, u_ctrl marcada); a árvore: ${ap.raizes.join(", ")}`);
    await pg.click("#cc-voltar"); await pg.waitForTimeout(2000);
    const vol = await pg.evaluate(async () => (await api("editor/controle")).controle);
    ok(!vol.controladores.length && !vol.arquivos["dsp_a.py"] && vol.rede.latencia === 0, "↶ voltar ao de antes: os controladores, os arquivos e a rede voltam");
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
    await pg.evaluate(async () => { await apiClaude("nova", {}); await api("editor/novo", { modo: "descartar" }); });
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { limpa(); if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
