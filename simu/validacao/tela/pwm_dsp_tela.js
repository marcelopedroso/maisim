// instância de teste (7201): o PWM com os registradores nos parâmetros (exemplos/exemplo_buck_pwm_interrupcao) — o campo
// do Ts fica só leitura com o valor tirado deles (2·TBPRD/f_clk = 100 µs) e o balão diz a conta; mudar o TBPRD na tabela
// muda o Ts na hora; o guardado continua o Ts digitado; em inglês, o balão
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  // carregar: a página termina de abrir e, se o editor tem algo sem salvar, pergunta antes de abrir outro (Cancelar fica)
  const carrega = async (recarga) => {
    if (recarga) await pg.reload(); else await pg.goto("http://localhost:7201/maisim/simu/");
    await pg.waitForFunction(() => typeof dados !== "undefined" && typeof api === "function", null, { timeout: 30000 });
    await pg.waitForTimeout(2500);
    for (let k = 0; k < 10 && await pg.$(".modal-fundo"); k++) { const bts = await pg.$$(".modal button"); if (bts.length) await bts[0].click(); await pg.waitForTimeout(300); }
  };
  const abrePainel = async () => {
    if (!(await pg.evaluate(() => typeof ctl !== "undefined" && ctl.carregado))) await pg.click("#bt-ctl");
    await pg.waitForFunction(() => ctl.carregado, null, { timeout: 30000 });
    await pg.evaluate(() => mostraTabela("par")); await pg.waitForSelector("#ctl-par .ctl-par", { timeout: 15000 });
  };
  await carrega(false);
  await pg.evaluate(async () => { await api("editor/abrir", { arq: "exemplos/exemplo_buck_pwm_interrupcao.ipes", modo: "descartar" });
    novoEstado(await api("editor/estado")); ajusta(); sim.par.dt = "1e-6"; sim.par.tfim = "0.01"; await recarregaControle(); });
  await abrePainel();
  const ts = () => pg.evaluate(() => ({ v: document.getElementById("ctl-ts").value, ro: document.getElementById("ctl-ts").readOnly, info: document.getElementById("ctl-ts-i").title }));
  let t = await ts();
  ok(t.ro && Math.abs(Number(t.v) - 1e-4) < 1e-12 && /2·TBPRD\/f_clk/.test(t.info) && /PWM de 10 kHz/.test(t.info) && /CTR = 0/.test(t.info),
     `Ts só leitura com o tirado dos registradores: ${t.v} s; balão "${t.info.split("\n")[1]}"`);
  // o TBPRD na tabela: 2500 → 50 µs na hora
  const tbprd = await pg.$$eval("#ctl-par .ctl-par", (rs) => rs.findIndex((r) => r.querySelector('[data-k="nome"]').value === "TBPRD"));
  const campo = `#ctl-par .ctl-par:nth-child(${tbprd + 1}) [data-k="valor"]`;
  await pg.fill(campo, "2500");
  await pg.waitForFunction(() => Math.abs(Number(document.getElementById("ctl-ts").value) - 5e-5) < 1e-12, null, { timeout: 5000 });
  ok(true, "TBPRD = 2500: o Ts vira 50 µs enquanto digita");
  await pg.press(campo, "Tab");
  await pg.waitForFunction(async () => (await api("editor/controle")).controle.parametros.some((q) => q.nome === "TBPRD" && q.valor === 2500), null, { timeout: 15000 });
  const guard = await pg.evaluate(async () => (await api("editor/controle")).controle.Ts);
  ok(Math.abs(guard - 1e-4) < 1e-12, `o guardado continua o Ts digitado (${guard} s); o que vale na rodada sai dos registradores`);
  // recarregar: o Ts tirado do TBPRD novo
  await carrega(true); await abrePainel();
  t = await ts();
  ok(t.ro && Math.abs(Number(t.v) - 5e-5) < 1e-12, `recarregada: Ts = ${t.v} s, só leitura`);
  // em inglês
  await pg.evaluate(() => { localStorage.setItem("maisim-lingua", "en"); document.cookie = "maisim-lingua=en; path=/"; });
  await carrega(true); await abrePainel();
  t = await ts();
  ok(/Ts comes from the PWM registers/.test(t.info) && /at CTR = 0/.test(t.info), `em inglês: "${t.info.split("\n")[1]}"`);
  await pg.evaluate(() => { localStorage.setItem("maisim-lingua", "pt"); document.cookie = "maisim-lingua=pt; path=/"; });
  ok(!erros.length, `sem erros na página (${erros.slice(0, 2).join(" | ")})`);
  await pg.evaluate(() => api("editor/novo", { descartar: true }));
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
