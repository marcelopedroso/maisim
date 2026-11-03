package app.maisim

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import java.net.HttpURLConnection
import java.net.URL

// a tela do app: enquanto prepara (a primeira vez) e liga, o progresso; pronto, o MaiSim do celular (/movel.html) numa
// WebView. Os links de fora (o site, o login da IA) abrem no navegador; o Exportar vai para os Downloads; o Importar abre o
// seletor de arquivos do Android
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var preparo: LinearLayout
    private lateinit var etapa: TextView
    private lateinit var barra: ProgressBar
    private lateinit var linhas: TextView
    private lateinit var tentar: Button
    private var carregou = false
    private var escolha: ValueCallback<Array<Uri>>? = null
    private val h = Handler(Looper.getMainLooper())
    private val base = "http://127.0.0.1:$PORTA"

    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        val raiz = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#f4f4f8")) }
        raiz.setOnApplyWindowInsetsListener { v, ins ->               // de ponta a ponta (Android 15): as barras e o teclado
            if (android.os.Build.VERSION.SDK_INT >= 30) {             // (WindowInsets.Type e CONSUMED: Android 11+)
                val b = ins.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                v.setPadding(b.left, b.top, b.right, b.bottom); WindowInsets.CONSUMED
            } else {                                                  // Android 10: o jeito antigo (as barras e o teclado juntos)
                @Suppress("DEPRECATION")
                v.setPadding(ins.systemWindowInsetLeft, ins.systemWindowInsetTop, ins.systemWindowInsetRight, ins.systemWindowInsetBottom)
                @Suppress("DEPRECATION") ins.consumeSystemWindowInsets()
            }
        }
        web = WebView(this).apply { visibility = View.GONE }
        preparo = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(64, 64, 64, 64) }
        val logo = ImageView(this).apply { setImageResource(R.drawable.logo) }
        val tit = TextView(this).apply { text = getString(R.string.preparando); textSize = 22f; setTextColor(Color.parseColor("#1b1d2a")); setTypeface(typeface, Typeface.BOLD); gravity = Gravity.CENTER; setPadding(0, 32, 0, 8) }
        val nota = TextView(this).apply { text = getString(R.string.primeira_vez); textSize = 14f; setTextColor(Color.parseColor("#585d72")); gravity = Gravity.CENTER }
        etapa = TextView(this).apply { textSize = 15f; setTextColor(Color.parseColor("#1b1d2a")); gravity = Gravity.CENTER; setPadding(0, 48, 0, 16) }
        barra = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        linhas = TextView(this).apply { textSize = 11f; typeface = Typeface.MONOSPACE; setTextColor(Color.parseColor("#585d72")); setPadding(0, 32, 0, 0) }
        tentar = Button(this).apply { text = getString(R.string.tentar); visibility = View.GONE; setOnClickListener { visibility = View.GONE; liga() } }
        listOf(logo, tit, nota, etapa, barra, linhas, tentar).forEach { preparo.addView(it, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)) }
        logo.layoutParams = LinearLayout.LayoutParams(220, 220)
        raiz.addView(preparo); raiz.addView(web)
        setContentView(raiz)
        configuraWeb()
        if (android.os.Build.VERSION.SDK_INT >= 33 &&                  // (antes do Android 13 a notificação não pede permissão)
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        liga()
        h.post(object : Runnable { override fun run() { mostra(); h.postDelayed(this, 300) } })
    }

    private fun liga() { startForegroundService(Intent(this, MaiSimService::class.java)) }

    private fun mostra() {
        val erro = Estado.erro
        if (Estado.pronto && !carregou) { carregou = true; web.loadUrl("$base/movel.html") }
        if (Estado.pronto) { web.visibility = View.VISIBLE; preparo.visibility = View.GONE; return }
        if (!Estado.pronto && carregou && erro != null) { carregou = false; web.visibility = View.GONE }
        preparo.visibility = View.VISIBLE
        etapa.text = erro ?: Estado.etapa
        etapa.setTextColor(Color.parseColor(if (erro != null) "#c0303a" else "#1b1d2a"))
        barra.isIndeterminate = Estado.progresso < 0 && erro == null
        if (Estado.progresso >= 0) barra.progress = Estado.progresso
        linhas.text = Estado.ultimas()
        tentar.visibility = if (erro != null && !Estado.rodando) View.VISIBLE else View.GONE
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configuraWeb() {
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)   // o APK de teste: chrome://inspect pelo cabo
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                val host = r.url.host ?: return false
                if (host == "127.0.0.1" || host == "localhost") return false
                startActivity(Intent(Intent.ACTION_VIEW, r.url)); return true       // o site, o login da IA: no navegador
            }
            override fun onRenderProcessGone(v: WebView, d: android.webkit.RenderProcessGoneDetail): Boolean { carregou = false; recreate(); return true }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                escolha?.onReceiveValue(null); escolha = cb
                // ".msd" não é um tipo conhecido do Android: todos os arquivos (o MaiSim confere o que veio)
                startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"), 7)
                return true
            }
        }
        web.setDownloadListener { url, _, disp, mime, _ -> baixa(url, disp, mime) }
    }

    // o Exportar (.msd, imagens): o próprio app baixa, com os cookies da página, e grava nos Downloads (sem permissão)
    private fun baixa(url: String, disp: String?, mime: String?) {
        val nome = URLUtil.guessFileName(url, disp, mime)
        Thread {
            try {
                val con = URL(url).openConnection() as HttpURLConnection
                CookieManager.getInstance().getCookie(url)?.let { con.setRequestProperty("Cookie", it) }
                val cv = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, nome); put(MediaStore.Downloads.MIME_TYPE, mime ?: "application/octet-stream") }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv) ?: throw Exception("MediaStore")
                con.inputStream.use { ent -> contentResolver.openOutputStream(uri)!!.use { ent.copyTo(it) } }
                h.post { Toast.makeText(this, getString(R.string.salvo, nome), Toast.LENGTH_LONG).show() }
            } catch (e: Exception) { h.post { Toast.makeText(this, getString(R.string.erro_salvar, e.message), Toast.LENGTH_LONG).show() } }
        }.start()
    }

    @Deprecated("Activity sem AndroidX")
    override fun onActivityResult(req: Int, res: Int, data: Intent?) {
        if (req == 7) { escolha?.onReceiveValue(if (res == RESULT_OK && data?.data != null) arrayOf(data.data!!) else null); escolha = null; return }
        super.onActivityResult(req, res, data)
    }

    @Deprecated("o voltar do sistema: a página anterior, ou o app vai para trás (o MaiSim continua ligado)")
    override fun onBackPressed() { if (web.visibility == View.VISIBLE && web.canGoBack()) web.goBack() else moveTaskToBack(true) }
}
