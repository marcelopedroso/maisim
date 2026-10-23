// a seção e o painel do scope de um sinal, no painel do medidor (instância de teste 7200), ideia de Marcelo em 23/10: o
// circuito no automático mostra a seção com o nome dele e o painel "Sinais da rodada"; "+ novo painel…" cria o painel e
// move o sinal para ele (o automático vira o layout do circuito, sem perder os outros sinais); "+ nova seção…" cria a seção
// com um painel; o scope (aqui dentro) se remonta com o layout novo
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const CH = "maisim-scope-layout-v4:exemplo_buck";
(async () => {
  let b;
  try {
    await fetch("http://localhost:7201/maisim/simu/editor/abrir", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arq: "exemplos/exemplo_buck.ipes", modo: "descartar" }) }).then((r) => r.text());
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent("exemplos/exemplo_buck.ipes"));
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal .m-ok")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    // uma rodada curta, para o scope aqui dentro ter o circuito
    await pg.evaluate(() => { sim.par.tfim = "0.002"; iniciaSim(); });
    await pg.waitForFunction(() => sim.estado === "fim" || sim.estado === "erro", null, { timeout: 120000 }); await pg.waitForTimeout(3000);
    const doScope = () => pg.frames().find((f) => f.url().includes("/maisim/scope/"));
    const itensScope = () => doScope().evaluate(() => itens.map((x) => x.tipo === "secao" ? "S:" + x.titulo : `P:${x.titulo}[${x.sinais.join(",")}]`));
    const s0 = await itensScope();
    // o medidor i_L (AMP.1)
    await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((e) => e.nome === "AMP.1"))); await pg.waitForSelector("#p-secao");
    const sel = () => pg.evaluate(() => ({ s: $("p-secao").selectedOptions[0].textContent, p: $("p-painel").selectedOptions[0].textContent }));
    const a0 = await sel(), gravou0 = await pg.evaluate((k) => localStorage.getItem(k), CH);
    ok(a0.s === "exemplo_buck" && a0.p === "Sinais da rodada" && !gravou0 && s0[0] === "S:exemplo_buck", `no automático: seção ${a0.s}, painel ${a0.p} (o scope: ${s0.slice(0, 2).join(" ")}), nada gravado`);
    // + novo painel…
    await pg.selectOption("#p-painel", "+"); await pg.waitForSelector(".modal input");
    await pg.fill(".modal input", "Corrente no indutor"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1200);
    const L1 = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), CH), a1 = await sel(), s1 = await itensScope();
    const auto = L1.itens.find((x) => x.titulo === "Sinais da rodada"), novo = L1.itens.find((x) => x.titulo === "Corrente no indutor");
    ok(novo && novo.sinais.join() === "i_L" && auto && !auto.sinais.includes("i_L") && auto.sinais.includes("v_o") && a1.p === "Corrente no indutor",
       `novo painel: i_L vai para "Corrente no indutor"; o automático vira o layout do circuito, com os outros (${auto && auto.sinais.join(",")})`);
    ok(s1.some((x) => x === "P:Corrente no indutor[i_L]"), `o scope aqui dentro se remontou: ${s1.join(" ")}`);
    // + nova seção…
    await pg.selectOption("#p-secao", "+"); await pg.waitForSelector(".modal input");
    const ins = await pg.$$(".modal input"); await ins[0].fill("Medidas"); await ins[1].fill("i_L sozinha"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1200);
    const L2 = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), CH), a2 = await sel();
    const ult = L2.itens.slice(-2);
    ok(ult[0].secao === "Medidas" && ult[1].titulo === "i_L sozinha" && ult[1].sinais.join() === "i_L" && !L2.itens.find((x) => x.titulo === "Corrente no indutor").sinais.includes("i_L")
       && a2.s === "Medidas" && a2.p === "i_L sozinha", `nova seção: "Medidas" com o painel "i_L sozinha" (e o i_L sai do painel de antes)`);
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
