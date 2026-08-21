import { ERROR, NOTICE, WARN } from '@plugjs/plug/logging'
import { assertAbsolutePath } from '@plugjs/plug/paths'
import { DiagnosticCategory } from 'typescript/unstable/async'

import type { ReportRecord } from '@plugjs/plug/logging'
import type { AbsolutePath } from '@plugjs/plug/paths'
import type { SourceFile } from 'typescript/unstable/ast'
import type { Diagnostic, Program } from 'typescript/unstable/async'

function convertDiagnostic(diagnostic: Diagnostic, sourceFile?: SourceFile): ReportRecord {
  const record: ReportRecord & { tags: string[] } = {
    level: NOTICE,
    message: diagnostic.text,
    tags: [`ts${diagnostic.code}`],
  }

  switch (diagnostic.category) {
    case DiagnosticCategory.Error:
      record.level = ERROR
      break
    case DiagnosticCategory.Warning:
      record.level = WARN
      break
  }

  if (diagnostic.reportsDeprecated) record.tags.push('deprecated')
  if (diagnostic.reportsUnnecessary) record.tags.push('unnecessary')

  if (diagnostic.fileName) {
    assertAbsolutePath(diagnostic.fileName)
    record.file = diagnostic.fileName
  }

  if (sourceFile) {
    const pos = sourceFile.getLineAndCharacterOfPosition(diagnostic.pos)
    record.line = pos.line + 1
    record.column = pos.character + 1
    record.length = diagnostic.end - diagnostic.pos
    record.source = sourceFile.getFullText()
  }

  return record
}

export async function convertDiagnostics(
  diagnostics: readonly Diagnostic[],
  program: Program,
  deprecations: 'warn' | 'notice' | 'off' = 'notice',
): Promise<ReportRecord[]> {
  // Filter out any duplicate diagnostic *before* we convert them to report
  // records (that might be expensive because of source file lookups)
  const unique = diagnostics.filter((diagnostic, index) => {
    const found = diagnostics.findIndex((other) => {
      return (
        diagnostic.category === other.category &&
        diagnostic.code === other.code &&
        diagnostic.text === other.text &&
        diagnostic.pos === other.pos &&
        diagnostic.end === other.end &&
        diagnostic.fileName === other.fileName
      )
    })
    return found === index
  })

  // Convert all diagnostics to report records
  const converted = await Promise.all(
    unique.map(async (diagnostic) => {
      // Anthing not an error is not critical
      const isNonCritical = diagnostic.category !== DiagnosticCategory.Error

      // First of all see how we need to handle non-error deprecations: when
      // "off" we suppress them, when "warn" we convert them to warnings...
      if (diagnostic.reportsDeprecated && isNonCritical) {
        if (deprecations === 'off') return // simply filter this out...
        if (deprecations === 'warn') {
          diagnostic = { ...diagnostic, category: DiagnosticCategory.Warning }
        }
      }

      // First figure out where this diagnostic came from...
      const sourceFileMetadata = diagnostic.fileName
        ? await program.getSourceFileMetadata(diagnostic.fileName)
        : /* coverage ignore next */ undefined

      // If the source file is in the default library (e.g. "lib.dom.ts") or
      // from an external library (in "node_modules") then we ONLY keep errors
      // and (we ignore things like warnings, suggestions, ...)
      const isExternal = sourceFileMetadata?.isDefaultLibrary || sourceFileMetadata?.isFromExternalLibrary
      if (isExternal && isNonCritical) return

      // Get the source file and its metadata (if any) for the diagnostic...
      // We do this *after* the external check above as getting the source file
      // is quite expensive (especially for things like "lib.es5.dts")...
      const sourceFile = diagnostic.fileName
        ? ((await program.getSourceFile(diagnostic.fileName)) ??
          (await program.getConfigSourceFile(diagnostic.fileName)))
        : /* coverage ignore next */ undefined

      // Convert our diagnostic to a report record and return it
      return convertDiagnostic(diagnostic, sourceFile)
    }),
  )

  // Filter out any null/undefined records
  return converted.filter((record): record is ReportRecord => !!record)
}

export async function convertProjectDiagnostics(
  diagnostics: readonly Diagnostic[],
  program: Program,
  fileName: AbsolutePath,
): Promise<ReportRecord[]> {
  // Make sure that we have a file name for the diagnostics
  const fileDiagnostics = diagnostics.map((diagnostic) => {
    if (diagnostic.fileName) return diagnostic
    return { ...diagnostic, fileName }
  })

  // Convert the diagnostics to report records and return them
  return convertDiagnostics(fileDiagnostics, program)
}
