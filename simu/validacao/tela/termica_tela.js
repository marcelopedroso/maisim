// a térmica e as perdas pela tela (instância de teste; C1, 25/10): o buck térmico de exemplo desenha a rede térmica (os
// terminais, as conexões em laranja, o Pv com "♨ IGBT.1"); o painel do Pv (a peça que ele aquece, com busca), do TEMP (dois
// rótulos térmicos) e do FLOW (o Pv e a perda: mudar a perda grava o losscomp e o nome automático acompanha, Pcond_D1); a seção
// Perdas do semicondutor (uF, rON, k_on, k_off, uK juntos) com o Pv que usa a perda ou o aviso "sem Pv", e o aviso do modo
// detalhado; o Pv trocando de peça leva os nomes do FLOW e do TEMP dele; o FLOW num Rth; a aba Térmica sem o TH_MODUL. O exemplo volta como estava (abrir de novo descarta).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const RAIZ = path.resolve(__dirname, "../../..");
const conf = (k, p) => { try { const m = fs.readFileSync(path.join(RAIZ, "config/teste.env"), "utf8").match(new RegExp(`^${k}=(\\S+)`, "m")); return m ? m[1] : p; } catch (e) { return p; } };
const B = `http://localhost:${conf("MAISIM_PORTA_SIMU", "7201")}/maisim/simu/`;
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  try {
    await pg.goto(`${B}?modelo=${encodeURIComponent("exemplos/exemplo_buck_termico.ipes")}`);
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas && dados.folhas["0"].elementos.some((e) => e.nome === "Pv.1"), null, { timeout: 60000 });
    if (!(await pg.evaluate(() => ed.ligado))) { await pg.click("#bt-editar"); await pg.waitForTimeout(500); }
    while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-ok"); await pg.waitForTimeout(800); }
    await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
    // o desenho: as conexões térmicas em laranja, o Pv com a peça, os terminais térmicos ligados (bornes cheios)
    const d = await pg.evaluate(() => ({ alvos: [...document.querySelectorAll("#svg text.pv-alvo")].map((t) => t.textContent),
      laranja: [...document.querySelectorAll("#svg polyline[data-fio]")].filter((p) => p.getAttribute("stroke") === COR.fioTH).length,
      termicos: dados.folhas["0"].fios.filter((w) => w.dom === "THERM").length, soltas: dados.encaixe.soltas.length }));
    ok(d.alvos.includes("♨ IGBT.1") && d.alvos.includes("♨ D.1") && d.laranja === d.termicos && d.termicos > 5 && d.soltas === 0,
      `o desenho: ${JSON.stringify(d)}`);
    const sel = async (n) => { await pg.evaluate((n) => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === n)), n); await pg.waitForTimeout(300); };
    // o Pv: a peça que ele aquece, com busca (as chaves e os diodos)
    await sel("Pv.1"); await pg.waitForSelector("#m-pv");
    await pg.fill("#m-pv", ""); await pg.type("#m-pv", "D"); await pg.waitForTimeout(300);
    const sug = await pg.evaluate(() => [...document.querySelectorAll(".sug")].map((s) => s.textContent));
    ok(await pg.inputValue("#m-pv") === "D" && sug.some((s) => s.includes("D.1")), `o painel do Pv: a busca da peça mostra o D.1 (${sug.join(" | ")})`);
    await pg.fill("#m-pv", "IGBT.1"); await pg.keyboard.press("Escape");
    // o TEMP: dois rótulos térmicos
    await sel("TEMP.1"); await pg.waitForSelector("#m-t1");
    ok(await pg.inputValue("#m-t1") === "Tj" && await pg.inputValue("#m-t2") === "ref", "o painel do TEMP: Tj − ref");
    // o FLOW: o Pv e a perda; mudar grava o losscomp, e o nome automático acompanha
    await sel("FLOW.4"); await pg.waitForSelector("#m-losscomp");
    ok(await pg.inputValue("#m-flow") === "Pv.2" && await pg.inputValue("#m-losscomp") === "total", "o painel do FLOW: Pv.2, total");
    await pg.selectOption("#m-losscomp", "conduction");
    await pg.waitForFunction(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "FLOW.4"); return e.losscomp === "conduction" && e.saidas[0] === "Pcond_D1"; }, null, { timeout: 20000 }).catch(() => {});
    let f4 = await pg.evaluate(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "FLOW.4"); return [e.losscomp, e.saidas[0]]; });
    ok(f4[0] === "conduction" && f4[1] === "Pcond_D1", `FLOW.4 → condução: o losscomp e o nome no scope (${f4})`);
    await sel("FLOW.4"); await pg.waitForSelector("#m-losscomp"); await pg.selectOption("#m-losscomp", "total");
    await pg.waitForFunction(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "FLOW.4"); return e.losscomp === "total" && e.saidas[0] === "Pv_D1"; }, null, { timeout: 20000 }).catch(() => {});
    f4 = await pg.evaluate(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "FLOW.4"); return [e.losscomp, e.saidas[0]]; });
    ok(f4[0] === "total" && f4[1] === "Pv_D1", `e de volta ao total (${f4})`);
    // a seção Perdas: os campos do modo simples juntos, e o Pv que usa a perda
    await sel("IGBT.1"); await pg.waitForSelector(".sec-perdas", { timeout: 20000 });
    const p = await pg.evaluate(() => { const s = document.querySelector(".sec-perdas");
      return { h: s.querySelector("h4").textContent, campos: [...s.querySelectorAll("[data-p]")].map((i) => i.dataset.p), pv: (s.querySelector(".com-pv") || {}).textContent || "" }; });
    ok(/Perdas|Losses/.test(p.h) && ["rON", "k_on", "k_off", "uK", "uF"].every((c) => p.campos.includes(c)) && p.pv.includes("Pv.1"),
      `a seção Perdas do IGBT: ${JSON.stringify(p)}`);
    // sem Pv: o aviso (o Pv.2 passa a aquecer o IGBT.1; o D.1 fica sem)
    await pg.evaluate(() => api("editor/mede", { nome: "Pv.2", tipo: "P", componente: "IGBT.1" }).then((j) => novoEstado(j)));
    await sel("D.1"); await pg.waitForSelector(".sec-perdas", { timeout: 20000 });
    const semPv = await pg.evaluate(() => (document.querySelector(".sec-perdas .sem-pv") || {}).textContent || "");
    ok(/sem Pv|without a Pv/.test(semPv), `o D.1 sem Pv: "${semPv}"`);
    await pg.evaluate(() => api("editor/mede", { nome: "Pv.2", tipo: "P", componente: "D.1" }).then((j) => novoEstado(j)));
    // o Pv passa a aquecer outra peça (o resistor também vale, como no Gecko): o FLOW e o TEMP dele com o nome automático
    // acompanham (Pv_D1 → Pv_R1, Tj_D1 → Tj_R1), e voltam
    const muda = async (id, v) => { await pg.fill(id, v); await pg.evaluate((id) => document.querySelector(id).dispatchEvent(new Event("change")), id); };
    const saida = (n) => pg.evaluate((n) => dados.folhas["0"].elementos.find((x) => x.nome === n).saidas[0], n);
    const espera = (fn, arg) => pg.waitForFunction(fn, arg, { timeout: 20000 }).catch(() => {});
    await sel("Pv.2"); await pg.waitForSelector("#m-pv"); await muda("#m-pv", "R.1");
    await espera(() => dados.folhas["0"].elementos.find((x) => x.nome === "FLOW.4").saidas[0] === "Pv_R1" && dados.folhas["0"].elementos.find((x) => x.nome === "TEMP.2").saidas[0] === "Tj_R1");
    ok(await saida("FLOW.4") === "Pv_R1" && await saida("TEMP.2") === "Tj_R1", `o Pv.2 aquece o R.1: FLOW.4 = ${await saida("FLOW.4")}, TEMP.2 = ${await saida("TEMP.2")}`);
    await sel("Pv.2"); await pg.waitForSelector("#m-pv"); await muda("#m-pv", "D.1");
    await espera(() => dados.folhas["0"].elementos.find((x) => x.nome === "FLOW.4").saidas[0] === "Pv_D1" && dados.folhas["0"].elementos.find((x) => x.nome === "TEMP.2").saidas[0] === "Tj_D1");
    ok(await saida("FLOW.4") === "Pv_D1" && await saida("TEMP.2") === "Tj_D1", `e de volta ao D.1: ${await saida("FLOW.4")}, ${await saida("TEMP.2")}`);
    // o FLOW num Rth: o fluxo de calor (P_Rth1), e o "qual perda" fica desligado (só vale no Pv)
    await sel("FLOW.4"); await pg.waitForSelector("#m-flow"); await muda("#m-flow", "Rth.1");
    await espera(() => dados.folhas["0"].elementos.find((x) => x.nome === "FLOW.4").saidas[0] === "P_Rth1");
    await sel("FLOW.4"); await pg.waitForSelector("#m-losscomp");
    ok(await saida("FLOW.4") === "P_Rth1" && await pg.evaluate(() => document.querySelector("#m-losscomp").disabled),
      `o FLOW.4 no Rth.1: ${await saida("FLOW.4")}, o "qual perda" desligado`);
    await muda("#m-flow", "Pv.2");
    await espera(() => dados.folhas["0"].elementos.find((x) => x.nome === "FLOW.4").saidas[0] === "Pv_D1");
    ok(await saida("FLOW.4") === "Pv_D1", `e de volta ao Pv.2 (${await saida("FLOW.4")})`);
    // uma peça no modo detalhado do Gecko (verlustTyp 2, curvas do .scl): a seção Perdas avisa que os campos simples não valem
    await pg.evaluate(() => { dados.folhas["0"].elementos.find((x) => x.nome === "IGBT.1").perda_modo = 2; });
    await sel("IGBT.1"); await pg.waitForSelector(".sec-perdas", { timeout: 20000 });
    const det = await pg.evaluate(() => (document.querySelector(".sec-perdas .perda-detalhada") || {}).textContent || "");
    ok(/detalhado|detailed/.test(det), `o modo detalhado: "${det.slice(0, 70)}…"`);
    await pg.evaluate(() => { delete dados.folhas["0"].elementos.find((x) => x.nome === "IGBT.1").perda_modo; });
    await sel("D.1"); await pg.waitForSelector(".sec-perdas", { timeout: 20000 });
    ok(!(await pg.$(".sec-perdas .perda-detalhada")), "no modo simples, sem o aviso");
    // a paleta: a aba Térmica, sem o TH_MODUL (lança UnsupportedOperationException no Gecko)
    const pal = await pg.evaluate(() => { const a = ed.catalogo.abas.find((x) => /Thermal/.test(x.aba));
      return { ids: a ? a.itens.map((i) => i.id) : [], modul: ed.catalogo.abas.some((x) => x.itens.some((i) => i.enum === "TH_MODUL")) }; });
    ok(pal.ids.includes("Pv") && pal.ids.includes("Rth") && !pal.ids.includes("MOD") && !pal.modul,
      `a aba Térmica: ${pal.ids.join(", ")} (sem o MOD)`);
    await pg.screenshot({ path: "termica_tela.png" });
    ok(!erros.length, `sem erros na página (${erros.join(" | ")})`);
  } finally {
    await pg.evaluate(() => api("editor/abrir", { arq: "exemplos/exemplo_buck_termico.ipes", modo: "descartar" })).catch(() => {});
    await b.close();
  }
  process.exit(falhas ? 1 : 0);
})();
