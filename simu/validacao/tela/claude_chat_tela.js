// "pedir ao Claude" na tela (direto no servidor de teste 7201: as rotas do Claude só aceitam a origem do MaiSim ou a dele; com o claude de mentira: o servidor de teste sobe com
// MAISIM_CLAUDE_BIN=…/validacao/claude_falso.py e MAISIM_CLAUDE_DIR numa pasta descartável): a conversa no painel do controle,
// o uso da conta, a proposta (diferença, aplicar, voltar), a trava da simulação, anexos (📎 e arrastar) e o ✦
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const pid = execSync(`ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1`).toString().trim();
const ENV = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`).toString().split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
if (!(ENV.MAISIM_CLAUDE_BIN || "").endsWith("claude_falso.py") || !/maisim_teste|\/tmp\//.test(ENV.MAISIM_CLAUDE_DIR || "")) { console.log("FALHA suba o servidor de teste com MAISIM_CLAUDE_BIN=…/claude_falso.py e MAISIM_CLAUDE_DIR descartável"); process.exit(1); }
const CONF = ENV.MAISIM_CLAUDE_DIR, logado = (on) => { const f = path.join(CONF, "falso_logado"); if (on) fs.writeFileSync(f, ""); else fs.rmSync(f, { force: true }); };
fs.mkdirSync(CONF, { recursive: true }); fs.writeFileSync(path.join(CONF, "falso_cenario"), "ganho"); logado(true);
const REPO = path.resolve(__dirname, "../dados");   // o exemplo original, congelado (o do repositório é do Marcelo e muda); vai para a pasta de teste
for (const f of ["exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"]) fs.copyFileSync(path.join(REPO, f), path.join(ENV.MAISIM_SALVOS, f));
const limpa = () => { logado(false); fs.rmSync(path.join(CONF, "falso_cenario"), { force: true }); };
const URL = "http://localhost:7201/maisim/simu/?modelo=" + encodeURIComponent(path.join(ENV.MAISIM_SALVOS, "exemplo_controle_pwm.ipes"));
const api = (pg, rota, corpo) => pg.evaluate(([r, c]) => fetch(r, c ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(c) } : {}).then((x) => x.json()), [rota, corpo]);
(async () => {
 let b;
 try {
  b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, colorScheme: "light" }); const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  await pg.goto(URL);
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await api(pg, "editor/abrir", { arq: path.join(ENV.MAISIM_SALVOS, "exemplo_controle_pwm.ipes"), modo: "descartar" });
  await api(pg, "claude/nova", {});
  await pg.reload(); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-editar"); await pg.waitForTimeout(600); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-extra, .modal .m-ok"); await pg.waitForTimeout(800); }
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
  await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
  const original = await pg.evaluate(() => codigoAtual());
  // abrir a conversa
  await pg.click("#ctl-claude-bt"); await pg.waitForTimeout(1500);
  const lay = await pg.evaluate(() => { const r = (id) => $(id).getBoundingClientRect(); return { chat: r("ctl-claude"), ed: r("ctl-editor"), lado: document.body.classList.contains("scope-lado"), uso: $("cc-uso").textContent, vazio: !!document.querySelector(".cc-vazio li") }; });
  ok(lay.chat.width > 200 && lay.chat.height > 150 && lay.ed.width > 300, `conversa aberta (${Math.round(lay.chat.width)}×${Math.round(lay.chat.height)}), editor com ${Math.round(lay.ed.width)} px`);
  // onde fica: ao lado do código (3 colunas, o padrão) ou embaixo; com o painel estreito, desce sozinha
  const onde = () => pg.evaluate(() => { const c = $("ctl-claude").getBoundingClientRect(), e = $("ctl-editor").getBoundingClientRect();
    return { lado: c.left >= e.right - 1, embaixo: c.top >= e.bottom - 1, larg: $("painel-controle").clientWidth, ed: Math.round(e.width), guardado: localStorage.getItem("maisim-simu-claude-lugar") }; });
  const o1 = await onde();
  ok(o1.larg < 820 ? o1.embaixo : o1.lado, `padrão "ao lado": painel de ${o1.larg} px → ${o1.lado ? "3 colunas" : "embaixo (estreito)"}`);
  await pg.setViewportSize({ width: 2400, height: 950 }); await pg.waitForTimeout(700);
  const o2 = await onde();
  ok(o2.larg >= 820 && o2.lado && o2.ed > 300, `painel largo (${o2.larg} px): 3 colunas, código com ${o2.ed} px`);
  await pg.click("#cc-lugar"); await pg.waitForTimeout(400);
  const o3 = await onde();
  ok(o3.embaixo && o3.guardado === "embaixo", "o botão leva a conversa para baixo do código (e lembra)");
  await pg.click("#cc-lugar"); await pg.waitForTimeout(400);
  ok((await onde()).lado, "e de volta ao lado");
  await pg.setViewportSize({ width: 1600, height: 950 }); await pg.waitForTimeout(500);
  ok(/sessão 42%/.test(lay.uso) && /semana 81%/.test(lay.uso), `uso da conta no topo: "${lay.uso}"`);
  ok(lay.vazio, "conversa vazia mostra exemplos do que pedir");
  await pg.screenshot({ path: "claude_chat_vazio.png" });
  // pedir
  await pg.fill("#cc-texto", "dobre o Kp e crie um ganho K2"); await pg.press("#cc-texto", "Control+Enter");
  await pg.waitForSelector(".cc-prop", { timeout: 20000 }); await pg.waitForTimeout(500);
  const card = await pg.evaluate(() => ({ prop: document.querySelector(".cc-prop").innerText, ele: [...document.querySelectorAll(".cc-ele")].map((x) => x.innerText).join(" | "), eu: [...document.querySelectorAll(".cc-eu")].map((x) => x.innerText), texto: $("cc-texto").value }));
  ok(/controle\.py: \+1 −0 linhas/.test(card.prop) && /p\["Kp"\]: 1\.885 → 3\.77/.test(card.prop) && /novo p\["K2"\] = 7\.5 V\/A/.test(card.prop), `cartão da proposta: ${card.prop.split("\n").slice(1, 4).join(" · ")}`);
  ok(/ainda não rodou/.test(card.prop) && !!(await pg.$("#cc-testar")), "a proposta não roda sozinha: o cartão oferece ▷ testar");
  await pg.click("#cc-testar");
  const testou = await pg.waitForFunction(() => /teste \(iniciar e 3 passo, sem simular\): ok · devolve g = 0/.test(document.querySelector(".cc-prop").innerText), null, { timeout: 15000 }).then(() => true).catch(() => false);
  ok(testou, "▷ testar: ok, devolve g = 0");
  ok(/Dobrei o Kp/.test(card.ele) && /mil tokens/.test(card.ele) && card.eu[0] === "dobre o Kp e crie um ganho K2" && card.texto === "",
    "a resposta (markdown leve), o gasto, o pedido no balão e a caixa limpa");
  ok(await pg.evaluate(() => codigoAtual()) === original, "antes de aplicar, o código no editor não muda");
  const git = await pg.evaluate(() => ({ mais: [...document.querySelectorAll(".cc-prop .cc-diff .cc-dm")].map((x) => x.textContent), menos: document.querySelectorAll(".cc-prop .cc-diff .cc-dr").length,
    cab: [...document.querySelectorAll(".cc-prop .cc-diff .cc-dh")].map((x) => x.textContent), ctx: document.querySelectorAll(".cc-prop .cc-diff .cc-dc").length }));
  ok(git.mais.length === 1 && git.mais[0].includes('_k2 = p["K2"]') && git.menos === 0 && /^@@ linha \d+ @@$/.test(git.cab[0]) && git.ctx === 4,
    `no cartão, a diferença como no git: ${git.cab[0]}, +1 linha (${git.mais[0]}), 2 de contexto de cada lado`);
  await pg.screenshot({ path: "claude_chat_proposta.png" });
  // a trava da simulação
  await pg.evaluate(() => travaControle(true)); await pg.waitForTimeout(200);
  const travado = await pg.evaluate(() => $("cc-aplicar").disabled); await pg.evaluate(() => travaControle(false)); await pg.waitForTimeout(200);
  ok(travado && !(await pg.evaluate(() => $("cc-aplicar").disabled)), "com a simulação rodando, aplicar fica desligado; depois volta");
  // ver a diferença
  await pg.click("#cc-ver"); await pg.waitForSelector(".cc-dif .monaco-diff-editor", { timeout: 10000 }); await pg.waitForTimeout(800);
  const dif = await pg.evaluate(() => ({ par: document.querySelector(".cc-dif-par").innerText, ins: document.querySelectorAll(".cc-dif .line-insert, .cc-dif .char-insert").length }));
  ok(/K2/.test(dif.par) && dif.ins > 0, `diferença no Monaco (${dif.ins} marcas de inserção) e a lista dos parâmetros`);
  const modo = () => pg.evaluate(() => { const m = document.querySelector(".cc-dif .editor.modified"), c = document.querySelector(".cc-dif-ed");
    return { ativo: document.querySelector(".cc-dif-modo .ativo").dataset.modo, frac: m.getBoundingClientRect().width / c.getBoundingClientRect().width }; });
  const m1 = await modo();
  ok(m1.ativo === "uni" && m1.frac > 0.9, `abre unificado, como o git diff (o editor ocupa ${Math.round(m1.frac * 100)}% da largura)`);
  await pg.click('.cc-dif-modo button[data-modo="lado"]'); await pg.waitForTimeout(500);
  const m2 = await modo();
  ok(m2.ativo === "lado" && m2.frac < 0.6 && await pg.evaluate(() => localStorage.getItem("maisim-simu-dif-modo")) === "lado", `lado a lado (a proposta em ${Math.round(m2.frac * 100)}%), lembrado`);
  await pg.click('.cc-dif-modo button[data-modo="uni"]'); await pg.waitForTimeout(300);
  await pg.screenshot({ path: "claude_chat_diferenca.png" });
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
  ok(!(await pg.$(".cc-dif")), "Esc fecha a diferença");
  // aplicar
  await pg.click("#cc-aplicar"); await pg.waitForTimeout(1500);
  const ap = await pg.evaluate(() => ({ cod: codigoAtual(), pars: ctl.dados.controle.parametros.map((q) => `${q.nome}=${q.valor}`), card: document.querySelector(".cc-prop").innerText, voltar: !!$("cc-voltar") }));
  const guard = (await api(pg, "editor/controle")).controle;
  ok(ap.cod.includes('_k2 = p["K2"]') && ap.pars.includes("Kp=3.77") && ap.pars.includes("K2=7.5") && /aplicada/.test(ap.card) && ap.voltar, `aplicada: código e parâmetros no painel (${ap.pars.join(", ")})`);
  ok(guard.codigo.includes('_k2 = p["K2"]') && guard.parametros.some((q) => q.nome === "K2"), "e guardada no servidor");
  ok(await pg.evaluate(() => !document.querySelector("#ctl-estado.erro")) && !(await pg.evaluate(() => (ctl.dados.conferencia || []).length)), "sem avisos do validador depois de aplicar (K2 existe)");
  // o histórico guarda o que mudou ao aplicar: "ver a mudança" (pedido de Marcelo, 19/10: saber o que mudou depois de aprovar)
  await pg.waitForSelector(".cc-mud", { timeout: 10000 });
  const bm = await pg.evaluate(() => document.querySelector(".cc-mud").innerText);
  await pg.click(".cc-mud"); await pg.waitForSelector(".cc-dif"); await pg.waitForTimeout(800);
  const jm = await pg.evaluate(() => ({ tit: document.querySelector(".cc-dif h3").textContent, sub: (document.querySelector(".cc-dif-sub") || {}).textContent || "",
    aplicar: !!document.querySelector(".cc-dif .m-aplicar"), par: (document.querySelector(".cc-dif-par") || {}).textContent || "" }));
  ok(/ver a mudança \+\d+ −\d+/.test(bm) && /^Mudança aplicada em/.test(jm.tit) && /^pedido: /.test(jm.sub) && !jm.aplicar && /K2/.test(jm.par),
    `no histórico, "${bm.replace(/\s+/g, " ")}" abre a mudança aplicada ("${jm.tit}"), sem o aplicar, com os parâmetros (K2)`);
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
  // voltar ao de antes
  await pg.click("#cc-voltar"); await pg.waitForTimeout(1200);
  const vol = await pg.evaluate(() => ({ cod: codigoAtual(), pars: ctl.dados.controle.parametros.map((q) => `${q.nome}=${q.valor}`) }));
  const guard2 = (await api(pg, "editor/controle")).controle;
  ok(vol.cod === original && vol.pars.includes("Kp=1.885") && !vol.pars.some((x) => x.startsWith("K2")) && guard2.codigo === original, "↶ voltar ao de antes: código e parâmetros de antes, guardados");
  ok(/voltou ao de antes/.test(await pg.evaluate(() => document.querySelector(".cc-prop").innerText)), "o cartão diz que voltou");
  ok(/aplicada e desfeita/.test(await pg.evaluate(() => document.querySelector(".cc-meta:last-of-type") && [...document.querySelectorAll(".cc-meta")].pop().textContent)) && !!(await pg.$(".cc-mud")),
    "no histórico: \"aplicada e desfeita\", e a mudança continua para ver");
  // a memória do MaiSim: o botão abre e guarda; uma proposta só de memória aparece no cartão e entra ao aplicar
  await api(pg, "claude/memoria", { texto: "" });
  await pg.click("#cc-memoria"); await pg.waitForSelector(".cc-mem textarea");
  await pg.fill(".cc-mem textarea", "- ganhos em V/A\n"); await pg.click(".cc-mem .m-guardar"); await pg.waitForTimeout(400);
  ok(!(await pg.$(".cc-mem")) && (await api(pg, "claude/memoria")).texto === "- ganhos em V/A\n", "memória: escrita pelo botão e guardada");
  fs.writeFileSync(path.join(CONF, "falso_cenario"), "memoria");
  await pg.fill("#cc-texto", "lembre que prefiro clamping"); await pg.press("#cc-texto", "Control+Enter");
  await pg.waitForFunction(() => /memória do MaiSim: \+1/.test((document.querySelector(".cc-prop") || {}).innerText || ""), null, { timeout: 20000 });
  const cm = await pg.evaluate(() => ({ txt: document.querySelector(".cc-prop").innerText, ver: !!$("cc-ver"), testar: !!$("cc-testar") }));
  ok(/clamping/.test(cm.txt) && !cm.ver && !cm.testar, "proposta só de memória: a linha nova no cartão, sem 'ver diferença' nem 'testar' (o código não muda)");
  await pg.click("#cc-aplicar"); await pg.waitForTimeout(800);
  ok((await api(pg, "claude/memoria")).texto === "- ganhos em V/A\n- prefiro anti-windup por clamping\n", "aplicar guarda a memória proposta");
  await pg.click("#cc-voltar"); await pg.waitForTimeout(800);
  ok((await api(pg, "claude/memoria")).texto === "- ganhos em V/A\n", "voltar ao de antes devolve a memória");
  await api(pg, "claude/memoria", { texto: "" }); fs.writeFileSync(path.join(CONF, "falso_cenario"), "ganho");
  // anexos: 📎 e arrastar
  const pdf = path.join(require("os").tmpdir(), "artigo_teste.pdf"); fs.writeFileSync(pdf, "%PDF-1.4\n% artigo\n");
  await pg.setInputFiles("#cc-arq", pdf); await pg.waitForSelector("#cc-anexos .cc-anexo", { timeout: 5000 });
  await pg.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(["\x89PNG\r\n"], "diagrama.png", { type: "image/png" }));
    $("ctl-claude").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); });
  await pg.waitForTimeout(800);
  const anx = await pg.evaluate(() => [...document.querySelectorAll("#cc-anexos .cc-anexo span")].map((x) => x.textContent));
  ok(anx.join(",") === "artigo_teste.pdf,diagrama.png", `anexos pelo 📎 e arrastando: ${anx.join(", ")}`);
  await pg.click('#cc-anexos button[data-tira="diagrama.png"]'); await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => document.querySelectorAll("#cc-anexos .cc-anexo").length) === 1, "tirar um anexo (×)");
  await pg.setInputFiles("#cc-arq", { name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") }); await pg.waitForTimeout(600);
  ok(/virus\.exe: .*PDF, imagem/.test(await pg.evaluate(() => $("cc-aviso").textContent)), "tipo não aceito: aviso na conversa");
  // o ✦ com o uso e o "pedir ao Claude"
  await pg.click("#cc-fechar"); await pg.waitForTimeout(300);
  ok(!(await pg.evaluate(() => $("painel-controle").classList.contains("com-claude"))), "× fecha a conversa");
  await pg.click("#bt-claude"); await pg.waitForSelector("[data-abre=claude]"); await pg.click("[data-abre=claude]");   // os detalhes e limites (o botão)
  await pg.waitForSelector(".cla-uso-l", { timeout: 10000 });
  const jan = await pg.evaluate(() => ({ l: [...document.querySelectorAll(".cla-uso-l")].map((x) => x.innerText.replace(/\s+/g, " ").trim()), pedir: !!$("cla-pedir") }));
  ok(jan.l.length === 3 && /sessão \(5 h\) 42% renova hoje às 13h50/.test(jan.l[0]) && jan.pedir, `✦: barras de uso (${jan.l[0]}) e o botão "pedir ao Claude"`);
  await pg.screenshot({ path: "claude_janela_uso.png", clip: { x: 400, y: 0, width: 900, height: 500 } });
  await pg.click("#cla-pedir"); await pg.waitForTimeout(800);
  ok(await pg.evaluate(() => !document.querySelector(".modal-fundo") && $("painel-controle").classList.contains("com-claude") && document.activeElement === $("cc-texto")), "pedir ao Claude: abre a conversa, com o cursor na caixa");
  // escuro
  const tema = (t) => pg.evaluate((x) => { document.documentElement.dataset.tema = x; dispatchEvent(new CustomEvent("maisim-tema", { detail: { tema: x } })); }, t);   // sem o trilho (porta do servidor)
  await tema("escuro"); await pg.waitForTimeout(600);
  ok(await pg.evaluate(() => getComputedStyle($("ctl-claude")).backgroundColor) === "rgb(23, 26, 33)", "a conversa segue o tema escuro");
  await pg.screenshot({ path: "claude_chat_escuro.png" });
  await tema("claro");
  // sem login
  logado(false); await pg.reload(); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado, null, { timeout: 30000 }); await pg.click("#ctl-claude-bt");
  const entrar = await pg.waitForSelector("#cc-entrar", { timeout: 20000 }).then(() => true).catch(() => false);   // o auth status de verdade leva uns segundos
  ok(entrar, "sem login: a conversa pede para entrar no Claude do MaiSim");
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await api(pg, "claude/nova", {}); await api(pg, "editor/abrir", { arq: path.join(ENV.MAISIM_SALVOS, "exemplo_controle_pwm.ipes"), modo: "descartar" });
 } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
 finally { limpa(); if (b) await b.close(); }
 process.exit(falhas ? 1 : 0);
})();
