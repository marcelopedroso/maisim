// envia com o destino montado (instância de teste 5010 → 8768), achado de Marcelo em 19/10: o controle manda o theta às 6
// células num for — envia("sm_ap_%d" % k, …) — e o diagrama e os cartões não ligavam nada ("ta no for… mas mostrar no esquema
// de ligar também"): "%" com o for sobre uma tupla, f-string com range(1, 4), "".format sem for (casa pelo molde com os
// controladores que existem), "x_" + str(k) com o for sobre uma lista e uma variável de um for sobre nomes (que não existem:
// o cartão avisa) — os cartões dizem para quem vai, e o diagrama tem uma seta para cada destino que existe
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const ORQ = `def iniciar(p, e):
    pass


def passo(t, m, p, e):
    th = 1.0
    for k in (1, 2, 3):
        envia("sm_ap_%d" % k, {"theta": th, "i_arm": 0.5})   # o caso do Marcelo
    for k in range(1, 4):
        envia(f"sm_an_{k}", {"theta": th})
    envia("sm_bp_{}".format(p.get("qual", 1)), {"theta": th})
    for k in [1]:
        envia("sm_cp_" + str(k), {"theta": th})
    for d in ("x_1", "x_2"):
        envia(d, {"z": 1})
    return {}
`;
const SM = 'def iniciar(p, e):\n    e["th"] = 0.0\n\n\ndef passo(t, m, p, e):\n    for msg in recebe():\n        e["th"] = msg["dados"]["theta"]\n    return {}\n';
const NOMES = ["sm_ap_1", "sm_ap_2", "sm_ap_3", "sm_an_1", "sm_an_2", "sm_an_3", "sm_bp_1", "sm_bp_2", "sm_cp_1"];
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 2300, height: 1100 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-ctl-vista", "arq"); localStorage.removeItem("pew-simu-ctl-tabelas"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:5010/pew/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async ([orq, sm, nomes]) => {
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      await api("editor/cmd", { op: "CREATE", args: ["C1", 10, 5, "CONST"] }); await api("editor/cmd", { op: "OUTNODE", args: ["C1", 0, "s01"] });
      const q = (nome, arquivo) => ({ nome, arquivo, todas: false, medidas: [], atuacoes: [], subcircuitos: [] });
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: [], parametros: [], acionamentos: [], codigo: orq,
        arquivos: Object.fromEntries(nomes.map((n) => [`${n}.py`, sm])), rede: { latencia: 2e-5 },
        controladores: [q("controle", "controle.py"), ...nomes.map((n) => q(n, `${n}.py`))] } });
      novoEstado(await api("editor/estado")); await recarregaControle(); mostraDoca("controle"); }, [ORQ, SM, NOMES]);
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(1000);
    const msgs = await pg.evaluate(() => { const m = mensagensDe(ctl.dados.controle.controladores);
      return { para: m.controle.envia.map((x) => x.para), chaves: Object.fromEntries(m.controle.envia.map((x) => [x.para, x.chaves.join()])),
        recebe: m.sm_ap_2.recebe.map((x) => `${x.de}:${x.chaves.join()}`), cod: (m.controle.envia.find((x) => x.para === "sm_ap_2") || { codigo: [] }).codigo }; });
    ok(["sm_ap_1", "sm_ap_2", "sm_ap_3"].every((n) => msgs.para.includes(n)) && msgs.chaves.sm_ap_2 === "theta,i_arm" && /controle\.py:8: envia\("sm_ap_%d" % k/.test(msgs.cod.join()),
      `"sm_ap_%d" % k com for k in (1, 2, 3): sm_ap_1, 2 e 3, com theta e i_arm (${msgs.cod.join()})`);
    ok(["sm_an_1", "sm_an_2", "sm_an_3"].every((n) => msgs.para.includes(n)), 'f"sm_an_{k}" com range(1, 4): sm_an_1, 2 e 3');
    ok(msgs.para.includes("sm_bp_1") && msgs.para.includes("sm_bp_2"), '"sm_bp_{}".format(…) sem for: os controladores que casam com o molde (sm_bp_1, sm_bp_2)');
    ok(msgs.para.includes("sm_cp_1"), '"sm_cp_" + str(k) com for k in [1]: sm_cp_1');
    ok(msgs.para.includes("x_1") && msgs.para.includes("x_2") && msgs.recebe.join() === "controle:theta,i_arm", `for d in ("x_1", "x_2"): x_1 e x_2; o sm_ap_2 recebe do controle (${msgs.recebe})`);
    // os cartões: para quem vai; o que não existe, com o aviso
    const card = await pg.evaluate(() => [...document.querySelectorAll('#ctl-ctls .ctl-ctl[data-nome="controle"] .ctl-msg')].map((x) => x.innerText.replace(/\s+/g, " ").trim()));
    ok(card.some((l) => /envia theta, i_arm → sm_ap_1, sm_ap_2, sm_ap_3/.test(l)) && card.some((l) => /⚠ x_1/.test(l)),
      `o cartão do controle: ${card.join(" | ")}`);
    // o diagrama: uma seta para cada destino que existe
    await pg.click("#ctl-diag-bt"); await pg.waitForTimeout(800);
    const setas = await pg.evaluate(() => $("ctl-diag-svg").querySelectorAll("path.msg").length);
    ok(setas === 9, `o diagrama: ${setas} setas do controle para as células (9 controladores)`);
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
