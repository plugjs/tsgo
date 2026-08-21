import { ERROR, NOTICE, WARN } from '@plugjs/plug/logging'
import { assertAbsolutePath } from '@plugjs/plug/paths'
import { DiagnosticCategory } from 'typescript/unstable/async'

import type { ReportRecord } from '@plugjs/plug/logging'
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
  const converted = await Promise.all(
    diagnostics.map(async (diagnostic) => {
      // First of all see how we need to handle deprecations: when "off" we
      // suppress them, when "warn" we convert them to warnings...
      if (diagnostic.reportsDeprecated) {
        // Nope! No deprecations to be reported!
        if (deprecations === 'off') return

        // If deprecations are set to "warn" we convert the category to a
        // warning (instead of a notice), obviously unless they are errors...
        if (deprecations === 'warn' && diagnostic.category !== DiagnosticCategory.Error) {
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
      const isNotice = diagnostic.category !== DiagnosticCategory.Error
      if (isExternal && isNotice) return

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
  const records = converted.filter((record): record is ReportRecord => !!record)
  // Remove duplicates (if any) and return the unique records and return
  return records.filter(
    (item, index) =>
      records.findIndex(
        (other) =>
          item.level === other.level &&
          item.message === other.message &&
          item.file === other.file &&
          item.line === other.line &&
          item.column === other.column &&
          item.length === other.length,
      ) === index,
  )
}
