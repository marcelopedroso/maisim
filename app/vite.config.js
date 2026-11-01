import { defineConfig } from 'vite'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// A página inicial (index.html, o menu public/maisim-nav.js) e os módulos do MaiSim encaminhados por aqui, para tudo ficar numa porta só:
//   /maisim/simu   → monte e simule circuitos, com o Gecko como cérebro (simu/servidor.py, MAISIM_PORTA_SIMU)
//   /maisim/scope  → o scope (scope/servidor.py, MAISIM_PORTA_SCOPE)
//   /maisim/figuras → o módulo Figuras (o mesmo servidor do scope)
//   /maisim/gecko  → a tela do GeckoCIRCUITS no navegador: noVNC + websockify (MAISIM_PORTA_TELA) sobre um Xvfb com o Gecko
//                    (gecko/sobe.sh); o websocket do VNC passa por aqui também (ws: true)
// As portas vêm de config/ (padrao.env, o perfil de MAISIM_PERFIL, o .env da raiz e o ambiente), pelo mesmo leitor dos
// servidores (config/ler_config.py).
const CFG = JSON.parse(execFileSync('python3', [fileURLToPath(new URL('../config/ler_config.py', import.meta.url)), '--json']).toString())
const local = (porta) => `http://localhost:${CFG[porta]}`
// a ponte Windows ↔ WSL às vezes deixa morta, do lado do Windows, uma conexão que o navegador guardou para reusar: o GET o
// Chrome repete sozinho numa conexão nova, o POST não ("Failed to fetch" em toda mudança). Fechar a conexão depois de cada
// resposta do simu e do scope tira o reuso (no localhost, abrir uma conexão nova custa quase nada)
const fecha = (proxy) => proxy.on('proxyRes', (proxyRes) => { proxyRes.headers.connection = 'close' })
// a tela do Gecko: o websocket só vindo da própria página (o navegador não aplica a mesma origem a websockets: sem isso, um
// site qualquer comandava o Gecko), como na app/pagina.py
const ORIGENS = new Set(['localhost', '127.0.0.1', '[::1]'].map((h) => `http://${h}:${CFG.MAISIM_PORTA_PAGINA}`))
const daPagina = (req) => (!req.headers.origin || ORIGENS.has(String(req.headers.origin).toLowerCase())) && [undefined, 'same-origin', 'none'].includes(req.headers['sec-fetch-site'])
const soDaPagina = (proxy) => proxy.on('proxyReqWs', (proxyReq, req, socket) => { if (!req.headers.origin || !daPagina(req)) socket.destroy() })
const proxy = {
    '/maisim/scope': { target: local('MAISIM_PORTA_SCOPE'), changeOrigin: true, configure: fecha },
    '/maisim/figuras': { target: local('MAISIM_PORTA_SCOPE'), changeOrigin: true, configure: fecha },   // o módulo Figuras (servido pelo scope)
    '/maisim/simu': { target: local('MAISIM_PORTA_SIMU'), changeOrigin: true, configure: fecha },
    '/maisim/gecko': { target: local('MAISIM_PORTA_TELA'), changeOrigin: true, ws: true, rewrite: (p) => p.replace(/^\/maisim\/gecko/, ''), configure: soDaPagina },
}

// e o mesmo para o que o próprio Vite serve (o trilho /maisim-nav.js, a página inicial): o trilho sumiu numa queda dessas (18/10;
// a página do simu segue sem ele quando o script não carrega)
const conexaoFechada = {
    name: 'maisim-conexao-fechada',
    configureServer: (server) => { server.middlewares.use((req, res, next) => { res.setHeader('Connection', 'close'); next() }) },
    configurePreviewServer: (server) => { server.middlewares.use((req, res, next) => { res.setHeader('Connection', 'close'); next() }) },
}

// a senha da tela do Gecko (sorteada a cada partida, gecko/vnc.senha no cache): só para a própria página (um site não manda o
// X-MaiSim), como a /maisim/gecko-senha da app/pagina.py; antes do proxy do /maisim/gecko (os middlewares daqui vêm primeiro)
const senhaGecko = (req, res, next) => {
    if (req.url.split('?')[0] !== '/maisim/gecko-senha') return next()
    if (!daPagina(req) || req.headers['x-maisim'] !== '1') { res.statusCode = 403; return res.end() }
    let senha = null
    try { senha = readFileSync(`${CFG.MAISIM_CACHE}/gecko/vnc.senha`, 'utf8').trim() || null } catch (e) { /* sem a tela */ }
    res.statusCode = senha ? 200 : 404; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ senha }))
}
const seguranca = {
    name: 'maisim-seguranca',
    configureServer: (server) => { server.middlewares.use(senhaGecko) },
    configurePreviewServer: (server) => { server.middlewares.use(senhaGecko) },
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [conexaoFechada, seguranca],
    server: {
        port: Number(CFG.MAISIM_PORTA_PAGINA),
        strictPort: true,
        proxy,
    },
    preview: { proxy },
})
