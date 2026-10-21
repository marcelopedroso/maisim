// etapa B (19/10, pedido de Marcelo): o Claude do PEW cria e edita os módulos — com o claude de mentira (cenário "modulos":
// cria o pll.py, chama do controle.py na ordem e revisa o leitura.py), direto no servidor de teste 8768: a proposta com os 3
// arquivos (pll.py novo), a janela da diferença com uma aba por arquivo, ▷ testar com os módulos, aplicar (o pll.py entra
// no editor e no servidor, como módulo), "ver a mudança" com os arquivos, voltar ao de antes (o pll.py sai), e as opções
// do CLI (Write só em ./*.py); o modelo e o esforço escolhidos e o enviar desligado enquanto ele responde
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const pid = execSync(`ss -ltnp | grep ':8768 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1`).toString().trim();
const ENV = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`).toString().split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
if (!(ENV.PEW_CLAUDE_BIN || "").endsWith("claude_falso.py") || !/pew_simu_teste|\/tmp\//.test(ENV.PEW_CLAUDE_DIR || "")) { console.log("FALHA suba o servidor de teste com o claude de mentira (reinicia_servidor_teste.sh)"); process.exit(1); }
const CONF = ENV.PEW_CLAUDE_DIR, logado = (on) => { const f = path.join(CONF, "falso_logado"); if (on) fs.writeFileSync(f, ""); else fs.rmSync(f, { force: true }); };
fs.mkdirSync(CONF, { recursive: true }); fs.writeFileSync(path.join(CONF, "falso_cenario"), "modulos"); logado(true);
fs.rmSync(path.join(CONF, "falso_chamadas.jsonl"), { force: true });
const limpa = () => { logado(false); fs.rmSync(path.join(CONF, "falso_cenario"), { force: true }); };
const api = (pg, rota, corpo) => pg.evaluate(([r, c]) => fetch(r, c ? { method: "POST", headers: { "Content-Type": "application/json", "X-PEW": "1" }, body: JSON.stringify(c) } : {}).then((x) => x.json()), [rota, corpo]);
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 2300, height: 1000 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:8768/pew/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await api(pg, "editor/novo", { modo: "descartar" }); await api(pg, "claude/nova", {});
    await pg.evaluate(async () => { const j = await api("editor/estado"); dados = j; folhaAtual = "0"; novoEstado(j); await recarregaControle(); mostraDoca("controle"); });
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    const original = await pg.evaluate(() => ({ cod: codigoAtual(), arqs: arquivosDoEditor() }));
    await pg.click("#ctl-claude-bt");
    await pg.waitForFunction(() => typeof cla !== "undefined" && cla.estado && cla.estado.logado && cc.estado && !$("cc-texto").disabled, null, { timeout: 30000 });   /* a conversa pronta (não só aberta) */
    // pedir: o claude de mentira cria o pll.py, chama do controle.py e revisa o leitura.py
    await pg.fill("#cc-texto", "crie um pll em módulo e chame no controle"); await pg.press("#cc-texto", "Control+Enter");
    await pg.waitForSelector(".cc-prop", { timeout: 30000 }); await pg.waitForTimeout(500);
    const card = await pg.evaluate(() => document.querySelector(".cc-prop").innerText);
    ok(/controle\.py: \+\d+ −0 linhas/.test(card) && /leitura\.py: \+1 −1 linhas/.test(card) && /pll\.py \(novo\): \+7 −0 linhas/.test(card),
      `cartão: ${card.split("\n").slice(1, 4).join(" · ")}`);
    const cli = fs.readFileSync(path.join(CONF, "falso_chamadas.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((x) => x.args.includes("--allowedTools")).pop();
    const tools = cli.args[cli.args.indexOf("--tools") + 1], perm = cli.args.slice(cli.args.indexOf("--allowedTools") + 1, cli.args.indexOf("--permission-mode"));
    ok(/Write/.test(tools) && perm.includes("Edit(./*.py)") && perm.includes("Write(./*.py)") && !perm.some((x) => /Write\((?!\.\/\*\.py\))/.test(x)),
      `o CLI: --tools ${tools}; escrever só ./*.py (${perm.filter((x) => /\*\.py/.test(x)).join(", ")})`);
    // a janela da diferença: uma aba por arquivo
    await pg.click("#cc-ver"); await pg.waitForSelector(".cc-dif"); await pg.waitForTimeout(800);
    const abas = await pg.evaluate(() => [...document.querySelectorAll(".cc-dif-arqs button")].map((x) => x.textContent));
    await pg.click('.cc-dif-arqs button:has-text("pll.py")'); await pg.waitForTimeout(600);
    const novo = await pg.evaluate(() => ({ ativo: document.querySelector(".cc-dif-arqs button.ativo").textContent, txt: document.querySelector(".cc-dif-ed").innerText }));
    ok(JSON.stringify(abas) === '["controle.py","leitura.py","pll.py (novo)"]' && /pll\.py/.test(novo.ativo) && /estado\["th"\]/.test(novo.txt), `diferença: abas ${abas.join(" · ")}; na do pll.py, o código novo`);
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
    // ▷ testar: a proposta com os módulos roda (iniciar e 3 passo)
    await pg.click("#cc-testar");
    const testou = await pg.waitForFunction(() => /teste \(iniciar e 3 passo, sem simular\): ok/.test(document.querySelector(".cc-prop").innerText), null, { timeout: 15000 }).then(() => true).catch(() => false);
    ok(testou, "▷ testar: o controle.py com o pll.py importado roda");
    // aplicar
    await pg.click("#cc-aplicar"); await pg.waitForTimeout(2000);
    const ap = await pg.evaluate(async () => ({ abas: ctl.lista.slice(), r: await api("editor/controle") }));
    ok(ap.abas.includes("pll.py") && ap.r.controle.arquivos["pll.py"] && ap.r.modulos.includes("pll.py") && /import pll/.test(ap.r.controle.codigo) && !ap.r.erros.length
       && !ap.r.avisos.some((x) => /passo\(\)|iniciar\(\)|não é importado/.test(x)),
      `aplicada: pll.py no editor e no servidor, como módulo, sem aviso de ordem (abas ${ap.abas.join(", ")})`);
    // o histórico: ver a mudança, com os arquivos
    await pg.waitForSelector(".cc-mud"); const bm = await pg.evaluate(() => document.querySelector(".cc-mud").innerText);
    await pg.click(".cc-mud"); await pg.waitForSelector(".cc-dif"); await pg.waitForTimeout(600);
    const hm = await pg.evaluate(() => ({ tit: document.querySelector(".cc-dif h3").textContent, abas: [...document.querySelectorAll(".cc-dif-arqs button")].map((x) => x.textContent) }));
    ok(/3 arquivos/.test(bm) && /^Mudança aplicada em/.test(hm.tit) && hm.abas.length === 3, `"${bm.replace(/\s+/g, " ")}" abre a mudança com as abas ${hm.abas.join(" · ")}`);
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
    // voltar ao de antes: o pll.py sai, o controle.py e o leitura.py voltam
    await pg.click("#cc-voltar"); await pg.waitForTimeout(2000);
    const vol = await pg.evaluate(async () => ({ cod: codigoAtual(), arqs: arquivosDoEditor(), r: await api("editor/controle") }));
    ok(vol.cod === original.cod && JSON.stringify(vol.arqs) === JSON.stringify(original.arqs) && !vol.r.controle.arquivos["pll.py"], "↶ voltar ao de antes: o pll.py sai, o controle.py e o leitura.py voltam (no editor e no servidor)");
    // o modelo e o esforço (19/10): escolhidos ao lado do enviar, lembrados, vão ao CLI; enquanto ele responde, o enviar
    // fica desligado — e parece desligado (antes o roxo continuava igual)
    await pg.selectOption("#cc-modelo", "haiku"); await pg.selectOption("#cc-esforco", "low");
    fs.writeFileSync(path.join(CONF, "falso_cenario"), "lento");
    await pg.fill("#cc-texto", "um pedido lento"); await pg.press("#cc-texto", "Control+Enter");
    await pg.waitForFunction(() => cc.estado && cc.estado.andamento, null, { timeout: 15000 }); await pg.waitForTimeout(500);
    const bt = await pg.evaluate(() => ({ dis: $("cc-enviar").disabled, txt: $("cc-enviar").textContent, bg: getComputedStyle($("cc-enviar")).backgroundColor, ph: $("cc-texto").placeholder }));
    const cli2 = fs.readFileSync(path.join(CONF, "falso_chamadas.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((x) => x.args.includes("--allowedTools")).pop().args;
    ok(bt.dis && bt.txt === "respondendo…" && bt.bg !== "rgb(124, 58, 237)" && /respondendo/.test(bt.ph), `respondendo: o enviar desligado ("${bt.txt}", fundo ${bt.bg}) e o aviso no campo`);
    ok(cli2[cli2.indexOf("--model") + 1] === "haiku" && cli2[cli2.indexOf("--effort") + 1] === "low", "o modelo (haiku) e o esforço (baixo) escolhidos foram ao CLI");
    await pg.click("#cc-parar"); await pg.waitForFunction(() => cc.estado && !cc.estado.andamento, null, { timeout: 30000 });
    ok(await pg.evaluate(() => !$("cc-enviar").disabled && $("cc-enviar").textContent === "enviar"), "parado: o enviar volta");
    await pg.reload(); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    ok(await pg.evaluate(() => $("cc-modelo").value === "haiku" && $("cc-esforco").value === "low"), "recarregado: o modelo e o esforço continuam escolhidos");
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
    await api(pg, "claude/nova", {}); await api(pg, "editor/novo", { modo: "descartar" });
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { limpa(); if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
