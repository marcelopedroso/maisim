// copiar o erro e pedir ao Claude (página de teste 7200 → 7201), Marcelo em 20/10 ("quando der um erro podia ter copiar
// erro… até copiava com prompt pra colar no Claude"): na saída do controle, "copiar" leva o erro e o trecho do arquivo em
// volta da linha (▶ na do erro); "pedir ao Claude" abre a conversa com o pedido escrito e não envia; numa saída que não é
// erro, o "pedir ao Claude" some e o "copiar" leva o texto. Sem fotos.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const MOD = 'def conta(x):\n    a = 1\n    b = 2\n    c = a + b\n    return x["nao_tem"] + c\n';
const CTL = 'import modulo_erro\n\n\ndef iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {"u": modulo_erro.conta({})}\n';
const BOM = 'def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {"u": 1.0}\n';
(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:7200" });
    const pg = await ctx.newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    const prepara = async (cod, mod) => { await pg.evaluate(async ([cod, mod]) => {
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      await api("editor/cmd", { op: "CREATE", args: ["C1", 8, 5, "CONST"] }); await api("editor/cmd", { op: "OUTNODE", args: ["C1", 0, "u"] });
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: ["u"], parametros: [], acionamentos: [], codigo: cod,
        arquivos: mod ? { "modulo_erro.py": mod } : {}, controladores: [] } });
      novoEstado(await api("editor/estado")); await recarregaControle(); mostraDoca("controle"); }, [cod, mod]);
    // o editor com o código novo antes do ▷ testar (senão ele guarda o de antes por cima: a falha de 21/10)
    await pg.waitForFunction(([cod]) => ctl.carregado && editorPronto() && textoDe("controle.py") === cod, [cod], { timeout: 30000 }).catch(() => {});
    };
    await prepara(CTL, MOD);
    await pg.waitForFunction(() => ctl.carregado, null, { timeout: 30000 }); await pg.waitForTimeout(500);
    const pedidosAntes = await pg.evaluate(async () => ((await api("claude/pedido")).conversa || { historico: [] }).historico.length);
    await pg.click("#ctl-testar");
    await pg.waitForFunction(() => /teste:/.test($("ctl-saida").textContent) && $("ctl-saida").className === "erro", null, { timeout: 30000 });
    const vis = await pg.evaluate(() => ({ copia: $("ctl-saida-copia").offsetParent !== null, claude: $("ctl-saida-claude").offsetParent !== null, txt: $("ctl-saida").textContent }));
    ok(vis.copia && vis.claude && /modulo_erro\.py linha 5/.test(vis.txt), `erro no ▷ testar: "copiar" e "pedir à IA" à vista (${vis.txt.split("\n")[0].slice(0, 90)})`);
    await pg.click("#ctl-saida-copia"); await pg.waitForTimeout(300);
    const copiado = await pg.evaluate(() => navigator.clipboard.readText());
    ok(/KeyError|nao_tem/.test(copiado) && /Trecho de modulo_erro\.py \(linhas 1–6; ▶ a do erro\)/.test(copiado) && /▶ 5 \|     return x\["nao_tem"\] \+ c/.test(copiado)
       && /  4 \|     c = a \+ b/.test(copiado), `copiar: o erro e o trecho com ▶ na linha 5:\n${copiado.split("\n").slice(-6).join("\n")}`);
    ok(await pg.evaluate(() => $("ctl-saida-copia").textContent === "copiado ✓"), "o botão diz \"copiado ✓\"");
    await pg.click("#ctl-saida-claude"); await pg.waitForTimeout(500);
    const chat = await pg.evaluate(async () => ({ aberto: cc.aberto, texto: $("cc-texto").value, foco: document.activeElement === $("cc-texto"),
      pedidos: ((await api("claude/pedido")).conversa || { historico: [] }).historico.length, anda: (await api("claude/pedido")).andamento }));
    ok(chat.aberto && /^Deu este erro no controle\. Explique a causa em uma frase e corrija:/.test(chat.texto) && /▶ 5 \|/.test(chat.texto) && chat.foco
       && chat.pedidos === pedidosAntes && !chat.anda, `pedir à IA: a conversa abre com o pedido escrito (${chat.texto.length} caracteres), o cursor na caixa, nada enviado (${chat.pedidos} = ${pedidosAntes} pedidos)`);
    // uma saída que não é erro: só o copiar, com o texto
    await prepara(BOM, null);
    await pg.waitForTimeout(400);
    await pg.click("#ctl-testar");
    await pg.waitForFunction(() => /teste ok/.test($("ctl-saida").textContent), null, { timeout: 30000 });
    await pg.click("#ctl-saida-copia"); await pg.waitForTimeout(300);
    const c2 = await pg.evaluate(async () => ({ claude: $("ctl-saida-claude").offsetParent !== null, txt: await navigator.clipboard.readText() }));
    ok(!c2.claude && /^teste ok/.test(c2.txt) && !/Trecho/.test(c2.txt), `saída sem erro: só o copiar, com o texto ("${c2.txt.slice(0, 60)}…")`);
    await pg.evaluate(async () => { $("cc-texto").value = ""; await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
