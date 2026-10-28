import { using } from '@plugjs/plug'
import { Files } from '@plugjs/plug/files'
import { ERROR } from '@plugjs/plug/logging'
import { assertAbsolutePath, commonPath, isAbsolutePath } from '@plugjs/plug/paths'
import { API, DiagnosticCategory } from 'typescript/async'

import { convertDiagnostics } from './diagnostics.ts'
import { diagnosticDeprecationLevel, emitOnlyOption, findProjectConfig } from './utils.ts'

import type { TscBuildOptions, TscOptions, TypeScriptBuildOptions, TypeScriptOptions } from './index.ts'
import type { Pipe } from '@plugjs/plug'
import type { AbsolutePath } from '@plugjs/plug/paths'
import type { Context, Plug } from '@plugjs/plug/pipe'
import type { BuildOrchestrator } from 'typescript/async'
import type { Diagnostic, RootedFilePath } from 'typescript/proto'

/** This is marked as "@internal" in TypeScript 7.1 as it's still unstable */
declare module 'typescript/async' {
  interface API {
    createBuildOrchestrator(
      rootNames: readonly string[],
      buildOrchestratorOptions: BuildOrchestratorOptions,
    ): Promise<BuildOrchestrator>
  }
}

/* ========================================================================== *
 * TYPESCRIPT 7 PLUG IMPLEMENTATION                                           *
 * ========================================================================== */

export class TypeScript implements Plug<Files> {
  constructor(private readonly _options: TypeScriptOptions = {}) {}

  async pipe(files: Files, context: Context): Promise<Files> {
    // Convert our options
    const deprecationsLevel = diagnosticDeprecationLevel(this._options.reportDeprecations)
    const emitOnly = emitOnlyOption(this._options.emitOnly)

    // Create our TypeScript API and report for this plug
    const report = context.log.report('TypeScript Report')

    // This is the list of emitted files to return to the pipe...
    const emittedFiles: AbsolutePath[] = []

    let api: API | undefined = undefined
    try {
      api = new API({ cwd: files.directory })

      // If we're not building references, then we just build our files
      const configs = [...files.absolutePaths()].map(findProjectConfig)
      const snapshot = await api.createSnapshot({ openProjects: configs })
      const projects = snapshot.getProjects()

      // Now build all projects in the order we determined earlier
      for (const project of projects) {
        // Get the actual TypeScript program for this project...
        const program = project.program

        // Collect compilation diagnostics for this project (has files)
        const fullDiagnostics = await Promise.all([
          program.getBindDiagnostics(),
          program.getConfigFileParsingDiagnostics(),
          program.getDeclarationDiagnostics(),
          program.getGlobalDiagnostics(),
          program.getProgramDiagnostics(),
          program.getSemanticDiagnostics(),
          program.getSuggestionDiagnostics(),
          program.getSyntacticDiagnostics(),
        ]).then((results) => results.flat())

        // Keep a set of external files we can ignore non-critical diags for
        const externalFiles = new Set<RootedFilePath>()

        // Filter out diagnostics that are not relevant for this project
        const now = Date.now()
        const diagnostics = (
          await Promise.all(
            fullDiagnostics.map(async (diagnostic) => {
              // Always keep all the errors...
              if (diagnostic.category === DiagnosticCategory.Error) return diagnostic

              // coverage ignore if // Keep diagnostics that do not have an associated file
              if (!diagnostic.fileName) return diagnostic

              // coverage ignore if // Before we do all the async resolution below, check our cache
              if (externalFiles.has(diagnostic.fileName)) return undefined

              // Get the source file metadata for this diagnostic (expensive)
              // and filter out anything from external libraries....
              const metadata = await program.getSourceFileMetadata(diagnostic.fileName)
              if (metadata?.isDefaultLibrary || metadata?.isFromExternalLibrary) {
                externalFiles.add(diagnostic.fileName)
                return undefined
              }

              // Anything else, we keep!
              return diagnostic
            }),
          )
        ).filter((diagnostic): diagnostic is Diagnostic => !!diagnostic)
        context.log.warn(`Filtered diagnostics in ${Date.now() - now}ms`)

        // When emitting, let's emit the files
        if (emitOnly !== null) {
          // Emit the files for this program and collect diagnostics
          const emitted = await program.emit(emitOnly)
          diagnostics.push(...emitted.diagnostics)

          // Make sure that we add any emitted file to the list to be returned
          if (emitted.emittedFiles?.length) {
            emitted.emittedFiles.forEach((file) => {
              assertAbsolutePath(file)
              emittedFiles.push(file)
            })
          }

          // Report an error if emitting was skipped for some reason (we should
          // have some diagnostics associated with this, but still...)
          // coverage ignore if // don't know how to test this...
          if (emitted.emitSkipped) {
            if (project.configFileName && isAbsolutePath(project.configFileName)) {
              report.add({
                level: ERROR,
                message: `Unable to emit files for this project`,
                file: project.configFileName,
              })
            } else {
              report.add({
                level: ERROR,
                message: `Unable to emit files for unknown project`,
              })
            }
          }
        }

        // Add all diagnostics to the report
        report.add(...convertDiagnostics(diagnostics, deprecationsLevel))
      }
    } finally {
      if (api) await api.close()
    }

    report.done()

    const outputPath = commonPath(files.directory, ...emittedFiles)
    return Files.builder(outputPath)
      .add(...emittedFiles)
      .build()
  }
}

export class TypeScriptBuild implements Plug<void> {
  constructor(private readonly _options: TypeScriptBuildOptions = {}) {}

  async pipe(files: Files, context: Context): Promise<void> {
    // Destructure the build options for easier access
    const { overrideCompilerOptions = {}, stopBuildOnErrors = false, verbose = true, force = true } = this._options

    // Create our TypeScript API and report for this plug
    const report = context.log.report('TypeScript Build Report')

    let api: API | undefined = undefined
    let orchestrator: BuildOrchestrator | undefined = undefined
    try {
      api = new API({ cwd: files.directory })
      orchestrator = await api.createBuildOrchestrator([...files.absolutePaths()], {
        cwd: files.directory,
        // From our options
        overrideCompilerOptions,
        stopBuildOnErrors,
        verbose,
        force,
      })

      const results = await orchestrator.build()

      if (results.diagnostics) report.add(...convertDiagnostics(results.diagnostics))

      if (results.status !== 0) {
        report.add({
          level: ERROR,
          message: `Build failed with status code ${results.status}`,
        })
      }
    } finally {
      if (orchestrator) await orchestrator.dispose()
      if (api) await api.close()
    }

    report.done()
  }
}

/* ========================================================================== *
 * TYPESCRIPT 7 HELPERS                                                       *
 * ========================================================================== */

/**
 * Compile the project identified by the specified configuration file
 * (either a `tsconfig.json` or a directory containing one).
 *
 * This is roughly equivalent to the command line `tsc --project <config>`.
 */
export function tsc(config: string, options: TscOptions = {}): Pipe {
  const { directory, ...opts } = options
  return using(config, { directory }).plug(new TypeScript(opts))
}

/* ========================================================================== */

/**
 * Compile the project identified by the specified configuration file
 * (either a `tsconfig.json` or a directory containing one) and all of its
 * references.
 *
 * This is roughly equivalent to the command line `tsc --build <config>`.
 */
export function tsbuild(config: string, options: TscBuildOptions = {}): Promise<undefined> {
  const { directory, ...opts } = options
  return using(config, { directory }).plug(new TypeScriptBuild(opts))
}
