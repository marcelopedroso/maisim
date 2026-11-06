// a biblioteca de controle no "+ Arquivo" (instância de teste 7200 → 7201), pedido de Marcelo em 06/11 ("pwm.py e pwm.c, pi.py
// e pi.c… ter ali e usar ou não"): a janela mostra Vazio e os 5 módulos; escolher um põe o nome dele (só leitura); na visão
// Python, o PLL cria o pll.py e o pi.py que ele importa (e abre o pll.py, com o uso no comentário); na visão C, o PWM cria o
// pwm.h e o pwm.c (abre o pwm.h); de novo o PWM: "já existe"; o Vazio continua criando o módulo com o nome digitado
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 }, locale: "pt-BR" })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async () => { const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j); await recarregaControle(); mostraDoca("controle"); });
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    await pg.click('#ctl-vistas [data-vista="arq"]'); await pg.waitForTimeout(400);
    const srv = () => pg.evaluate(async () => { const c = (await api("editor/controle")).controle; return { py: Object.keys(c.arquivos).sort(), c: Object.keys(c.c.arquivos).sort() }; });
    const escolhe = async (bib) => {
      await pg.click("#ctl-arq-novo2"); await pg.waitForSelector(".modal .ctl-bib");
      if (bib) await pg.check(`.modal input[name=bib][value="${bib}"]`);
      const campo = await pg.evaluate(() => { const c = document.querySelector(".modal input[name=nome]"); return { v: c.value, ro: c.readOnly }; });
      await pg.click(".modal .m-ok"); await pg.waitForTimeout(1800);
      return campo;
    };
    // 1. a janela: o Vazio marcado e os 5 da biblioteca
    await pg.click("#ctl-arq-novo2"); await pg.waitForSelector(".modal .ctl-bib");
    const ops = await pg.evaluate(() => [...document.querySelectorAll(".modal input[name=bib]")].map((x) => `${x.value || "vazio"}${x.checked ? "*" : ""}`));
    ok(ops.join(",") === "vazio*,pi,pwm,passa_baixa,rampa,pll", `a janela: ${ops.join(", ")}`);
    await pg.click(".modal .m-cancela"); await pg.waitForTimeout(300);
    // 2. visão Python: o PLL traz o pi.py que ele importa
    let campo = await escolhe("pll"), s = await srv();
    const pll = await pg.evaluate(() => textoDe("pll.py"));
    ok(campo.v === "pll.py" && campo.ro, `o nome do módulo da biblioteca: "${campo.v}" (só leitura: ${campo.ro})`);
    ok(s.py.includes("pll.py") && s.py.includes("pi.py") && await pg.evaluate(() => ctl.arq) === "pll.py" && /biblioteca do MaiSim/.test(pll) && /import pi/.test(pll),
      `visão Python, PLL: ${s.py.join(", ")} · aberto: ${await pg.evaluate(() => ctl.arq)}`);
    ok(/pll\.py e pi\.py|pi\.py e pll\.py/.test(await pg.textContent("#ctl-estado")), `o aviso: "${await pg.textContent("#ctl-estado")}"`);
    // 3. o Vazio continua: o nome digitado
    await pg.click("#ctl-arq-novo2"); await pg.waitForSelector(".modal .ctl-bib");
    await pg.check('.modal input[name=bib][value="pwm"]'); await pg.check('.modal input[name=bib][value=""]');
    const volta = await pg.evaluate(() => { const c = document.querySelector(".modal input[name=nome]"); return { v: c.value, ro: c.readOnly }; });
    await pg.fill(".modal input[name=nome]", "meu_modulo"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1800);
    s = await srv();
    ok(/^modulo\d+\.py$/.test(volta.v) && !volta.ro && s.py.includes("meu_modulo.py") && !s.py.includes("pwm.py"), `Vazio de novo: o nome volta ("${volta.v}") e cria o meu_modulo.py`);
    // 4. visão C: o PWM, o par .h/.c (abre o .h, com o uso)
    await pg.evaluate(() => poeVisao(true)); await pg.waitForTimeout(800);
    campo = await escolhe("pwm"); s = await srv();
    ok(campo.v === "pwm" && s.c.includes("pwm.h") && s.c.includes("pwm.c") && await pg.evaluate(() => ctl.arq) === "pwm.h" && /PwmEstado/.test(await pg.evaluate(() => textoDe("pwm.h"))),
      `visão C, PWM: ${s.c.join(", ")} · aberto: ${await pg.evaluate(() => ctl.arq)}`);
    // 5. de novo o PWM: já existe, nada muda
    await escolhe("pwm");
    ok((await srv()).c.length === s.c.length && /pwm\.h/.test(await pg.textContent("#ctl-estado")), `PWM de novo: "${await pg.textContent("#ctl-estado")}"`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message); }
  if (b) await b.close();
  process.exit(falhas ? 1 : 0);
})();
