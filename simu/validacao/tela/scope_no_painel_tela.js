// a seção e o painel do scope de um sinal, no painel do medidor (instância de teste 7200), ideia de Marcelo em 23/10: o
// circuito no automático mostra a seção com o nome dele e o painel "Sinais da rodada"; "+ novo painel…" cria o painel e
// move o sinal para ele (o automático vira o layout do circuito, sem perder os outros sinais); "+ nova seção…" cria a seção
// com um painel; o scope (aqui dentro) se remonta com o layout novo
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const CH = "maisim-scope-layout-v5:exemplos/exemplo_buck.ipes";   // a chave é o caminho do circuito
const api = (rota, corpo) => fetch("http://localhost:7201/maisim/simu/" + rota, corpo ? { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo) } : {}).then((r) => r.json());
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
    // o layout mudou noutra janela com as escolhas abertas aqui: não grava num painel errado (as posições são outras)
    await pg.evaluate((k) => localStorage.setItem(k, JSON.stringify({ itens: [{ secao: "De outra janela" }, { titulo: "P", sinais: ["v_o"] }] })), CH);
    await pg.selectOption("#p-painel", { label: "i_L sozinha" }).catch(() => {}); await pg.waitForTimeout(300);
    const L3 = await pg.evaluate((k) => localStorage.getItem(k), CH), m3 = await pg.textContent("#msg");
    ok(/mudou/.test(m3) && JSON.parse(L3).itens.length === 2 && !/i_L/.test(L3), `layout mudado noutra janela: "${m3}", nada gravado no lugar errado`);
    // o padrão do circuito (o .scope.json): um circuito sem layout neste navegador parte dele, não do automático
    const sv = await api("editor/salvar", { nome: "nopainel_teste", pasta: "circuitos", sobrescrever: true });
    await api("scope/padrao", { modelo: sv.salvo, layout: { itens: [{ secao: "Do padrão" }, { titulo: "Corrente", sinais: ["i_L"] }, { titulo: "Tensão", sinais: ["v_o"] }] } });
    const pg2 = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage(); pg2.on("pageerror", (e) => erros.push(e.message));
    await pg2.route("**/scope/padrao?*", async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.continue(); });   // o padrão demora a vir
    await pg2.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent(sv.salvo));
    for (let k = 0; k < 60 && !(await pg2.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg2.$(".modal .m-ok")) await pg2.click(".modal .m-ok"); await pg2.waitForTimeout(500); }
    await pg2.evaluate(() => seleciona(dados.folhas["0"].elementos.find((e) => e.nome === "AMP.1")));
    const travadas = await pg2.evaluate(() => $("p-secao").disabled && $("p-painel").disabled);   // enquanto o padrão vem, não dá para escolher
    await pg2.waitForFunction(() => $("p-secao") && $("p-secao").selectedOptions[0].textContent === "Do padrão", null, { timeout: 5000 }).catch(() => {});
    const a4 = await pg2.evaluate(() => ({ s: $("p-secao").selectedOptions[0].textContent, p: $("p-painel").selectedOptions[0].textContent, chave: circuitoDoLayout() }));
    const soltas = await pg2.evaluate(() => !$("p-secao").disabled && !$("p-painel").disabled);
    ok(travadas && soltas && a4.s === "Do padrão" && a4.p === "Corrente" && a4.chave === sv.salvo,
      `sem layout guardado: as listas esperam o padrão do circuito e partem dele (seção ${a4.s}, painel ${a4.p}; chave ${a4.chave})`);
    // salvar como: o layout vai junto para o arquivo novo
    await pg2.selectOption("#p-painel", { label: "Tensão" }); await pg2.waitForTimeout(300);
    await pg2.evaluate(() => { salvarComo(); }); await pg2.waitForSelector(".modal input"); await pg2.fill(".modal input", "nopainel_teste_2"); await pg2.click(".modal .m-ok");
    for (let k = 0; k < 10 && await pg2.$(".modal .m-ok"); k++) { await pg2.click(".modal .m-ok"); await pg2.waitForTimeout(300); }   // sobrescrever, de uma vez anterior
    await pg2.waitForFunction(() => /nopainel_teste_2/.test(circuitoDoLayout()), null, { timeout: 10000 }).catch(() => {});
    const levou = await pg2.evaluate(() => { const L = JSON.parse(localStorage.getItem(`maisim-scope-layout-v5:${circuitoDoLayout()}`) || "null"); return L && L.itens.find((x) => x.titulo === "Tensão"); });
    ok(levou && levou.sinais.join() === "v_o,i_L", `salvar como: o layout foi junto (${JSON.stringify(levou)})`);
    await api("editor/abrir", { arq: "exemplos/exemplo_buck.ipes", modo: "descartar" });
    for (const n of ["nopainel_teste", "nopainel_teste_2"]) await api("editor/apagar_arquivo", { arq: sv.salvo.replace("nopainel_teste", n) });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
