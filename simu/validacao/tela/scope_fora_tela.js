// o scope numa janela à parte (instância de teste 7200), pedido de Marcelo em 23/10, como o do código: com o scope aberto
// na janela dele, a aba scope do simu vira uma faixa estreita ("o scope está na janela do scope", ir para lá, ver aqui
// também); a aba controle não muda; "ver aqui também" devolve; a janela do scope fechada, volta sozinha. Cada janela do scope
// conta por si; em Comparar não conta; escondida, espera mais (o navegador atrasa os avisos); "ir para lá" não abre um segundo
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const S = "http://localhost:7200/maisim/simu/";
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 850 } });
    // o simu de teste do zero no exemplo (descartando o que outro teste deixou: um "mudanças não salvas" travava o clique)
    await fetch("http://localhost:7201/maisim/simu/editor/abrir", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arq: "exemplos/exemplo_buck.ipes", modo: "descartar" }) }).then((r) => r.text());
    const A = await ctx.newPage(); const erros = []; A.on("pageerror", (e) => erros.push(e.message));
    await A.goto(S + "?modelo=" + encodeURIComponent("exemplos/exemplo_buck.ipes"));
    for (let k = 0; k < 60 && !(await A.evaluate(() => typeof dados !== "undefined" && dados && dados.folhas)); k++) { if (await A.$(".modal .m-ok")) await A.click(".modal .m-ok"); await A.waitForTimeout(500); }
    await A.evaluate(() => mostraDoca("scope")); await A.waitForTimeout(500);
    const larg = () => A.evaluate(() => ({ doca: Math.round($("painel-scope").getBoundingClientRect().width), tela: Math.round($("tela").getBoundingClientRect().width),
      iframe: getComputedStyle($("if-scope")).display, aviso: getComputedStyle($("scope-fora")).display }));
    const antes = await larg();
    const B = await ctx.newPage(); await B.goto("http://localhost:7200/maisim/scope/?janela=1"); await A.waitForTimeout(3500);
    const fx = await larg();
    await A.evaluate(() => mostraDoca("controle")); await A.waitForTimeout(400); const ct = await larg();
    await A.evaluate(() => mostraDoca("scope")); await A.click("#scope-fora-bt"); await A.waitForTimeout(400); const aq = await larg();
    await A.evaluate(() => document.body.classList.remove("scope-aqui")); await A.waitForTimeout(300);
    ok(antes.doca > 300 && fx.doca <= 210 && fx.iframe === "none" && fx.aviso === "flex" && fx.tela > antes.tela + 100,
      `com o scope na janela dele: a aba scope vira faixa (${antes.doca} → ${fx.doca} px; o desenho ${antes.tela} → ${fx.tela} px), com o aviso`);
    ok(ct.doca > 300 && aq.doca > 300 && aq.iframe !== "none", `a aba controle não muda (${ct.doca} px); "ver aqui também" devolve o scope (${aq.doca} px)`);
    // duas janelas do scope: fechar uma não devolve a aba (a outra continua lá)
    const C = await ctx.newPage(); await C.goto("http://localhost:7200/maisim/scope/"); await A.waitForTimeout(1500);   // numa aba comum
    await C.close(); await A.waitForTimeout(1500);
    const umaFica = await larg();
    ok(umaFica.doca <= 210, `duas janelas do scope, fechada uma: a faixa fica (${umaFica.doca} px)`);
    // a outra em Comparar (o ao vivo não aparece nela): a aba volta; de volta ao vivo, faixa de novo
    await B.click("#bt-comparar"); await A.waitForTimeout(1000); const comp = await larg();
    await B.click("#bt-vivo"); await A.waitForTimeout(1000); const vivo = await larg();
    ok(comp.doca > 300 && vivo.doca <= 210, `a janela do scope em Comparar: a aba volta (${comp.doca} px); ao vivo de novo, faixa (${vivo.doca} px)`);
    // uma janela escondida (o navegador atrasa os avisos dela): sem aviso por 9 s, a faixa fica
    await A.evaluate(() => { const c = new BroadcastChannel("maisim-simu"); c.postMessage({ tipo: "scope", de: "escondida", oculto: true, vivo: true }); });
    await B.close(); await A.waitForTimeout(9500); const oc = await larg();
    ok(oc.doca <= 210, `uma janela escondida, sem aviso por 9 s: a faixa fica (${oc.doca} px)`);
    await A.evaluate(() => { const c = new BroadcastChannel("maisim-simu"); c.postMessage({ tipo: "scope-fechado", de: "escondida" }); });
    await A.waitForTimeout(800);
    const fim = await larg();
    ok(fim.doca > 300 && fim.iframe !== "none", `fechada a janela do scope, a aba volta (${fim.doca} px)`);
    // "ir para lá": a janela do scope aberta daqui (pelo trilho) vem para a frente, a mesma; uma aberta à parte (outra aba, que
    // o navegador não acha pelo nome): não abre outra, diz onde está
    const [E] = await Promise.all([ctx.waitForEvent("page"), A.evaluate(() => { window.open("/maisim/scope/?janela=1", "maisim-scope"); })]);
    await E.waitForLoadState(); await A.waitForTimeout(1500);
    let n0 = ctx.pages().length; await A.evaluate(() => mostraDoca("scope")); await A.click("#scope-fora-ir"); await A.waitForTimeout(1000);
    const mesma = ctx.pages().length === n0 && /janela=1/.test(E.url());
    await E.close(); await A.waitForTimeout(800);
    const D = await ctx.newPage(); await D.goto("http://localhost:7200/maisim/scope/"); await A.waitForTimeout(1500);
    n0 = ctx.pages().length; await A.click("#scope-fora-ir"); await A.waitForTimeout(1000);
    const aviso = await A.textContent("#msg");
    ok(mesma && ctx.pages().length === n0 && /outra aba/.test(aviso), `"ir para lá": a janela aberta pelo trilho, a mesma; aberto em outra aba, não abre outro ("${aviso}")`);
    await D.close();
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
