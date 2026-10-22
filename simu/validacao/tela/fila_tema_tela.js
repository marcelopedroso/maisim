// página inicial e scope (instância isolada: Vite 7210 → scope 7211; subir com validacao/sobe_fila.sh):
// 1) a página inicial com o trilho e os cartões; 2) a página segue o tema do trilho (e sem localStorage, o do sistema); 3) o scope fecha a conexão ao vivo com a
// aba escondida e reconecta ao voltar (na mesma rodada, sem refazer os painéis); 4) com 6 abas do scope escondidas, a
// página inicial carrega (antes ficava na fila do navegador: 6 conexões por endereço)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const B = "http://localhost:7210", SCOPE = "http://localhost:7211";
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const conexoes = () => Number(execSync(`ss -tn state established "( sport = :7211 )" | tail -n +2 | wc -l`).toString().trim());
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const publica = (obj) => fetch(SCOPE + "/maisim/scope/publicar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) }).then((r) => r.status);
const esconde = (pg, sim) => pg.evaluate((h) => {         // a aba vai para o segundo plano (ou volta)
  Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
}, sim);
(async () => {
  for (const u of [B + "/", SCOPE + "/maisim/scope/"]) { try { await fetch(u); } catch (e) { console.log(`FALHA fora do ar: ${u} (validacao/sobe_fila.sh)`); process.exit(1); } }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 800 }, colorScheme: "light" });
  const erros = []; ctx.on("page", (p) => p.on("pageerror", (e) => erros.push(`${p.url()}: ${e.message}`)));
  // 1) a página inicial (estática): um trilho só e os cartões dos módulos
  const pg = await ctx.newPage();
  await pg.goto(B + "/maisim-nav.js"); await pg.evaluate(() => { localStorage.clear(); });
  await pg.goto(B + "/"); await pg.waitForSelector("#maisim-nav", { timeout: 20000 }); await pg.waitForTimeout(500);
  const ini = await pg.evaluate(() => ({ n: document.querySelectorAll("#maisim-nav").length, cartoes: [...document.querySelectorAll(".cartao")].map((x) => x.getAttribute("href")) }));
  // o terceiro cartão (22/10): "Exemplos", que abre a lista dos modelos na própria página (aparece quando o simu responde)
  ok(ini.n === 1 && ini.cartoes.join() === "/maisim/simu/?novo=1,/maisim/scope/,#exemplos", `página inicial: ${ini.n} trilho, cartões ${ini.cartoes.join(" ")}`);
  // 2) tema: a página segue o trilho e a escolha fica guardada
  const fundo = () => pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const claro = await pg.evaluate(() => document.documentElement.dataset.tema), fClaro = await fundo();
  ok(claro === "claro", `sistema claro: data-tema ${claro}`);
  await pg.click("#maisim-nav .tema"); await pg.click("#maisim-nav .tema"); await pg.waitForTimeout(300);          // sistema → claro → escuro
  const esc = await pg.evaluate(() => ({ tema: document.documentElement.dataset.tema, guardado: localStorage.getItem("maisim-tema") })), fEsc = await fundo();
  ok(esc.tema === "escuro" && esc.guardado === "escuro" && fEsc !== fClaro, `trilho → escuro: a página acompanha (data-tema ${esc.tema}, fundo ${fClaro} → ${fEsc})`);
  await pg.reload(); await pg.waitForSelector("#maisim-nav"); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => document.documentElement.dataset.tema === "escuro" && document.querySelector("#maisim-nav .tema").dataset.rotulo === "Tema: escuro (clique: como o sistema)"),
     "recarregada: continua escura, e o trilho mostra a escolha");
  await pg.evaluate(() => localStorage.setItem("maisim-tema", "claro"));
  await pg.close();
  // navegador sem localStorage (bloqueado): a página abre como o sistema, e o botão não quebra nada
  const ctxB = await b.newContext({ viewport: { width: 1300, height: 800 }, colorScheme: "light" });
  ctxB.on("page", (p) => p.on("pageerror", (e) => erros.push(`(sem localStorage) ${p.url()}: ${e.message}`)));
  await ctxB.addInitScript(() => { Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("bloqueado"); } }); });
  const pb = await ctxB.newPage(); await pb.goto(B + "/"); await pb.waitForSelector("#maisim-nav", { timeout: 20000 });
  const b0 = await pb.evaluate(() => document.documentElement.dataset.tema);
  await pb.click("#maisim-nav .tema"); await pb.waitForTimeout(300);
  const b1 = await pb.evaluate(() => document.documentElement.dataset.tema);
  ok(b0 === "claro" && b1 === "claro", `sem localStorage: abre como o sistema (${b0}) e o clique não quebra (${b1})`);
  await ctxB.close();
  // 3) scope: conexão ao vivo só com a aba à vista (segundo plano simulado: document.hidden + visibilitychange)
  const n0 = conexoes();
  const sc = await ctx.newPage(); await sc.goto(B + "/maisim/scope/"); await sc.waitForTimeout(1500);
  const n1 = conexoes();
  ok(n1 === n0 + 1, `scope aberto: conexões no scope ${n0} → ${n1} (o canal ao vivo)`);
  const META = { planta: "teste-fila", rotulo: "fila" };
  ok(await publica({ tipo: "inicio", meta: META }) === 200, "rodada ao vivo de teste publicada (só na memória do scope 7211)");
  await publica({ tipo: "dados", lote: { t: [0, 1e-4, 2e-4], x: [0, 1, 2] } }); await sc.waitForTimeout(800);
  const id1 = await sc.evaluate(() => { A.marca = "a mesma"; return A.meta._rodada_vivo; });
  ok(!!id1, `o servidor numera a rodada (${id1})`);
  await esconde(sc, true); await sc.waitForTimeout(1500);
  ok(conexoes() === n1, "escondida por pouco tempo (1,5 s de 30 s): a conexão fica");
  await esconde(sc, false); await sc.waitForTimeout(800);
  ok(conexoes() === n1 && await sc.evaluate(() => A.marca === "a mesma" && !A.ger), "voltou logo: nada reconecta nem é reenviado");
  await sc.evaluate(() => { esperaEscondida = 0; });                      // daqui em diante, fecha na hora
  await esconde(sc, true); await sc.waitForTimeout(800);
  const n2 = conexoes();
  ok(n2 === n0, `escondida além do prazo: a conexão fecha (${n1} → ${n2})`);
  await publica({ tipo: "dados", lote: { t: [3e-4, 4e-4], x: [3, 4] } }); await sc.waitForTimeout(300);
  await esconde(sc, false); await sc.waitForTimeout(1500);
  const volta = await sc.evaluate(() => ({ marca: A && A.marca, ger: A && A.ger, n: A ? (A.dados.t || []).length : -1 }));
  ok(conexoes() === n1 && volta.marca === "a mesma" && volta.ger === 1 && volta.n === 5, `de volta: reconecta na mesma rodada (painéis e zoom ficam; a medição recalcula, ger ${volta.ger}) com as 5 amostras, inclusive as 2 que vieram com ela escondida`);
  await publica({ tipo: "inicio", meta: META }); await sc.waitForTimeout(800);
  const nova = await sc.evaluate(() => ({ marca: A && A.marca, id: A && A.meta._rodada_vivo, st: document.getElementById("status").textContent }));
  ok(nova.marca === undefined && nova.id !== id1 && /aguardando dados/.test(nova.st), `rodada nova com a MESMA meta, aba à vista: troca como rodada nova (${nova.id}; "${nova.st}")`);
  await sc.evaluate(() => { A.marca = "velha"; });
  await esconde(sc, true); await sc.waitForTimeout(300);
  await publica({ tipo: "inicio", meta: META }); await publica({ tipo: "dados", lote: { t: [0, 1e-4], x: [7, 8] } });
  await esconde(sc, false); await sc.waitForTimeout(1500);
  const nova2 = await sc.evaluate(() => ({ marca: A && A.marca, x: A ? A.dados.x : null }));
  ok(nova2.marca === undefined && JSON.stringify(nova2.x) === "[7,8]", `rodada nova com a mesma meta enquanto escondida: ao voltar, é a nova (x = ${JSON.stringify(nova2.x)})`);
  await publica({ tipo: "inicio", meta: { planta: "teste-fila", rotulo: "fila 3" } }); await sc.waitForTimeout(800);
  ok(await sc.evaluate(() => A && A.meta.rotulo === "fila 3"), "rodada com outra meta: troca como antes");
  await publica({ tipo: "fim" }); await sc.close();
  // o scope pelo trilho (sem ?so nem ?a): com a rodada já terminada, vazio; no simu (?so=rodada), a última; com uma rodada
  // em andamento, ao vivo (Marcelo, 22/10: "se tiver uma simulação rodando; se não tiver nada, vir vazio")
  const olha = async (url) => { const p = await ctx.newPage(); await p.goto(B + url); await p.waitForTimeout(2000);
    const r = await p.evaluate(() => ({ rot: A && A.meta ? A.meta.rotulo : null, st: document.getElementById("status").textContent })); await p.close(); return r; };
  const trilho = await olha("/maisim/scope/"), noSimu = await olha("/maisim/scope/?so=rodada");
  await publica({ tipo: "inicio", meta: { planta: "teste-fila", rotulo: "fila 4" } }); await publica({ tipo: "dados", lote: { t: [0, 1e-4], x: [1, 2] } });
  const rodando = await olha("/maisim/scope/");
  await publica({ tipo: "fim" });
  ok(trilho.rot === null && /nenhuma simulação rodando/.test(trilho.st) && noSimu.rot === "fila 3" && rodando.rot === "fila 4",
    `scope pelo trilho: terminada → vazio ("${trilho.st.slice(0, 40)}…"); no simu, a última (${noSimu.rot}); em andamento → ao vivo (${rodando.rot})`);
  // 4) 6 abas do scope: à vista, a página inicial fica na fila; escondidas, carrega
  const abas = [];
  for (let k = 0; k < 6; k++) { const p = await ctx.newPage(); await p.goto(B + "/maisim/scope/"); await p.waitForTimeout(500); abas.push(p); }
  const tenta = async () => { const p = await ctx.newPage(); const t = Date.now(); p.goto(B + "/").catch(() => {});
    let ms = null; try { await p.waitForSelector("#maisim-nav", { timeout: 6000 }); ms = Date.now() - t; } catch (e) {} await p.close(); return ms; };
  const cheio = await tenta();
  ok(cheio === null, `controle: 6 abas do scope à vista → a página inicial não carrega em 6 s (${cheio === null ? "na fila" : cheio + " ms"}) — o problema que o Marcelo viu`);
  for (const p of abas) { await p.evaluate(() => { esperaEscondida = 0; }); await esconde(p, true); }   // escondidas além do prazo (simulado)
  await espera(800);
  const livre = await tenta();
  ok(livre !== null && livre < 5000, `as 6 abas escondidas além do prazo (segundo plano simulado) → a página inicial carrega, trilho em ${livre} ms`);
  for (const p of abas) await p.close();
  ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
