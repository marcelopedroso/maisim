// fechar a janela fecha o MaiSim (24/10, Marcelo: no Windows, fechada a janela, o pythonw e o java ficavam no ar escondidos
// e travavam os arquivos da atualização). Um lançador à parte, do zero (app/lancador.py --abrir, portas 7300–7306, tela :73,
// dados e cache numa pasta temporária, sem abrir navegador: MAISIM_NAVEGADOR=nenhum), e a página no Chromium do Playwright:
//   - a página dá sinal de vida (/maisim/vivo/ultimo: uma aberta); trocar de página (início → simu) não desliga;
//   - o ícone de novo, com o lançador no ar, só abre a janela e sai (o primeiro continua);
//   - com mudança não salva, fechar a janela pergunta antes (beforeunload);
//   - fechada a página com uma rodada em andamento, o MaiSim espera a rodada (fica no ar);
//   - acabada a rodada, ele desliga sozinho: o lançador sai e as portas 7300–7304 ficam livres.
// Leva ~1,5 min (o Gecko sobe do zero). Não mexe na instância de teste (7200) nem na do Marcelo.
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), net = require("net");
const RAIZ = path.resolve(__dirname, "../../.."), B = 7300, URL0 = `http://localhost:${B}`;
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const noAr = (p) => new Promise((r) => { const s = net.connect(p, "127.0.0.1"); s.setTimeout(500);
  s.on("connect", () => { s.destroy(); r(true); }); s.on("error", () => r(false)); s.on("timeout", () => { s.destroy(); r(false); }); });
const json = async (u, corpo) => (await fetch(u, corpo === undefined ? {} : { method: "POST", body: JSON.stringify(corpo),
  headers: { "Content-Type": "application/json", "X-MaiSim": "1" } })).json();
const ate = async (cond, s) => { const fim = Date.now() + s * 1000; while (Date.now() < fim) { if (await cond()) return true; await dorme(1000); } return false; };

