// os sinais digitais no scope (Marcelo, 27/10: "a turma vai encher o saco"), na instância de teste (simu 7201 → scope 7202):
// o buck do exemplo em malha fechada (um PI em Python no ciclo de trabalho, Ts = 100 µs; o PWM de 20 kHz no Gecko).
//  - com a amostra pedida de 2 µs, o simu grava dentro do Ts (patch 0011) e o gate g sai com os pulsos de 20 kHz; o scope o
//    desenha em degrau (o valor mantido até a amostra seguinte), e o v_o (analógico) com reta; sem aviso;
//  - com a amostra de 100 µs (o caminho antigo: só no instante do Ts), o g não acompanha o chaveamento e o painel avisa,
//    discreto, embaixo do gráfico: "amostrado a cada 100 µs; g chaveia mais rápido que isso — diminua o intervalo de amostra";
//  - as regras nos números (as funções do scope): só 0/1 é digital; chaveia demais com mais de 40% de trocas, ou trocando
//    com a amostra mais longa que meio período da fonte de sinal mais rápida do circuito (meta.f_sinais).
// A foto: scope_digital_g.png (os pulsos do g, a portadora e o d entre 10 e 10,4 ms)
const { chromium } = require("playwright");
const path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const SIMU = "http://localhost:7201/maisim/simu/", SCOPE = "http://localhost:7202/maisim/scope/";
const api = async (rota, corpo) => (await fetch(SIMU + rota, corpo === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
const PI = "def iniciar(p, e):\n    e['i'] = 0.0\n\n\ndef passo(t, m, p, e):\n    erro = 24.0 - m['v_o']\n    e['i'] += erro * p['Ts']\n" +
           "    d = min(0.95, max(0.05, 0.02 * erro + 20.0 * e['i']))\n    return {'d': d}\n";
const roda = async (nome, amostras, laco) => {
  await api("editor/abrir", { arq: "exemplos/exemplo_buck.ipes", modo: "descartar" });
  await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: ["d"], codigo: PI, parametros: [], atraso: { modo: "logo", tempo: 0 }, acionamentos: [] } });
  let r = await api("editor/rodar", { dt: "5e-07", tfim: "0.02", nome, amostras, laco });
  for (let k = 0; k < 600 && ["preparando", "rodando", "pausada"].includes(r.estado); k++) { await new Promise((s) => setTimeout(s, 200)); r = await api("editor/rodada"); }
  return r;
};
(async () => {
  let b;
  try {
    const fino = await roda("digital_fino", "10000", "novo"), grosso = await roda("digital_grosso", "200", "antigo");
    ok(fino.estado === "fim" && fino.amostra_dentro_ts === 2e-6 && grosso.estado === "fim" && !grosso.amostra_dentro_ts,
       `as rodadas: a cada 2 µs dentro do Ts de 100 µs (${fino.estado}, ${fino.amostras} amostras) e só no instante do Ts (${grosso.estado}, ${grosso.amostras})`);
    const lst = await (await fetch(SCOPE + "rodadas")).json();
    const acha = (r) => lst.find((x) => x.arq.includes(path.basename(path.dirname(r.arquivo || "x/x"))) && x.arq.endsWith(".npz"));
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: "pt-BR" });
    const pg = await ctx.newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    const abre = async (r) => { await pg.goto(SCOPE + "?a=" + encodeURIComponent(acha(r).arq));
      await pg.waitForFunction(() => typeof A !== "undefined" && A && A.dados && A.dados.t && itens.length && paineis().some((p) => p.u), null, { timeout: 30000 });
      await pg.waitForTimeout(500); };
    const painel = () => pg.evaluate(() => { const p = paineis().find((q) => q.sinais.includes("g")), a = p.el.querySelector(".aviso-amostra");
      return { degrau: Object.fromEntries(p.series.map((s) => [s.canal, s.degrau])), aviso: a ? a.textContent : null }; });
    // 1. a amostra de 2 µs: os pulsos, em degrau
    await abre(fino);
    let P = await painel();
    const pulsos = await pg.evaluate(() => { const g = A.dados.g; let n = 0; for (let k = 1; k < g.length; k++) if (g[k] !== g[k - 1]) n++; return n; });
    ok(P.degrau.g === true && P.degrau.v_o === false && P.degrau.portadora === false && !P.aviso,
       `amostra de 2 µs: o g (só 0 e 1) em degrau, o v_o e a portadora com reta; sem aviso (${JSON.stringify(P.degrau)})`);
    ok(pulsos > 700, `o g com ${pulsos} trocas em 20 ms: os pulsos do PWM de 20 kHz (≈ 800)`);
    await pg.evaluate(() => { const p = paineis().find((q) => q.sinais.includes("g")); p.sinais = ["g", "portadora", "d"]; refazGrafico(p); });
    await pg.waitForTimeout(300);
    await pg.evaluate(() => { const p = paineis().find((q) => q.sinais.includes("g")); p.u.setScale("x", { min: 10.0, max: 10.4 }); });
    await pg.waitForTimeout(300); await pg.mouse.move(0, 0);
    await pg.locator(".cartao").first().screenshot({ path: path.join(__dirname, "scope_digital_g.png") });
    // 2. a amostra de 100 µs: o aviso
    await abre(grosso);
    P = await painel();
    ok(P.degrau.g === true && P.aviso === "amostrado a cada 100 µs; g chaveia mais rápido que isso — diminua o intervalo de amostra",
       `amostra de 100 µs: o aviso embaixo do gráfico ("${P.aviso}")`);
    // 2b. comparando: a A fina e a B de 100 µs — o aviso só para a B, com o nome dela (Codex, #162)
    await pg.goto(SCOPE + "?a=" + encodeURIComponent(acha(fino).arq) + "&b=" + encodeURIComponent(acha(grosso).arq));
    await pg.waitForFunction(() => typeof A !== "undefined" && A && B && B.dados && itens.length && paineis().some((p) => p.u), null, { timeout: 30000 });
    await pg.waitForTimeout(500);
    P = await painel();
    ok(P.aviso === "B: amostrado a cada 100 µs; g chaveia mais rápido que isso — diminua o intervalo de amostra",
       `comparando A (2 µs) com B (100 µs): o aviso só da B ("${P.aviso}")`);
    // 3. as regras nos números
    const R = await pg.evaluate(() => {
      const F = (x, meta, dt) => ({ dados: { t: x.map((_, k) => k * (dt || 1e-6)), x }, meta: meta || {}, cache: {} });
      const alterna = Array.from({ length: 100 }, (_, k) => k % 2), lento = Array.from({ length: 100 }, (_, k) => (Math.floor(k / 10) % 2));
      return {
        digital: digital(F(alterna), "x"), analogico: digital(F(alterna.map((v) => v * 0.5)), "x"), zeros: digital(F(alterna.map(() => 0)), "x"),
        comNaN: digital(F([NaN, 0, 1, NaN, 1]), "x"),
        rapido: chaveiaDemais(F(alterna), "x"), lentoSemF: chaveiaDemais(F(lento), "x"),
        lentoComF: chaveiaDemais(F(lento, { Ts: 1e-4, f_sinais: 20000 }), "x"), lentoComFFino: chaveiaDemais(F(lento, { Ts: 2e-6, f_sinais: 20000 }), "x"),
      };
    });
    ok(R.digital && !R.analogico && !R.zeros && R.comNaN, `digital: só 0 e 1 (com algum 1; NaN ignorado) ${JSON.stringify({ d: R.digital, a: R.analogico, z: R.zeros, n: R.comNaN })}`);
    ok(R.rapido && !R.lentoSemF && R.lentoComF && !R.lentoComFFino,
       `chaveia demais: trocando a toda amostra; ou trocando com a amostra de 100 µs e a portadora de 20 kHz (não com 2 µs, nem sem fonte de sinal) ${JSON.stringify(R)}`);
    ok(!erros.length, `sem erros na página (${erros.join(" | ")})`);
  } catch (e) { ok(false, "exceção: " + (e.stack || e)); }
  finally { if (b) await b.close(); }
  console.log(falhas ? `${falhas} FALHA(S)` : "tudo OK");
  process.exit(falhas ? 1 : 0);
})();
