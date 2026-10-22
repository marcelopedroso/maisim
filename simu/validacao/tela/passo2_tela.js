// instância de teste (7201): abrir o exemplo pelo Abrir, painel com atraso e acionamentos, trava durante a rodada
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  await pg.goto("http://localhost:7201/maisim/simu/");
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  // abrir o exemplo pelo Abrir (com busca)
  await pg.click("#bt-modelo"); await pg.waitForSelector(".lista-abrir .op"); await pg.fill(".busca-abrir", "exemplo_controle_pi"); await pg.keyboard.press("Enter");
  await pg.waitForFunction(() => /exemplo_controle_pi/.test($("bt-modelo").textContent) && document.querySelectorAll("#svg .el").length >= 6, null, { timeout: 90000 });
  await pg.click("#bt-editar"); await pg.waitForTimeout(500); if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok");
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
  await pg.evaluate(() => { sim.par.dt = "1e-6"; sim.par.tfim = "0.04"; sim.par.nome = "exemplo_tela"; sim.par.amostras = "4000"; });
  await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(400);
  const p = await pg.evaluate(() => ({ ativo: $("ctl-ativo").checked, atraso: $("ctl-atraso").value, info: (($("ctl-atraso-i").getAttribute("title") || $("ctl-atraso-i").dataset.dica || "") + "\n" + $("ctl-atraso-info").innerText),
    acs: [...document.querySelectorAll("#ctl-ac .ctl-ac")].map((r) => `${r.querySelector('[data-k="t"]').value} ${r.querySelector('[data-k="alvo"]').value} ${r.querySelector('[data-k="valor"]').value}`),
    alvos: [...document.querySelectorAll('#ctl-ac .ctl-ac:first-child [data-k="alvo"] option')].map((o) => o.value), linha1: codigoAtual().split("\n")[0] }));
  ok(p.ativo && p.atraso === "amostra" && /100 × Δt/.test(p.info), `exemplo aberto com o controle: atraso "${p.atraso}" · ${p.info}`);
  ok(p.acs.join(" | ") === "0.012 p:i_ref 8 | 0.022 CONST:v_dist 20", `acionamentos: ${p.acs.join(" | ")} · alvos possíveis: ${p.alvos.join(", ")}`);
  ok(/Exemplo do MaiSim/.test(p.linha1), `código do exemplo no editor: ${p.linha1}`);
  // adicionar e tirar um acionamento; latência mostra o campo
  await pg.evaluate(() => mostraTabela("ac")); await pg.waitForTimeout(300);     // os acionamentos ficam numa tabela, numa aba (19/10)
  await pg.click("#ctl-ac-novo"); await pg.waitForTimeout(700);
  ok(await pg.$$eval("#ctl-ac .ctl-ac", (r) => r.length) === 3, "+ acionamento: 3 linhas");
  await pg.click("#ctl-ac .ctl-ac:last-child [data-rm-ac]"); await pg.waitForTimeout(900);
  const depois = await pg.evaluate(() => api("editor/controle"));
  ok(depois.controle.acionamentos.length === 2, `× tira e o servidor guarda: ${depois.controle.acionamentos.length} acionamentos`);
  await pg.selectOption("#ctl-atraso", "tempo"); await pg.fill("#ctl-atraso-t", "3e-5"); await pg.press("#ctl-atraso-t", "Tab"); await pg.waitForTimeout(900);
  const lat = await pg.evaluate(() => [$("ctl-atraso-tempo").style.display, (($("ctl-atraso-i").getAttribute("title") || $("ctl-atraso-i").dataset.dica || "") + "\n" + $("ctl-atraso-info").innerText)]);
  const srv = (await pg.evaluate(() => api("editor/controle"))).controle.atraso;
  ok(lat[0] === "" && /30 × Δt/.test(lat[1]) && srv.modo === "tempo" && Math.abs(srv.tempo - 3e-5) < 1e-12, `latência: ${lat[1]} · guardado ${JSON.stringify(srv)}`);
  await pg.selectOption("#ctl-atraso", "amostra"); await pg.waitForTimeout(900);
  // ▶: durante a rodada, o painel e o editor ficam travados; no fim, destravam
  await pg.click("#bt-play");
  await pg.waitForFunction(() => sim.estado === "rodando", null, { timeout: 20000 });
  const trava = await pg.evaluate(() => ({ corpo: document.body.classList.contains("sim-rodando"), aviso: $("ctl-trava").style.display !== "none",
    leitura: ctl.editor.getOption(monaco.editor.EditorOption.readOnly) }));
  ok(trava.corpo && trava.aviso && trava.leitura, `rodando: painel travado, aviso visível, editor só leitura (${JSON.stringify(trava)})`);
  await pg.screenshot({ path: "passo2_rodando.png" });
  await pg.waitForFunction(() => sim.estado === "fim" || sim.estado === "erro", null, { timeout: 120000 });
  const fim = await pg.evaluate(() => ({ estado: sim.estado, corpo: document.body.classList.contains("sim-rodando"), leitura: ctl.editor.getOption(monaco.editor.EditorOption.readOnly) }));
  ok(fim.estado === "fim" && !fim.corpo && !fim.leitura, `fim: destravado (${JSON.stringify(fim)})`);
  // ⏹ no meio também destrava — numa rodada longa (1 s), para o ⏹ chegar com ela rodando (a de 40 ms acabava antes do
  // clique numa máquina mais rápida, como a do GitHub Actions, e o estado ficava "fim", não "parada")
  await pg.evaluate(() => { sim.par.tfim = "1"; });
  await pg.click("#bt-play"); await pg.waitForFunction(() => sim.estado === "rodando", null, { timeout: 20000 }); await pg.waitForTimeout(300);
  // o diodo animado do MaiSim ao lado da barrinha enquanto simula (Marcelo, 22/10); pausada, ele para
  const anima = () => pg.evaluate(() => { const d = document.querySelector("#progresso.ativo .sim-diodo .diodo-ia .dia-fluxo"); return d ? getComputedStyle(d).animationPlayState.split(",")[0] : "sem diodo"; });
  const dRoda = await anima();
  await pg.click("#bt-pausa"); await pg.waitForFunction(() => sim.estado === "pausada", null, { timeout: 20000 }); await pg.waitForTimeout(300);
  const dPausa = await anima();
  // simulando (pausada também), a ⚙ abre só para ver (Marcelo, 22/10): os parâmetros e as variáveis travados, copiar o nome continua
  await pg.click("#bt-param"); await pg.waitForSelector(".modal .m-abas, .modal input[name='dt']");
  const travaP = await pg.evaluate(() => { const m = document.querySelector(".modal"), ins = [...m.querySelectorAll("input")];
    return { aviso: !!m.querySelector(".m-trava"), ins: ins.length, livres: ins.filter((x) => !x.disabled).map((x) => x.name || x.id || x.dataset.g),
      copia: [...m.querySelectorAll("[data-copia]")].every((b) => !b.disabled), outros: [...m.querySelectorAll(".gv button:not([data-copia]), #gv-cria")].every((b) => b.disabled),
      ok: m.querySelector(".m-ok").textContent, cancela: !!m.querySelector(".m-cancela") }; });
  await pg.click(".modal .m-ok"); await pg.waitForTimeout(200);
  ok(travaP.aviso && travaP.ins > 0 && !travaP.livres.length && travaP.copia && travaP.outros && travaP.ok === "fechar" && !travaP.cancela,
    `simulando, a ⚙ só mostra: aviso, ${travaP.ins} campos travados${travaP.livres.length ? ` (livres: ${travaP.livres})` : ""}, criar/apagar travados, copiar o nome ativo, "fechar"`);
  await pg.click("#bt-play"); await pg.waitForFunction(() => sim.estado === "rodando", null, { timeout: 20000 }); await pg.waitForTimeout(300);
  const dVolta = await anima();
  ok(dRoda === "running" && dPausa === "paused" && dVolta === "running", `o diodo animado na barrinha: rodando ${dRoda}, pausada ${dPausa}, continuando ${dVolta}`);
  await pg.click("#bt-parar"); await pg.waitForFunction(() => sim.estado === "parada", null, { timeout: 60000 });
  ok(await pg.evaluate(() => !document.body.classList.contains("sim-rodando") && !ctl.editor.getOption(monaco.editor.EditorOption.readOnly)), "⏹ no meio: destravado");
  await pg.click("#bt-param"); await pg.waitForSelector(".modal input[name='dt']");
  const livre = await pg.evaluate(() => { const m = document.querySelector(".modal"); return { aviso: !!m.querySelector(".m-trava"), presos: [...m.querySelectorAll("input")].filter((x) => x.disabled).length, ok: m.querySelector(".m-ok").textContent }; });
  await pg.click(".modal .m-cancela"); await pg.waitForTimeout(200);
  ok(!livre.aviso && !livre.presos && livre.ok === "guardar", `parada, a ⚙ volta a editar (sem aviso, nenhum campo travado, "${livre.ok}")`);
  const c1 = await pg.evaluate(async () => [await api("editor/params?nome=CONST.1"), await api("editor/params?nome=CONST.2")].map((l) => l[0].valor));
  ok(c1.join() === "0,0", `depois de parar no meio, os CONST voltaram: ${c1}`);
  await pg.screenshot({ path: "passo2_painel.png" });
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