const T = fs.mkdtempSync(path.join(os.tmpdir(), "maisim-fecha-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("MAISIM_")));   // sem o perfil de teste do ci.sh
Object.assign(env, { MAISIM_PORTA: String(B), MAISIM_TELA_X: ":73", MAISIM_DADOS: `${T}/d`, MAISIM_CACHE: `${T}/c`, MAISIM_NAVEGADOR: "nenhum",
  MAISIM_CLAUDE_DIR: `${T}/claude`, MAISIM_CURSOR_DIR: `${T}/cursor`, MAISIM_EXEMPLOS_GECKO: "0" });
["PAGINA", "SIMU", "SCOPE", "GECKO", "MOTOR", "TELA", "VNC"].forEach((k, i) => { env[`MAISIM_PORTA_${k}`] = String(B + i); });   // nem um .env da raiz muda
const lanca = () => { const p = spawn("python3", ["app/lancador.py", "--abrir"], { cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"] });
  p.saida = ""; p.fim = null; p.stdout.on("data", (d) => { p.saida += d; }); p.stderr.on("data", (d) => { p.saida += d; });
  p.on("exit", (c) => { p.fim = c; }); return p; };

(async () => {
  let b, l;
  try {
    for (let i = 0; i < 7; i++) if (await noAr(B + i)) throw new Error(`a porta ${B + i} já está em uso (sobra de uma vez anterior?)`);
    l = lanca();
    ok(await ate(() => /no ar em|running at/.test(l.saida) || l.fim !== null, 180) && l.fim === null, "o lançador subiu (página, simulador, scope, Gecko e motor)");
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1300, height: 850 } });
    const pg = await ctx.newPage();
    await pg.goto(URL0 + "/", { waitUntil: "load" });
    ok(await ate(async () => (await json(URL0 + "/maisim/vivo/ultimo")).abas === 1, 10), "a página inicial dá sinal de vida (uma página aberta)");
    await pg.goto(URL0 + "/maisim/simu/", { waitUntil: "load" }); await dorme(1500);
    let v = await json(URL0 + "/maisim/vivo/ultimo");
    ok(v.abas === 1 && v.fechou, `trocar de página: a anterior avisou que fechou e a do simu está aberta (abas ${v.abas})`);
    // o ícone de novo, com o MaiSim no ar
    const l2 = lanca();
    ok(await ate(() => l2.fim !== null, 20) && l2.fim === 0 && /no ar \(sem abrir|running \(browser not opened/.test(l2.saida) && l.fim === null,
      `o ícone de novo só abre a janela no MaiSim que está no ar e sai (saída ${l2.fim}); o primeiro continua`);
    // uma rodada longa, e a página fecha: uma cópia do exemplo nos circuitos de quem usa, com o controle em Python a cada Δt
    // (4,9 milhões de viagens; com a simulação rápida, o Ts de 2 µs do exemplo acabava antes dos 55 s no runner do CI); já
    // salva, porque mudar o controle pela API deixaria o circuito por salvar, e aí o lançador, de propósito, deixa o Gecko
    // no ar; a rodada é parada à mão no fim
    const ex = path.join(T, "d", "circuitos"); fs.mkdirSync(ex, { recursive: true });
    for (const f of ["exemplo_controle_pwm.ipes", "exemplo_controle_pwm.aparencia.json"]) fs.copyFileSync(path.join(RAIZ, "exemplos", f), path.join(ex, f));
    const ctl = JSON.parse(fs.readFileSync(path.join(RAIZ, "exemplos", "exemplo_controle_pwm.controle.json"), "utf8"));
    fs.writeFileSync(path.join(ex, "exemplo_controle_pwm.controle.json"), JSON.stringify({ ...ctl, Ts: 1e-7 }));
    let r = await json(URL0 + "/maisim/simu/editor/abrir", { arq: path.join(ex, "exemplo_controle_pwm.ipes"), modo: "descartar" });
    ok(!r.erro, `abre a cópia do exemplo (${r.erro || "ok"})`);
    r = await json(URL0 + "/maisim/simu/editor/rodar", { dt: "1e-07", tfim: "0.49", nome: "fecha_longa", amostras: "1000" });
    ok(await ate(async () => (await json(URL0 + "/maisim/simu/editor/rodada")).estado === "rodando", 30), `uma rodada longa em andamento (${r.estado || r.erro})`);
    // com mudança não salva, fechar a janela pergunta antes (só com o lançador vigiando: a página sabe pelo sinal de vida)
    ok(await ate(() => pg.evaluate(() => window.maisimVigiada === true), 25), "a página sabe que fechar desliga o MaiSim (vigiada)");
    await pg.evaluate(() => { ed.sujo = true; }); await pg.keyboard.press("Shift");   // (o aviso pede um gesto na página)
    let aviso = null; pg.on("dialog", (d) => { aviso = d.type(); d.accept(); });
    await pg.close({ runBeforeUnload: true }); await ate(() => aviso !== null || pg.isClosed(), 10); await dorme(500);
    ok(aviso === "beforeunload", `fechar com mudança não salva: o navegador pergunta antes (${aviso})`);
    const t0 = Date.now();
    await dorme(55000);   // além dos 45 s de prazo de uma página (e do sinal do segundo lançador)
    const rd = await json(URL0 + "/maisim/simu/editor/rodada");
    v = await json(URL0 + "/maisim/vivo/ultimo");
    ok(l.fim === null && rd.estado === "rodando" && v.abas === 0,
      `página fechada há ${Math.round((Date.now() - t0) / 1000)} s com a rodada em andamento: o MaiSim fica no ar (rodada ${rd.estado}, abas ${v.abas})`);
    await json(URL0 + "/maisim/simu/editor/parar", {});
    const t1 = Date.now();
    const saiu = await ate(() => l.fim !== null, 60);
    ok(saiu && /janela do MaiSim fechou|MaiSim window was closed/.test(l.saida), `acabada a rodada, o lançador desligou sozinho em ${Math.round((Date.now() - t1) / 1000)} s (saída ${l.fim})`);
    const livres = await ate(async () => { for (let i = 0; i < 5; i++) if (await noAr(B + i)) return false; return true; }, 20);
    ok(livres, "as portas 7300–7304 ficaram livres (página, simulador, scope, Gecko e motor)");
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally {
    if (b) await b.close();
    if (l && l.fim === null) { try { process.kill(l.pid, "SIGTERM"); } catch (e) { /* já saiu */ } await ate(() => l.fim !== null, 60); }
    if (falhas) console.log(l ? l.saida.split("\n").slice(-15).join("\n") : "");
    try { fs.rmSync(T, { recursive: true, force: true }); } catch (e) { /* ok */ }
  }
  process.exit(falhas ? 1 : 0);
})();
