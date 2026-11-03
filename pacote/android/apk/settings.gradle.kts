// o MaiSim para Android (o APK): um app que traz o proot e monta o Ubuntu e o MaiSim na primeira abertura
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "MaiSim"
include(":app")
