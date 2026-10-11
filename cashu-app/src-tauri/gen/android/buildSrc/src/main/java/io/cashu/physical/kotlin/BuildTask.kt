import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    private fun resolveExecutable(baseName: String): String {
        if (Os.isFamily(Os.FAMILY_WINDOWS)) {
            return baseName
        }
        val userHome = System.getProperty("user.home") ?: ""
        val candidatePaths = listOf(
            "/opt/homebrew/bin/$baseName",
            "/usr/local/bin/$baseName",
            "$userHome/.cargo/bin/$baseName",
            "$userHome/.bun/bin/$baseName"
        )
        for (path in candidatePaths) {
            val f = File(path)
            if (f.canExecute()) {
                return f.absolutePath
            }
        }
        return baseName
    }

    @TaskAction
    fun assemble() {
        val baseExecutable = """npm"""
        val executable = resolveExecutable(baseExecutable)
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$baseExecutable.exe",
                    "$baseExecutable.cmd",
                    "$baseExecutable.bat",
                )
                
                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script")

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))

            val userHome = System.getProperty("user.home") ?: ""
            val currentEnvPath = System.getenv("PATH") ?: ""
            val extraPaths = listOf(
                "/opt/homebrew/bin",
                "/usr/local/bin",
                "$userHome/.cargo/bin",
                "$userHome/.bun/bin"
            )
            val combinedPath = (extraPaths + currentEnvPath.split(File.pathSeparator))
                .distinct()
                .filter { it.isNotEmpty() && File(it).exists() }
                .joinToString(File.pathSeparator)
            environment("PATH", combinedPath)
        }.assertNormalExitValue()
    }
}