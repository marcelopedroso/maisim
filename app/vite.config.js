import { defineConfig } from 'vite'

// A página inicial (index.html, o menu public/pew-nav.js) e os módulos do PEW encaminhados por aqui, para tudo ficar numa porta só:
//   /pew/scope  → o scope (scope/servidor.py, porta 8765)
//   /pew/gecko  → a tela do GeckoCIRCUITS no navegador: noVNC + websockify (porta 6080) sobre um Xvfb com o Gecko
//                 (gecko/sobe.sh); o websocket do VNC passa por aqui também (ws: true)
//   /pew/simu    → monte e simule circuitos, com o Gecko como cérebro (simu/servidor.py, porta 8767);
//                  /pew/control (o nome de antes) vai para o mesmo servidor, que redireciona
// PEW_SCOPE_URL, PEW_GECKO_URL e PEW_SIMU_URL trocam os destinos (ex.: servidores de teste).
const PEW_SCOPE = process.env.PEW_SCOPE_URL || 'http://localhost:8765'
const PEW_GECKO = process.env.PEW_GECKO_URL || 'http://localhost:6080'
const PEW_SIMU = process.env.PEW_SIMU_URL || process.env.PEW_CONTROL_URL || 'http://localhost:8767'
// a ponte Windows ↔ WSL às vezes deixa morta, do lado do Windows, uma conexão que o navegador guardou para reusar: o GET o
// Chrome repete sozinho numa conexão nova, o POST não ("Failed to fetch" em toda mudança). Fechar a conexão depois de cada
// resposta do simu e do scope tira o reuso (no localhost, abrir uma conexão nova custa quase nada)
const fecha = (proxy) => proxy.on('proxyRes', (proxyRes) => { proxyRes.headers.connection = 'close' })
const proxy = {
    '/pew/scope': { target: PEW_SCOPE, changeOrigin: true, configure: fecha },
    '/pew/simu': { target: PEW_SIMU, changeOrigin: true, configure: fecha },
    '/pew/control': { target: PEW_SIMU, changeOrigin: true, configure: fecha },
    '/pew/gecko': { target: PEW_GECKO, changeOrigin: true, ws: true, rewrite: (p) => p.replace(/^\/pew\/gecko/, '') },
}

// e o mesmo para o que o próprio Vite serve (o trilho /pew-nav.js, a página inicial): o trilho sumiu numa queda dessas (18/10;
// a página do simu segue sem ele quando o script não carrega)
const conexaoFechada = {
    name: 'pew-conexao-fechada',
    configureServer: (server) => { server.middlewares.use((req, res, next) => { res.setHeader('Connection', 'close'); next() }) },
    configurePreviewServer: (server) => { server.middlewares.use((req, res, next) => { res.setHeader('Connection', 'close'); next() }) },
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [conexaoFechada],
    server: {
        port: 5000,
        strictPort: true,
        proxy,
    },
    preview: { proxy },
})
