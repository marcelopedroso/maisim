// o Google Antigravity na tela (21/10), direto no servidor de teste 7201 com o agy de mentira (MAISIM_AGY_BIN=…/agy_falso.py,
// MAISIM_AGY_DIR descartável): a janela das contas compacta (cada conta numa linha; "detalhes e limites" abre os limites e a
// pasta), os limites do Antigravity (o /usage dele), e na conversa o seletor com o nome dos modelos e sem o esforço.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const pid = execSync(`ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1`).toString().trim();
const ENV = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`).toString().split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
if (!(ENV.MAISIM_AGY_BIN || "").endsWith("agy_falso.py") || !/maisim_teste|\/tmp\//.test(ENV.MAISIM_AGY_DIR || "")) { console.log("FALHA suba o servidor de teste (reinicia_servidor_teste.sh): o agy de mentira numa pasta descartável"); process.exit(1); }
const CONF = ENV.MAISIM_CLAUDE_DIR, FOTOS = process.env.MAISIM_FOTOS || "";
fs.mkdirSync(CONF, { recursive: true }); fs.writeFileSync(path.join(CONF, "falso_logado"), "");   // o Claude conectado (o de mentira)
const api = (pg, rota, corpo) => pg.evaluate(([r, c]) => fetch(r, c ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(c) } : {}).then((x) => x.json()), [rota, corpo]);
(async () => {
 let b;
 try {
  b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 }, colorScheme: "light" })).newPage();
  await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  await pg.goto("http://localhost:7201/maisim/simu/");
  await pg.waitForFunction(() => typeof cla !== "undefined" && cla.estado && cla.ias.length, null, { timeout: 30000 });
  await api(pg, "claude/ia/sair", { ia: "antigravity" });
  await api(pg, "claude/ia/entrar", { ia: "antigravity" });
  const e = await api(pg, "claude/ia/codigo", { ia: "antigravity", codigo: "4/codigo-bom-123" });
  ok(e.logado, "o Antigravity conectado (o agy de mentira)");
  await pg.evaluate(() => { localStorage.removeItem("maisim-simu-cc-ia"); }); await pg.reload();
  await pg.waitForFunction(() => typeof cla !== "undefined" && cla.estado && cla.estado.logado && cla.ias.length, null, { timeout: 30000 });
  await pg.click("#bt-claude"); await pg.waitForSelector("#iac-antigravity [data-abre=antigravity]");
  const j0 = await pg.evaluate(() => ({ barras: document.querySelectorAll(".cla-uso-l").length, txt: $("iac-antigravity").textContent, cl: document.querySelector(".modal.cla section.cla-ia").textContent }));
  ok(j0.barras === 0 && /Conectado como teste@gmail\.com/.test(j0.txt) && /Conectado como teste@maisim\.local · plano max/.test(j0.cl),
    "a janela compacta: cada conta numa linha (quem está conectado), os detalhes fechados");
  if (FOTOS) await pg.screenshot({ path: path.join(FOTOS, "contas_compacta.png") });
  await pg.click("#iac-antigravity [data-abre=antigravity]");
  await pg.waitForSelector("#iac-antigravity .cla-uso-l", { timeout: 15000 });
  const j1 = await pg.evaluate(() => ({ l: [...document.querySelectorAll("#iac-antigravity .cla-uso-l")].map((x) => x.innerText.replace(/\s+/g, " ").trim()),
    titulo: (document.querySelector("#iac-antigravity .cla-uso-l") || {}).title || document.querySelector("#iac-antigravity .cla-uso-l").dataset.dica || "",
    bt: $("iac-antigravity").querySelector("[data-abre]").textContent, pasta: /agy-maisim/.test($("iac-antigravity").textContent) }));
  ok(j1.l.length === 3 && /^Gemini · semana 25% renova/.test(j1.l[0]) && /^Gemini · 5 h 0,8% renova (hoje|amanhã) às/.test(j1.l[1]) && /Gemini Flash/.test(j1.titulo)
    && /ocultar/.test(j1.bt) && j1.pasta, `"detalhes e limites": os limites do Antigravity (${j1.l[1]}) e a pasta`);
  if (FOTOS) await pg.screenshot({ path: path.join(FOTOS, "contas_limites.png") });
  await pg.click("[data-abre=claude]"); await pg.waitForSelector("section.cla-ia:first-of-type .cla-uso-l", { timeout: 15000 });
  ok((await pg.$$("section.cla-ia:first-of-type .cla-uso-l")).length === 3, "os detalhes do Claude: o uso da conta dele");
  await pg.click("#iac-antigravity [data-abre=antigravity]"); await pg.waitForTimeout(200);
  ok((await pg.$$("#iac-antigravity .cla-uso-l")).length === 0, "ocultar detalhes: fecha de novo");
  await pg.click("#cla-pedir"); await pg.waitForFunction(() => cc.aberto && $("cc-ia").options.length > 1, null, { timeout: 30000 });
  await pg.selectOption("#cc-ia", "antigravity"); await pg.waitForTimeout(300);
  const s = await pg.evaluate(() => ({ mod: [...$("cc-modelo").options].map((o) => o.textContent), esf: getComputedStyle($("cc-esforco")).display, nome: $("cc-ia").selectedOptions[0].textContent }));
  ok(s.nome === "Google Antigravity" && s.mod.join("|") === "modelo: padrão|Gemini Falso (High)|Claude Falso (Medium)" && s.esf === "none",
    `na conversa: "${s.nome}", os modelos com o nome (${s.mod.slice(1).join(", ")}), sem o esforço (vem no modelo)`);
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await api(pg, "claude/ia/sair", { ia: "antigravity" });   // deixa a instância de teste como estava (os outros testes contam com isso)
 } catch (e) { ok(false, `o teste parou: ${e.message.split("\n")[0]}`); }
 finally {
  fs.rmSync(path.join(CONF, "falso_logado"), { force: true });
  if (b) await b.close();
  process.exit(falhas ? 1 : 0);
 }
})();
