// a página inicial (instância de teste 7200): levar um circuito para outro MaiSim (o .msd; Marcelo, 24/10). Uma rodada do
// exemplo_controle_pwm dos seus; o Exportar da linha abre o diálogo com o que vai junto e as rodadas deste circuito (nenhuma
// marcada, o total); marcar e exportar baixa o .msd; o Importar… com esse arquivo mostra a prévia com o conflito de nome
// (sugere _2) e a rodada marcada; importar põe o circuito em cima nos Recentes, com o Abrir.
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const api = (rota, corpo) => fetch("http://localhost:7201/maisim/simu/" + rota, corpo ? { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo) } : {}).then((r) => r.json());
const DADOS = path.join(os.homedir(), ".cache/maisim_teste"), CIRC = path.join(DADOS, "circuitos"), RODADAS = path.join(DADOS, "rodadas");
const ORIG = path.join(CIRC, "exemplo_controle_pwm.ipes"), NOVO = "exemplo_controle_pwm_2";
const apagaNovo = () => { for (const f of fs.readdirSync(CIRC)) if (f.startsWith(NOVO + ".")) fs.unlinkSync(path.join(CIRC, f)); };
(async () => {
  let b; const pastas = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "msd_tela_"));
  apagaNovo();
  try {
    await api("editor/abrir", { arq: ORIG, modo: "descartar" });
    let j = await api("editor/rodar", { dt: "1e-6", tfim: "0.002", nome: "msd_tela", amostras: "100" });
    while (["preparando", "rodando", "pausada"].includes(j.estado)) { await new Promise((r) => setTimeout(r, 300)); j = await api("editor/rodada"); }
    if (j.estado !== "fim") throw new Error(`a rodada não terminou: ${j.estado} ${j.erro || ""}`);
    const pasta = path.basename(path.dirname(j.arquivo)); pastas.push(pasta);
    b = await chromium.launch();
    const pg = await (await b.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#circuitos:not([hidden])", { timeout: 20000 });
    ok(await pg.$("#bt-importar") !== null, "o Importar… no cabeçalho da seção Circuitos");
    const linha = pg.locator("#lista-circ .rodada", { has: pg.locator("b", { hasText: /^exemplo_controle_pwm$/ }) }).first();
    await linha.locator("button.exportar").click();
    await pg.waitForSelector(".msd-exp");
    const rods = await pg.$$eval(".msd-exp .msd-rods label", (ls) => ls.map((l) => [l.querySelector(".n").textContent, l.querySelector("input").checked]));
    const txt = await pg.textContent(".msd-exp");
    ok(rods.some(([n]) => n.includes("msd_tela")) && rods.every(([, c]) => !c) && /controle/.test(txt) && /total estimado/.test(txt),
       `o diálogo de exportar: as rodadas do circuito, nenhuma marcada, o que vai junto e o total (${rods.map(([n]) => n).join(", ")})`);
    const t0 = await pg.textContent(".msd-exp .total");
    const i = rods.findIndex(([n]) => n.includes("msd_tela"));
    await pg.locator(".msd-exp .msd-rods input").nth(i).check();
    ok((await pg.textContent(".msd-exp .total")) !== t0 || /kB/.test(t0), `marcar soma no total (${t0} → ${await pg.textContent(".msd-exp .total")})`);
    const [dl] = await Promise.all([pg.waitForEvent("download"), pg.click(".msd-exp .m-exp")]);
    const arq = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(arq);
    ok(dl.suggestedFilename() === "exemplo_controle_pwm.msd" && fs.statSync(arq).size > 1000 && fs.readFileSync(arq).subarray(0, 2).toString() === "PK",
       `exportar baixa ${dl.suggestedFilename()} (${fs.statSync(arq).size} bytes, um zip)`);
    await pg.waitForSelector(".msd-exp", { state: "detached" });
    // importar o mesmo arquivo: o conflito
    await pg.setInputFiles("#arq-msd", arq);
    await pg.waitForSelector(".msd-imp .m-imp", { timeout: 20000 });
    const conf = await pg.textContent(".msd-imp");
    const sug = await pg.$eval("#msd-nome", (x) => x.value);
    const marc = await pg.$$eval(".msd-imp .msd-rods input", (xs) => xs.map((x) => x.checked));
    ok(/Já existe um circuito exemplo_controle_pwm/.test(conf) && sug === NOVO && marc.length === 1 && marc[0]
       && await pg.$eval('input[name="msd-modo"][value="como"]', (x) => x.checked), `a prévia: o conflito, "importar como ${sug}" marcado, a rodada marcada`);
    ok(/exportado por .* com o MaiSim/.test(conf), "a prévia diz quem exportou, quando e com qual MaiSim");
    await pg.click(".msd-imp .m-imp");
    await pg.waitForSelector(".msd-imp .m-abrir", { timeout: 20000 });
    const href = await pg.getAttribute(".msd-imp .m-abrir", "href");
    ok(href === `/maisim/simu/?modelo=${encodeURIComponent(path.join(CIRC, NOVO + ".ipes"))}` && /1 rodada/.test(await pg.textContent(".msd-imp")),
       `importado: o Abrir leva ao circuito novo (${href})`);
    await pg.click(".msd-imp .m-nao");
    const topo = await pg.$eval("#lista-circ .rodada b", (x) => x.textContent);
    ok(topo === NOVO, `o circuito importado em cima nos Recentes (${topo})`);
    for (const d of fs.readdirSync(RODADAS)) if (d.startsWith(pasta + "_")) pastas.push(d);
    ok(pastas.length === 2 && fs.existsSync(path.join(CIRC, NOVO + ".controle.json")), `no disco: o circuito com o controle e a rodada ${pastas[1]}`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message); }
  if (b) await b.close();
  for (const p of pastas) fs.rmSync(path.join(RODADAS, p), { recursive: true, force: true });
  apagaNovo(); fs.rmSync(tmp, { recursive: true, force: true });
  try { const f = path.join(DADOS, "recentes.json"), r = JSON.parse(fs.readFileSync(f, "utf8")); delete r[path.join(CIRC, NOVO + ".ipes")]; fs.writeFileSync(f, JSON.stringify(r)); } catch (e) { /* sem recentes */ }
  process.exit(falhas ? 1 : 0);
})();
