// variáveis globais ($) pela tela (instância de teste 7200 → 7201): no parâmetro de um componente, escrever $nome liga
// (a que não existe é criada com o valor de agora) e o campo mostra o nome e o valor; o ⚙ tem as abas "simulação" e
// "variáveis globais ($)" (o $x abre direto na segunda): mudar o valor, criar, apagar (a usada pede confirmação e quem a usa
// fica com o valor), "apagar as que nenhum componente usa"; um número no campo desliga
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } }); await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:7200" });
    const pg = await ctx.newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    const g0 = await pg.evaluate(async () => { const j = await api("editor/novo", { modo: "descartar" }); ed.novo = "variaveis"; dados = j; folhaAtual = "0"; seleciona(null); novoEstado(j);
      novoEstado(await api("editor/cmd", { op: "CREATE", args: ["U.1", 10, 10, "U"] })); novoEstado(await api("editor/cmd", { op: "CREATE", args: ["U.2", 10, 20, "U"] }));
      seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "U.1")); return Object.keys(dados.globais); });
    // 1. $nome no parâmetro: liga (a variável nova fica com o valor de agora)
    await pg.waitForSelector('#p-params input[data-p="uDC"]', { timeout: 30000 });
    const antes = await pg.inputValue('#p-params input[data-p="uDC"]');
    await pg.fill('#p-params input[data-p="uDC"]', "$Vdc_t"); await pg.press('#p-params input[data-p="uDC"]', "Tab");
    await pg.waitForSelector('#p-params .com-var input.var[data-p="uDC"]', { timeout: 30000 });
    let c = await pg.evaluate(() => ({ g: dados.globais["$Vdc_t"], var: dados.folhas["0"].elementos.find((x) => x.nome === "U.1").par.dcValue_var,
      campo: document.querySelector('#p-params input[data-p="uDC"]').value, mostra: document.querySelector('#p-params .com-var small').textContent, msg: $("msg").textContent }));
    ok(c.g === Number(antes) && c.var === "$Vdc_t" && c.campo === "$Vdc_t" && /^= /.test(c.mostra), `uDC ← $Vdc_t (nova, ${antes}): o campo mostra "${c.campo}" e "${c.mostra}" · "${c.msg}"`);
    ok(await pg.evaluate(() => document.querySelectorAll("#p-params .com-var").length === 1 && !document.querySelector('#p-params input[data-p="uMAX"]').classList.contains("var")),
      "só o uDC aparece ligado (o uMAX, nome alternativo do uDC no Gecko, continua número)");
    // a outra fonte, na mesma variável
    await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "U.2")));
    await pg.waitForSelector('#p-params input[data-p="uDC"]'); await pg.fill('#p-params input[data-p="uDC"]', "$Vdc_t"); await pg.press('#p-params input[data-p="uDC"]', "Tab");
    await pg.waitForSelector('#p-params .com-var input.var[data-p="uDC"]', { timeout: 30000 });
    // 2. o ⚙: duas abas; a das variáveis lista $Vdc_t com 2 usos
    await pg.click("#bt-param"); await pg.waitForSelector(".modal .m-abas");
    let m = await pg.evaluate(() => ({ abas: [...document.querySelectorAll(".m-abas button")].map((x) => x.textContent), ativa: document.querySelector(".m-abas .ativo").textContent,
      dt: !!document.querySelector('.modal input[name="dt"]') && getComputedStyle(document.querySelector('.m-aba[data-aba="sim"]')).display !== "none" }));
    ok(m.abas.join("|") === "simulação|variáveis globais ($)" && m.ativa === "simulação" && m.dt, `⚙: abas ${m.abas.join(" · ")}, abre em "${m.ativa}" (Δt à vista)`);
    await pg.click('.m-abas button[data-aba="vars"]'); await pg.waitForTimeout(200);
    const linha = () => pg.evaluate(() => { const i = document.querySelector('.gv input[data-g="$Vdc_t"]'); return i && { v: i.value, usos: i.parentElement.querySelector("small").textContent, ok: document.querySelector(".modal .m-ok").textContent }; });
    let l = await linha();
    ok(l && l.usos === "2 usos" && l.ok === "fechar", `aba das variáveis: $Vdc_t = ${l && l.v}, ${l && l.usos} (o botão vira "${l && l.ok}")`);
    // mudar o valor (Enter não fecha a janela)
    await pg.fill('.gv input[data-g="$Vdc_t"]', "42"); await pg.press('.gv input[data-g="$Vdc_t"]', "Enter"); await pg.waitForTimeout(2500);
    ok(await pg.evaluate(() => dados.globais["$Vdc_t"] === 42 && !!document.querySelector(".modal")), "valor 42 + Enter: a variável muda e a janela continua aberta");
    // copiar o nome (19/10): um clique copia $Vdc_t; depois, colado no parâmetro de um componente, liga
    await pg.click('.gv [data-copia="$Vdc_t"]'); await pg.waitForTimeout(300);
    const cop = await pg.evaluate(async () => ({ clip: await navigator.clipboard.readText(), msg: $("msg").textContent, verde: document.querySelector('.gv [data-copia="$Vdc_t"]').classList.contains("copiado") }));
    ok(cop.clip === "$Vdc_t" && /copiado/.test(cop.msg) && cop.verde, `copiar: "${cop.clip}" na área de transferência ("${cop.msg}")`);
    // criar
    await pg.fill("#gv-nome", "f_teste"); await pg.press("#gv-nome", "Enter"); await pg.fill("#gv-valor", "60"); await pg.press("#gv-valor", "Enter");
    await pg.waitForSelector('.gv input[data-g="$f_teste"]', { timeout: 30000 });
    ok(await pg.evaluate(() => dados.globais["$f_teste"] === 60), "criar f_teste = 60 (o $ entra sozinho): $f_teste na lista");
    // apagar a sem uso: na hora
    await pg.click('.gv [data-apaga="$f_teste"]'); await pg.waitForTimeout(2500);
    ok(await pg.evaluate(() => !("$f_teste" in dados.globais) && !document.querySelector('.gv input[data-g="$f_teste"]')), "× numa variável sem uso: apagada");
    // apagar a usada: pede confirmação
    await pg.click('.gv [data-apaga="$Vdc_t"]'); await pg.waitForTimeout(400);
    ok(await pg.evaluate(() => "$Vdc_t" in dados.globais && document.querySelector('.gv [data-apaga="$Vdc_t"]').textContent === "apagar?"), "× numa variável usada: primeiro pergunta (apagar?)");
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
    // 3. o $x abre direto na aba das variáveis
    await pg.click("#bt-globais"); await pg.waitForSelector(".modal .m-abas");
    m = await pg.evaluate(() => ({ h: document.querySelector(".modal h3").textContent, ativa: document.querySelector(".m-abas .ativo").dataset.aba }));
    ok(/Parâmetros da simulação/.test(m.h) && m.ativa === "vars", `$x: "${m.h}", na aba das variáveis`);
    // apagar as que nenhum componente usa (as do modelo base, se houver): fica só $Vdc_t
    const sem = await pg.evaluate(() => { const b = $("gv-limpa"); return b ? +b.textContent.match(/\d+/)[0] : 0; });
    if (sem) { await pg.click("#gv-limpa"); await pg.waitForTimeout(4000); }
    ok(await pg.evaluate(() => JSON.stringify(Object.keys(dados.globais)) === '["$Vdc_t"]' && !$("gv-limpa")), `"apagar as ${sem} que nenhum componente usa": fica só $Vdc_t (um passo do desfazer)`);
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
    // 3b. colar o nome copiado no parâmetro de outro componente: liga (o fluxo do Marcelo)
    await pg.evaluate(async () => { novoEstado(await api("editor/cmd", { op: "CREATE", args: ["U.3", 10, 30, "U"] })); seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "U.3")); });
    await pg.waitForSelector('#p-params input[data-p="uDC"]'); await pg.click('#p-params input[data-p="uDC"]'); await pg.keyboard.press("Control+a");
    await pg.keyboard.press("Control+v"); await pg.keyboard.press("Tab");
    await pg.waitForSelector('#p-params .com-var input.var[data-p="uDC"]', { timeout: 30000 });
    ok(await pg.evaluate(() => dados.folhas["0"].elementos.find((x) => x.nome === "U.3").par.dcValue_var === "$Vdc_t"), "Ctrl+V do nome copiado no uDC do U.3 + Tab: ligado a $Vdc_t");
    // 4. um número no campo desliga
    await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "U.1")));
    await pg.waitForSelector('#p-params .com-var input.var[data-p="uDC"]');
    c = await pg.evaluate(() => document.querySelector('#p-params .com-var small').textContent);
    await pg.fill('#p-params input[data-p="uDC"]', "5"); await pg.press('#p-params input[data-p="uDC"]', "Tab");
    await pg.waitForFunction(() => !document.querySelector('#p-params .com-var') && document.querySelector('#p-params input[data-p="uDC"]'), null, { timeout: 30000 });
    const d = await pg.evaluate(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "U.1"); return { var: e.par.dcValue_var, v: e.par.dcValue, campo: document.querySelector('#p-params input[data-p="uDC"]').value }; });
    ok(/^= 42/.test(c) && !d.var && d.v === 5 && d.campo === "5", `antes "${c}"; o número 5 no campo desliga: uDC = ${d.v}, sem variável`);
    // nome inválido no campo: recusa e volta
    await pg.fill('#p-params input[data-p="uDC"]', "$1x"); await pg.press('#p-params input[data-p="uDC"]', "Tab");
    await pg.waitForFunction(() => /nome da variável/.test($("msg").textContent), null, { timeout: 10000 }).catch(() => {});   // a resposta do servidor (não um tempo fixo: no Actions, 600 ms às vezes não bastava)
    ok(/nome da variável/.test(await pg.textContent("#msg")) && (await pg.inputValue('#p-params input[data-p="uDC"]')) === "5", "$1x no campo: recusado, o campo volta ao 5");
    // limpa: o circuito em branco e as variáveis que o teste criou saem (o "novo" não apaga variáveis)
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    const gs = await pg.evaluate(async () => Object.keys((await api("editor/estado")).globais));
    for (const k of gs.filter((k) => !g0.includes(k))) await pg.evaluate(async (k) => api("editor/variavel", { acao: "apaga", nome: k }), k);
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
