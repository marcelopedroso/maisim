// os módulos em C pela tela (instância de teste 7200 → 7201), pedido de Marcelo em 06/11 ("é de praxe usar include em C?
// vale ter árvore e reaproveitar código"): na visão C, a coluna "Arquivos" conta só os do C; a árvore segue os #include
// (controle.c → pwm.c → pwm.h), sem "virar controlador" e sem o × do controle.c; "+ Arquivo" cria o par nome.h/nome.c
// (recusa maisim_… e controle); apagar um .c pela lista; na visão Python, nada do C na árvore
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const PWM_H = '#ifndef PWM_H\n#define PWM_H\n#include "maisim_controle.h"\nmaisim_real pwm_compara(maisim_real portadora, maisim_real d);\n#endif\n';
const PWM_C = '#include "pwm.h"\nmaisim_real pwm_compara(maisim_real portadora, maisim_real d) { return portadora < d ? 1.0 : 0.0; }\n';
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    // o circuito novo (controle.py, leitura.py, escrita.py) com o C: controle.c (o modelo + #include "pwm.h") e o par pwm.h/pwm.c
    await pg.evaluate(async ([h, c]) => {
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      const cfg = (await api("editor/controle")).controle, modelo = (await api("editor/controle")).modelo_c;
      cfg.c = { ...cfg.c, usar: true, arquivos: { "controle.c": modelo.replace('#include "maisim_controle.h"', '#include "maisim_controle.h"\n#include "pwm.h"'), "pwm.h": h, "pwm.c": c } };
      await api("editor/controle", { controle: cfg });
      await recarregaControle(); mostraDoca("controle");
    }, [PWM_H, PWM_C]);
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    await pg.click('#ctl-vistas [data-vista="arq"]'); await pg.waitForTimeout(600);
    const arv = () => pg.evaluate(() => [...document.querySelectorAll("#ctl-ctls .ctl-no")].map((x) => {
      let n = 0; for (let p = x.parentElement; p; p = p.parentElement) if (p.classList && p.classList.contains("ctl-ramo")) n++;
      return { a: x.dataset.abre, n, liga: !!x.querySelector("[data-liga]"), fecha: !!x.querySelector("[data-fecha]"), solto: !!x.closest(".ctl-soltos"), t: x.title };
    }));
    const nArq = () => pg.evaluate(() => $("ctl-n-arq").textContent);
    // 1. a visão C: a árvore pelos #include e o número dos arquivos do C
    let a = await arv();
    const no = (n) => a.find((x) => x.a === n) || {};
    ok(a.map((x) => x.a).join(",") === "controle.c,pwm.c,pwm.h" && no("controle.c").n === 0 && no("pwm.c").n === 1 && no("pwm.h").n === 2,
      `visão C: controle.c → pwm.c → pwm.h (${a.map((x) => `${x.a}@${x.n}`).join(" ")})`);
    ok(!a.some((x) => x.liga) && !no("controle.c").fecha && no("pwm.c").fecha && /#include "pwm\.h"/.test(no("pwm.c").t),
      `sem "virar controlador" no C, sem o × do controle.c; a dica do módulo: "${no("pwm.c").t}"`);
    ok(await nArq() === "3", `"Arquivos" conta só os do C: ${await nArq()}`);
    // 2. a visão Python: nada do C
    await pg.evaluate(() => poeVisao(false)); await pg.waitForTimeout(800);
    a = await arv();
    ok(a.length === 3 && !a.some((x) => /\.[ch]$/.test(x.a)) && await nArq() === "3", `visão Python: ${a.map((x) => x.a).join(", ")} · ${await nArq()}`);
    await pg.evaluate(() => poeVisao(true)); await pg.waitForTimeout(800);
    // 3. "+ Arquivo" na visão C: o par filtro.h/filtro.c (sem #include ainda: fica em "sem uso")
    await pg.click("#ctl-arq-novo2"); await pg.waitForSelector(".modal input[name=nome]");
    ok(await pg.inputValue(".modal input[name=nome]") === "modulo1" && /#include/.test(await pg.textContent(".modal")), "a janela do módulo em C (o nome sem extensão; o texto do #include)");
    await pg.fill(".modal input[name=nome]", "filtro"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1800);
    const srv = await pg.evaluate(async () => Object.keys((await api("editor/controle")).controle.c.arquivos).sort());
    const fh = await pg.evaluate(() => textoDe("filtro.h")), fc = await pg.evaluate(() => textoDe("filtro.c"));
    ok(srv.join(",") === "controle.c,filtro.c,filtro.h,pwm.c,pwm.h" && await pg.evaluate(() => ctl.arq) === "filtro.c" && await nArq() === "5",
      `"+ Arquivo" cria filtro.h e filtro.c, guardados, e abre o .c: ${srv.join(", ")} · ${await nArq()}`);
    ok(/#ifndef FILTRO_H/.test(fh) && /filtro_passo\(maisim_real x\);/.test(fh) && /#include "filtro\.h"/.test(fc), "os modelos: o .h com a guarda e a declaração; o .c com o #include");
    a = await arv();
    ok(a.filter((x) => x.solto).map((x) => x.a).sort().join(",") === "filtro.c,filtro.h", `sem #include ainda, o par fica em "sem uso": ${a.filter((x) => x.solto).map((x) => x.a).join(", ")}`);
    // 4. nomes recusados
    for (const nome of ["maisim_x", "controle", "2x", "pwm", "PWM"]) {
      await pg.click("#ctl-arq-novo2"); await pg.waitForSelector(".modal input[name=nome]");
      await pg.fill(".modal input[name=nome]", nome); await pg.click(".modal .m-ok"); await pg.waitForTimeout(500);
    }
    ok((await pg.evaluate(async () => Object.keys((await api("editor/controle")).controle.c.arquivos).length)) === 5, "maisim_x, controle, 2x, pwm (já existe) e PWM (só muda a maiúscula: a guarda PWM_H seria a mesma) recusados");
    // 5. apagar o filtro.c pela lista (o × pede confirmação); o arquivo aberto volta ao controle.c
    await pg.click('#ctl-ctls [data-fecha="filtro.c"]'); await pg.waitForSelector(".modal .m-ok"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1800);
    const depois = await pg.evaluate(async () => Object.keys((await api("editor/controle")).controle.c.arquivos).sort());
    ok(depois.join(",") === "controle.c,filtro.h,pwm.c,pwm.h" && await pg.evaluate(() => ctl.arq) === "controle.c", `apagar o filtro.c: ${depois.join(", ")} · aberto: ${await pg.evaluate(() => ctl.arq)}`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message); }
  if (b) await b.close();
  process.exit(falhas ? 1 : 0);
})();
