// a seção do Cursor na janela das contas de IA (as respostas do servidor simuladas: o estado do Cursor muda a cada passo):
// não instalado (no Linux, o comando oficial do terminal; no Windows, o do PowerShell, sem curl … | bash), deslogado (a conta
// é da pessoa: custos e limites dela; o botão "Entrar com a conta Cursor"; o link dos termos do Cursor), o login em andamento
// (o link da página do Cursor pela propriedade href, só https; nenhum campo de código: o `agent` confere sozinho), cancelar,
// conectado pela conta (o e-mail) e pela chave de API (só os 4 últimos), e sair (com a confirmação)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } }); const pg = await ctx.newPage();
  await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const sv = { sistema: "linux", cur: { instalado: false, logado: false, pasta: "~/.cursor-maisim", entradas: ["login", "chave"], login: null }, posts: [] };
  const json = (r, o, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });
  await pg.route("**/claude/estado", (r) => json(r, { pasta: "~/.claude-maisim", instalado: true, logado: true, email: "teste@maisim.local", sistema: sv.sistema, pode_instalar: false }));
  await pg.route("**/claude/ias", (r) => json(r, [{ id: "claude", nome: "Claude", instalado: true, modelos: [""], esforcos: [""], tem_login: false, rotulos: {} },
    { id: "cursor", nome: "Cursor", instalado: sv.cur.instalado, modelos: [""], esforcos: [""], tem_login: true, rotulos: {}, estado: { id: "cursor", nome: "Cursor", ...sv.cur } }]));
  for (const acao of ["entrar", "cancelar", "sair"]) {
    await pg.route(`**/claude/ia/${acao}`, (r) => {
      sv.posts.push(acao);
      if (acao === "entrar") sv.cur.login = { andamento: true, url: "https://cursor.com/loginDeepControl?challenge=x&uuid=y&mode=login&redirectTarget=cli", erro: null, desde: Date.now() / 1000 };
      else { sv.cur.login = null; if (acao === "sair") Object.assign(sv.cur, { logado: false, email: null, modo: null, chave: null }); }
      return json(r, { id: "cursor", nome: "Cursor", ...sv.cur });
    });
  }
  const sec = async () => (await pg.textContent("#iac-cursor")) || "";
  const reabre = async () => {
    await pg.evaluate(() => { if (typeof fechaJanelaClaude === "function") fechaJanelaClaude(); });
    await pg.click("#bt-claude"); await pg.waitForSelector(".modal.cla #iac-cursor", { timeout: 15000 });
  };
  await pg.goto("http://localhost:7201/maisim/simu/");
  await pg.waitForFunction(() => typeof cla !== "undefined" && cla.estado, null, { timeout: 30000 });

  await reabre();
  let t = await sec();
  ok(/Cursor CLI não está instalado/.test(t) && t.includes("curl https://cursor.com/install -fsS | bash") && !/irm /.test(t),
    `Linux, não instalado: o comando oficial do terminal (${t.slice(0, 90)}…)`);
  sv.sistema = "windows"; await pg.evaluate(() => atualizaClaude()); await reabre();
  t = await sec();
  ok(t.includes("irm 'https://cursor.com/install?win32=true' | iex") && /PowerShell/.test(t) && !/curl/.test(t),
    "Windows, não instalado: o instalador do PowerShell, sem o curl … | bash");
  sv.sistema = "linux"; sv.cur.instalado = true; await pg.evaluate(() => atualizaClaude()); await reabre();
  t = await sec();
  const termos = await pg.$eval(".modal.cla .cla-termos", (p) => [...p.querySelectorAll("a")].map((a) => a.href));
  ok(/Use a sua conta Cursor\. Custos e limites são da sua conta\./.test(t) && (await pg.textContent("#iac-cursor button.primario")) === "Entrar com a conta Cursor"
    && termos.includes("https://cursor.com/terms-of-service"),
    "deslogado: a conta é da pessoa (custos e limites dela), o botão \"Entrar com a conta Cursor\" e o link dos termos do Cursor");

  await pg.click("#iac-cursor button.primario");
  await pg.waitForSelector("#iac-link-cursor[href]", { timeout: 10000 });
  t = await sec();
  const href = await pg.getAttribute("#iac-link-cursor", "href");
  ok(href.startsWith("https://cursor.com/loginDeepControl?") && !(await pg.$("#iac-codigo-cursor")) && /esperando a autorização na página do Cursor/.test(t)
    && await pg.$("#iac-cursor [role=status]"),
    "entrando: o link da página do Cursor, nenhum campo de código (o agent confere sozinho) e o aviso de espera");
  sv.cur.login = { andamento: true, url: "javascript:alert(1)", erro: null }; await pg.evaluate(() => atualizaIAs());
  await pg.waitForFunction(() => !document.querySelector("#iac-link-cursor").hasAttribute("href"), null, { timeout: 10000 });
  ok(true, "um link que não é https não entra no href");
  await pg.click("#iac-cursor [data-ia-acao=cancelar]");
  await pg.waitForSelector("#iac-cursor button.primario", { timeout: 10000 });
  ok(sv.posts.includes("cancelar"), "cancelar: o login para e o \"Entrar\" volta");

  Object.assign(sv.cur, { logado: true, email: "teste@cursor.local", modo: "login" }); await pg.evaluate(() => atualizaIAs());
  await pg.waitForFunction(() => /Conectado como/.test(document.querySelector("#iac-cursor").textContent), null, { timeout: 10000 });
  t = await sec();
  ok(/Conectado como teste@cursor\.local/.test(t) && /conectado/.test(await pg.textContent("#iac-cursor h4")), "conectado pela conta: o e-mail");
  Object.assign(sv.cur, { email: null, modo: "chave", chave: "••••••••••WXYZ" }); await pg.evaluate(() => atualizaIAs());
  await pg.waitForFunction(() => /chave de API/.test(document.querySelector("#iac-cursor").textContent), null, { timeout: 10000 });
  t = await sec();
  ok(/Conectado com a chave de API ••••••••••WXYZ/.test(t), "conectado pela chave de API: só os 4 últimos");
  await pg.click("#iac-cursor [data-ia-acao=sair]");
  await pg.waitForSelector(".modal-fundo:last-child .m-ok.perigo", { timeout: 10000 });
  ok(/Cursor/.test(await pg.textContent(".modal-fundo:last-child .modal")), "sair: pede confirmação, com o nome do Cursor");
  await pg.click(".modal-fundo:last-child .m-ok.perigo");
  await pg.waitForSelector("#iac-cursor button.primario", { timeout: 10000 });
  ok(sv.posts.includes("sair") && !/Conectado/.test(await sec()), "saiu: a seção volta ao \"Entrar\"");
  ok(!erros.length, `sem erros na página (${erros.join(" | ") || "nenhum"})`);
  await b.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log("FALHA " + e.message); process.exit(1); });
