// a paleta do editor (instância de teste 7200 → 7201): o que o MaiSim não oferece ("oculto" no catalogo.json, ESCONDIDOS do
// catalogo_gecko.py — a ponte com o Simulink, exportar/importar dados, Java, C/C++, pequenos sinais, matricial esparso,
// PMSM pronto) não aparece em aba nenhuma nem na busca; o que fica (abc>>dq, dq>>abc, tempo, texto, controle de tiristor,
// passeio aleatório) continua lá. 25/10 (v0.3.1): também as janelas SV e UZI do Gecko (o painel XY do scope faz o papel), o
// CISPR16, a relutância inteira (a aba Reluctance some, e os seus medidores e terminais) e, das máquinas, SM-SAL, SM-RO, IM,
// IM-SAT e a LISN; ficam M-DC, PM-DC, PMSM e IM-CAGE, e o VIEWMOT com o nome do MaiSim ("Grandeza da máquina")
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const FORA = ["ToEXT", "FromEXT", "DataExport", "FILE", "JAVA", "C DLL", "ANALYSIS", "SPARSEMATRIX", "PMSM_CTRL", "PMSM_MOD",
  "CISPR16", "SV", "UZI", "MMF_MEAS", "FLUX", "Rel", "NLRel", "MMF", "LRel", "RELUCTANCE_TERMINAL", "REL_GLOBAL", "SM-SAL", "SM-RO", "IM", "IM-SAT", "LISN"];
const EN = process.env.MAISIM_TESTE_LINGUA === "en", VM = EN ? "Machine quantity" : "Grandeza da máquina", QVM = EN ? "quantity" : "máquina";   // o VIEWMOT
const FICA = ["ABCDQ", "DQABC", "TIME", "TEXT", "THYRISTOR_CONTROL", "RANDOM", "SIGNAL", "CONST", "GATE",
  "M-DC", "PM-DC", "PMSM", "IM-CAGE", "VIEWMOT", "VOLT", "AMP", "TEMP", "FLOW", "TAG"];
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/?novo=1");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof ed !== "undefined" && ed.catalogo && document.querySelectorAll("#abas button").length)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    for (let k = 0; k < 10 && await pg.$(".modal-fundo"); k++) { await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }   // o nome do novo
    const ids = new Set();
    const abas = await pg.$$eval("#abas button", (bs) => bs.map((b) => b.textContent));
    for (const a of abas) {
      await pg.click(`#abas button:text-is("${a}")`); await pg.waitForTimeout(100);
      (await pg.$$eval("#itens .item", (is) => is.map((i) => i.dataset.id))).forEach((i) => ids.add(i));
    }
    const fora = FORA.filter((i) => ids.has(i)), falta = FICA.filter((i) => !ids.has(i));
    ok(abas.length >= 10 && !abas.includes("Reluctance") && !fora.length, `${abas.length} abas, sem a Reluctance (${abas.join(", ")}); ${ids.size} itens: nenhum dos de fora (${fora.join(", ") || "nenhum à vista"})`);
    ok(!falta.length, `os que ficam estão lá (${FICA.join(", ")}): ${falta.length ? "faltam " + falta.join(", ") : "todos"}`);
    const busca = {};
    await pg.click(`#abas button:text-is("Measure")`); await pg.waitForTimeout(100);
    const vm = await pg.$eval('#itens .item[data-id="VIEWMOT"] span', (e) => e.textContent).catch(() => "");
    ok(vm === VM, `o VIEWMOT na aba Measure com o nome do MaiSim: "${vm}"`);
    for (const q of ["Simulink", "Java", "PMSM", "Data", "Reluct", "SM-", "LISN", "Space", QVM]) {
      await pg.fill("#busca", q); await pg.waitForTimeout(150);
      busca[q] = await pg.$$eval("#itens .item", (is) => is.map((i) => i.dataset.id));
    }
    await pg.fill("#busca", "");
    ok(!busca.Simulink.length && !busca.Java.length && !busca.Data.some((i) => FORA.includes(i)) && busca.PMSM.every((i) => !FORA.includes(i)) && busca.PMSM.includes("PMSM"),
      `na busca também não: Simulink [${busca.Simulink}], Java [${busca.Java}], Data [${busca.Data}], PMSM [${busca.PMSM}] (a máquina fica)`);
    ok(!busca.Reluct.length && !busca["SM-"].length && !busca.LISN.length && !busca.Space.length && busca[QVM].includes("VIEWMOT"),
      `nem os de 25/10: Reluct [${busca.Reluct}], SM- [${busca["SM-"]}], LISN [${busca.LISN}], Space [${busca.Space}]; "${QVM}" acha o VIEWMOT [${busca[QVM]}]`);
    ok(!erros.length, `sem erro na página: ${erros.join(" | ") || "nenhum"}`);
  } catch (e) { ok(false, "erro: " + e.message); }
  finally { if (b) await b.close(); console.log(falhas ? `\n${falhas} FALHA(S)` : "\nOK: tudo certo"); process.exit(falhas ? 1 : 0); }
})();
