// o app: a versão vem do VERSION do MaiSim; só arm64 (os celulares de 64 bits); o proot e o loader como lib*.so em jniLibs,
// extraídos para o nativeLibraryDir (o único lugar de onde um app com targetSdk >= 29 ainda pode executar: o W^X)
import java.io.File

val versaoMaisim = File(rootDir, "../../../VERSION").readText().trim()
fun codigoDe(v: String): Int {                             // 0.3.8-rc3 → 30803, 0.3.8 → 30899
    val m = Regex("""^(\d+)\.(\d+)\.(\d+)(?:-rc(\d+))?""").find(v) ?: return 1
    val (a, b, c, rc) = m.destructured
    return a.toInt() * 1_000_000 + b.toInt() * 10_000 + c.toInt() * 100 + (rc.toIntOrNull() ?: 99)
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.maisim"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.maisim"
        minSdk = 29
        targetSdk = 35
        versionCode = codigoDe(versaoMaisim)
        versionName = versaoMaisim
        ndk { abiFilters += listOf("arm64-v8a") }
    }
    signingConfigs {
        create("release") {                                // a chave de verdade vem do ambiente (os segredos do CI)
            val ks = System.getenv("MAISIM_KEYSTORE")
            if (ks != null) {
                storeFile = file(ks); storePassword = System.getenv("MAISIM_KEYSTORE_SENHA")
                keyAlias = System.getenv("MAISIM_CHAVE_NOME"); keyPassword = System.getenv("MAISIM_CHAVE_SENHA")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (System.getenv("MAISIM_KEYSTORE") != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    // o que não existe na versão mínima do Android (29) quebra o app num celular antigo: o lint barra (o CI roda antes de montar)
    lint { fatal += listOf("NewApi", "InlinedApi"); abortOnError = true; checkReleaseBuilds = true }
    packaging { jniLibs { useLegacyPackaging = true } }    // extrai os .so (sem isso o proot não fica executável)
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("org.apache.commons:commons-compress:1.27.1")   // o tar do Ubuntu e do MaiSim (links simbólicos e permissões)
}
