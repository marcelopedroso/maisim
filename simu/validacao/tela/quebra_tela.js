// quebra de linha no editor do controle (página de teste 5010 → 8768): o botão ao lado do "?" e Alt+Z ligam e desligam a
// quebra; a escolha fica no navegador; o código não muda; a trava da simulação não desliga o botão
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const URL = "http://localhost:5010/pew/simu/?modelo=" + encodeURIComponent(require("os").homedir() + "/.cache/pew_simu_teste/pew/exemplo_controle_pwm.ipes");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: "light" }); const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const abre = async () => {
    await pg.goto(URL);
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(400);
  };
  const estado = () => pg.evaluate(() => { const bt = $("ctl-quebra"), ed = ctl.editor, L = ed.getLayoutInfo();
    return { ativo: bt.classList.contains("ativo"), aria: bt.getAttribute("aria-pressed"), wrap: ed.getRawOptions().wordWrap,
      larg: ed.getScrollWidth(), vis: L.contentWidth, guardado: (() => { try { return localStorage.getItem("pew-simu-quebra"); } catch (e) { return "?"; } })(),
      vizinho: bt.nextElementSibling && bt.nextElementSibling.id, codigo: ed.getValue() }; });
  await pg.goto(URL); await pg.evaluate(() => { try { localStorage.removeItem("pew-simu-quebra"); } catch (e) {} });
  await abre();
  // o Monaco mede a largura das linhas depois de desenhá-las: espera a medida (até 5 s) antes de comparar
  await pg.waitForFunction(() => ctl.editor.getScrollWidth() > ctl.editor.getLayoutInfo().contentWidth, null, { timeout: 5000 }).catch(() => {});
  const e0 = await estado();
  ok(e0.vizinho === "ctl-guia" && !e0.ativo && e0.aria === "false" && e0.wrap === "off" && e0.larg > e0.vis,
    `começa sem quebra (botão ${e0.ativo ? "ligado" : "desligado"}, wordWrap ${e0.wrap}): botão ao lado do "?" (${e0.vizinho}), largura do texto ${e0.larg} px > visível ${e0.vis} px (rola para o lado)`);
  await pg.click("#ctl-quebra"); await pg.waitForTimeout(400);
  const e1 = await estado();
  ok(e1.ativo && e1.aria === "true" && e1.wrap === "on" && e1.larg <= e1.vis + 1 && e1.guardado === "1",
    `clique: quebra ligada · largura ${e1.larg} px ≤ ${e1.vis} px (sem rolar para o lado), guardado "${e1.guardado}"`);
  ok(e1.codigo === e0.codigo, "o código continua igual (a quebra é só na tela)");
  await pg.screenshot({ path: "quebra_ligada.png" });
  await abre();
  const e2 = await estado();
  ok(e2.ativo && e2.wrap === "on", "ao recarregar a página, continua ligada");
  const cdp = await ctx.newCDPSession(pg);
  const altZ = async () => {                                   // Alt+Z com texto, como o Option+Z do macOS gera ("Ω")
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", modifiers: 1, key: "Ω", code: "KeyZ", windowsVirtualKeyCode: 90, text: "Ω", unmodifiedText: "z" });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 1, key: "Ω", code: "KeyZ", windowsVirtualKeyCode: 90 });
    await pg.waitForTimeout(300);
  };
  await pg.click("#ctl-editor .view-lines"); await altZ();
  const e3 = await estado();
  ok(!e3.ativo && e3.wrap === "off" && e3.guardado === "0" && !e3.codigo.includes("Ω") && e3.codigo === e0.codigo,
    `Alt+Z no editor desliga, e a tecla não vai para o código (enviada com o texto "Ω", como no Mac)`);
  // controle da própria checagem: a mesma tecla sem o Alt escreve no código (senão o "não escreve" acima não provaria nada)
  await cdp.send("Input.insertText", { text: "Ω" }); await pg.waitForTimeout(200);
  const escrito = (await estado()).codigo.includes("Ω");
  await pg.evaluate(() => { const ed = ctl.editor; ed.trigger("t", "undo", null); }); await pg.waitForTimeout(200);
  ok(escrito && (await estado()).codigo === e0.codigo, "controle da checagem: um Ω digitado de fato aparece no código (e é desfeito)");
  await pg.click("#ctl-editor .view-lines"); await altZ();
  ok((await estado()).wrap === "on", "Alt+Z de novo liga");
  await pg.evaluate(() => travaControle(true));
  const trav = await pg.evaluate(() => ({ quebra: $("ctl-quebra").disabled, testar: $("ctl-testar").disabled }));
  ok(!trav.quebra && trav.testar, "com a simulação rodando (trava), o botão da quebra continua valendo (só muda a vista)");
  await pg.click("#ctl-quebra"); await pg.waitForTimeout(200);
  ok((await estado()).wrap === "off", "e funciona com a trava");
  await pg.evaluate(() => travaControle(false));
  await pg.mouse.move(0, 0); await pg.hover("#ctl-quebra"); await pg.waitForTimeout(700);
  const dica = await pg.evaluate(() => { const d = $("dica-ui"); return d.classList.contains("vis") ? d.innerHTML : ""; });
  ok(/quebra de linha/.test(dica) && /<kbd>Alt\+Z<\/kbd>/.test(dica), `dica no padrão do PEW, com a tecla: ${dica.replace(/<[^>]+>/g, "|")}`);
  const p2 = await ctx.newPage(); await p2.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */ p2.on("pageerror", (e) => erros.push(e.message));
  await p2.route(/monaco-editor/, (r) => r.abort());
  await p2.goto(URL); await p2.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await p2.evaluate(() => { try { localStorage.setItem("pew-simu-quebra", "1"); } catch (e) {} });
  await p2.reload(); await p2.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await p2.click("#bt-ctl"); await p2.waitForFunction(() => ctl.carregado && ctl.texto, null, { timeout: 40000 });
  const ws = () => p2.evaluate(() => ({ ws: getComputedStyle(ctl.texto).whiteSpace, ativo: $("ctl-quebra").classList.contains("ativo"), cod: ctl.texto.value }));
  const t0 = await ws();
  await p2.click("#ctl-quebra"); const t1 = await ws();
  await p2.focus("#ctl-texto"); await p2.keyboard.press("Alt+z"); await p2.waitForTimeout(200); const t2 = await ws();
  ok(t0.ws === "pre-wrap" && t0.ativo && t1.ws === "pre" && !t1.ativo && t2.ws === "pre-wrap" && t2.ativo && t2.cod === t0.cod,
    `sem o Monaco (caixa de texto simples): abre com a quebra guardada (${t0.ws}), o botão desliga (${t1.ws}), Alt+Z liga (${t2.ws})`);
  await p2.close();
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await pg.evaluate(() => { try { localStorage.removeItem("pew-simu-quebra"); } catch (e) {} });
  await b.close(); process.exit(falhas ? 1 : 0);
})();
