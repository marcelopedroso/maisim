// a instalação do Claude Code pela janela das contas (as respostas do servidor simuladas: a instância de teste é Linux e tem o
// claude de mentira): no Windows, o botão Instalar → a saída do instalador enquanto anda → no fim, instalado e o "Entrar"; a
// falha mostra o erro e a saída, e "tentar de novo"; no Linux, o comando oficial do terminal e "Procurar de novo" (sem botão de
// instalar)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } }); const pg = await ctx.newPage();
  await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  // o servidor simulado: sistema, instalado, a instalação (andamento → saída → fim) e o resultado do POST
  const sv = { sistema: "windows", pode: true, instalado: false, inst: null, polls: 0, fim: "ok", posts: 0 };
  const estado = () => ({ pasta: "~/AppData/Roaming/MaiSim/claude", instalado: sv.instalado, logado: false, sistema: sv.sistema, pode_instalar: sv.pode,
    ...(sv.inst ? { instalacao: sv.inst } : {}) });
  const json = (r, o, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });
  await pg.route("**/claude/estado", (r) => json(r, estado()));
  await pg.route("**/claude/ias", (r) => json(r, [{ id: "claude", nome: "Claude", instalado: sv.instalado, modelos: [""], esforcos: [""], tem_login: false, rotulos: {} }]));
  await pg.route("**/claude/instalar", (r) => { sv.posts++; sv.polls = 0; sv.inst = { pode: true, andamento: true, ok: null, erro: null, saida: "", desde: Date.now() / 1000 }; return json(r, sv.inst); });
  await pg.route("**/claude/instalacao", (r) => {
    sv.polls++;
    if (sv.polls === 1) sv.inst = { ...sv.inst, saida: "Setting up Claude Code..." };
    else if (sv.polls >= 3) {
      if (sv.fim === "ok") { sv.instalado = true; sv.inst = { ...sv.inst, andamento: false, ok: true, fim: Date.now() / 1000, saida: "Setting up Claude Code...\n✅ Installation complete!" }; }
      else sv.inst = { ...sv.inst, andamento: false, ok: false, fim: Date.now() / 1000, erro: "o instalador da Anthropic terminou com erro (saída 1); veja o fim da saída abaixo", saida: "Failed to download binary" };
    }
    return json(r, sv.inst);
  });
  await pg.goto("http://localhost:7201/maisim/simu/");
  await pg.waitForFunction(() => typeof cla !== "undefined" && cla.estado, null, { timeout: 30000 });
  ok(/não está instalado/.test(await pg.evaluate(() => $("bt-claude").title)), "botão do cabeçalho: não instalado");
  await pg.click("#bt-claude"); await pg.waitForSelector(".modal.cla #cla-instalar");
  let t = await pg.textContent(".modal.cla");
  ok(/instalador oficial da Anthropic/.test(t) && /sem pedir administrador/.test(t) && await pg.$("#cla-procura") && !/curl/.test(t),
    "Windows: o botão Instalar, o \"Procurar de novo\" e nenhum comando de bash");
  sv.fim = "erro"; await pg.click("#cla-instalar");
  await pg.waitForSelector(".modal.cla .cla-saida", { timeout: 10000 });
  t = await pg.textContent(".modal.cla");
  ok(/Instalando o Claude Code/.test(t) && !(await pg.$("#cla-instalar")) && /instalando o Claude Code/.test(await pg.evaluate(() => $("bt-claude").title)),
    "instalando: o aviso, a saída, sem o botão (um por vez), e o título do botão do cabeçalho");
  await pg.waitForSelector("#cla-instalar", { timeout: 15000 });
  t = await pg.textContent(".modal.cla");
  ok(/terminou com erro/.test(t) && /Failed to download binary/.test(t) && /Tentar instalar de novo/.test(t), "falhou: o erro, o fim da saída e \"tentar instalar de novo\"");
  await pg.screenshot({ path: "claude_instala_falha.png" });
  sv.fim = "ok"; await pg.click("#cla-instalar");
  await pg.waitForSelector("#cla-entrar", { timeout: 15000 });
  t = await pg.textContent(".modal.cla");
  ok(/foi instalado\. Agora entre/.test(t) && sv.posts === 2 && !(await pg.$(".modal.cla .cla-saida")), "instalou: o estado de novo (achado sem reiniciar) e o \"Entrar\"");
  await pg.screenshot({ path: "claude_instala.png" });
  await pg.keyboard.press("Escape");
  // o Linux: o comando oficial do terminal e "Procurar de novo" (sem botão); achado depois de instalar por fora
  Object.assign(sv, { sistema: "linux", pode: false, instalado: false, inst: null });
  await pg.click("#bt-claude"); await pg.waitForSelector(".modal.cla #cla-procura");
  t = await pg.textContent(".modal.cla");
  ok(/curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash/.test(t) && !(await pg.$("#cla-instalar")),
    "Linux: o comando oficial (curl … install.sh | bash), sem o botão Instalar");
  await pg.click("#cla-procura"); await pg.waitForFunction(() => /Ainda não encontrei/.test(document.querySelector(".modal.cla").textContent));
  ok(true, "procurar de novo, ainda ausente: avisa");
  sv.instalado = true; await pg.click("#cla-procura"); await pg.waitForSelector("#cla-entrar", { timeout: 10000 });
  ok(!/foi instalado/.test(await pg.textContent(".modal.cla")), "procurar de novo, instalado por fora: o \"Entrar\" (sem o recado da instalação)");
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close();
  console.log(`falhas: ${falhas}`); process.exit(falhas ? 1 : 0);
})().catch((e) => { console.log("FALHA " + e.message); process.exit(1); });
