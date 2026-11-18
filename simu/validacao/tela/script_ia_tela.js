// a IA do MaiSim na página de scripts (#258), com o claude de mentira (cenário "script"), na instância de teste:
//  - sem conta conectada: o aviso com "Entrar"; o Enviar desligado;
//  - o botão flutuante abre a gaveta; pedir (Enter) mostra a IA trabalhando e depois a proposta com a diferença (+/−) e o
//    arquivo novo; nada gravado antes; "Aplicar e rodar" grava, recarrega o editor e roda (a saída aparece); a conversa
//    marca "aplicada";
//  - pedir a partir de um exemplo: salva uma cópia nos seus e a conversa é a da cópia;
//  - nenhuma janela do navegador; sem erros de JS.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const B = "http://localhost:7200/maisim/simu/script";
const pid = execSync("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1").toString().trim();
const ENV = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`).toString().split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
const CONF = ENV.MAISIM_CLAUDE_DIR;
if (!/maisim_teste|\/tmp\//.test(CONF || "")) { console.log("FALHA MAISIM_CLAUDE_DIR não é uma pasta descartável"); process.exit(1); }
const SCRIPTS = (ENV.MAISIM_SCRIPTS || path.join(ENV.MAISIM_DADOS, "scripts")).replace(/^~/, process.env.HOME);
const PROJ = "tela_ia";
const pede = (pg, rota, corpo) => pg.evaluate(async ([r, c]) => (await fetch(r, { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(c) })).json(), [rota, corpo]);
(async () => {
  let b; const nativas = [];
  try {
    fs.rmSync(path.join(CONF, "falso_logado"), { force: true });
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1400, height: 850 }, locale: "pt-BR" });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("t")) { localStorage.clear(); localStorage.setItem("maisim-lingua", "pt"); sessionStorage.setItem("t", "1"); } } catch (e) { /* sem */ } });
    const pg = await ctx.newPage(); const erros = [];
    pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { nativas.push(d.message()); d.dismiss().catch(() => {}); });
    await pg.goto(B); await pg.waitForSelector("#lista-exemplos li", { timeout: 30000 });
    await pede(pg, "scripts/pasta/apagar", { nome: PROJ });
    const MAIN = "import maisim\nprint('antes')\n";
    await pede(pg, "scripts/salvar", { nome: `${PROJ}/main`, codigo: MAIN });
    await pede(pg, "scripts/ia/nova", { nome: `${PROJ}/main` });
    await pg.goto(`${B}?nome=${PROJ}/main`); await pg.waitForSelector(`#lista-meus button[data-nome="${PROJ}/main"]`);
    // sem conta
    await pg.click("#bt-ia"); await pg.waitForSelector("#gaveta-ia:not([hidden])");
    await pg.waitForFunction(() => !document.getElementById("ia-aviso").hidden, null, { timeout: 8000 }).catch(() => {});
    const sem = await pg.evaluate(() => ({ av: document.getElementById("ia-aviso").textContent, link: !!document.querySelector('#ia-aviso a[href*="contas=1"]'), env: document.getElementById("ia-enviar").disabled }));
    ok(/Entre numa conta/.test(sem.av) && sem.link && sem.env, `sem conta: o aviso com Entrar e o Enviar desligado (${JSON.stringify(sem)})`);
    // com conta (a de mentira)
    fs.writeFileSync(path.join(CONF, "falso_logado"), "");
    fs.writeFileSync(path.join(CONF, "falso_cenario"), "script");
    const NOVO = "import maisim\nprint('depois')\n";
    fs.writeFileSync(path.join(CONF, "falso_script.json"), JSON.stringify({ "main.py": NOVO, "libs/extra.py": "X = 1\n" }));
    await pg.click("#ia-fecha"); await pg.click("#bt-ia");
    await pg.waitForFunction(() => document.getElementById("ia-aviso").hidden && !document.getElementById("ia-enviar").disabled, null, { timeout: 8000 }).catch(() => {});
    await pg.fill("#ia-texto", "troque antes por depois"); await pg.press("#ia-texto", "Enter");
    await pg.waitForSelector(".ia-cartao", { timeout: 30000 }).catch(() => {});
    const card = await pg.evaluate(() => ({ arqs: [...document.querySelectorAll(".ia-arq summary")].map((s) => s.textContent),
      mais: [...document.querySelectorAll(".ia-dif .mais")].map((s) => s.textContent), menos: [...document.querySelectorAll(".ia-dif .menos")].map((s) => s.textContent),
      eu: [...document.querySelectorAll(".ia-eu")].map((s) => s.textContent), txt: document.getElementById("ia-texto").value }));
    ok(card.arqs.some((x) => /^libs\/extra\.py.*novo/.test(x)) && card.arqs.some((x) => x.startsWith("main.py")), `a proposta: o main e o novo na libs (${JSON.stringify(card.arqs)})`);
    ok(card.mais.some((x) => x.includes("print('depois')")) && card.menos.some((x) => x.includes("print('antes')")), "a diferença: − antes, + depois");
    ok(card.eu.includes("troque antes por depois") && card.txt === "", "o pedido aparece na conversa e a caixa esvazia");
    ok(fs.readFileSync(path.join(SCRIPTS, PROJ, "main.py"), "utf8") === MAIN, "nada gravado antes de aplicar");
    // aplicar e rodar
    await pg.click('.ia-bts [data-ia="aplicar_rodar"]');
    await pg.waitForFunction(() => /terminou/.test(document.getElementById("resultado").textContent), null, { timeout: 30000 }).catch(() => {});
    const dep = await pg.evaluate(() => ({ cod: window.monaco ? monaco.editor.getModels()[0].getValue() : "", saida: document.getElementById("saida").textContent,
      apl: !!document.querySelector(".ia-aplicada"), card: !!document.querySelector(".ia-cartao") }));
    ok(dep.cod === NOVO && /depois/.test(dep.saida) && fs.readFileSync(path.join(SCRIPTS, PROJ, "main.py"), "utf8") === NOVO,
       `Aplicar e rodar: gravou, o editor recarregou e rodou (${JSON.stringify(dep.saida.slice(-60))})`);
    ok(dep.apl && !dep.card, "a conversa marca aplicada e o cartão sai");
    // a partir de um exemplo: salva uma cópia e pede sobre ela
    await pg.goto(`${B}?nome=pwm/sine_pwm&grupo=exemplos`); await pg.waitForSelector("#gaveta-ia:not([hidden])");
    fs.writeFileSync(path.join(CONF, "falso_script.json"), JSON.stringify({ "sine_pwm.py": "print('copia')\n" }));
    await pg.fill("#ia-texto", "mude o exemplo"); await pg.press("#ia-texto", "Enter");
    await pg.waitForSelector(".ia-cartao", { timeout: 30000 }).catch(() => {});
    const ex = await pg.evaluate(() => ({ nome: document.getElementById("nome").value, card: !!document.querySelector(".ia-cartao") }));
    ok(/^pwm_copia\d*\/sine_pwm$/.test(ex.nome) && ex.card, `pedir num exemplo: a cópia nos seus e a conversa dela (${JSON.stringify(ex)})`);
    await pede(pg, "scripts/ia/descartar", { nome: ex.nome });
    if (ex.nome.includes("/")) await pede(pg, "scripts/pasta/apagar", { nome: ex.nome.split("/")[0] });
    ok(nativas.length === 0, `nenhuma janela do navegador (${nativas.join(" | ") || "nenhuma"})`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
    await pede(pg, "scripts/pasta/apagar", { nome: PROJ });
  } catch (e) { ok(false, "o teste caiu: " + (e.stack || e).toString().split("\n").slice(0, 3).join(" ")); }
  finally {
    if (b) await b.close();
    for (const f of ["falso_cenario", "falso_script.json"]) fs.rmSync(path.join(CONF, f), { force: true });
  }
  process.exit(falhas ? 1 : 0);
})();
