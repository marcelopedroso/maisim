// a paleta do editor (instância de teste 7200 → 7201): o que o MaiSim não oferece ("oculto" no catalogo.json, ESCONDIDOS do
// catalogo_gecko.py — a ponte com o Simulink, exportar/importar dados, Java, C/C++, pequenos sinais, matricial esparso,
// PMSM pronto) não aparece em aba nenhuma nem na busca; o que fica (abc>>dq, dq>>abc, tempo, texto, controle de tiristor,
// passeio aleatório) continua lá
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const FORA = ["ToEXT", "FromEXT", "DataExport", "FILE", "JAVA", "C DLL", "ANALYSIS", "SPARSEMATRIX", "PMSM_CTRL", "PMSM_MOD"];
const FICA = ["ABCDQ", "DQABC", "TIME", "TEXT", "THYRISTOR_CONTROL", "RANDOM", "SIGNAL", "CONST", "GATE"];
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
    ok(abas.length >= 11 && !fora.length, `${abas.length} abas, ${ids.size} itens: nenhum dos de fora (${fora.join(", ") || "nenhum à vista"})`);
    ok(!falta.length, `os que ficam estão lá (${FICA.join(", ")}): ${falta.length ? "faltam " + falta.join(", ") : "todos"}`);
    const busca = {};
    for (const q of ["Simulink", "Java", "PMSM", "Data"]) {
      await pg.fill("#busca", q); await pg.waitForTimeout(150);
      busca[q] = await pg.$$eval("#itens .item", (is) => is.map((i) => i.dataset.id));
    }
    await pg.fill("#busca", "");
    ok(!busca.Simulink.length && !busca.Java.length && !busca.Data.some((i) => FORA.includes(i)) && busca.PMSM.every((i) => !FORA.includes(i)) && busca.PMSM.includes("PMSM"),
      `na busca também não: Simulink [${busca.Simulink}], Java [${busca.Java}], Data [${busca.Data}], PMSM [${busca.PMSM}] (a máquina fica)`);
    ok(!erros.length, `sem erro na página: ${erros.join(" | ") || "nenhum"}`);
  } catch (e) { ok(false, "erro: " + e.message); }
  finally { if (b) await b.close(); console.log(falhas ? `\n${falhas} FALHA(S)` : "\nOK: tudo certo"); process.exit(falhas ? 1 : 0); }
})();
