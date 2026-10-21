// o botão do Claude do MaiSim (instância de teste, pasta descartável): estado, entrar → links, código (Enter), foco e aviso que
// sobrevivem ao acompanhamento, cancelar; a tela de conectado (simulada) com Esc na confirmação de sair; falha de rede
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } }); const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  await pg.goto("http://localhost:7201/maisim/simu/");
  await pg.waitForFunction(() => typeof cla !== "undefined" && cla.estado, null, { timeout: 30000 });
  const b0 = await pg.evaluate(() => ({ title: $("bt-claude").title, logado: $("bt-claude").classList.contains("logado"), raio: getComputedStyle($("bt-claude")).borderTopLeftRadius }));
  ok(b0.title === "IA do MaiSim — Claude: entrar" && !b0.logado && b0.raio === "6px", `botão: "${b0.title}" · cantos ${b0.raio}`);
  await pg.click("#bt-claude"); await pg.waitForSelector(".modal.cla #cla-entrar");
  ok(/pasta só dele/.test(await pg.textContent(".modal.cla")), "janela: explica a pasta própria");
  await pg.click("#cla-entrar"); await pg.waitForSelector("#cla-auto[href]", { timeout: 30000 });
  const l = await pg.evaluate(() => ({ auto: $("cla-auto").href, manual: $("cla-manual").href, alvo: $("cla-auto").target, bt: $("bt-claude").classList.contains("andamento") }));
  const ru = (u) => new URL(u).searchParams.get("redirect_uri");
  ok(/^https:\/\/claude\.com\/cai\/oauth\/authorize/.test(l.auto) && /^http:\/\/localhost:\d+\/callback$/.test(ru(l.auto)) && l.alvo === "_blank", `link principal: retorno em ${ru(l.auto)}`);
  ok(ru(l.manual) === "https://platform.claude.com/oauth/code/callback" && l.bt, `link alternativo: ${ru(l.manual)} · ponto amarelo`);
  await pg.screenshot({ path: "claude_login.png" });
  await pg.click("#cla-codigo"); await pg.keyboard.type("abc"); await pg.keyboard.press("Enter"); await pg.waitForSelector(".cla-erro", { timeout: 10000 });
  ok(/xxxx#yyyy/.test(await pg.textContent(".modal.cla")), "Enter no campo envia; código mal formado recusado");
  await pg.waitForTimeout(3300);
  ok(/xxxx#yyyy/.test(await pg.textContent(".modal.cla")) && await pg.$("#cla-auto[href]"), "o aviso continua depois de 2 ciclos do acompanhamento, e o login segue");
  await pg.fill("#cla-codigo", ""); await pg.click("#cla-codigo"); await pg.keyboard.type("parc"); await pg.waitForTimeout(3300); await pg.keyboard.type("ial");
  const f = await pg.evaluate(() => ({ v: $("cla-codigo").value, foco: document.activeElement && document.activeElement.id }));
  ok(f.v === "parcial" && f.foco === "cla-codigo", `digitando durante o acompanhamento: "${f.v}", foco em ${f.foco}`);
  await pg.click("#cla-cancelar"); await pg.waitForSelector("#cla-entrar");
  ok(/cancelado/.test(await pg.textContent(".modal.cla")) && !(await pg.evaluate(() => $("bt-claude").classList.contains("andamento"))), "cancelar: volta ao entrar, com o motivo");
  await pg.keyboard.press("Escape"); ok(!(await pg.$(".modal.cla")), "Esc fecha a janela");
  // conectado (simulado na resposta do estado): sair → confirmação → Esc fecha só a confirmação
  // uma interceptação só, com o modo numa variável: trocar por unroute + route deixava um intervalo em que um pedido de
  // estado chegava ao servidor de verdade (desconectado) e a tela, com razão, mostrava isso
  let modoEstado = "logado";
  await pg.route("**/claude/estado", (r) => modoEstado === "falha" ? r.abort() : modoEstado === "real" ? r.continue() : r.fulfill({ contentType: "application/json", body: JSON.stringify({ pasta: "~/.claude-maisim", instalado: true, logado: true, email: "teste@exemplo", plano: "max" }) }));
  await pg.click("#bt-claude"); await pg.waitForSelector("#cla-sair");
  ok(/Conectado como teste@exemplo · plano max/.test(await pg.textContent(".modal.cla")) && await pg.evaluate(() => $("bt-claude").classList.contains("logado")), "conectado: e-mail, plano, ponto verde");
  await pg.click("#cla-sair"); await pg.waitForFunction(() => document.querySelectorAll(".modal-fundo").length === 2);
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
  ok((await pg.$$(".modal-fundo")).length === 1 && await pg.$(".modal.cla #cla-sair"), "Esc na confirmação de sair fecha só a confirmação");
  await pg.keyboard.press("Escape");
  // falha de rede com estado conhecido: mantém o que sabia e avisa; sem estado: "sem resposta" (nunca "não instalado")
  modoEstado = "falha";
  await pg.click("#bt-claude"); await pg.waitForSelector(".modal.cla .cla-erro");
  ok(/Sem resposta do servidor agora/.test(await pg.textContent(".modal.cla")) && await pg.$("#cla-sair"), "falha de rede com estado conhecido: mantém a tela e avisa");
  await pg.keyboard.press("Escape"); await pg.evaluate(() => { cla.estado = null; });
  await pg.click("#bt-claude"); await pg.waitForSelector(".modal.cla #cla-tentar");
  const t = await pg.textContent(".modal.cla section.cla-ia");   // a parte do Claude (as outras IAs têm a sua)
  ok(/Sem resposta do servidor/.test(t) && !/não está instalado/.test(t) && await pg.$("#cla-tentar"), "falha de rede: 'sem resposta', com 'tentar de novo' (não 'não instalado')");
  modoEstado = "real"; await pg.click("#cla-tentar"); await pg.waitForSelector("#cla-entrar", { timeout: 10000 });
  ok(true, "tentar de novo: volta ao estado real (deslogado)");
  await pg.keyboard.press("Escape");
  const s = await pg.evaluate(() => api("claude/estado"));
  ok(!(s.login && s.login.andamento), "no servidor, nenhum login em andamento");
  // cabeçalho estreito: o botão do Claude continua dentro da tela
  await pg.setViewportSize({ width: 1150, height: 800 }); await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => $("bt-claude").getBoundingClientRect().right);
  ok(r <= 1150, `cabeçalho a 1150 px: o botão termina em ${Math.round(r)} px`);
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
