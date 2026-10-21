// painel novo no scope em "só a rodada" (instância isolada: Vite 7210 → scope de teste 7211; ../sobe_fila.sh): o caso de
// Marcelo (19/10) — "+ Painel", marcar o 1º sinal: o painel sumia até a próxima mudança no layout (guardar o layout antes
// de montar o gráfico o tratava como painel do MMC). Uma gravação pequena só para o ensaio (o scope só lê scope_*.npz
// dentro de simu/), apagada no fim. Também: o "+ Painel" do topo vai para a seção da rodada; os painéis do MMC continuam fora
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const SM = path.resolve(__dirname, "../../.."), PASTA = path.join(__dirname, "..", "tmp_scope_painel"), ARQ = path.join(PASTA, "scope_painel_teste.npz");
(async () => {
  let b;
  try {
    fs.mkdirSync(PASTA, { recursive: true });
    execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.06, 1e-4); w = 2 * np.pi * 50
meta = {"planta": "gecko-maisim", "rotulo": "painel_teste", "dt": 1e-4, "Ts": 1e-4, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.06,
        "sinais": [{"canal": "Va", "elemento": "VOLT.1"}, {"canal": "Vb", "elemento": "VOLT.2"}], "acionamentos": []}
np.savez(${JSON.stringify(ARQ)}, meta=np.array(json.dumps(meta)), t=t, Va=180*np.cos(w*t), Vb=180*np.cos(w*t - 2*np.pi/3), theta=(w*t) % (2*np.pi))`]);
    const rel = path.relative(SM, ARQ);
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto("http://localhost:7210/maisim/scope/?so=rodada&a=" + encodeURIComponent(rel));
    await pg.waitForFunction(() => [...document.querySelectorAll(".cartao")].some((c) => c._painel && c._painel.u), null, { timeout: 30000 });
    const novos = () => pg.evaluate(() => [...document.querySelectorAll(".cartao")].filter((c) => c._painel.titulo === "Novo painel")
      .map((c) => ({ visivel: !c.classList.contains("oculto") && c.clientWidth > 0, grafico: c._painel.u ? Math.round(c._painel.u.width) : 0, sinais: c._painel.sinais.join() })));
    const marca = async (canal) => {                    // o último painel novo: Sinais ▾ e marca o sinal
      await pg.evaluate(() => [...document.querySelectorAll(".cartao")].filter((c) => c._painel.titulo === "Novo painel").pop().querySelector(".b-sinais").click());
      await pg.click(`.menu input[type=checkbox][data-c="${canal}"]`); await pg.waitForTimeout(600); await pg.keyboard.press("Escape"); await pg.mouse.click(5, 5);
    };
    // 1. o "+ Painel" da seção da rodada; marcar theta
    await pg.evaluate(() => { const r = [...document.querySelectorAll(".cartao")].find((c) => c._painel.u); let s = r.previousElementSibling;
      while (s && !s.classList.contains("secao")) s = s.previousElementSibling; s.querySelector(".b-mais").click(); });
    await pg.waitForTimeout(500);
    let n = await novos();
    ok(n.length === 1 && n[0].visivel && !n[0].grafico, `+ Painel na seção da rodada: o painel novo aparece, vazio (${JSON.stringify(n)})`);
    await marca("theta");
    n = await novos();
    ok(n[0].visivel && n[0].grafico > 400 && n[0].sinais === "theta", `marcado theta: o painel continua à vista, com o gráfico de ${n[0].grafico} px (antes sumia)`);
    // 2. o "+ Painel" do topo: no fim da seção da rodada, à vista; marcar Vb
    await pg.click("#bt-painel"); await pg.waitForTimeout(500);
    n = await novos();
    ok(n.length === 2 && n[1].visivel, `+ Painel do topo: o painel novo vai para a seção da rodada, à vista (${JSON.stringify(n[1])})`);
    await marca("Vb");
    n = await novos();
    ok(n.every((x) => x.visivel && x.grafico > 400), `marcado Vb: os dois painéis novos à vista, com gráfico (${n.map((x) => x.grafico).join(", ")} px)`);
    // 3. os painéis do MMC (sinais que não existem nesta rodada) continuam fora
    const mmc = await pg.evaluate(() => [...document.querySelectorAll(".cartao")].filter((c) => c._painel.titulo === "V_dc").map((c) => !c.classList.contains("oculto")));
    ok(mmc.length === 1 && !mmc[0], "o painel V_dc (do MMC, sem sinal nesta rodada) continua escondido");
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
