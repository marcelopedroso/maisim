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
    fs.rmSync(path.join(CONF, "falso_resposta_script.md"), { force: true });
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1400, height: 850 }, locale: "pt-BR" });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("t")) { localStorage.clear(); localStorage.setItem("maisim-lingua", "pt"); sessionStorage.setItem("t", "1"); } } catch (e) { /* sem */ } });
    const pg = await ctx.newPage(); const erros = [];
    pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { nativas.push(d.message()); d.dismiss().catch(() => {}); });
    await pg.goto(B); await pg.waitForSelector("#lista-exemplos li", { state: "attached", timeout: 30000 });
    // o KaTeX vem antes do script.js (que carrega o Monaco): com o AMD (define) do Monaco já no ar, o KaTeX vira módulo e some
    // a global katex — as equações da IA saíam cruas, às vezes (uma corrida); a ordem garante, e com o Monaco no ar ela continua
    const ordem = await pg.evaluate(() => { const s = [...document.querySelectorAll("script[src]")].map((x) => x.getAttribute("src"));
      return [s.findIndex((x) => /katex\.min\.js/.test(x)), s.findIndex((x) => /static\/script\.js/.test(x))]; });
    await pg.waitForFunction(() => typeof monaco !== "undefined", null, { timeout: 30000 }).catch(() => {});
    const glob = await pg.evaluate(() => typeof katex === "object" && typeof katex.renderToString === "function");
    ok(ordem[0] >= 0 && ordem[0] < ordem[1] && glob, `o KaTeX carrega antes do script.js (Monaco) e fica global (${ordem}, ${glob})`);
    await pede(pg, "scripts/pasta/apagar", { nome: PROJ });
    const MAIN = "import maisim\nprint('antes')\n";
    await pede(pg, "scripts/salvar", { nome: `${PROJ}/main`, codigo: MAIN });
    await pede(pg, "scripts/ia/nova", { nome: `${PROJ}/main` });
    await pg.goto(`${B}?nome=${PROJ}/main`); await pg.waitForSelector(`#lista-meus button[data-nome="${PROJ}/main"]`);
    // sem conta
    await pg.click("#bt-ia"); await pg.waitForSelector("#gaveta-ia:not([hidden])");
    // a largura da gaveta: arrastar a borda da esquerda (e o editor encolhe junto)
    const wG = () => pg.$eval("#gaveta-ia", (x) => Math.round(x.getBoundingClientRect().width));
    const wPag = () => pg.$eval("#col-cod", (x) => Math.round(x.getBoundingClientRect().width));
    const g0 = await wG(), p0 = await wPag(), bg = await (await pg.$("#ia-borda")).boundingBox();
    await pg.mouse.move(bg.x + bg.width / 2, bg.y + 200); await pg.mouse.down();
    await pg.mouse.move(bg.x + bg.width / 2 - 150, bg.y + 200, { steps: 6 }); await pg.mouse.up();
    const g1 = await wG(), p1 = await wPag();
    ok(Math.abs(g1 - g0 - 150) <= 6 && Math.abs(p0 - p1 - 150) <= 6, `arrastar a borda da gaveta: ${g0} → ${g1} px, a página ${p0} → ${p1} px`);
    await pg.waitForSelector("#ia-entrar", { timeout: 8000 }).catch(() => {});
    const sem = await pg.evaluate(() => ({ av: document.getElementById("ia-msgs").textContent, link: !!document.querySelector('#ia-msgs a[href*="contas=1"] #ia-entrar'), env: document.getElementById("ia-enviar").disabled }));
    ok(/Entre numa conta/.test(sem.av) && sem.link && sem.env, `sem conta: o aviso com Entrar e o Enviar desligado (${JSON.stringify(sem)})`);
    // com conta (a de mentira)
    fs.writeFileSync(path.join(CONF, "falso_logado"), "");
    fs.writeFileSync(path.join(CONF, "falso_cenario"), "script");
    const NOVO = "import maisim\nprint('depois')\nmaisim.scope('r', [0, 1], {'v_o': [1, 2]})\n";
    fs.writeFileSync(path.join(CONF, "falso_script.json"), JSON.stringify({ "main.py": NOVO, "libs/extra.py": "X = 1\n" }));
    fs.writeFileSync(path.join(CONF, "falso_resposta_script.md"), "A planta:\n\n$$G_{vd}(s) = \\frac{V_{in}}{LCs^2 + \\frac{L}{R}s + 1}$$\n\ncom $\\omega_0 = 1/\\sqrt{LC}$.");
    await pg.click("#ia-fecha"); await pg.click("#bt-ia");
    await pg.waitForFunction(() => !document.getElementById("ia-entrar") && !document.getElementById("ia-enviar").disabled, null, { timeout: 8000 }).catch(() => {});
    const oi = await pg.evaluate(() => [...document.querySelectorAll("#ia-msgs .cc-vazio li")].length);
    ok(oi === 3, `as boas-vindas com os exemplos de pedido (${oi})`);
    await pg.fill("#ia-texto", "troque antes por depois"); await pg.press("#ia-texto", "Enter");   // Enter só quebra a linha
    ok(!(await pg.$(".cc-eu")), "Enter sozinho não envia (quebra a linha, como na IA do circuito)");
    await pg.fill("#ia-texto", "troque antes por depois"); await pg.press("#ia-texto", "Control+Enter");
    await pg.waitForSelector(".cc-prop", { timeout: 30000 }).catch(() => {});
    const card = await pg.evaluate(() => ({ arqs: [...document.querySelectorAll(".cc-diff-rot")].map((s) => s.textContent),
      mais: [...document.querySelectorAll(".cc-diff .cc-dm")].map((s) => s.textContent), menos: [...document.querySelectorAll(".cc-diff .cc-dr")].map((s) => s.textContent),
      eu: [...document.querySelectorAll(".cc-eu")].map((s) => s.textContent), txt: document.getElementById("ia-texto").value }));
    ok(card.arqs.some((x) => /^libs\/extra\.py.*novo/.test(x)) && card.arqs.some((x) => x.startsWith("main.py")), `a proposta: o main e o novo na libs (${JSON.stringify(card.arqs)})`);
    ok(card.mais.some((x) => x.includes("print('depois')")) && card.menos.some((x) => x.includes("print('antes')")), "a diferença: − antes, + depois");
    ok(card.eu.includes("troque antes por depois") && card.txt === "", "o pedido aparece na conversa e a caixa esvazia");
    ok(fs.readFileSync(path.join(SCRIPTS, PROJ, "main.py"), "utf8") === MAIN, "nada gravado antes de aplicar");
    // as equações da resposta (LaTeX) saem formatadas pelo KaTeX, como na IA do circuito: em destaque e na linha, sem o TeX cru
    const eq = await pg.evaluate(() => { const e = [...document.querySelectorAll("#ia-msgs .cc-ele")].pop();
      return { dest: !!(e && e.querySelector(".katex-display .katex")), linha: e ? e.querySelectorAll(".katex").length : 0,
        cru: e ? [...e.childNodes].some((n) => n.nodeType === 1 && !n.querySelector(".katex") && /\$/.test(n.textContent)) : true }; });
    ok(eq.dest && eq.linha >= 2 && !eq.cru, `a resposta com equações formatadas pelo KaTeX (${JSON.stringify(eq)})`);
    // o Revisar: a janela grande com as abas dos arquivos; recusar um muda o botão para "Aplicar 1 de 2"; fechar não aplica
    await pg.click('.cc-bts [data-ia="revisar"]'); await pg.waitForSelector(".modal.cc-dif");
    const rev = await pg.evaluate(() => ({ abas: [...document.querySelectorAll(".cc-dif-arqs button")].map((b) => b.textContent), ed: !!document.querySelector(".cc-dif-ed .monaco-diff-editor, .cc-dif-ed .cc-diff") }));
    ok(rev.abas.length === 2 && rev.ed, `Revisar: a janela com o editor de diferenças e uma aba por arquivo (${JSON.stringify(rev.abas)})`);
    await pg.click('.cc-dif-arqs button:has-text("extra")'); await pg.click('.cc-dif-escolha [data-aceita="0"]');
    const bt = await pg.textContent(".modal .m-aplicar-rodar");
    ok(/1 de 2/.test(bt), `recusar um arquivo: "${bt}"`);
    await pg.keyboard.press("Escape");
    ok(!(await pg.$(".modal.cc-dif")) && fs.readFileSync(path.join(SCRIPTS, PROJ, "main.py"), "utf8") === MAIN, "Esc fecha o Revisar sem aplicar");
    // aplicar e rodar
    await pg.click('.cc-bts [data-ia="aplicar_rodar"]');
    await pg.waitForFunction(() => /terminou/.test(document.getElementById("resultado").textContent), null, { timeout: 30000 }).catch(() => {});
    const dep = await pg.evaluate(() => ({ cod: window.monaco ? monaco.editor.getEditors()[0].getValue() : "", saida: document.getElementById("saida").textContent,
      apl: !!document.querySelector(".ia-aplicada"), card: !!document.querySelector(".cc-prop"), scope: !document.getElementById("col-scope").hidden }));
    ok(dep.cod === NOVO && /depois/.test(dep.saida) && fs.readFileSync(path.join(SCRIPTS, PROJ, "main.py"), "utf8") === NOVO,
       `Aplicar e rodar: gravou, o editor recarregou e rodou (${JSON.stringify(dep.saida.slice(-60))})`);
    ok(dep.apl && !dep.card, "a conversa marca aplicada e o cartão sai");
    ok(dep.scope, "rodou e gravou uma rodada: a coluna do Scope abre ao lado");
    // a partir de um exemplo: salva uma cópia e pede sobre ela
    await pg.goto(`${B}?nome=pwm/sine_pwm&grupo=exemplos`); await pg.waitForSelector("#gaveta-ia:not([hidden])");
    fs.writeFileSync(path.join(CONF, "falso_script.json"), JSON.stringify({ "sine_pwm.py": "print('copia')\n" }));
    await pg.fill("#ia-texto", "mude o exemplo"); await pg.press("#ia-texto", "Control+Enter");
    await pg.waitForSelector(".modal .m-campo", { timeout: 8000 }).catch(() => {});
    const jc = await pg.evaluate(() => ({ tit: (document.querySelector(".modal h3") || {}).textContent, valor: (document.querySelector(".modal .m-campo") || {}).value, texto: (document.querySelector(".modal p") || {}).textContent }));
    ok(jc.tit === "Copiar o exemplo" && /^sessao_\d+$/.test(jc.valor || "") && /só para ler/.test(jc.texto || ""), `pedir num exemplo: a janela da cópia, com o nome padrão (${JSON.stringify(jc)})`);
    await pg.keyboard.press("Enter");
    await pg.waitForSelector(".cc-prop", { timeout: 30000 }).catch(() => {});
    const ex = await pg.evaluate(() => ({ nome: document.getElementById("nome-atual").textContent, card: !!document.querySelector(".cc-prop") }));
    ok(ex.nome === `${jc.valor}/sine_pwm` && ex.card, `Enter aceita o padrão: a cópia e a conversa dela (${JSON.stringify(ex)})`);
    await pede(pg, "scripts/ia/descartar", { nome: ex.nome });
    if (ex.nome.includes("/")) await pede(pg, "scripts/pasta/apagar", { nome: ex.nome.split("/")[0] });
    ok(nativas.length === 0, `nenhuma janela do navegador (${nativas.join(" | ") || "nenhuma"})`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
    await pede(pg, "scripts/pasta/apagar", { nome: PROJ });
  } catch (e) { ok(false, "o teste caiu: " + (e.stack || e).toString().split("\n").slice(0, 3).join(" ")); }
  finally {
    if (b) await b.close();
    for (const f of ["falso_cenario", "falso_script.json", "falso_resposta_script.md"]) fs.rmSync(path.join(CONF, f), { force: true });
  }
  process.exit(falhas ? 1 : 0);
})();
