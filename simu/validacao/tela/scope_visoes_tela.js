// as visões do scope, POR CIRCUITO (Marcelo, 23/10), e num arquivo (instância de teste 7200 → scope 7202): "Exportar visões" baixa os painéis, as seções e
// as cores; "Importar visões…" troca pelas de um arquivo — o exportado aqui, um do PEW (o mesmo formato) — e recusa o
// que não é (Marcelo, 21/10: "exportar scopes e daí importar, pra ter as mesmas views")
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "visoes_"));
const URL = "http://localhost:7200/maisim/scope/";
// uma gravação própria, do circuito "circuito_visoes" (a pasta do teste está em MAISIM_SCOPE_PASTAS; apagada no fim)
const PASTA = path.join(__dirname, "..", "tmp_scope_visoes"), RAIZ = path.resolve(__dirname, "../../..");
fs.mkdirSync(PASTA, { recursive: true });
const NPZ = path.join(PASTA, "scope_visoes.npz");
require("child_process").execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.01, 1e-4)
meta = {"planta": "gecko-maisim", "rotulo": "visoes", "modelo": "x/circuito_visoes.ipes", "dt": 1e-4, "Ts": 1e-4, "tfim": 0.01, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(NPZ)}, meta=np.array(json.dumps(meta)), t=t, sinal_a=np.sin(t), sinal_b=np.cos(t))`]);
const COM_RODADA = URL + "?a=" + encodeURIComponent(path.relative(RAIZ, NPZ));
const CHAVE = "maisim-scope-layout-v4:circuito_visoes", OUTRO = "maisim-scope-layout-v4:outro_circuito";
const MEU = { colunas: 1, itens: [{ secao: "Seção do teste" }, { titulo: "Painel do teste", sinais: ["sinal_a", "sinal_b"] }] };
(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
    const pg = await ctx.newPage();
    const erros = [], dialogos = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo do navegador: " + d.message()); d.dismiss(); });
    // as perguntas do MaiSim (pergunta(), no lugar do confirm()): aceita cada uma e guarda o texto em dialogos
    await pg.exposeFunction("__pergunta", (t) => { dialogos.push(t); });
    await pg.addInitScript(() => { new MutationObserver(() => { const m = document.querySelector(".sc-modal");
      if (m && !m.dataset.visto) { m.dataset.visto = 1; window.__pergunta(m.querySelector("p").textContent); setTimeout(() => m.querySelector(".sc-ok").click(), 50); } })
      .observe(document, { childList: true, subtree: true }); });
    const vistos = () => pg.evaluate(() => itens.map((x) => x.tipo === "secao" ? "S:" + x.titulo : "P:" + x.titulo));
    const abre = async () => { await pg.goto(COM_RODADA); await pg.waitForFunction(() => typeof A !== "undefined" && A && A.dados && itens.length, null, { timeout: 20000 }); };
    // 0. sem rodada: nada (o aviso), e importar pede uma rodada antes
    await pg.goto(URL); await pg.waitForTimeout(1500);
    await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("maisim-scope-layout")) localStorage.removeItem(k); });
    await pg.reload(); await pg.waitForTimeout(1500);
    const vazio = await vistos();
    // 1. um circuito sem layout: o automático (a seção com o nome do circuito, os sinais da rodada), sem gravar nada
    await abre(); const auto = await vistos(), gravou = await pg.evaluate((k) => localStorage.getItem(k), CHAVE);
    ok(vazio.length === 0 && JSON.stringify(auto) === JSON.stringify(["S:circuito_visoes", "P:Sinais da rodada visoes"]) && !gravou,
       `sem rodada: nada (${vazio.length} itens); o circuito sem layout: o automático ${JSON.stringify(auto)}, sem gravar`);
    // 2. as visões do circuito (guardadas com o nome dele) e as de outro circuito, à parte
    await pg.evaluate(([k, L, o]) => { localStorage.setItem(k, JSON.stringify(L)); localStorage.setItem(o, JSON.stringify({ itens: [{ titulo: "do outro", sinais: ["x"] }] }));
      localStorage.setItem("maisim-scope-cores", JSON.stringify({ sinal_a: "#ff0000" })); }, [CHAVE, MEU, OUTRO]);
    await abre();
    ok(JSON.stringify(await vistos()) === JSON.stringify(["S:Seção do teste", "P:Painel do teste"]), `as visões do circuito: ${JSON.stringify(await vistos())}`);
    // 3. exportar: com o nome do circuito
    const [down] = await Promise.all([pg.waitForEvent("download"), pg.click("#bt-exportar")]);
    const arq = path.join(TMP, down.suggestedFilename()); await down.saveAs(arq);
    const v = JSON.parse(fs.readFileSync(arq, "utf8"));
    ok(/^visoes_scope_circuito_visoes_\d{4}-\d\d-\d\d\.json$/.test(down.suggestedFilename()) && v.formato === "scope-visoes" && v.circuito === "circuito_visoes" && v.layout.itens.length === 2
       && v.layout.itens[1].titulo === "Painel do teste" && v.cores.sinal_a === "#ff0000", `exportado: ${down.suggestedFilename()} (${v.layout.itens.length} itens, cores ${JSON.stringify(v.cores)})`);
    // 4. "Layout automático": só este circuito volta ao automático; o do outro fica
    await pg.click("#bt-padrao"); await pg.waitForTimeout(300);
    await pg.evaluate(() => localStorage.setItem("maisim-scope-cores", "{}"));
    const voltou = await vistos(), outro = await pg.evaluate((o) => localStorage.getItem(o), OUTRO);
    ok(JSON.stringify(voltou) === JSON.stringify(["S:circuito_visoes", "P:Sinais da rodada visoes"]) && /do outro/.test(outro || ""), `layout automático: ${JSON.stringify(voltou)}; o do outro circuito fica`);
    // 5. importar o exportado
    await pg.setInputFiles("#arq-visoes", arq); await pg.waitForFunction(() => /visões importadas/.test(document.getElementById("status").textContent), null, { timeout: 10000 });
    const cor = await pg.evaluate(() => JSON.parse(localStorage.getItem("maisim-scope-cores")).sinal_a);
    ok(JSON.stringify(await vistos()) === JSON.stringify(["S:Seção do teste", "P:Painel do teste"]) && cor === "#ff0000" && dialogos.length === 1 && /circuito_visoes/.test(dialogos[0]),
       `importado de volta: ${JSON.stringify(await vistos())}, cor ${cor}; pergunta antes ("${dialogos[0]}")`);
    // 6. um arquivo do PEW (o mesmo formato)
    const pew = path.join(TMP, "visoes_pew.json");
    fs.writeFileSync(pew, JSON.stringify({ formato: "scope-visoes", versao: 1, de: "PEW", layout: { colunas: 3, itens: [{ secao: "MMC" }, { titulo: "Correntes", sinais: ["i_Lf_a"] }, { titulo: "Vdc", sinais: ["Vdc_cmd", "Vcc"] }] },
      cores: { Vcc: "#d62728", "<script>": "#000000", Vdc_cmd: "vermelho" } }));
    await pg.setInputFiles("#arq-visoes", pew); await pg.waitForFunction(() => /visões importadas de visoes_pew/.test(document.getElementById("status").textContent), null, { timeout: 10000 });
    const cores = await pg.evaluate(() => JSON.parse(localStorage.getItem("maisim-scope-cores")));
    const doPew = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).itens.map((x) => x.secao ? "S:" + x.secao : "P:" + x.titulo), CHAVE);
    ok(JSON.stringify(doPew) === JSON.stringify(["S:MMC", "P:Correntes", "P:Vdc"]) && await pg.evaluate(() => larguraPadrao) === 3 && JSON.stringify(cores) === JSON.stringify({ Vcc: "#d62728" }),
       `do PEW: guardado para o circuito ${JSON.stringify(doPew)}, por linha ${await pg.evaluate(() => larguraPadrao)}, cores só as válidas ${JSON.stringify(cores)}`);
    // 7. o que não é arquivo de visões: recusado, nada muda
    const ruim = path.join(TMP, "outro.json"); fs.writeFileSync(ruim, JSON.stringify({ formato: "outro", itens: [] }));
    await pg.setInputFiles("#arq-visoes", ruim); await pg.waitForTimeout(500);
    ok(/não é um arquivo de visões/.test(await pg.textContent("#status")) && dialogos.length === 2, `arquivo que não é de visões: "${await pg.textContent("#status")}", nada mudou`);
    // 8. o layout de antes (um só para tudo, v3): na 1ª rodada do circuito, vêm só os painéis com sinais dela (e a seção deles)
    await pg.evaluate(([k]) => { localStorage.removeItem(k); localStorage.setItem("maisim-scope-layout-v3", JSON.stringify({ colunas: 2, itens: [
      { secao: "Porta CC e rede" }, { titulo: "V_dc", sinais: ["vdc"] }, { secao: "Minha seção" }, { titulo: "Meu painel", sinais: ["sinal_b", "nao_existe"] }] })); }, [CHAVE]);
    await abre(); const mig = await vistos(), guardado = await pg.evaluate((k) => !!localStorage.getItem(k), CHAVE);
    ok(JSON.stringify(mig) === JSON.stringify(["S:Minha seção", "P:Meu painel"]) && guardado, `do layout de antes: só o que tem sinal desta rodada ${JSON.stringify(mig)}, guardado para o circuito`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); fs.rmSync(TMP, { recursive: true, force: true }); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
