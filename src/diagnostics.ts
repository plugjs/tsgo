import { ERROR, NOTICE, WARN } from '@plugjs/plug/logging'
import { assertAbsolutePath } from '@plugjs/plug/paths'
import { DiagnosticCategory } from 'typescript/async'

import type { ReportRecord } from '@plugjs/plug/logging'
import type { Diagnostic } from 'typescript/async'

function convertDiagnostic(diagnostic: Diagnostic): ReportRecord {
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

  if (diagnostic.startPosition) {
    const pos = diagnostic.startPosition
    record.line = pos.line + 1
    record.column = pos.character + 1
    record.length = diagnostic.end - diagnostic.pos
    record.source = diagnostic.source
  }

  return record
}

export function convertDiagnostics(
  diagnostics: readonly Diagnostic[],
  deprecations: 'warn' | 'notice' | 'off' = 'notice',
): ReportRecord[] {
  // Filter out any duplicate diagnostic *before* we convert them to report
  // records (that might be expensive because of source file lookups)
  const seen = new Set<string>()
  const unique = diagnostics.filter((diagnostic) => {
    const key = JSON.stringify([
      diagnostic.category,
      diagnostic.code,
      diagnostic.text,
      diagnostic.pos,
      diagnostic.end,
      diagnostic.fileName,
    ])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Convert all diagnostics to report records
  const converted = unique.map((diagnostic) => {
    // Anything not an error is not critical
    const isNonCritical = diagnostic.category !== DiagnosticCategory.Error

    // First of all see how we need to handle non-error deprecations: when
    // "off" we suppress them, when "warn" we convert them to warnings...
    if (diagnostic.reportsDeprecated && isNonCritical) {
      if (deprecations === 'off') return // simply filter this out...
      if (deprecations === 'warn') {
        diagnostic = { ...diagnostic, category: DiagnosticCategory.Warning }
      }
    }

    // Convert our diagnostic to a report record and return it
    return convertDiagnostic(diagnostic)
  })

  // Filter out any null/undefined records
  return converted.filter((record): record is ReportRecord => !!record)
}
