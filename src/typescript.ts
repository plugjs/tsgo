import { using } from '@plugjs/plug'
import { assert } from '@plugjs/plug/asserts'
import { Files } from '@plugjs/plug/files'
import { ERROR } from '@plugjs/plug/logging'
import { commonPath, getAbsoluteParent, resolveAbsolutePath } from '@plugjs/plug/paths'
import { API, EmitOnly } from 'typescript/unstable/async'

import { convertDiagnostics } from './diagnostics.ts'
import { findProjectConfig, findProjectReferences, readProjectConfig, resolveProjectOrder } from './projects.ts'

import type { TscOptions, TypeScriptOptions } from './index.ts'
import type { Pipe } from '@plugjs/plug'
import type { AbsolutePath } from '@plugjs/plug/paths'
import type { Context, Plug } from '@plugjs/plug/pipe'
import type { Snapshot } from 'typescript/unstable/async'

/* ========================================================================== *
 * TYPESCRIPT 7 PLUG IMPLEMENTATION                                           *
 * ========================================================================== */

export class TypeScript implements Plug<Files> {
  private _emitOnly: EmitOnly | null
  private _reportDeprecations: 'warn' | 'notice' | 'off'
  private _projectReferences: boolean

  constructor(options: TypeScriptOptions = {}) {
    const { projectReferences, reportDeprecations, emitOnly } = options
    this._projectReferences = !!projectReferences

    switch (emitOnly) {
      // If *none* or *false* we don't emit any files at all
      case 'none':
      case false:
        this._emitOnly = null
        break
      // If *js* we only emit JavaScript files
      case 'js':
        this._emitOnly = EmitOnly.OnlyJs
        break
      // If *dts* we only emit declaration files
      case 'dts':
        this._emitOnly = EmitOnly.OnlyDts
        break
      // If *all* or *true* (default) we emit all files
      case 'all':
      case true:
      default:
        this._emitOnly = EmitOnly.All
        break
    }

    switch (reportDeprecations) {
      // If *warn* we report deprecations as warnings
      case 'warn':
        this._reportDeprecations = 'warn'
        break
      // If *off* or *false* we don't report deprecations at all
      case 'off':
      case false:
        this._reportDeprecations = 'off'
        break
      // If *notice* or *true* (default) we report deprecations as notices
      case 'notice':
      case true:
      default:
        this._reportDeprecations = 'notice'
        break
    }
  }

  async pipe(files: Files, context: Context): Promise<Files> {
    // Create our TypeScript API and report for this plug
    const api = new API({ cwd: files.directory })
    const report = context.log.report('TypeScript Report')

    // This is the list of emitted files to return to the pipe...
    const emittedFiles: AbsolutePath[] = []

    try {
      // The list of projects to build (in order) and the snapshot used
      // to build them.
      let projects: AbsolutePath[]
      let snapshot: Snapshot

      // First of all figure out whether we have to build project references
      // too or not... This will determine whether we have to resolve them....
      if (this._projectReferences) {
        // Find all project references for the given configuration files
        const projectReferences = await findProjectReferences(api, ...files.absolutePaths())
        report.add(...projectReferences.errors)
        if (report.errors) report.done()

        // Then determine the build order for all projects and their references
        const projectOrder = resolveProjectOrder(projectReferences.projects)
        report.add(...projectOrder.errors)
        if (report.errors) report.done()

        // At this point, our list of projects to build is the "order"
        snapshot = await api.updateSnapshot({ openProjects: projectOrder.order })
        projects = [...projectOrder.order]
      } else {
        // If we're not building references, then we just build our files
        const configs = [...files.absolutePaths()].map(findProjectConfig)
        snapshot = await api.updateSnapshot({ openProjects: configs })
        projects = [...configs]

        // When resolving the project references above, we already processed
        // any configuration files and added eventual errors to the report...
        // In this case, we have to do it ourselves by reading each config!
        for (const config of configs) {
          const { errors } = await readProjectConfig(api, config)
          report.add(...errors)
        }

        // If we have any errors at this point, we can't continue...
        if (report.errors) report.done()
      }

      // Now build all projects in the order we determined earlier
      for (const project of projects) {
        // Get the actual TypeScript program for this project...
        const program = snapshot.getProject(project)?.program
        assert(program, `Project "${project}" not found in snapshot`)

        // Collect compilation diagnostics for this project (has files)
        const diagnostics = await Promise.all([
          program.getBindDiagnostics(),
          program.getSemanticDiagnostics(),
          program.getSyntacticDiagnostics(),
          program.getSuggestionDiagnostics(),
          program.getDeclarationDiagnostics(),
        ]).then((results) => results.flat())

        // When emitting, let's emit the files
        if (this._emitOnly !== null) {
          // Emit the files for this program and collect diagnostics
          const emitted = await program.emit(this._emitOnly)
          diagnostics.push(...emitted.diagnostics)

          // Make sure that we add any emitted file to the list to be returned
          if (emitted.emittedFiles?.length) {
            const directory = getAbsoluteParent(project)
            const mapper = resolveAbsolutePath.bind(null, directory)
            emittedFiles.push(...emitted.emittedFiles.map((file) => mapper(file)))
          }

          // Report an error if emitting was skipped for some reason (we should
          // have some diagnostics associated with this, but still...)
          // coverage ignore if // don't know how to test this...
          if (emitted.emitSkipped) {
            report.add({
              level: ERROR,
              message: `Unable to emit files for this project`,
              file: project,
            })
          }
        }

        // Add all diagnostics to the report
        report.add(...(await convertDiagnostics(diagnostics, program, this._reportDeprecations)))
      }
    } finally {
      await api.close()
    }

    report.done()

    const outputPath = commonPath(files.directory, ...emittedFiles)
    return Files.builder(outputPath)
      .add(...emittedFiles)
      .build()
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
  return using(config, { directory }).plug(new TypeScript({ ...opts, projectReferences: false }))
}

/* ========================================================================== */

/**
 * Compile the project identified by the specified configuration file
 * (either a `tsconfig.json` or a directory containing one) and all of its
 * references.
 *
 * This is roughly equivalent to the command line `tsc --build <config>`.
 */
export function tsbuild(config: string, options: TscOptions = {}): Pipe {
  const { directory, ...opts } = options
  return using(config, { directory }).plug(new TypeScript({ ...opts, projectReferences: true }))
}
