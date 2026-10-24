// o Gemini na tela (etapa 3 do hub de IA, 21/10), direto no servidor de teste 7201 com o gemini de mentira (MAISIM_GEMINI_BIN=
// …/validacao/gemini_falso.py, MAISIM_GEMINI_DIR descartável — nunca a conta Google de verdade): a janela das contas com o Claude e
// o Gemini, o login do Gemini (link, código errado, código certo), o seletor de IA na conversa com os modelos de cada uma
// (a escolha fica no navegador), um pedido respondido pelo Gemini (o nome na resposta), e sair.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const pid = execSync(`ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1`).toString().trim();
const ENV = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`).toString().split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
if (!(ENV.MAISIM_GEMINI_BIN || "").endsWith("gemini_falso.py") || !/maisim_teste|\/tmp\//.test(ENV.MAISIM_GEMINI_DIR || "")) { console.log("FALHA suba o servidor de teste (reinicia_servidor_teste.sh): o gemini de mentira numa pasta descartável"); process.exit(1); }
const GEM = ENV.MAISIM_GEMINI_DIR, CONF = ENV.MAISIM_CLAUDE_DIR, FOTOS = process.env.MAISIM_FOTOS || "";
fs.mkdirSync(GEM, { recursive: true }); fs.writeFileSync(path.join(GEM, "falso_cenario"), "ganho");
fs.rmSync(path.join(CONF, "falso_logado"), { force: true });          // o Claude desconectado: a conversa vai pelo Gemini
const REPO = path.resolve(__dirname, "../dados");
for (const f of ["exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"]) fs.copyFileSync(path.join(REPO, f), path.join(ENV.MAISIM_SALVOS, f));
const URL = "http://localhost:7201/maisim/simu/?modelo=" + encodeURIComponent(path.join(ENV.MAISIM_SALVOS, "exemplo_controle_pwm.ipes"));
const api = (pg, rota, corpo) => pg.evaluate(([r, c]) => fetch(r, c ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(c) } : {}).then((x) => x.json()), [rota, corpo]);
const foto = (pg, nome) => (FOTOS ? pg.screenshot({ path: path.join(FOTOS, nome) }) : null);
(async () => {
 let b;
 try {
  b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, colorScheme: "light" }); const pg = await ctx.newPage();
  await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  await pg.goto(URL);
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await api(pg, "claude/ia/sair", { ia: "gemini" });
  await api(pg, "editor/abrir", { arq: path.join(ENV.MAISIM_SALVOS, "exemplo_controle_pwm.ipes"), modo: "descartar" });
  await api(pg, "claude/nova", {});
  await pg.evaluate(() => { for (const k of ["maisim-simu-cc-ia", "maisim-simu-cc-modelo", "maisim-simu-cc-modelo-gemini"]) localStorage.removeItem(k); });   // começa do padrão (uma vez)
  await pg.reload(); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas && cla.estado && cla.ias.length, null, { timeout: 30000 });

  // a janela das contas: o Claude e o Gemini
  await pg.click("#bt-claude"); await pg.waitForSelector(".modal.cla #iac-gemini [data-ia-acao=entrar]");
  const j = await pg.evaluate(() => ({ h3: document.querySelector(".modal.cla h3").textContent, secoes: [...document.querySelectorAll(".modal.cla section.cla-ia h4")].map((x) => x.firstChild.textContent.trim()),
    texto: $("iac-gemini").textContent, termos: ($("iac-gemini").querySelector("a[href]") || {}).href, claude: !!document.querySelector(".modal.cla #cla-entrar") }));
  ok(j.h3 === "IA do MaiSim — contas" && j.secoes.join(",") === "Claude,Google Antigravity,Gemini" && j.claude, `a janela das contas: ${j.secoes.join(", ")} (o entrar do Claude continua)`);
  ok(/não atende mais contas pessoais/.test(j.texto) && /Antigravity/.test(j.texto) && /login só dele/.test(j.texto) && /gemini-code-assist\/resources\/privacy-notices/.test(j.termos || ""),
    "Gemini desconectado: o aviso de que contas pessoais vão pelo Antigravity, a pasta própria e os avisos de privacidade (link)");
  await foto(pg, "gemini_contas.png");
  await pg.click("#iac-gemini [data-ia-acao=entrar]"); await pg.waitForSelector("#iac-link-gemini[href]", { timeout: 40000 });
  const l = await pg.evaluate(() => ({ href: $("iac-link-gemini").href, alvo: $("iac-link-gemini").target, bt: $("bt-claude").classList.contains("andamento") }));
  ok(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/.test(l.href) && l.alvo === "_blank" && l.bt, "entrar: o link do Google (aba nova) e o ponto amarelo no balão");
  await foto(pg, "gemini_login.png");
  await pg.click("#iac-codigo-gemini"); await pg.keyboard.type("4/codigo-ruim-999"); await pg.keyboard.press("Enter");
  await pg.waitForFunction(() => /o Google recusou o código/.test(($("iac-gemini") || {}).textContent || ""), null, { timeout: 40000 });
  ok(!!(await pg.$("#iac-gemini [data-ia-acao=entrar]")), "código errado (Enter no campo envia): o erro do Gemini e o entrar de novo");
  await pg.click("#iac-gemini [data-ia-acao=entrar]"); await pg.waitForSelector("#iac-link-gemini[href]", { timeout: 40000 });
  await pg.fill("#iac-codigo-gemini", "4/codigo-bom-123"); await pg.click("#iac-gemini [data-ia-acao=codigo]");
  await pg.waitForFunction(() => /Conectado como teste@gmail\.com/.test(($("iac-gemini") || {}).textContent || ""), null, { timeout: 40000 });
  const bt = await pg.evaluate(() => ({ t: $("bt-claude").title, logado: $("bt-claude").classList.contains("logado"), pedir: !!$("cla-pedir") }));
  ok(/Gemini: conectado como teste@gmail\.com/.test(bt.t) && bt.logado && bt.pedir, `conectado: o balão verde e diz "${bt.t}"; "pedir à IA" na janela`);
  await foto(pg, "gemini_conectado.png");

  // a conversa: o seletor de IA e os modelos de cada uma
  await pg.click("#cla-pedir"); await pg.waitForFunction(() => cc.aberto && ctl.carregado && ctl.editor, null, { timeout: 30000 });
  const s0 = await pg.evaluate(() => ({ vis: getComputedStyle($("cc-ia")).display !== "none", ops: [...$("cc-ia").options].map((o) => o.value) }));
  ok(s0.vis && s0.ops.join(",") === "claude,antigravity,gemini,eco", `o seletor de IA aparece: ${s0.ops.join(", ")}`);
  ok(/entre com a sua conta do Claude/.test(await pg.textContent("#cc-msgs")), "com o Claude escolhido e desconectado: pede o login do Claude");
  await pg.selectOption("#cc-modelo", "sonnet");
  await pg.selectOption("#cc-ia", "gemini"); await pg.waitForTimeout(300);
  const s1 = await pg.evaluate(() => ({ mod: [...$("cc-modelo").options].map((o) => o.value + "=" + o.textContent), esf: getComputedStyle($("cc-esforco")).display, uso: $("cc-uso").textContent,
    vazio: !!document.querySelector(".cc-vazio .cc-oi b"), guardado: localStorage.getItem("maisim-simu-cc-ia") }));
  ok(s1.mod.join("|") === "=Modelo: automático|pro=Pro|flash=Flash|flash-lite=Flash-Lite" && s1.esf === "none" && s1.guardado === "gemini",
    `Gemini escolhido: os modelos dele (${s1.mod.map((m) => m.split("=")[1]).join(", ")}), sem o esforço, guardado no navegador`);
  ok(s1.vazio && !/entre com a sua conta/.test(await pg.textContent("#cc-msgs")) && s1.uso === "", "Gemini conectado: a conversa pronta para pedir (sem o uso da conta do Claude)");
  await pg.selectOption("#cc-modelo", "flash");
  await pg.selectOption("#cc-ia", "claude"); await pg.waitForTimeout(200);
  const v1 = await pg.evaluate(() => $("cc-modelo").value);
  await pg.selectOption("#cc-ia", "gemini"); await pg.waitForTimeout(200);
  const v2 = await pg.evaluate(() => $("cc-modelo").value);
  ok(v1 === "sonnet" && v2 === "flash", `cada IA guarda o seu modelo: Claude → ${v1}, Gemini → ${v2}`);

  // um pedido respondido pelo Gemini
  await pg.fill("#cc-texto", "dobre o Kp e crie um K2"); await pg.click("#cc-enviar");
  await pg.waitForFunction(() => cc.estado && !cc.estado.andamento && cc.estado.conversa && cc.estado.conversa.historico.length === 1, null, { timeout: 60000 });
  await pg.waitForTimeout(400);
  const r = await pg.evaluate(() => ({ msgs: $("cc-msgs").textContent, meta: [...document.querySelectorAll(".cc-meta")].map((x) => x.textContent).pop() || "",
    ia: cc.estado.conversa.historico[0].ia, prop: !!document.querySelector(".cc-prop #cc-aplicar") }));
  ok(r.ia === "gemini" && /Dobrei o Kp/.test(r.msgs) && /^Gemini · gemini-falso-2\.5 · /.test(r.meta) && r.prop,
    `a resposta do Gemini na conversa, com o nome dele (${r.meta.slice(0, 40)}…) e a proposta para aplicar`);
  const c = fs.readFileSync(path.join(GEM, "falso_chamadas.jsonl"), "utf8").trim().split("\n").map((x) => JSON.parse(x)).filter((x) => x.args.includes("-p")).pop();
  ok(c && c.args[c.args.indexOf("--model") + 1] === "flash", "o pedido foi ao Gemini com o modelo escolhido (--model flash)");
  await foto(pg, "gemini_conversa.png");
  await pg.click("#cc-descartar"); await pg.waitForTimeout(400);

  // recarregar: a escolha volta
  await pg.reload(); await pg.waitForFunction(() => typeof cc !== "undefined" && cc.ias && cc.ias.length && $("cc-ia").options.length > 1, null, { timeout: 30000 });
  ok(await pg.evaluate(() => $("cc-ia").value === "gemini" && $("cc-modelo").value === "flash"), "depois de recarregar: Gemini e Flash, como estavam");

  // sair (com a confirmação)
  await pg.click("#bt-claude"); await pg.waitForSelector("#iac-gemini [data-ia-acao=sair]");
  await pg.click("#iac-gemini [data-ia-acao=sair]"); await pg.waitForFunction(() => document.querySelectorAll(".modal-fundo").length === 2);
  await pg.click(".modal-fundo:last-child .m-ok");
  await pg.waitForSelector("#iac-gemini [data-ia-acao=entrar]", { timeout: 20000 });
  const fim = await api(pg, "claude/ias");
  ok(!fim.find((a) => a.id === "gemini").estado.logado && !fs.existsSync(path.join(GEM, ".gemini", "oauth_creds.json")), "sair: o Gemini desconectado (o login saiu da pasta do MaiSim)");
  await pg.keyboard.press("Escape");
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
 } catch (e) { ok(false, `o teste parou: ${e.message.split("\n")[0]}`); }
 finally {
  fs.rmSync(path.join(GEM, "falso_cenario"), { force: true });
  if (b) await b.close();
  process.exit(falhas ? 1 : 0);
 }
})();
