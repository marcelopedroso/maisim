// a página do modo script (#258) na instância de teste: as perguntas são as janelas do MaiSim, nunca as do navegador
// (Marcelo, 17/11: "horrível esse alert"). Confere:
//  - nenhum alert/confirm/prompt do navegador em toda a volta (o teste conta os "dialog" do Playwright);
//  - + Pasta: a janela com o campo; um nome inválido mostra o erro e a janela fica; Esc cancela; um nome válido cria e a
//    pasta aparece escolhida na árvore;
//  - Salvar sem nome: a janela pede o nome já com a pasta escolhida ("pasta/"); salvar cria o script dentro dela;
//  - Apagar: a janela de perigo (botão vermelho, foco no Cancelar); Cancelar não apaga; Apagar apaga;
//  - descartar mudanças ao abrir outro: a janela; Cancelar fica; apagar a pasta: a janela com quantos scripts.
const { chromium } = require("playwright");
let falhas = 0, nativasG = [];
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const B = "http://localhost:7200/maisim/simu/script";
const PASTA = "tela_janelas";
const pede = (pg, rota, corpo) => pg.evaluate(async ([r, c]) => (await fetch(`scripts${r}`, { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(c) })).json(), [rota, corpo]);
(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1300, height: 800 }, locale: "pt-BR" });
    await ctx.addInitScript(() => { try { localStorage.setItem("maisim-lingua", "pt"); } catch (e) { /* sem */ } });
    const pg = await ctx.newPage(); const erros = [], nativas = nativasG;
    pg.on("pageerror", (e) => erros.push(e.message));
    pg.on("dialog", (d) => { nativas.push(`${d.type()}: ${d.message()}`); d.dismiss().catch(() => {}); });
    await pg.goto(B); await pg.waitForSelector("#lista-exemplos li", { timeout: 30000 });
    await pede(pg, "/pasta/apagar", { nome: PASTA });
    await pg.reload(); await pg.waitForSelector("#lista-exemplos li");
    const modal = async () => { await pg.waitForSelector(".modal", { timeout: 2500 }).catch(() => {}); return pg.evaluate(() => { const m = document.querySelector(".modal"); return m ? { tit: m.querySelector("h3").textContent, campo: (m.querySelector(".m-campo") || {}).value,
      erro: (m.querySelector(".m-erro") || {}).textContent || "", perigo: m.querySelector(".m-ok").classList.contains("perigo"), foco: document.activeElement && document.activeElement.className } : null; }); };
    // + Pasta
    await pg.click("#bt-pasta"); let m = await modal();
    ok(m && m.tit === "Nova pasta" && m.foco.includes("m-campo"), `+ Pasta abre a janela do MaiSim com o campo em foco (${JSON.stringify(m)})`);
    await pg.fill(".modal .m-campo", "nome com espaço"); await pg.keyboard.press("Enter"); m = await modal();
    ok(m && /letras, números/.test(m.erro), `um nome inválido: o erro embaixo e a janela fica (${m && m.erro})`);
    await pg.keyboard.press("Escape");
    ok(!(await modal()), "Esc fecha a janela");
    await pg.click("#bt-pasta"); await pg.fill(".modal .m-campo", PASTA); await pg.keyboard.press("Enter");
    await pg.waitForSelector(`#lista-meus button.abre.sel[data-pasta="${PASTA}"]`, { timeout: 10000 }).catch(() => {});
    ok(!!(await pg.$(`#lista-meus button.abre.sel[data-pasta="${PASTA}"]`)), "um nome válido cria a pasta, escolhida na árvore");
    // Salvar sem nome: a janela pede, já com a pasta
    await pg.click("#bt-novo"); await pg.waitForTimeout(300);
    await pg.fill("#nome", ""); await pg.click("#bt-salvar"); m = await modal();
    ok(m && m.tit === "Salvar o script" && m.campo === `${PASTA}/`, `Salvar sem nome: a janela pede o nome, já com "${PASTA}/" (${JSON.stringify(m)})`);
    await pg.fill(".modal .m-campo", `${PASTA}/um`); await pg.click(".modal .m-ok");
    await pg.waitForSelector(`#lista-meus button[data-nome="${PASTA}/um"]`, { timeout: 10000 }).catch(() => {});
    ok(!!(await pg.$(`#lista-meus button[data-nome="${PASTA}/um"]`)) && (await pg.inputValue("#nome")) === `${PASTA}/um`, "salvou o script dentro da pasta");
    // descartar mudanças
    await pg.evaluate(() => { const ed = window.monaco && monaco.editor.getModels()[0]; if (ed) ed.setValue(ed.getValue() + "\n# mudou\n"); else { const t = document.querySelector("#editor textarea"); t.value += "\n# mudou"; t.dispatchEvent(new Event("input")); } });
    const sujoV = await pg.$eval("#estado", (e) => [e.textContent, e.classList.contains("nao-salvo"), getComputedStyle(e).color]);
    ok(sujoV[0] === "não salvo" && sujoV[1] && sujoV[2] !== "rgb(91, 100, 112)", `mudou: "não salvo" em vermelho (${JSON.stringify(sujoV)})`);
    await pg.click('#lista-exemplos button[data-pasta="pwm"]').catch(() => {});
    await pg.click('#lista-exemplos button[data-nome="pwm/sine_pwm"]'); m = await modal();
    ok(m && m.tit === "Mudanças não salvas" && m.perigo && m.foco.includes("m-cancela"), `abrir outro com mudanças: a janela de perigo, foco no Cancelar (${JSON.stringify(m)})`);
    await pg.click(".modal .m-cancela");
    ok((await pg.inputValue("#nome")) === `${PASTA}/um`, "Cancelar: fica no script");
    // Salvar de novo o mesmo script: grava sem perguntar; salvar com o nome de outro que existe: pergunta antes de substituir
    await pg.click("#bt-salvar"); await pg.waitForTimeout(500);
    const est = await pg.$eval("#estado", (e) => [e.textContent, e.classList.contains("nao-salvo")]);
    ok(!(await modal()) && est[0] === "salvo" && !est[1], `salvar o próprio script de novo: sem pergunta, "salvo" sem o vermelho (${JSON.stringify(est)})`);
    await pede(pg, "/salvar", { nome: `${PASTA}/outro`, codigo: "print(1)\n" });
    await pg.fill("#nome", `${PASTA}/outro`); await pg.click("#bt-salvar"); m = await modal();
    ok(m && m.tit === "Substituir o script?" && m.perigo, `o nome de outro script que existe: pergunta antes de substituir (${JSON.stringify(m)})`);
    await pg.click(".modal .m-cancela"); await pg.fill("#nome", `${PASTA}/um`); await pg.waitForTimeout(200);
    // Apagar
    const corAp = await pg.$eval("#bt-apagar", (b) => [b.disabled, getComputedStyle(b).color]);
    ok(!corAp[0] && /^rgb\((2[0-4]\d|25[0-5]|1[5-9]\d), (\d{1,2}|1[01]\d), (\d{1,2}|1[01]\d)\)$/.test(corAp[1]), `o botão Apagar em vermelho (${corAp[1]})`);
    await pg.click("#bt-apagar"); m = await modal();
    ok(m && m.tit === "Apagar o script?" && m.perigo && m.foco.includes("m-cancela"), `Apagar: a janela de perigo (${JSON.stringify(m)})`);
    await pg.click(".modal .m-cancela"); await pg.waitForTimeout(300);
    ok(!!(await pg.$(`#lista-meus button[data-nome="${PASTA}/um"]`)), "Cancelar não apaga");
    await pg.click("#bt-apagar"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(600);
    ok(!(await pg.$(`#lista-meus button[data-nome="${PASTA}/um"]`)), "Apagar apaga");
    // mover: arrastar o script aberto para a raiz ("Meus scripts") e, pelo teclado, Mover… de volta para a pasta
    await pede(pg, "/salvar", { nome: `${PASTA}/mv`, codigo: "print('mv')\n" }); await pg.goto(`${B}?nome=${PASTA}/mv`);
    await pg.waitForSelector(`#lista-meus button[data-nome="${PASTA}/mv"]`);
    await pg.evaluate(() => { const m = window.monaco && monaco.editor.getModels()[0]; if (m) m.setValue(m.getValue() + "# sem salvar\n"); });
    await pg.dragAndDrop(`#lista-meus button[data-nome="${PASTA}/mv"]`, "#raiz-meus");
    await pg.waitForSelector('#lista-meus button[data-nome="mv"]', { timeout: 10000 }).catch(() => {});
    const depois = await pg.evaluate(() => ({ nome: document.getElementById("nome").value, url: location.search, sujo: document.getElementById("estado").classList.contains("nao-salvo"),
      cod: window.monaco ? monaco.editor.getModels()[0].getValue().includes("# sem salvar") : null }));
    ok(depois.nome === "mv" && /nome=mv$/.test(depois.url) && depois.sujo && depois.cod, `arrastar para a raiz: o aberto acompanha, o não salvo fica no editor (${JSON.stringify(depois)})`);
    await pg.click("#bt-mover"); m = await modal();
    const ops = await pg.$$eval(".modal select option", (os) => os.map((o) => o.value));
    ok(m && m.tit === "Mover mv" && ops.includes(PASTA) && !ops.includes(""), `Mover…: a janela com a lista das pastas, sem a de agora (${JSON.stringify(ops)})`);
    await pg.selectOption(".modal select", PASTA); await pg.keyboard.press("Enter");
    await pg.waitForSelector(`#lista-meus button[data-nome="${PASTA}/mv"]`, { timeout: 10000 }).catch(() => {});
    ok((await pg.inputValue("#nome")) === `${PASTA}/mv`, "pelo teclado (Mover… e Enter): de volta para a pasta");
    await pg.click("#bt-salvar"); await pg.waitForTimeout(400); await pede(pg, "/apagar", { nome: `${PASTA}/mv` });
    // o endereço de um script que não existe mais (apagado noutra aba): o erro na saída e a árvore desenhada
    await pg.reload(); await pg.waitForSelector("#lista-exemplos li", { timeout: 10000 }).catch(() => {});
    const sumiu = await pg.evaluate(() => ({ ex: document.querySelectorAll("#lista-exemplos li").length, err: !!document.querySelector("#saida .err"), url: location.search }));
    ok(sumiu.ex > 0 && sumiu.err && sumiu.url === "", `abrir um script que não existe mais: o erro na saída, a árvore desenhada, o endereço limpo (${JSON.stringify(sumiu)})`);
    // apagar a pasta (com dois scripts dentro: o "outro" do passo de substituir e o "dois")
    await pede(pg, "/salvar", { nome: `${PASTA}/dois`, codigo: "print(2)\n" }); await pg.reload(); await pg.waitForSelector("#lista-exemplos li");
    await pg.hover(`#lista-meus li.pasta[data-id="meus:${PASTA}"] > .linha`); await pg.click(`#lista-meus button[data-tira="${PASTA}"]`); m = await modal();
    ok(m && m.tit === "Apagar a pasta?" && m.perigo && /com os 2 scripts/.test(await pg.textContent(".modal p")), `apagar a pasta: a janela diz quantos scripts (${await pg.textContent(".modal p").catch(() => "")})`);
    await pg.click(".modal .m-ok"); await pg.waitForTimeout(600);
    ok(!(await pg.$(`#lista-meus li.pasta[data-id="meus:${PASTA}"]`)), "a pasta saiu da árvore");
    // o tema: trocar pelo trilho troca também o editor (o Monaco)
    const fundoEd = () => pg.evaluate(() => { const e = document.querySelector("#editor .monaco-editor-background, #editor .monaco-editor"); return e ? getComputedStyle(e).backgroundColor : ""; });
    const claro = await fundoEd();
    await pg.evaluate(() => { localStorage.setItem("maisim-tema", "escuro"); window.dispatchEvent(new StorageEvent("storage", { key: "maisim-tema" })); });
    await pg.waitForTimeout(400);
    const escuro = await fundoEd();
    const lum = (c) => { const m = c.match(/\d+/g) || [255, 255, 255]; return (+m[0] + +m[1] + +m[2]) / 3; };
    ok(lum(claro) > 200 && lum(escuro) < 80, `trocar o tema pelo trilho troca o editor (${claro} → ${escuro})`);
    await pg.evaluate(() => { localStorage.setItem("maisim-tema", "claro"); window.dispatchEvent(new StorageEvent("storage", { key: "maisim-tema" })); });
    await pg.waitForTimeout(300);
    // a Saída: arrastar a borda de cima muda a altura (e fica ao recarregar); "−" minimiza; rodar mostra de novo
    const hSaida = () => pg.$eval("#saida-box", (x) => Math.round(x.getBoundingClientRect().height));
    const h0 = await hSaida(), bb = await (await pg.$("#saida-borda")).boundingBox();
    await pg.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await pg.mouse.down();
    await pg.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 - 120, { steps: 6 }); await pg.mouse.up();
    const h1 = await hSaida();
    await pg.reload(); await pg.waitForSelector("#lista-exemplos li");
    const h2 = await hSaida();
    ok(Math.abs(h1 - h0 - 120) <= 6 && Math.abs(h2 - h1) <= 6, `arrastar a borda da Saída: ${h0} → ${h1} px, e fica ao recarregar (${h2} px)`);
    await pg.click("#bt-saida");
    const rec = await pg.evaluate(() => ({ h: Math.round(document.getElementById("saida-box").getBoundingClientRect().height), vis: getComputedStyle(document.getElementById("saida")).display, bt: document.getElementById("bt-saida").textContent }));
    ok(rec.h < 50 && rec.vis === "none" && rec.bt === "+", `"−" minimiza a Saída (${JSON.stringify(rec)})`);
    await pg.click('#lista-exemplos button[data-pasta="circuits"]').catch(() => {});
    await pg.click('#lista-exemplos button[data-nome="circuits/rlc_step"]'); await pg.waitForTimeout(500);
    await pg.click("#bt-rodar"); await pg.waitForFunction(() => /terminou/.test(document.getElementById("resultado").textContent), null, { timeout: 30000 }).catch(() => {});
    ok(!(await pg.$eval("#saida-box", (x) => x.classList.contains("recolhida"))), "rodar com a Saída minimizada: ela aparece sozinha");
    await pg.dblclick("#saida-borda");
    ok(Math.abs((await hSaida()) - h0) <= 6, "duplo clique na borda: volta ao tamanho de antes");
    ok(nativas.length === 0, `nenhuma janela do navegador (${nativas.join(" | ") || "nenhuma"})`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + (e.stack || e).toString().split("\n").slice(0, 3).join(" ") + (nativasG.length ? ` (janelas do navegador: ${nativasG.join(" | ")})` : "")); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
