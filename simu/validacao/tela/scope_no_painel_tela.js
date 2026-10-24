// a seção e os painéis do scope de um sinal, no painel do medidor (instância de teste 7200), ideia de Marcelo em 23/10 (e um
// sinal em vários painéis, 24/10): o circuito no automático mostra a seção com o nome dele e o painel "Sinais da rodada"
// marcado; "+ novo painel…" cria o painel já com o sinal (o automático vira o layout do circuito, sem perder os outros
// sinais, e o sinal fica nos dois); desmarcar tira só daquele painel; "+ nova seção…" cria a seção com um painel; marcar um
// painel que já existe põe o sinal nele; o ✕ apaga painéis da seção; o scope (aqui dentro) se remonta com o layout novo
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
    // o que o painel mostra: a seção, os painéis marcados e todos os da seção (pelo título de verdade, data-titulo), e o "também em"
    const sel = (P = pg) => P.evaluate(() => ({ s: $("p-secao").selectedOptions[0].textContent,
      p: [...document.querySelectorAll("#p-paineis input:checked")].map((i) => i.dataset.titulo).join(),
      todos: [...document.querySelectorAll("#p-paineis input")].map((i) => i.dataset.titulo), tambem: $("p-tambem").hidden ? "" : $("p-tambem").textContent }));
    const marca = async (titulo, sim = true, P = pg) => { await P[sim ? "check" : "uncheck"](`#p-paineis input[data-titulo="${titulo}"]`); await P.waitForTimeout(1200); };
    const leL = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), CH);
    const sinaisDe = (L, t) => { const x = L.itens.find((y) => y.titulo === t); return x ? x.sinais : null; };
    const a0 = await sel(), gravou0 = await pg.evaluate((k) => localStorage.getItem(k), CH);
    ok(a0.s === "exemplo_buck" && a0.p === "Sinais da rodada" && !gravou0 && s0[0] === "S:exemplo_buck", `no automático: seção ${a0.s}, painel ${a0.p} (o scope: ${s0.slice(0, 2).join(" ")}), nada gravado`);
    // + novo painel…: o painel novo já com o sinal; ele fica também no de antes (um sinal em dois painéis)
    await pg.click("#p-painel-novo"); await pg.waitForSelector(".modal input");
    await pg.fill(".modal input", "Corrente no indutor"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1200);
    const L1 = await leL(), a1 = await sel(), s1 = await itensScope();
    const auto = sinaisDe(L1, "Sinais da rodada"), novo = sinaisDe(L1, "Corrente no indutor");
    ok(novo && novo.join() === "i_L" && auto && auto.includes("i_L") && auto.includes("v_o") && a1.p === "Sinais da rodada,Corrente no indutor",
       `novo painel: i_L em "Corrente no indutor" e ainda em "Sinais da rodada" (o automático vira o layout do circuito, com os outros: ${auto && auto.join(",")}); marcados: ${a1.p}`);
    ok(s1.includes("P:Corrente no indutor[i_L]") && s1.some((x) => /^P:Sinais da rodada\[(.*,)?i_L(,|\])/.test(x)), `o scope aqui dentro se remontou, com i_L nos dois: ${s1.join(" ")}`);
    // desmarcar: sai só daquele painel
    await marca("Sinais da rodada", false);
    const Lb = await leL(), ab = await sel(), mb = await pg.textContent("#msg");
    ok(!sinaisDe(Lb, "Sinais da rodada").includes("i_L") && sinaisDe(Lb, "Sinais da rodada").includes("v_o") && sinaisDe(Lb, "Corrente no indutor").join() === "i_L"
       && ab.p === "Corrente no indutor" && /sai do painel/.test(mb), `desmarcar "Sinais da rodada": i_L sai só dele, fica em "Corrente no indutor" ("${mb}")`);
    // + nova seção…: a seção com um painel com o sinal; nos de antes ele fica, e a linha "também em" mostra onde
    await pg.selectOption("#p-secao", "+"); await pg.waitForSelector(".modal input");
    const ins = await pg.$$(".modal input"); await ins[0].fill("Medidas"); await ins[1].fill("i_L sozinha"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1200);
    const L2 = await leL(), a2 = await sel();
    const ult = L2.itens.slice(-2);
    ok(ult[0].secao === "Medidas" && ult[1].titulo === "i_L sozinha" && ult[1].sinais.join() === "i_L" && sinaisDe(L2, "Corrente no indutor").join() === "i_L"
       && a2.s === "Medidas" && a2.p === "i_L sozinha" && /exemplo_buck › Corrente no indutor/.test(a2.tambem),
       `nova seção: "Medidas" com o painel "i_L sozinha" (o i_L fica no de antes: "${a2.tambem}")`);
    // a lista mostra o nome em notação, como o desenho e o scope (Marcelo, 24/10): i_L → i itálico com o L subscrito
    const nt = await pg.evaluate(() => { const sp = document.querySelector('#p-paineis input[data-titulo="i_L sozinha"] + span');
      return sp ? { sub: [...sp.querySelectorAll("sub")].map((x) => x.textContent).join(), letra: (sp.querySelector(".mat-l") || {}).textContent,
        estilo: sp.querySelector(".mat-l") ? getComputedStyle(sp.querySelector(".mat-l")).fontStyle : "", txt: sp.textContent, dica: sp.title,
        sobra: sp.querySelector("sub") ? Math.round(sp.getBoundingClientRect().bottom - sp.querySelector("sub").getBoundingClientRect().bottom) : null } : null; });
    ok(nt && nt.letra === "i" && nt.sub === "L" && nt.estilo === "italic" && nt.txt === "iL sozinha" && nt.dica === "i_L sozinha" && nt.sobra >= 0,
       `o painel "i_L sozinha" na lista em notação, o subscrito inteiro dentro da linha (sobra ≥ 0 px): ${JSON.stringify(nt)}`);
    // um painel que já existe, noutra seção: marcar põe o sinal nele (e ele continua nos outros)
    await pg.selectOption("#p-secao", { label: "exemplo_buck" }); await pg.waitForTimeout(300);
    const a3a = await sel(); await marca("Sinais da rodada");
    const L3a = await leL(), a3 = await sel(), m3a = await pg.textContent("#msg");
    ok(a3a.p === "Corrente no indutor" && a3a.todos.includes("Sinais da rodada") && sinaisDe(L3a, "Sinais da rodada").includes("i_L") && sinaisDe(L3a, "i_L sozinha").join() === "i_L"
       && sinaisDe(L3a, "Corrente no indutor").join() === "i_L" && a3.p === "Sinais da rodada,Corrente no indutor" && /entra no painel “Sinais da rodada”/.test(m3a),
       `painel que já existe: i_L em "Sinais da rodada", "Corrente no indutor" e "i_L sozinha" ("${m3a}")`);
    // ✕: apagar um painel da seção (a janela lista os painéis com quantos sinais têm); some do layout e do scope
    await pg.click("#p-painel-apaga"); await pg.waitForSelector(".modal .apaga-paineis");
    const rotulos = await pg.$$eval(".modal .apaga-paineis label", (ls) => ls.map((l) => l.textContent.replace(/\s+/g, " ").trim()));
    await pg.check('.modal .apaga-paineis label:has-text("Corrente no indutor") input'); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1500);
    const L4a = await leL(), a4a = await sel(), m4a = await pg.textContent("#msg"), s4a = await itensScope();
    ok(rotulos.some((r) => /^Corrente no indutor 1 sinal$/.test(r)) && !sinaisDe(L4a, "Corrente no indutor") && sinaisDe(L4a, "Sinais da rodada").includes("i_L") && sinaisDe(L4a, "i_L sozinha")
       && !a4a.todos.includes("Corrente no indutor") && /apagado/.test(m4a) && !s4a.some((x) => x.startsWith("P:Corrente no indutor")),
       `✕ apaga "Corrente no indutor" (a janela: ${rotulos.join(" | ")}): fora do layout, da lista e do scope ("${m4a}")`);
    // o layout mudou noutra janela com as escolhas abertas aqui: não grava num painel errado (as posições são outras)
    await pg.evaluate((k) => { localStorage.setItem(k, JSON.stringify({ itens: [{ secao: "De outra janela" }, { titulo: "P", sinais: ["v_o"] }] }));
      document.querySelector("#p-paineis input").click(); }, CH);   // na mesma hora (a lista ainda é a de antes)
    await pg.waitForTimeout(300);
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
    // enquanto o padrão vem, não dá para escolher: a seção, os quadradinhos e os botões, travados
    const travadas = await pg2.evaluate(() => { const xs = [...document.querySelectorAll("#p-paineis input")];
      return $("p-secao").disabled && xs.length > 0 && xs.every((x) => x.disabled) && $("p-painel-novo").disabled && $("p-painel-apaga").disabled; });
    await pg2.waitForFunction(() => $("p-secao") && $("p-secao").selectedOptions[0].textContent === "Do padrão", null, { timeout: 5000 }).catch(() => {});
    const a4 = await sel(pg2), chave = await pg2.evaluate(() => circuitoDoLayout());
    const soltas = await pg2.evaluate(() => !$("p-secao").disabled && ![...document.querySelectorAll("#p-paineis input")].some((x) => x.disabled) && !$("p-painel-novo").disabled);
    ok(travadas && soltas && a4.s === "Do padrão" && a4.p === "Corrente" && chave === sv.salvo,
      `sem layout guardado: a seção e os painéis esperam o padrão do circuito e partem dele (seção ${a4.s}, painel ${a4.p}; chave ${chave})`);
    // salvar como: o layout vai junto para o arquivo novo (com o i_L nos dois painéis)
    await marca("Tensão", true, pg2);
    await pg2.evaluate(() => { salvarComo(); }); await pg2.waitForSelector(".modal input"); await pg2.fill(".modal input", "nopainel_teste_2"); await pg2.click(".modal .m-ok");
    for (let k = 0; k < 10 && await pg2.$(".modal .m-ok"); k++) { await pg2.click(".modal .m-ok"); await pg2.waitForTimeout(300); }   // sobrescrever, de uma vez anterior
    await pg2.waitForFunction(() => /nopainel_teste_2/.test(circuitoDoLayout()), null, { timeout: 10000 }).catch(() => {});
    const levou = await pg2.evaluate(() => JSON.parse(localStorage.getItem(`maisim-scope-layout-v5:${circuitoDoLayout()}`) || "null"));
    ok(levou && sinaisDe(levou, "Tensão").join() === "v_o,i_L" && sinaisDe(levou, "Corrente").join() === "i_L", `salvar como: o layout foi junto (${JSON.stringify(levou && levou.itens)})`);
    await api("editor/abrir", { arq: "exemplos/exemplo_buck.ipes", modo: "descartar" });
    for (const n of ["nopainel_teste", "nopainel_teste_2"]) await api("editor/apagar_arquivo", { arq: sv.salvo.replace("nopainel_teste", n) });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
