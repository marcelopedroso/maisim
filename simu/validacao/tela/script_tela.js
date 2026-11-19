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
// abrir um exemplo pela árvore: a seção Exemplos (a barra do pé) e a pasta dele abertas, e o clique no arquivo
async function abreExemplo(pg, nome, dois = false) {
  if (!(await pg.$("#secao-exemplos.aberta"))) await pg.click("#cab-exemplos");
  const pasta = nome.split("/")[0];
  if (!(await pg.$(`#lista-exemplos li.pasta.aberta[data-id="exemplos:${pasta}"]`))) await pg.click(`#lista-exemplos button[data-pasta="${pasta}"]`);
  const sel = `#lista-exemplos button[data-nome="${nome}"]`;
  if (dois) await pg.dblclick(sel); else await pg.click(sel);
  await pg.waitForTimeout(500);
}
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
    await pg.goto(B); await pg.waitForSelector("#lista-exemplos li", { state: "attached", timeout: 30000 });
    await pede(pg, "/pasta/apagar", { nome: PASTA });
    await pg.reload(); await pg.waitForSelector("#lista-exemplos li", { state: "attached", timeout: 30000 });
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
    // + Script (como o novo arquivo do VS Code): pergunta o nome já com a pasta escolhida, cria e abre a aba com o nome
    await pg.click("#bt-novo2"); m = await modal();
    const txtNovo = await pg.textContent(".modal p");
    ok(m && m.tit === "Novo script" && m.campo === "" && txtNovo.includes(`Em ${PASTA}.`), `+ Script: a janela pede só o nome; a pasta escolhida no texto (${JSON.stringify(m)} · ${txtNovo})`);
    await pg.fill(".modal .m-campo", "um"); await pg.click(".modal .m-ok");
    await pg.waitForSelector(`#lista-meus button[data-nome="${PASTA}/um"]`, { timeout: 10000 }).catch(() => {});
    const aba1 = await pg.$$eval("#ctl-abas .aba.ativa .nome-aba", (x) => x.map((y) => y.textContent));
    ok(JSON.stringify(aba1) === '["um.py"]' && (await pg.textContent("#ctl-estado")) === "salvo", `a aba já com o nome e salva (${JSON.stringify(aba1)})`);
    await pg.click("#bt-novo"); await modal(); await pg.fill(".modal .m-campo", "um"); await pg.click(".modal .m-ok"); m = await modal();
    ok(m && /já existe/.test(await pg.textContent(".modal p")), "um nome que já existe: avisa e não substitui");
    await pg.click(".modal .m-ok");
    ok(!!(await pg.$(`#lista-meus button[data-nome="${PASTA}/um"]`)) && (await pg.textContent("#nome-atual")) === `${PASTA}/um`, "salvou o script dentro da pasta");
    // descartar mudanças
    await pg.evaluate(() => { const ed = window.monaco && monaco.editor.getEditors()[0].getModel(); if (ed) ed.setValue(ed.getValue() + "\n# mudou\n"); else { const t = document.querySelector("#editor textarea"); t.value += "\n# mudou"; t.dispatchEvent(new Event("input")); } });
    const sujoV = await pg.$eval("#ctl-estado", (e) => [e.textContent, e.classList.contains("nao-salvo"), getComputedStyle(e).color]);
    ok(sujoV[0] === "não salvo" && sujoV[1] && sujoV[2] !== "rgb(91, 100, 112)", `mudou: "não salvo" em vermelho (${JSON.stringify(sujoV)})`);
    // as abas: abrir outro não pergunta (o que não foi salvo fica na aba dele); fechar a aba com mudanças pergunta
    await abreExemplo(pg, "pwm/sine_pwm");
    const abas = await pg.$$eval("#ctl-abas .aba", (bs) => bs.map((b) => [b.textContent, b.classList.contains("ativa")]));
    ok(!(await pg.$(".modal")) && abas.length >= 2 && abas.some(([t, a]) => /sine_pwm/.test(t) && a) && abas.some(([t]) => /um\.py•/.test(t)),
       `abrir outro: uma aba nova, sem perguntar; a de antes fica com o • de não salvo (${JSON.stringify(abas)})`);
    await pg.click('#ctl-abas .aba:has-text("um.py")');
    ok((await pg.evaluate(() => monaco.editor.getModels().some((x) => x.getValue().includes("# mudou")) && document.querySelector(".monaco-editor") && window.st && 1)) !== false
       && (await pg.textContent("#nome-atual")) === `${PASTA}/um`, "voltar à aba: o que não foi salvo continua lá");
    await pg.click('#ctl-abas .aba:has-text("um.py") .fecha'); m = await modal();
    ok(m && m.tit === "Mudanças não salvas" && m.perigo && m.foco.includes("m-cancela"), `fechar a aba com mudanças: a janela de perigo, foco no Cancelar (${JSON.stringify(m)})`);
    await pg.click(".modal .m-cancela");
    ok((await pg.textContent("#nome-atual")) === `${PASTA}/um`, "Cancelar: a aba fica");
    // Salvar de novo o mesmo script: grava sem perguntar; salvar com o nome de outro que existe: pergunta antes de substituir
    await pg.click("#bt-salvar"); await pg.waitForTimeout(500);
    const est = await pg.$eval("#ctl-estado", (e) => [e.textContent, e.classList.contains("nao-salvo")]);
    ok(!(await modal()) && est[0] === "salvo" && !est[1], `salvar o próprio script de novo: sem pergunta, "salvo" sem o vermelho (${JSON.stringify(est)})`);
    await pede(pg, "/salvar", { nome: `${PASTA}/outro`, codigo: "print(1)\n" });
    await pg.click("#bt-salvar-como"); await pg.fill(".modal .m-campo", `${PASTA}/outro`); await pg.click(".modal .m-ok"); m = await modal();
    ok(m && m.tit === "Substituir o script?" && m.perigo, `salvar como, com o nome de outro script que existe: pergunta antes de substituir (${JSON.stringify(m)})`);
    await pg.click(".modal .m-cancela"); await pg.waitForTimeout(200);
    ok((await pg.textContent("#nome-atual")) === `${PASTA}/um`, "Cancelar: o script continua com o nome dele");
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
    await pg.evaluate(() => { const m = window.monaco && monaco.editor.getEditors()[0].getModel(); if (m) m.setValue(m.getValue() + "# sem salvar\n"); });
    await pg.dragAndDrop(`#lista-meus button[data-nome="${PASTA}/mv"]`, "#raiz-meus");
    await pg.waitForSelector('#lista-meus button[data-nome="mv"]', { timeout: 10000 }).catch(() => {});
    const depois = await pg.evaluate(() => ({ nome: document.getElementById("nome-atual").textContent, url: location.search, sujo: document.getElementById("ctl-estado").classList.contains("nao-salvo"),
      cod: window.monaco ? monaco.editor.getModels().some((x) => x.getValue().includes("# sem salvar")) : null }));
    ok(depois.nome === "mv" && /nome=mv$/.test(depois.url) && depois.sujo && depois.cod, `arrastar para a raiz: o aberto acompanha, o não salvo fica no editor (${JSON.stringify(depois)})`);
    await pg.click("#bt-mover"); m = await modal();
    const ops = await pg.$$eval(".modal select option", (os) => os.map((o) => o.value));
    ok(m && m.tit === "Mover mv" && ops.includes(PASTA) && !ops.includes(""), `Mover…: a janela com a lista das pastas, sem a de agora (${JSON.stringify(ops)})`);
    await pg.selectOption(".modal select", PASTA); await pg.keyboard.press("Enter");
    await pg.waitForSelector(`#lista-meus button[data-nome="${PASTA}/mv"]`, { timeout: 10000 }).catch(() => {});
    ok((await pg.textContent("#nome-atual")) === `${PASTA}/mv`, "pelo teclado (Mover… e Enter): de volta para a pasta");
    await pg.click("#bt-salvar"); await pg.waitForTimeout(400); await pede(pg, "/apagar", { nome: `${PASTA}/mv` });
    // o endereço de um script que não existe mais (apagado noutra aba): o erro na saída e a árvore desenhada
    await pg.reload(); await pg.waitForSelector("#lista-exemplos li", { state: "attached", timeout: 10000 }).catch(() => {});
    const sumiu = await pg.evaluate(() => ({ ex: document.querySelectorAll("#lista-exemplos li").length, err: !!document.querySelector("#saida .err"), url: location.search }));
    ok(sumiu.ex > 0 && sumiu.err && !sumiu.url.includes("mv"), `abrir um script que não existe mais: o erro na saída, a árvore desenhada, outra aba no lugar (${JSON.stringify(sumiu)})`);
    // apagar a pasta (com dois scripts dentro: o "outro" do passo de substituir e o "dois")
    await pede(pg, "/salvar", { nome: `${PASTA}/dois`, codigo: "print(2)\n" }); await pg.reload(); await pg.waitForSelector("#lista-exemplos li", { state: "attached", timeout: 30000 });
    await pg.hover(`#lista-meus li.pasta[data-id="meus:${PASTA}"] > .linha`); await pg.click(`#lista-meus button[data-tira="${PASTA}"]`); m = await modal();
    ok(m && m.tit === "Apagar a pasta?" && m.perigo && /com os 2 scripts/.test(await pg.textContent(".modal p")), `apagar a pasta: a janela diz quantos scripts (${await pg.textContent(".modal p").catch(() => "")})`);
    await pg.click(".modal .m-ok"); await pg.waitForTimeout(600);
    ok(!(await pg.$(`#lista-meus li.pasta[data-id="meus:${PASTA}"]`)), "a pasta saiu da árvore");
    // renomear o script aberto (o lápis da barra): no mesmo lugar, e a aba acompanha
    await pede(pg, "/salvar", { nome: `${PASTA}/ren_a`, codigo: "print(1)\n", sobrescrever: true });
    await pg.goto(`${B}?nome=${PASTA}/ren_a`); await pg.waitForSelector("#ctl-abas .aba"); await pg.waitForTimeout(500);
    await pg.click("#bt-renomear"); m = await modal();
    ok(m && m.tit === "Renomear o script" && m.campo === "ren_a", `renomear: a janela com o nome de agora (${JSON.stringify(m)})`);
    await pg.fill(".modal .m-campo", "ren_b"); await pg.keyboard.press("Enter");
    await pg.waitForSelector(`#lista-meus button[data-nome="${PASTA}/ren_b"]`, { timeout: 10000 }).catch(() => {});
    const ren = await pg.evaluate(() => ({ nome: document.getElementById("nome-atual").textContent, aba: [...document.querySelectorAll("#ctl-abas .aba.ativa .nome-aba")].map((x) => x.textContent).join(),
      tip: (document.querySelector('#lista-meus button[data-nome$="/ren_b"]') || {}).title }));
    ok(ren.nome === `${PASTA}/ren_b` && ren.aba === "ren_b.py" && ren.tip === `${PASTA}/ren_b.py`, `renomeado: o nome, a aba e o tooltip com .py (${JSON.stringify(ren)})`);
    // pela árvore: o ✎ e o × de um arquivo (aparecem ao passar o mouse)
    const linha = `#lista-meus li.arq:has(button[data-nome="${PASTA}/ren_b"]) > .linha`;
    await pg.hover(linha); await pg.click(`#lista-meus button[data-renomear="${PASTA}/ren_b"]`); m = await modal();
    ok(m && m.tit === "Renomear o script" && m.campo === "ren_b", `✎ de um arquivo na árvore: a janela de renomear (${JSON.stringify(m)})`);
    await pg.fill(".modal .m-campo", "ren_c"); await pg.keyboard.press("Enter");
    await pg.waitForSelector(`#lista-meus button[data-nome="${PASTA}/ren_c"]`, { timeout: 10000 }).catch(() => {});
    ok(!!(await pg.$(`#lista-meus button[data-nome="${PASTA}/ren_c"]`)) && (await pg.textContent("#nome-atual")) === `${PASTA}/ren_c`, "renomeado pela árvore (e a aba aberta acompanha)");
    await pg.hover(`#lista-meus li.arq:has(button[data-nome="${PASTA}/ren_c"]) > .linha`); await pg.click(`#lista-meus button[data-apaga-script="${PASTA}/ren_c"]`); m = await modal();
    ok(m && m.tit === "Apagar o script?" && m.perigo, "× de um arquivo na árvore: a janela de perigo");
    await pg.click(".modal .m-ok"); await pg.waitForTimeout(700);
    ok(!(await pg.$(`#lista-meus button[data-nome="${PASTA}/ren_c"]`)) && !(await pg.$$eval("#ctl-abas .aba .nome-aba", (x) => x.some((y) => y.textContent === "ren_c.py"))),
       "apagado pela árvore: sai da lista e a aba dele fecha");
    // a coluna do Scope sem ter rodado nesta tela: a última rodada do script aberto; sem nenhuma, o Scope com a lista
    await pede(pg, "/salvar", { nome: `${PASTA}/ja_rodou`, codigo: "import maisim\nmaisim.scope('jr', [0, 1], {'a': [1, 2]})\n", sobrescrever: true });
    const rj = await pede(pg, "/rodar", { nome: `${PASTA}/ja_rodou` });
    await pg.evaluate(() => localStorage.setItem("maisim-script-col-scope", "0"));
    await pg.goto(`${B}?nome=${PASTA}/ja_rodou`); await pg.waitForSelector("#ctl-abas .aba"); await pg.waitForTimeout(600);
    await pg.click("#bt-col-scope"); await pg.waitForTimeout(800);
    const sc1 = await pg.evaluate(() => ({ src: document.getElementById("if-scope").getAttribute("src") || "", vazio: !document.getElementById("scope-vazio").hidden }));
    ok(sc1.src.includes(encodeURIComponent(rj.rodadas[0].arquivo)) && !sc1.vazio, `abrir o Scope num script que já rodou: a última rodada dele (${sc1.src.slice(0, 80)}…)`);
    await pg.click("#bt-col-scope");
    await pg.evaluate(() => localStorage.setItem("maisim-script-col-scope", "0"));
    await pg.goto(`${B}?nome=${PASTA}/um`); await pg.waitForSelector("#ctl-abas .aba"); await pg.waitForTimeout(600);
    await pg.click("#bt-col-scope"); await pg.waitForTimeout(800);
    const sc2 = await pg.evaluate(() => ({ src: document.getElementById("if-scope").getAttribute("src") || "", vazio: !document.getElementById("scope-vazio").hidden }));
    ok(sc2.src === "/maisim/scope/" && !sc2.vazio, `num que nunca rodou: o Scope com a lista para escolher uma anterior (${JSON.stringify(sc2)})`);
    await pg.click("#bt-col-scope");
    // um script com duas rodadas de painéis diferentes: a coluna do Scope mostra cada uma com os painéis dela, nas duas ordens
    await pede(pg, "/salvar", { nome: `${PASTA}/duas`, sobrescrever: true, codigo: "import maisim\nmaisim.scope('ra', [0, 1], {'x': [1, 2], 'y': [0, 1]}, panels=[['x'], ['y']])\n"
      + "maisim.scope('rb', [0, 1], {'z': [3, 4]}, panels=[['z']])\n" });
    await pg.goto(`${B}?nome=${PASTA}/duas`); await pg.waitForSelector("#ctl-abas .aba"); await pg.waitForTimeout(600);
    await pg.click("#bt-rodar"); await pg.waitForFunction(() => document.querySelectorAll("#saida a").length >= 4, null, { timeout: 30000 });
    const titulos = async (rod) => {
      await pg.click(`#saida a:text-matches("_${rod}$")`); await pg.waitForTimeout(400);
      const f = await (await pg.$("#if-scope")).contentFrame();
      await f.waitForFunction(() => document.querySelectorAll("input.titulo").length > 0, null, { timeout: 15000 }).catch(() => {});
      await pg.waitForTimeout(800);
      return f.evaluate(() => [...document.querySelectorAll(".cartao")].filter((c) => c.offsetParent).map((c) => (c.querySelector("input.titulo") || {}).value));
    };
    const ta = await titulos("ra"), tb = await titulos("rb"), ta2 = await titulos("ra");
    ok(JSON.stringify(ta) === '["x","y"]' && JSON.stringify(tb) === '["z"]' && JSON.stringify(ta2) === '["x","y"]',
       `duas rodadas no mesmo script: cada uma com os painéis dela no Scope (${JSON.stringify([ta, tb, ta2])})`);
    await pg.click("#bt-col-scope");
    // a ⚙: o que fazer com a rodada de antes (substituir é o padrão, como no circuito); a escolha fica guardada por script
    await pg.click("#bt-param"); m = await modal();
    const sel0 = await pg.$eval(".modal select", (x) => x.value);
    ok(m && m.tit === "Rodar este script" && sel0 === "substitui", `⚙: a janela, com "substituir" como padrão (${sel0})`);
    await pg.selectOption(".modal select", "nova"); await pg.click(".modal .m-ok");
    await pg.click("#bt-param"); await modal();
    const sel1 = await pg.$eval(".modal select", (x) => x.value);
    ok(sel1 === "nova", `a escolha fica guardada (${sel1})`);
    await pg.selectOption(".modal select", "substitui"); await pg.click(".modal .m-ok");
    // os Exemplos: uma barra no pé da coluna (como o Outline do VS Code), recolhida até clicar; o estado fica ao recarregar
    if (await pg.$("#secao-exemplos.aberta")) await pg.click("#cab-exemplos");
    const fechada = await pg.evaluate(() => ({ h: Math.round(document.getElementById("secao-exemplos").getBoundingClientRect().height), vis: !!document.querySelector("#lista-exemplos").offsetParent }));
    await pg.click("#cab-exemplos");
    const aberta = await pg.evaluate(() => ({ h: Math.round(document.getElementById("secao-exemplos").getBoundingClientRect().height), vis: !!document.querySelector("#lista-exemplos").offsetParent }));
    ok(fechada.h < 40 && !fechada.vis && aberta.h > 100 && aberta.vis, `Exemplos: uma barra no pé, que expande ao clicar (${fechada.h} → ${aberta.h} px)`);
    // as abas como no VS Code: um clique abre em prévia (o próximo troca); duplo clique mantém; 📌 fixa à esquerda
    await abreExemplo(pg, "control/pi_load_step");          // (dois que ainda não estão abertos)
    const n1 = await pg.$$eval("#ctl-abas .aba", (bs) => bs.length);
    await abreExemplo(pg, "analysis/pwm_thd");
    const prev = await pg.$$eval("#ctl-abas .aba", (bs) => bs.map((b) => [b.querySelector(".nome-aba").textContent, b.classList.contains("previa")]));
    ok(prev.length === n1 && prev.some(([t, p]) => t === "pwm_thd.py" && p) && !prev.some(([t]) => t === "pi_load_step.py"),
       `um clique abre em prévia e o próximo clique troca o arquivo na mesma aba (${JSON.stringify(prev)})`);
    await pg.dblclick('#ctl-abas .aba.previa');
    await abreExemplo(pg, "control/pi_load_step");
    const dep2 = await pg.$$eval("#ctl-abas .aba .nome-aba", (bs) => bs.map((b) => b.textContent));
    ok(dep2.includes("pwm_thd.py") && dep2.includes("pi_load_step.py"), `duplo clique na aba a mantém: o próximo abre ao lado (${JSON.stringify(dep2)})`);
    await pg.hover('#ctl-abas .aba:has-text("pwm_thd")'); await pg.click('#ctl-abas .aba:has-text("pwm_thd") .fixa-bt');
    const fixa = await pg.evaluate(() => { const b = [...document.querySelectorAll("#ctl-abas .aba")].find((x) => /pwm_thd/.test(x.textContent));
      const prim = [...document.querySelectorAll("#ctl-abas .aba")].sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left)[0];
      return { fixa: b.classList.contains("fixa"), primeira: prim === b, fecha: getComputedStyle(b.querySelector(".fecha")).display }; });
    ok(fixa.fixa && fixa.primeira && fixa.fecha === "none", `📌 fixa a aba à esquerda, sem o × (${JSON.stringify(fixa)})`);
    await pg.click('#ctl-abas .aba:has-text("pwm_thd") .fixa-bt');
    // a busca dos Arquivos: só o que tem o texto no nome, com as pastas abertas; o ▾ do nome leva à busca
    await pg.click("#bt-modelo");
    ok(await pg.evaluate(() => document.activeElement && document.activeElement.id === "arq-busca"), "o ▾ do nome do script leva à busca dos Arquivos");
    await pg.fill("#arq-busca", "rlc");
    const vis = await pg.$$eval("#col-arq li button[data-nome]", (bs) => bs.filter((b) => b.offsetParent).map((b) => b.dataset.nome));
    ok(JSON.stringify(vis) === '["circuits/rlc_step"]', `a busca "rlc": só o que tem o texto, com a pasta aberta (${JSON.stringify(vis)})`);
    await pg.press("#arq-busca", "Enter"); await pg.waitForTimeout(500);
    ok((await pg.textContent("#nome-atual")) === "circuits/rlc_step", "Enter na busca abre o primeiro que sobrou");
    await pg.press("#arq-busca", "Escape");
    // as colunas: Arquivos e Scope ligam e desligam (e ficam assim ao recarregar); as abas voltam
    await pg.click("#bt-col-arq"); await pg.click("#bt-col-scope");
    const abasAntes = await pg.$$eval("#ctl-abas .aba", (bs) => bs.map((b) => b.textContent.replace(/[•×]/g, "")).filter((t) => t.endsWith(".py")));
    await pg.reload(); await pg.waitForSelector("#ctl-abas .aba"); await pg.waitForTimeout(800);
    const cols = await pg.evaluate(() => ({ arq: document.getElementById("col-arq").hidden, scope: document.getElementById("col-scope").hidden,
      bts: [document.getElementById("bt-col-arq").classList.contains("ativo"), document.getElementById("bt-col-scope").classList.contains("ativo")] }));
    const abasDepois = await pg.$$eval("#ctl-abas .aba", (bs) => bs.map((b) => b.textContent.replace(/[•×]/g, "")).filter((t) => t.endsWith(".py")));
    ok(cols.arq && !cols.scope && JSON.stringify(cols.bts) === "[false,true]", `as colunas ficam como estavam ao recarregar (${JSON.stringify(cols)})`);
    ok(abasAntes.every((t) => abasDepois.includes(t)), `as abas abertas voltam ao recarregar (${JSON.stringify(abasDepois)})`);
    await pg.click("#bt-col-arq"); await pg.click("#bt-col-scope");
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
    await pg.reload(); await pg.waitForSelector("#lista-exemplos li", { state: "attached", timeout: 30000 });
    const h2 = await hSaida();
    ok(Math.abs(h1 - h0 - 120) <= 6 && Math.abs(h2 - h1) <= 6, `arrastar a borda da Saída: ${h0} → ${h1} px, e fica ao recarregar (${h2} px)`);
    await pg.click("#bt-saida");
    const rec = await pg.evaluate(() => ({ h: Math.round(document.getElementById("saida-box").getBoundingClientRect().height), vis: getComputedStyle(document.getElementById("saida")).display, bt: document.getElementById("bt-saida").textContent }));
    ok(rec.h < 50 && rec.vis === "none" && rec.bt === "+", `"−" minimiza a Saída (${JSON.stringify(rec)})`);
    await abreExemplo(pg, "circuits/rlc_step");
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
