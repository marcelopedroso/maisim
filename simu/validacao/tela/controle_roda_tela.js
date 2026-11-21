// o dropdown "Controle na simulação" (instância de teste 7200 → 7201), pedido de Marcelo em 21/11 ("como fica definido
// qual controle estou usando? faz um dropdown no lugar do check"): Desligado | Python — controle.py | C — controle.c diz o que
// a simulação roda (guarda ativo e c.usar); ver um arquivo (a linha "ver em C" / "ver em Python" na árvore, ou abrir um
// .c) muda só o que o painel mostra; o selo "roda" marca o controlador que roda; Desligado guarda a linguagem que estava
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    // o circuito novo, com o controle desligado e sem controle.c
    await pg.evaluate(async () => {
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      const cfg = (await api("editor/controle")).controle;
      await api("editor/controle", { controle: { ...cfg, ativo: false, c: { ...cfg.c, usar: false, arquivos: {} } } });
      await recarregaControle(); mostraDoca("controle");
    });
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    await pg.click('#ctl-vistas [data-vista="arq"]'); await pg.waitForTimeout(600);
    const srv = () => pg.evaluate(async () => { const c = (await api("editor/controle")).controle; return { ativo: !!c.ativo, usar: !!(c.c && c.c.usar), temC: !!(c.c && c.c.arquivos && c.c.arquivos["controle.c"]) }; });
    const tela = () => pg.evaluate(() => ({ roda: $("ctl-roda").value, off: $("ctl-roda").classList.contains("off"), visaoC: visaoC(), arq: ctl.arq,
      selos: [...document.querySelectorAll("#ctl-ctls .ctl-roda-selo")].map((x) => x.closest(".ctl-no, .ctl-outra").querySelector(".nome").textContent),
      outra: (document.querySelector("#ctl-ctls .ctl-outra") || {}).textContent || "",
      rotulo: document.querySelector(".ctl-ativo span").textContent, ops: [...$("ctl-roda").options].map((o) => `${o.value}=${o.textContent}`) }));
    const escolhe = async (v) => { await pg.selectOption("#ctl-roda", v); await pg.waitForTimeout(1500); };
    // 1. desligado: o dropdown diz Desligado, sem selo; as opções e o rótulo
    let t = await tela(), s = await srv();
    ok(t.rotulo === "Controle na simulação" && t.ops.join("|") === "off=Desligado|py=Python — controle.py|c=C — controle.c",
      `o rótulo e as opções: "${t.rotulo}" · ${t.ops.join(" | ")}`);
    ok(t.roda === "off" && t.off && !s.ativo && !t.selos.length && !t.visaoC && /controle\.c/.test(t.outra) && /ver em C/.test(t.outra),
      `desligado: ${t.roda}, sem selo, visão Python, a linha "${t.outra}" no fim da árvore`);
    // 2. Python: guarda ativo, c.usar falso; o selo no controle.py
    await escolhe("py"); t = await tela(); s = await srv();
    ok(s.ativo && !s.usar && t.roda === "py" && !t.off && t.selos.join(",") === "controle.py", `Python: ativo ${s.ativo}, usar ${s.usar}, selo em ${t.selos.join(",")}`);
    // 3. C: cria o controle.c do modelo, guarda c.usar, a visão vai para o C; o selo no controle.c
    await escolhe("c"); t = await tela(); s = await srv();
    ok(s.ativo && s.usar && s.temC && t.visaoC && t.arq === "controle.c" && t.selos.join(",") === "controle.c",
      `C: ativo ${s.ativo}, usar ${s.usar}, controle.c guardado ${s.temC}, visão C, aberto ${t.arq}, selo em ${t.selos.join(",")}`);
    // 4. ver em Python (a linha da árvore): a visão muda, o que roda não; o controle.c continua com o selo, na linha do fim
    await pg.click("#ctl-ctls .ctl-outra"); await pg.waitForTimeout(1200); t = await tela(); s = await srv();
    ok(!t.visaoC && t.arq === "controle.py" && t.roda === "c" && s.usar && s.ativo && t.selos.join(",") === "controle.c" && /ver em C/.test(t.outra),
      `ver em Python: visão Python, aberto ${t.arq}; continua rodando o C (${t.roda}, usar ${s.usar}); selo em ${t.selos.join(",")} na linha "${t.outra}"`);
    // 5. abrir o controle.c pela aba/árvore (mostraArquivo): a visão segue o arquivo, o que roda não muda
    await pg.click("#ctl-ctls .ctl-outra"); await pg.waitForTimeout(800);
    await pg.evaluate(() => mostraArquivo("controle.py")); await pg.waitForTimeout(500); t = await tela();
    ok(!t.visaoC && t.roda === "c", `abrir o controle.py: visão Python (${!t.visaoC}), roda ${t.roda}`);
    // 6. Desligado guarda a linguagem que estava (c.usar) e tira o selo; ligar de novo em C volta ao C
    await escolhe("off"); t = await tela(); s = await srv();
    ok(!s.ativo && s.usar && t.roda === "off" && t.off && !t.selos.length, `Desligado: ativo ${s.ativo}, usar ${s.usar} (a linguagem fica), sem selo`);
    // 7. recarregar: o dropdown e a visão vêm do guardado
    await escolhe("c"); await pg.reload();
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(() => mostraDoca("controle")); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(800);
    t = await tela();
    ok(t.roda === "c" && t.visaoC, `recarregado: roda ${t.roda}, visão C ${t.visaoC}`);
    // 8. em inglês
    await pg.evaluate(() => maisimI18n.muda("en")); await pg.waitForTimeout(800); t = await tela();
    ok(t.rotulo === "Control in the simulation" && t.ops.join("|") === "off=Off|py=Python — controle.py|c=C — controle.c" && /view in Python/.test(t.outra)
      && (await pg.evaluate(() => (document.querySelector("#ctl-ctls .ctl-roda-selo") || {}).textContent)) === "runs",
      `inglês: "${t.rotulo}" · ${t.ops.join(" | ")} · "${t.outra}"`);
    await pg.evaluate(() => maisimI18n.muda("pt")); await pg.waitForTimeout(300);
    await escolhe("off");
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message); }
  if (b) await b.close();
  console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
  process.exit(falhas ? 1 : 0);
})();
