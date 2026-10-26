// várias IAs na tela (instância de teste 7201, com o Claude de mentira e o "Eco", a IA de teste que entra por chave de API):
// a janela das contas no modo da chave (campo de senha, Salvar chave, a chave mascarada, o saldo, Trocar chave, Sair); o
// seletor de IA do chat só com duas IAs conectadas (não só instaladas); o modelo, o esforço e a barra de uso seguem a IA
// escolhida; cada resposta diz quem respondeu e a troca no meio da conversa ganha a linha "a partir daqui"; a dica do
// trilho lista as IAs conectadas. A chave nunca volta para a página.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const pid = execSync(`ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1`).toString().trim();
const ENV = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`).toString().split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
if (!(ENV.MAISIM_CLAUDE_BIN || "").endsWith("claude_falso.py") || ENV.MAISIM_IA_TESTE !== "1") { console.log("FALHA suba o servidor de teste (reinicia_servidor_teste.sh)"); process.exit(1); }
const CONF = ENV.MAISIM_CLAUDE_DIR, ECO = path.join(path.dirname(CONF), "eco-maisim");
const CHAVE = "sk-teste" + "0123456789abcdef" + "WXYZ";     // de mentira
for (const d of [CONF, ECO]) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "falso_cenario"), "le_conversa"); }
fs.writeFileSync(path.join(CONF, "falso_logado"), "");
fs.rmSync(path.join(ECO, "maisim", "chave"), { force: true });
const REPO = path.resolve(__dirname, "../dados");
for (const f of ["exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"]) fs.copyFileSync(path.join(REPO, f), path.join(ENV.MAISIM_SALVOS, f));
const ARQ = path.join(ENV.MAISIM_SALVOS, "exemplo_controle_pwm.ipes");
const URL = "http://localhost:7201/maisim/simu/?modelo=" + encodeURIComponent(ARQ);
const api = (pg, rota, corpo) => pg.evaluate(([r, c]) => fetch(r, c ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(c) } : {}).then((x) => x.json()), [rota, corpo]);
const semChave = (pg) => pg.evaluate((k) => !document.documentElement.outerHTML.includes(k) && ![...document.querySelectorAll("input")].some((x) => x.value.includes(k)), CHAVE);
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, colorScheme: "light" }); const pg = await ctx.newPage();
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); localStorage.removeItem("maisim-simu-cc-ia"); } catch (e) { /* ok */ } });
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    const respostas = []; pg.on("response", async (r) => { if (/\/claude\//.test(r.url())) { try { respostas.push(await r.text()); } catch (e) { /* ok */ } } });
    await pg.goto(URL);
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    await api(pg, "claude/ia/sair", { ia: "eco" });
    await api(pg, "editor/abrir", { arq: ARQ, modo: "descartar" }); await api(pg, "claude/nova", {});
    await pg.reload(); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    await pg.click("#bt-editar"); await pg.waitForTimeout(600); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-extra, .modal .m-ok"); await pg.waitForTimeout(800); }
    await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    await pg.click("#ctl-claude-bt"); await pg.waitForFunction(() => cla.estado && cla.estado.logado && cc.ias.some((a) => a.id === "eco"), null, { timeout: 20000 });
    const sel = () => pg.evaluate(() => ({ visivel: getComputedStyle($("cc-ia")).display !== "none", ops: [...$("cc-ia").options].map((o) => o.textContent), ia: ccIA(),
      modelos: [...$("cc-modelo").options].map((o) => o.textContent), esforco: getComputedStyle($("cc-esforco")).display !== "none", uso: $("cc-uso").textContent }));
    const s0 = await sel();
    ok(!s0.visivel && s0.ia === "claude" && /Fable/.test(s0.modelos.join()), `só o Claude conectado (o Eco instalado, sem chave): sem o seletor de IA (${JSON.stringify(s0.ops)})`);

    // a janela das contas: o Eco no modo da chave
    await pg.click("#bt-claude"); await pg.waitForSelector("#iac-eco input[type=password]");
    const j0 = await pg.evaluate(() => { const s = $("iac-eco"), i = s.querySelector("input"); return { txt: s.innerText, tipo: i.type, nota: $(i.getAttribute("aria-describedby")).textContent,
      rotulo: i.closest("label") && i.closest("label").textContent, bt: s.querySelector("[data-ia-acao=chave]").textContent }; });
    ok(j0.tipo === "password" && j0.bt === "Salvar chave" && /nunca aparece de volta/.test(j0.nota) && /Cole aqui/.test(j0.rotulo) && /não conectado/.test(j0.txt),
      `Eco sem chave: o campo de senha com rótulo, "Salvar chave" e o aviso (${j0.nota})`);
    await (await pg.$(".modal.cla")).screenshot({ path: "ia_contas_sem_chave.png" });
    // a DeepSeek (sempre na lista, de chave): o texto dela, o link das chaves e o campo
    const dsj = await pg.evaluate(() => { const s = $("iac-deepseek"); if (!s) return {}; const l = s.querySelector("a.iac-link");
      return { txt: s.innerText, href: l && l.href, alvo: l && l.target, rel: l && l.rel, ph: s.querySelector("input[type=password]") && s.querySelector("input[type=password]").placeholder }; });
    ok(/^DeepSeek\s+não conectado/.test(dsj.txt || "") && /A DeepSeek funciona com uma chave de API \(cobrança por uso\)/.test(dsj.txt) && /1\. Crie a chave em platform\.deepseek\.com → API keys ↗/.test(dsj.txt)
      && dsj.href === "https://platform.deepseek.com/api_keys" && dsj.alvo === "_blank" && /noopener/.test(dsj.rel) && dsj.ph === "sk-…",
      `a DeepSeek: "${(dsj.txt || "").split("\n").slice(0, 3).join(" | ")}", o link ${dsj.href}`);
    await pg.click("#iac-chave-eco"); await pg.keyboard.type("abc"); await pg.keyboard.press("Enter");
    await pg.waitForSelector("#iac-eco .iac-erro", { timeout: 10000 });
    ok(/começa com “sk-”/.test(await pg.textContent("#iac-eco .iac-erro")) && await pg.inputValue("#iac-chave-eco") === "abc", "chave mal formada (Enter): o motivo, e o que se colou fica para corrigir");
    await pg.fill("#iac-chave-eco", CHAVE); await pg.click("#iac-eco [data-ia-acao=chave]");
    await pg.waitForSelector("#iac-eco [data-ia-acao=trocar]", { timeout: 10000 });
    await pg.waitForFunction(() => /saldo/.test($("iac-eco").innerText), null, { timeout: 10000 }).catch(() => {});
    const j1 = await pg.evaluate(() => ({ txt: $("iac-eco").innerText, bts: [...$("iac-eco").querySelectorAll(".cla-bts button")].map((x) => x.textContent), titulo: $("bt-claude").title }));
    ok(/Chave de API: sk-••••••••••WXYZ/.test(j1.txt) && /saldo US\$\s1,84/.test(j1.txt) && /Cobrança por uso, na sua chave/.test(j1.txt) && j1.bts.join() === "Trocar chave,Sair",
      `chave salva: "${j1.txt.split("\n").filter((x) => /Chave/.test(x))[0]}", [${j1.bts.join("] [")}]`);
    ok(/Eco \(teste\): conectado \(chave de API\)/.test(j1.titulo), `o balão do cabeçalho: "${j1.titulo}"`);
    ok(await semChave(pg) && !respostas.some((t) => t.includes(CHAVE)), "a chave não está na página nem em nenhuma resposta do servidor");
    await pg.screenshot({ path: "ia_contas_chave.png", clip: { x: 350, y: 0, width: 900, height: 950 } });
    await pg.click("#iac-eco [data-ia-acao=trocar]");
    const tr1 = await pg.evaluate(() => ({ foco: document.activeElement && document.activeElement.id, bts: [...$("iac-eco").querySelectorAll(".cla-bts button")].map((x) => x.textContent) }));
    await pg.click("#iac-eco [data-ia-acao=nao_trocar]");
    ok(tr1.foco === "iac-chave-eco" && tr1.bts.join() === "Cancelar" && await pg.$("#iac-eco [data-ia-acao=trocar]"), "Trocar chave: o campo de novo (com o cursor nele); Cancelar volta à chave de agora");
    await pg.keyboard.press("Escape");

    // o chat com duas IAs conectadas: o seletor, os modelos e o esforço da escolhida, a barra de uso dela
    await pg.waitForFunction(() => getComputedStyle($("cc-ia")).display !== "none", null, { timeout: 10000 }).catch(() => {});
    const s1 = await sel();
    ok(s1.visivel && s1.ops.join() === "Claude,Eco (teste)" && s1.ia === "claude" && s1.esforco && /sessão 42%/.test(s1.uso), `com o Eco conectado: o seletor de IA [${s1.ops.join(", ")}]; Claude com esforço e "${s1.uso}"`);
    await pg.selectOption("#cc-ia", "eco"); await pg.waitForFunction(() => /saldo/.test($("cc-uso").textContent), null, { timeout: 10000 }).catch(() => {});
    const s2 = await sel();
    ok(s2.ia === "eco" && s2.modelos.join() === "Modelo: padrão,Eco Pro,Eco Flash" && !s2.esforco && /saldo US\$\s1,84/.test(s2.uso),
      `Eco escolhido: os modelos dele [${s2.modelos.join(", ")}], sem o esforço (só o padrão), a barra com "${s2.uso}"`);
    // um pedido ao Claude, outro ao Eco: quem respondeu e a linha da troca
    await pg.selectOption("#cc-ia", "claude");
    const nHist = () => pg.evaluate(() => ((cc.estado && cc.estado.conversa && cc.estado.conversa.historico) || []).length);
    const pede = async (txt) => { const n = await nHist(); await pg.fill("#cc-texto", txt); await pg.press("#cc-texto", "Control+Enter");
      await pg.waitForFunction((n0) => cc.estado && !cc.estado.andamento && cc.estado.conversa.historico.length > n0, n, { timeout: 30000 }); await pg.waitForTimeout(400); };
    await pede("um");
    await pg.selectOption("#cc-ia", "eco"); await pg.selectOption("#cc-modelo", "opus");
    await pede("dois");
    const c = await pg.evaluate(() => ({ metas: [...document.querySelectorAll("#cc-msgs .cc-meta")].map((x) => x.textContent), troca: [...document.querySelectorAll("#cc-msgs .cc-troca")].map((x) => ({ t: x.textContent, papel: x.getAttribute("role") })),
      ordem: [...document.querySelectorAll("#cc-msgs > *")].map((x) => x.className.split(" ")[0]) }));
    const k = c.ordem.indexOf("cc-troca");
    ok(c.metas.length === 2 && /^Claude · claude-falso · /.test(c.metas[0]) && /^Eco \(teste\) · claude-falso · /.test(c.metas[1]), `cada resposta diz quem respondeu: "${c.metas.map((x) => x.split(" · ").slice(0, 2).join(" · ")).join('" e "')}"`);
    ok(c.troca.length === 1 && c.troca[0].t === "a partir daqui: Eco (teste) · claude-falso (leu a conversa anterior)" && c.troca[0].papel === "separator" && c.ordem[k + 1] === "cc-eu",
      `a troca de IA: "${c.troca[0] && c.troca[0].t}", antes do pedido que o Eco respondeu`);
    const ult = await api(pg, "claude/pedido");
    ok((ult.conversa.historico.slice(-1)[0] || {}).resposta === "li a conversa: 1 pedido(s)", "o Eco leu a conversa anterior (CONVERSA.md)");
    await pg.screenshot({ path: "ia_contas_chat.png" });
    await pg.evaluate(() => maisimI18n.muda("en")); await pg.waitForTimeout(500);
    const en = await pg.evaluate(() => { cc.desenhado = ""; desenhaChat(); return { troca: document.querySelector("#cc-msgs .cc-troca").textContent, uso: $("cc-uso").textContent }; });
    ok(en.troca === "from here on: Eco (teste) · claude-falso (read the earlier conversation)" && /balance \$1\.84/.test(en.uso), `em inglês: "${en.troca}" · "${en.uso}"`);
    await pg.evaluate(() => maisimI18n.muda("pt")); await pg.waitForTimeout(300);

    // a dica do trilho (na página de teste, com o trilho): as IAs conectadas
    const H = await ctx.newPage(); await H.goto("http://localhost:7200/");
    await H.waitForFunction(() => /conectad/.test((document.querySelector("#maisim-nav .item.ia") || {}).dataset.rotulo || "") && document.querySelector("#maisim-nav .item.ia.conectada"), null, { timeout: 15000 }).catch(() => {});
    const rot = await H.evaluate(() => document.querySelector("#maisim-nav .item.ia").dataset.rotulo); await H.close();
    ok(rot === "IAs conectadas: Claude, Eco (teste) (clique: as contas)", `o trilho: "${rot}"`);

    // sair do Eco: o seletor some e a conversa volta ao Claude
    await pg.click("#bt-claude"); await pg.waitForSelector("#iac-eco [data-ia-acao=sair]"); await pg.click("#iac-eco [data-ia-acao=sair]");
    await pg.waitForFunction(() => document.querySelectorAll(".modal-fundo").length === 2); await pg.click(".modal-fundo:last-child .m-ok");
    await pg.waitForSelector("#iac-eco input[type=password]", { timeout: 10000 });
    ok(!fs.existsSync(path.join(ECO, "maisim", "chave")), "Sair (com a confirmação): a chave apagada, o campo de volta");
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(500);
    const s3 = await sel();
    ok(!s3.visivel && s3.ia === "claude" && /sessão 42%/.test(s3.uso), "sem a chave do Eco: o seletor some e a conversa volta ao Claude (com o uso dele)");
    ok(await semChave(pg) && !respostas.some((t) => t.includes(CHAVE)), "no fim, a chave continua fora da página e das respostas");
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
    await api(pg, "claude/nova", {}); await api(pg, "editor/abrir", { arq: ARQ, modo: "descartar" });
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally {
    for (const d of [CONF, ECO]) for (const f of ["falso_logado", "falso_cenario"]) fs.rmSync(path.join(d, f), { force: true });
    fs.rmSync(path.join(ECO, "maisim", "chave"), { force: true });
    if (b) await b.close();
  }
  process.exit(falhas ? 1 : 0);
})();
