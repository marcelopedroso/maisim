// as mensagens entre os controladores nos cartões (instância de teste 7200 → 7201), pedido de Marcelo em 19/10 ("mostrar
// quando um DSP recebe uma variável de outro… o theta vem do PLL… ter essa cadeia"): lidas do código — envia("destino",
// {"chave": …}) no arquivo do controlador e nos módulos que ele importa; quem manda o mesmo a vários numa linha só; o que
// cada um recebe; a latência; os avisos (destino que não é controlador; recebe mensagem e não chama recebe()); comentário
// não conta
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const CTL = (corpo, imp = "") => `${imp}def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n${corpo}    return {}\n`;
const ARQS = {
  // a mensagem numa variável (o jeito do Marcelo, 19/10): msg = {...}, msg["z"] = …, envia("dsp_a", msg)
  "controle.py": CTL('    msg = {"theta": 1.0, "w": 2.0}\n    msg["z"] = 5.0\n    envia("dsp_a", msg)\n    envia("dsp_b", msg)\n    # envia("dsp_c", {"x": 1})  (comentário: não conta)\n    envia("dsp_x", {"y": 3})\n'),
  "dsp_a.py": CTL('    for msg in recebe():\n        e["th"] = msg["dados"]["theta"]\n    aviso.manda(t)\n', "import aviso\n\n\n"),
  "aviso.py": "def iniciar(p):\n    return {}\n\n\ndef manda(t):\n    envia(\"dsp_b\", dict(alarme=1))\n",
  "dsp_b.py": CTL("    pass\n") };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1900, height: 1000 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-ctl-vista", "arq"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async (a) => {
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      const q = (nome, arquivo) => ({ nome, arquivo, todas: false, medidas: [], atuacoes: [], subcircuitos: [] });
      const { ["controle.py"]: codigo, ...arquivos } = a;
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: [], parametros: [], acionamentos: [], codigo, arquivos,
        controladores: [q("controle", "controle.py"), q("dsp_a", "dsp_a.py"), q("dsp_b", "dsp_b.py")], rede: { latencia: 2e-5 } } });
      await recarregaControle(); mostraDoca("controle"); }, ARQS);
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(800);
    const msgs = () => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll("#ctl-ctls .ctl-ctl")].map((x) => [x.dataset.nome, [...x.querySelectorAll(".ctl-msg")].map((m) => m.innerText.replace(/\s+/g, " ").trim())])));
    const m = await msgs();
    ok(JSON.stringify(m.controle) === JSON.stringify(["envia theta, w, z → dsp_a, dsp_b (fibra de 20 µs)", "envia y → ⚠ dsp_x (fibra de 20 µs)"]),
      `controle: ${m.controle.join(" | ")} (a variável msg seguida até msg = {…} e msg["z"] = …; o mesmo para dois numa linha; ⚠ no destino que não existe; o comentário não conta)`);
    ok(JSON.stringify(m.dsp_a) === JSON.stringify(["recebe theta, w, z ← controle", "envia alarme → dsp_b (fibra de 20 µs)"]),
      `dsp_a: ${m.dsp_a.join(" | ")} (o envia de dentro do módulo aviso.py conta, com dict(alarme=…))`);
    ok(JSON.stringify(m.dsp_b) === JSON.stringify(["recebe theta, w, z ← controle ⚠ não chama recebe()", "recebe alarme ← dsp_a ⚠ não chama recebe()"]),
      `dsp_b: ${m.dsp_b.join(" | ")} (recebe de dois; não chama recebe(): avisa)`);
    // o que cada um lê da mensagem: o dsp_a lê só theta (w e z chegam e não são lidos, apagados); o tooltip com o código
    const det = await pg.evaluate(() => { const ca = document.querySelector('#ctl-ctls .ctl-ctl[data-nome="dsp_a"] .ctl-msg');
      const ce = document.querySelector('#ctl-ctls .ctl-ctl[data-nome="controle"] .ctl-msg');
      return { naoLe: [...ca.querySelectorAll("code.nao-le")].map((x) => x.textContent), dica: ce.title }; });
    ok(det.naoLe.join() === "w,z" && /controle\.py:\d+: envia\("dsp_a", msg\)/.test(det.dica) && /controle\.py:\d+: msg = \{"theta": 1\.0, "w": 2\.0\}/.test(det.dica)
       && /dsp_a lê: theta · chega e não lê: w, z/.test(det.dica) && /dsp_b lê: nada disso · chega e não lê: theta, w, z/.test(det.dica),
      `o que é lido: dsp_a não lê ${det.naoLe.join(", ")} (apagados); o tooltip do envia:\n${det.dica}`);
    // o código muda, os cartões acompanham (dsp_b passa a chamar recebe())
    await pg.evaluate(() => { mostraArquivo("dsp_b.py"); ctl.modelos["dsp_b.py"].setValue(ctl.modelos["dsp_b.py"].getValue().replace("    pass\n", "    for msg in recebe():\n        pass\n")); });
    await pg.waitForTimeout(1800);
    const m2 = await msgs();
    ok(m2.dsp_b.every((x) => !/⚠/.test(x)), `dsp_b chamando recebe(): sem aviso (${m2.dsp_b.join(" | ")})`);
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
