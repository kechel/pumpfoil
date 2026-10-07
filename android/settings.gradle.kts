pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // HUAWEI Wear Engine (Huawei-Uhren, 07.10.2026). Nur com.huawei.* aus diesem Repo — es
        // soll nie andere Bibliotheken liefern koennen.
        maven {
            url = uri("https://developer.huawei.com/repo/")
            content { includeGroupByRegex("com\\.huawei.*") }
        }
    }
}
rootProject.name = "Pumpfoil"
include(":app", ":wear")
