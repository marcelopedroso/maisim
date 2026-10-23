// a IA no pé do trilho (instância de teste 7200 → 7201), pedido de Marcelo em 23/10: o ícone com a situação (a bolinha verde
// e "IA: Claude conectado" quando alguma IA está conectada; "nenhuma conectada" sem); o clique, de outra página, leva ao
// simu com a janela das contas aberta (?contas=1, que sai do endereço); no simu, abre a janela na hora, sem trocar de página
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const pid = execSync(`ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1`).toString().trim();
const ENV = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`).toString().split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
const CONF = ENV.MAISIM_CLAUDE_DIR, LOGADO = path.join(CONF, "falso_logado");
const situacao = (pg) => pg.evaluate(() => { const a = document.querySelector("#maisim-nav .item.ia"); return { rot: a.dataset.rotulo, verde: a.classList.contains("conectada") }; });
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1300, height: 800 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    fs.rmSync(LOGADO, { force: true });
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#maisim-nav .item.ia");
    await pg.waitForFunction(() => /IA: /.test(document.querySelector("#maisim-nav .item.ia").dataset.rotulo), null, { timeout: 15000 });
    const s0 = await situacao(pg);
    fs.mkdirSync(CONF, { recursive: true }); fs.writeFileSync(LOGADO, "");                     // o Claude de mentira conectado
    await pg.reload(); await pg.waitForFunction(() => document.querySelector("#maisim-nav .item.ia.conectada"), null, { timeout: 15000 }).catch(() => {});
    const s1 = await situacao(pg);
    ok(!s0.verde && /nenhuma conectada/.test(s0.rot) && s1.verde && /Claude conectado/.test(s1.rot), `a situação: "${s0.rot}" → "${s1.rot}" (com a bolinha verde)`);
    await pg.click("#maisim-nav .item.ia"); await pg.waitForURL(/\/maisim\/simu\//);
    const modal = await pg.waitForSelector(".modal.cla", { timeout: 30000 }).then(() => true).catch(() => false);
    ok(modal && !/contas=/.test(pg.url()), `da página inicial: o simu com a janela das contas aberta (e o endereço sem o ?contas: ${pg.url().replace(/^.*\/maisim/, "/maisim")})`);
    await pg.click(".modal.cla .m-ok"); await pg.waitForTimeout(300);
    const antes = pg.url(); await pg.click("#maisim-nav .item.ia");
    const modal2 = await pg.waitForSelector(".modal.cla", { timeout: 10000 }).then(() => true).catch(() => false);
    ok(modal2 && pg.url() === antes, "no simu: a janela abre na hora, sem trocar de página");
    // um login que sai (ou entra) noutra aba: o simu avisa (maisim-ia-logados) e a bolinha das outras abas muda na hora
    const H = await pg.context().newPage(); await H.goto("http://localhost:7200/");
    await H.waitForFunction(() => document.querySelector("#maisim-nav .item.ia.conectada"), null, { timeout: 15000 }).catch(() => {});
    fs.rmSync(LOGADO, { force: true });
    await pg.evaluate(() => avisaTrilho([]));                                                     // o que o simu faz ao ver o login sair
    const saiu = await H.waitForFunction(() => !document.querySelector("#maisim-nav .item.ia.conectada"), null, { timeout: 8000 }).then(() => true).catch(() => false);
    ok(saiu && /nenhuma conectada/.test((await situacao(H)).rot), `login saiu: a outra aba muda na hora ("${(await situacao(H)).rot}")`);
    // a outra aba escondida quando o login muda: muda ao voltar a ela (sem esperar os 2 min)
    fs.writeFileSync(LOGADO, "");
    await H.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); });
    await pg.evaluate(() => avisaTrilho(["Claude"])); await H.waitForTimeout(1000);
    const escondida = (await situacao(H)).verde;
    await H.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
    const voltou = await H.waitForFunction(() => document.querySelector("#maisim-nav .item.ia.conectada"), null, { timeout: 8000 }).then(() => true).catch(() => false);
    ok(!escondida && voltou, `login entrou com a outra aba escondida: muda quando ela volta (escondida: ${escondida ? "verde" : "sem verde"}; voltou: ${voltou ? "verde" : "sem verde"})`);
    // a janela à parte (janela=1, sem o trilho à vista) não pergunta a situação da IA
    const J = await pg.context().newPage(); let pedidos = 0;
    J.on("request", (r) => { if (/\/claude\/(estado|ias)/.test(r.url())) pedidos++; });
    await J.goto("http://localhost:7200/maisim/scope/?janela=1"); await J.waitForTimeout(1500);
    await J.evaluate(() => { localStorage.setItem("maisim-ia-logados", "x" + Date.now()); window.maisimNav.situacaoIA(true); }); await J.waitForTimeout(1500);
    ok(pedidos === 0, `a janela à parte não pergunta a situação da IA (${pedidos} pedidos)`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { fs.rmSync(LOGADO, { force: true }); if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
