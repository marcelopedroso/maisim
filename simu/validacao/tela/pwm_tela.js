// instância de teste (7201): o exemplo do buck com PWM no controle.py — Δt do arquivo, destino das atuações, Ts × Δt, GATE
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  await pg.goto("http://localhost:7201/maisim/simu/");
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.evaluate(() => { sim.par.dt = "5e-5"; sim.par.tfim = "0.04"; sim.par.nome = "pwm_tela"; sim.par.amostras = "100000"; });   // o que "sobrou" de outro modelo
  await pg.click("#bt-modelo"); await pg.waitForSelector(".lista-abrir .op"); await pg.fill(".busca-abrir", "exemplo_controle_pwm"); await pg.keyboard.press("Enter");
  await pg.waitForFunction(() => /exemplo_controle_pwm/.test($("bt-modelo").textContent) && document.querySelectorAll("#svg .el").length >= 10, null, { timeout: 90000 });
  await pg.click("#bt-editar"); await pg.waitForTimeout(500); if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok");
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 }); await pg.waitForTimeout(300);
  const a = await pg.evaluate(() => ({ dt: sim.par.dt, tfim: sim.par.tfim, msg: $("msg").textContent }));
  ok(Number(a.dt) === 1e-6 && Number(a.tfim) === 0.01 && /Δt = 1 µs/.test(a.msg), `ao abrir, Δt e tempo final vêm do arquivo: dt ${a.dt}, tfim ${a.tfim} · "${a.msg}"`);
  await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(400);
  const p = await pg.evaluate(() => ({ atu: [...document.querySelectorAll("#ctl-atu .ctl-item")].map((x) => x.textContent.replace(/\s+/g, " ").trim()),
    ts: (($("ctl-ts-i").getAttribute("title") || $("ctl-ts-i").dataset.dica || "") + "\n" + $("ctl-ts-info").innerText), at: (($("ctl-atraso-i").getAttribute("title") || $("ctl-atraso-i").dataset.dica || "") + "\n" + $("ctl-atraso-info").innerText), alertas: document.querySelectorAll("#ctl-lado .ctl-alerta, .ctl-lado .ctl-alerta, .ctl-alerta").length }));
  ok(p.atu.length === 1 && /g\s*CONST\.1 → chave S\.1/.test(p.atu[0]), `atuação e aonde ela chega: ${p.atu.join(" | ")}`);
  ok(/= 2 × Δt de 1 µs · efetivo 2 µs/.test(p.ts) && /passo\(\) roda 5\.000 vezes em 10 ms/.test(p.ts), `Ts × Δt: ${p.ts.replace(/\n/g, " / ")}`);
  ok(/t \+ 1 × Δt = t \+ 1 µs/.test(p.at) && p.alertas === 0, `atraso: ${p.at.replace(/\n/g, " / ")} · alertas ${p.alertas}`);
  // Ts que não é múltiplo de Δt: aviso na hora (e volta)
  await pg.fill("#ctl-ts", "2.5e-6"); await pg.waitForTimeout(200);
  const nm = await pg.evaluate(() => $("ctl-ts-info").innerText);   // alerta: continua à vista
  ok(/não é múltiplo de Δt: o controle roda com 3 × Δt = 3 µs/.test(nm), `Ts = 2,5 µs: ${nm.replace(/\n/g, " / ")}`);
  await pg.fill("#ctl-ts", "2e-6"); await pg.press("#ctl-ts", "Tab"); await pg.waitForTimeout(900);
  ok((await pg.evaluate(() => api("editor/controle"))).controle.Ts === 2e-6, "Ts de volta a 2 µs (guardado)");
  // GATE: a chave que ele comanda, nas propriedades e no desenho
  await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "GATE.1"))); await pg.waitForTimeout(400);
  const g = await pg.evaluate(() => ({ chave: $("m-chave") && $("m-chave").value, aviso: $("m-chave") ? $("m-chave").closest("label").nextElementSibling.textContent : "",
    rot: [...document.querySelectorAll("#svg text")].map((t) => t.textContent).filter((t) => t === "→ S.1").length }));
  ok(g.chave === "S.1" && /> 0,5 liga/.test(g.aviso) && g.rot === 1, `GATE.1: comanda ${g.chave} · "${g.aviso}" · etiqueta no desenho ${g.rot}`);
  await pg.evaluate(() => { seleciona(null); ajusta(); }); await pg.waitForTimeout(300);
  await pg.screenshot({ path: "pwm_circuito.png" });
  // ▶ com o Δt do arquivo
  await pg.click("#bt-play");
  await pg.waitForFunction(() => sim.estado === "rodando", null, { timeout: 20000 });
  await pg.waitForFunction(() => sim.estado === "fim" || sim.estado === "erro", null, { timeout: 180000 });
  const r = await pg.evaluate(() => api("editor/rodada"));
  ok(r.estado === "fim" && r.dt === 1e-6 && r.tfim === 0.01 && !(r.avisos || []).length, `rodada: ${r.estado}, Δt ${r.dt}, tfim ${r.tfim}, ${r.amostras} amostras em ${r.segundos} s, avisos ${JSON.stringify(r.avisos)}`);
  await pg.screenshot({ path: "pwm_painel.png" });
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
