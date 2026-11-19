plugins {
    id("com.android.application")
}

android {
    namespace = "com.example"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.aistudio.eternalbluepos.kxmpzq"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "2.3.0"
    }

    signingConfigs {
        create("debugConfig") {
            storeFile = file("${rootDir}/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debugConfig")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = false
    }
}

val buildWebApp = tasks.register<Exec>("buildWebApp") {
    workingDir = rootProject.projectDir
    val npmBin = if (file("/usr/local/bin/npm").exists()) "/usr/local/bin/npm" else "npm"
    commandLine(npmBin, "run", "build")
}

val syncWebAssets = tasks.register<Sync>("syncWebAssets") {
    dependsOn(buildWebApp)
    from(rootProject.layout.projectDirectory.dir("dist"))
    into(layout.projectDirectory.dir("src/main/assets/web"))
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity:1.10.1")
}
