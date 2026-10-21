// módulos pela tela (instância de teste 7200 → 7201), pedido de Marcelo em 19/10: o circuito novo vem com leitura.py e
// escrita.py (módulos) e o controle.py que os chama; "+ arquivo" cria um módulo (aviso enquanto ninguém o importa);
// "▷ testar" roda o fluxo; "virar controlador" e "virar módulo"; num controle de antes dos módulos, "organizar como um DSP"
// cria os dois arquivos sem mexer no controle.py
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const PI = require("os").homedir() + "/.cache/maisim_teste/circuitos/exemplo_controle_pi.ipes";
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async () => { const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j); await recarregaControle(); mostraDoca("controle"); });
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    await pg.click('#ctl-vistas [data-vista="arq"]'); await pg.waitForTimeout(400);
    // a árvore pelos imports (19/10): cada linha diz o papel na dica (controlador; módulo · import x · chamado por …)
    const arv = () => pg.evaluate(() => [...document.querySelectorAll("#ctl-ctls .ctl-no")].map((x) => `${x.dataset.abre}:${x.title.replace(/^\S+ · /, "").slice(0, 40)}`));
    const cfg = async () => (await pg.evaluate(() => api("editor/controle")));
    // 1. o circuito novo
    let a = await arv(), r = await cfg();
    ok(a.length === 3 && a.some((x) => /^leitura\.py:módulo · import leitura/.test(x)) && a.some((x) => /^escrita\.py:módulo · import escrita/.test(x)) && /import leitura/.test(await pg.evaluate(() => codigoAtual())),
      `circuito novo: ${a.join(" | ")}`);
    // 2. ▷ testar: o fluxo leitura → controle → escrita roda
    await pg.click("#ctl-testar"); await pg.waitForFunction(() => !/testando/.test($("ctl-saida").textContent), null, { timeout: 30000 });
    const sai = await pg.evaluate(() => ({ t: $("ctl-saida").textContent, c: $("ctl-saida").className }));
    ok(/^teste ok/.test(sai.t) && sai.c !== "erro", `▷ testar com os módulos: "${sai.t.split("\n")[0].slice(0, 80)}…"`);
    // 3. + arquivo: um módulo, com aviso enquanto ninguém o importa
    await pg.click("#ctl-arq-novo2"); await pg.waitForSelector(".modal input[name=nome]"); await pg.fill(".modal input[name=nome]", "pll"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1800);
    r = await cfg();
    ok(r.modulos.includes("pll.py") && !r.controle.controladores.length && r.avisos.some((x) => /pll\.py \(módulo\) não é importado/.test(x)) && /iniciar\(p\)/.test(r.controle.arquivos["pll.py"]),
      `+ arquivo pll.py: módulo com o modelo (iniciar/passo), aviso "${(r.avisos.find((x) => /pll/.test(x)) || "").slice(0, 50)}…"`);
    await pg.evaluate(() => { const m = ctl.modelos["controle.py"]; m.setValue(m.getValue().replace("import escrita", "import escrita\nimport pll")); }); await pg.waitForTimeout(1800);
    r = await cfg();
    ok(!r.avisos.some((x) => /pll/.test(x)) && !r.erros.length, "import pll no controle.py: o aviso some");
    // 3b. o × da aba fecha a aba (o arquivo fica na lista); clicar nele na lista reabre; o × da lista apaga (Marcelo, 19/10)
    await pg.evaluate(() => mostraArquivo("pll.py")); await pg.waitForTimeout(300);
    await pg.click('#ctl-abas [data-fecha-aba="pll.py"]'); await pg.waitForTimeout(500);
    let fa = await pg.evaluate(async () => ({ abas: [...document.querySelectorAll("#ctl-abas .aba[data-arq]")].map((x) => x.dataset.arq), ativa: ctl.arq,
      lista: ctl.lista.slice(), srv: Object.keys((await api("editor/controle")).controle.arquivos) }));
    ok(!fa.abas.includes("pll.py") && fa.ativa !== "pll.py" && fa.lista.includes("pll.py") && fa.srv.includes("pll.py") && !(await pg.$(".modal")),
      `× da aba: pll.py sai das abas (${fa.abas.join(", ")}), continua na lista e no servidor, sem perguntar nada`);
    await pg.click('#ctl-ctls .ctl-no[data-abre="pll.py"]'); await pg.waitForTimeout(400);
    fa = await pg.evaluate(() => ({ abas: [...document.querySelectorAll("#ctl-abas .aba[data-arq]")].map((x) => x.dataset.arq), ativa: ctl.arq }));
    ok(fa.abas.includes("pll.py") && fa.ativa === "pll.py", "clicar no pll.py na lista: a aba volta, aberta");
    // 4. virar controlador e voltar a módulo
    await pg.evaluate(() => { const m = ctl.modelos["controle.py"]; m.setValue(m.getValue().replace("import pll\n", "")); }); await pg.waitForTimeout(1500);
    await pg.click('#ctl-ctls [data-liga="pll.py"]'); await pg.waitForTimeout(1500);
    r = await cfg();
    ok(r.controle.controladores.map((q) => q.arquivo).join() === "controle.py,pll.py" && !r.modulos.includes("pll.py"), `virar controlador: ${r.controle.controladores.map((q) => q.nome).join(", ")}`);
    await pg.click('#ctl-ctls [data-desliga="pll.py"]'); await pg.waitForTimeout(1500);
    r = await cfg();
    ok(!r.controle.controladores.length && r.modulos.includes("pll.py"), "virar módulo: volta a ser módulo (a lista de controladores esvazia)");
    // 5. um controle de antes dos módulos: organizar como um DSP
    await pg.evaluate(async (pi) => { novoEstado(await api("editor/abrir", { arq: pi, modo: "descartar" })); await recarregaControle(); }, PI); await pg.waitForTimeout(800);
    const antes = await pg.evaluate(() => codigoAtual());
    ok(await pg.$('#ctl-ctls [data-dsp]') && (await arv()).length === 1, "o exemplo de antes dos módulos: só o controle.py, com o botão “organizar como um DSP”");
    await pg.click('#ctl-ctls [data-dsp]'); await pg.waitForTimeout(1800);
    r = await cfg();
    ok(JSON.stringify(Object.keys(r.controle.arquivos).sort()) === '["escrita.py","leitura.py"]' && r.controle.codigo === antes && !(await pg.$('#ctl-ctls [data-dsp]')),
      `organizar como um DSP: leitura.py e escrita.py criados, o controle.py igual (${(await pg.textContent("#ctl-estado")).slice(0, 60)}…)`);
    await pg.evaluate(async (pi) => { await api("editor/abrir", { arq: pi, modo: "descartar" }); }, PI);
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
