// a seção do Cursor na janela das contas de IA (as respostas do servidor simuladas: o estado do Cursor muda a cada passo):
// não instalado (no Linux, o comando oficial do terminal e "Procurar de novo"; no Windows, o botão Instalar genérico, que
// manda {ia: "cursor"}), deslogado (a conta é da pessoa: custos e limites dela; "Entrar com a conta Cursor" e, como
// alternativa, "Usar uma chave de API"; o link "termos" do Cursor no título), o login em andamento (o link da página do
// Cursor pela propriedade href, só https; nenhum campo de código: o `agent` confere sozinho), cancelar, a ordem
// chave,login (o campo da chave primeiro, o login como alternativa), salvar a chave (a página só vê os 4 últimos),
// conectado pela conta (o e-mail) e sair (com a confirmação)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const CHAVE = "crsr_" + "tela0123456789abcdef" + "WXYZ";   // de mentira
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } }); const pg = await ctx.newPage();
  await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const sv = { sistema: "linux", pode: false, modoLogin: "", cur: { instalado: false, logado: false, pasta: "~/.cursor-maisim", entradas: ["login", "chave"], login: null }, posts: [] };
  const json = (r, o, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });
  const est = () => ({ id: "cursor", nome: "Cursor", ...sv.cur, modo_login: sv.modoLogin });
  await pg.route("**/claude/estado", (r) => json(r, { pasta: "~/.claude-maisim", instalado: true, logado: true, email: "teste@maisim.local", sistema: sv.sistema, pode_instalar: false }));
  await pg.route("**/claude/ias", (r) => json(r, [{ id: "claude", nome: "Claude", instalado: true, modelos: [""], esforcos: [""], tem_login: false, rotulos: {}, modo_login: "", pode_instalar: false },
    { id: "cursor", nome: "Cursor", instalado: sv.cur.instalado, modelos: [""], esforcos: [""], tem_login: true, rotulos: {}, modo_login: sv.modoLogin, pode_instalar: sv.pode, estado: est() }]));
  await pg.route("**/claude/instalar", (r) => { sv.posts.push(["instalar", r.request().postDataJSON()]); return json(r, { pode: true, andamento: false, ok: true, ia: "cursor", saida: "", fim: Date.now() / 1000 }); });
  await pg.route("**/claude/instalacao", (r) => json(r, { pode: true, andamento: false, ok: true, ia: "cursor", saida: "", fim: Date.now() / 1000 }));
  for (const acao of ["entrar", "cancelar", "sair", "codigo"]) {
    await pg.route(`**/claude/ia/${acao}`, (r) => {
      const corpo = r.request().postDataJSON(); sv.posts.push([acao, corpo]);
      if (acao === "entrar") sv.cur.login = { andamento: true, url: "https://cursor.com/loginDeepControl?challenge=x&uuid=y&mode=login&redirectTarget=cli", erro: null, desde: Date.now() / 1000 };
      else if (acao === "codigo") Object.assign(sv.cur, { logado: true, modo: "chave", chave: "••••••••••" + corpo.codigo.slice(-4) });
      else { sv.cur.login = null; if (acao === "sair") Object.assign(sv.cur, { logado: false, email: null, modo: null, chave: null }); }
      return json(r, est());
    });
  }
  const sec = async () => (await pg.textContent("#iac-cursor")) || "";
  const bts = () => pg.$$eval("#iac-cursor .cla-bts button", (x) => x.map((b) => b.textContent));
  const reabre = async () => {
    await pg.evaluate(() => { if (typeof fechaJanelaClaude === "function") fechaJanelaClaude(); });
    await pg.click("#bt-claude"); await pg.waitForSelector(".modal.cla #iac-cursor", { timeout: 15000 });
  };
  const redesenha = (cond) => pg.evaluate(() => atualizaIAs()).then(() => pg.waitForFunction(cond, null, { timeout: 10000 }));
  await pg.goto("http://localhost:7201/maisim/simu/");
  await pg.waitForFunction(() => typeof cla !== "undefined" && cla.estado, null, { timeout: 30000 });

  await reabre();
  let t = await sec();
  ok(/Cursor CLI não está instalado/.test(t) && t.includes("curl https://cursor.com/install -fsS | bash") && /Procurar de novo/.test(t) && !(await pg.$("#iac-cursor [data-ia-acao=instalar]")),
    `Linux, não instalado: o comando oficial do terminal e "Procurar de novo", sem botão de instalar (${t.slice(0, 80)}…)`);
  Object.assign(sv, { sistema: "windows", pode: true }); await pg.evaluate(() => atualizaClaude()); await reabre();
  t = await sec();
  ok((await pg.textContent("#iac-cursor [data-ia-acao=instalar]")) === "Instalar o Cursor CLI" && !/curl/.test(t), "Windows, não instalado: o botão Instalar genérico, sem o curl … | bash");
  await pg.click("#iac-cursor [data-ia-acao=instalar]");
  await pg.waitForFunction(() => true); await pg.waitForTimeout(500);
  const inst = sv.posts.find((p) => p[0] === "instalar");
  ok(inst && inst[1] && inst[1].ia === "cursor", `o Instalar manda a IA ao servidor (${JSON.stringify(inst && inst[1])})`);

  Object.assign(sv, { sistema: "linux", pode: false }); sv.cur.instalado = true; await pg.evaluate(() => atualizaClaude()); await reabre();
  t = await sec();
  const termos = await pg.$eval("#iac-cursor h4", (h) => [...h.querySelectorAll("a")].map((a) => [a.href, a.textContent, a.target]));
  ok(/Use a sua conta Cursor\. Custos e limites são da sua conta\./.test(t) && JSON.stringify(await bts()) === JSON.stringify(["Entrar com a conta Cursor", "Usar uma chave de API"])
    && (await pg.textContent("#iac-cursor button.primario")) === "Entrar com a conta Cursor"
    && termos.some(([h, x, alvo]) => h === "https://cursor.com/terms-of-service" && /termos ↗/.test(x) && alvo === "_blank"),
    `deslogado: a conta é da pessoa, "Entrar com a conta Cursor" e a alternativa "Usar uma chave de API", o link "termos ↗" do Cursor (${JSON.stringify(await bts())})`);
  await pg.click("#iac-cursor [data-ia-acao=usar_chave]");
  await pg.waitForSelector("#iac-chave-cursor", { timeout: 10000 });
  t = await sec();
  const lk = await pg.$eval("#iac-cursor a.iac-link", (a) => a.href);
  ok(lk === "https://cursor.com/dashboard/api" && (await pg.getAttribute("#iac-chave-cursor", "type")) === "password" && /Uma chave de API do Cursor/.test(t)
    && (await bts()).includes("Entrar com a conta Cursor"),
    "Usar uma chave de API: o campo de senha, o link da página das chaves do Cursor e o login ainda como alternativa");

  await pg.click("#iac-cursor [data-ia-acao=entrar]");
  await pg.waitForSelector("#iac-link-cursor[href]", { timeout: 10000 });
  t = await sec();
  const href = await pg.getAttribute("#iac-link-cursor", "href");
  ok(href.startsWith("https://cursor.com/loginDeepControl?") && !(await pg.$("#iac-codigo-cursor")) && /esperando a autorização na página do Cursor/.test(t)
    && await pg.$("#iac-cursor [role=status]"),
    "entrando: o link da página do Cursor, nenhum campo de código (o agent confere sozinho) e o aviso de espera");
  sv.cur.login = { andamento: true, url: "javascript:alert(1)", erro: null };
  await redesenha(() => !document.querySelector("#iac-link-cursor").hasAttribute("href"));
  ok(true, "um link que não é https não entra no href");
  await pg.click("#iac-cursor [data-ia-acao=cancelar]");
  await pg.waitForSelector("#iac-cursor [data-ia-acao=entrar]", { timeout: 10000 });
  ok(sv.posts.some((p) => p[0] === "cancelar"), "cancelar: o login para e a escolha volta");

  sv.modoLogin = "chave"; await reabre();
  await pg.evaluate(() => { cla.usaChave = {}; desenhaJanelaClaude(); });
  await pg.waitForSelector("#iac-chave-cursor", { timeout: 10000 });
  ok((await bts()).includes("Entrar com a conta Cursor") && !(await bts()).includes("Usar uma chave de API"), "MAISIM_CURSOR_ENTRADA=chave,login: o campo da chave primeiro, o login como alternativa");
  await pg.fill("#iac-chave-cursor", CHAVE); await pg.click("#iac-cursor [data-ia-acao=chave]");
  await pg.waitForFunction(() => /Chave de API:/.test(document.querySelector("#iac-cursor").textContent), null, { timeout: 10000 });
  t = await sec();
  const naPagina = await pg.evaluate((k) => document.documentElement.outerHTML.includes(k) || [...document.querySelectorAll("input")].some((x) => x.value.includes(k)), CHAVE);
  ok(/Chave de API:\s*••••••••••WXYZ/.test(t) && /Custos e limites são da sua conta Cursor/.test(t) && !naPagina && JSON.stringify(await bts()) === JSON.stringify(["Trocar chave", "Sair"]),
    "a chave salva: só os 4 últimos na página, Trocar chave e Sair");
  await pg.click("#iac-cursor [data-ia-acao=sair]");
  await pg.waitForSelector(".modal-fundo:last-child .m-ok.perigo", { timeout: 10000 });
  ok(/Cursor/.test(await pg.textContent(".modal-fundo:last-child .modal")), "sair: pede confirmação, com o nome do Cursor");
  await pg.click(".modal-fundo:last-child .m-ok.perigo");
  await pg.waitForSelector("#iac-chave-cursor", { timeout: 10000 });
  ok(sv.posts.some((p) => p[0] === "sair") && !/Chave de API:/.test(await sec()), "saiu: a seção volta ao campo da chave (a 1ª da ordem)");

  sv.modoLogin = ""; Object.assign(sv.cur, { logado: true, email: "teste@cursor.local", modo: "login", chave: null });
  await redesenha(() => /Conectado como/.test(document.querySelector("#iac-cursor").textContent));
  t = await sec();
  ok(/Conectado como teste@cursor\.local/.test(t) && /conectado/.test(await pg.textContent("#iac-cursor h4")) && (await bts()).includes("Sair"), "conectado pela conta: o e-mail e Sair");
  ok(!erros.length, `sem erros na página (${erros.join(" | ") || "nenhum"})`);
  await b.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log("FALHA " + e.message); process.exit(1); });
