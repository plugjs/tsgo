import { ERROR, NOTICE, WARN } from '@plugjs/plug/logging'
import { DiagnosticCategory } from 'typescript/unstable/async'

import { convertDiagnostics, convertProjectDiagnostics } from '../src/diagnostics.ts'

import type { Program } from 'typescript/unstable/async'

describe('TypeScript Diagnostics', () => {
  const program: Program = {
    getSourceFileMetadata: async (file: string) => {
      return file === '/path/to/external.ts'
        ? { isFromExternalLibrary: true }
        : file === '/path/to/default.ts'
          ? { isDefaultLibrary: true }
          : undefined
    },
    getSourceFile: async (file: string) => {
      if (file !== '/path/to/source.ts') return
      return {
        getLineAndCharacterOfPosition: (pos: number) => ({ line: 0, character: pos }),
        getFullText: () => 'const x = 42;',
      }
    },
    getConfigSourceFile: async (file: string) => {
      if (file !== '/path/to/config.ts') return
      return {
        getLineAndCharacterOfPosition: (pos: number) => ({ line: 0, character: pos }),
        getFullText: () => '{"hello":"world"}',
      }
    },
  } as any

  it('should convert some simple diagnostics without duplicates', async () => {
    const diagnostics = [
      {
        category: DiagnosticCategory.Error,
        code: 1111,
        text: 'This error has no file',
        pos: 0,
        end: 10,
      },
      {
        category: DiagnosticCategory.Warning,
        code: 2222,
        text: 'This is a warning',
        pos: 0,
        end: 10,
        fileName: '/path/to/warning.ts',
      },
      {
        category: DiagnosticCategory.Suggestion,
        code: 3333,
        text: 'This is a suggestion',
        pos: 0,
        end: 10,
        fileName: '/path/to/suggestion.ts',
      },
      {
        category: DiagnosticCategory.Message,
        code: 4444,
        text: 'This is a message',
        pos: 0,
        end: 10,
        fileName: '/path/to/message.ts',
      },
    ]

    const result = await convertDiagnostics([...diagnostics, ...diagnostics], program)

    expect(result).toEqual([
      { level: ERROR, message: 'This error has no file', tags: ['ts1111'] },
      { level: WARN, message: 'This is a warning', tags: ['ts2222'], file: '/path/to/warning.ts' },
      { level: NOTICE, message: 'This is a suggestion', tags: ['ts3333'], file: '/path/to/suggestion.ts' },
      { level: NOTICE, message: 'This is a message', tags: ['ts4444'], file: '/path/to/message.ts' },
    ])
  })

  it('should correctly handle a diagnostic with a source file', async () => {
    const result = await convertDiagnostics(
      [
        {
          category: DiagnosticCategory.Error,
          code: 1111,
          text: 'A simple error',
          pos: 0,
          end: 10,
          fileName: '/path/to/source.ts',
        },
      ],
      program,
    )

    expect(result).toEqual([
      {
        level: ERROR,
        message: 'A simple error',
        tags: ['ts1111'],
        file: '/path/to/source.ts',
        line: 1,
        column: 1,
        length: 10,
        source: 'const x = 42;',
      },
    ])
  })

  it('should correctly handle a diagnostic with a config file', async () => {
    const result = await convertDiagnostics(
      [
        {
          category: DiagnosticCategory.Error,
          code: 1111,
          text: 'A simple error',
          pos: 0,
          end: 10,
          fileName: '/path/to/config.ts',
        },
      ],
      program,
    )

    expect(result).toEqual([
      {
        level: ERROR,
        message: 'A simple error',
        tags: ['ts1111'],
        file: '/path/to/config.ts',
        line: 1,
        column: 1,
        length: 10,
        source: '{"hello":"world"}',
      },
    ])
  })

  it('should correctly handle a diagnostic for a config file', async () => {
    const result = await convertProjectDiagnostics(
      [
        {
          category: DiagnosticCategory.Error,
          code: 1111,
          text: 'A simple error',
          pos: 0,
          end: 10,
        },
        {
          category: DiagnosticCategory.Warning,
          code: 2222,
          text: 'A simple warning',
          pos: 0,
          end: 10,
          fileName: '/path/to/another-config.ts',
        },
      ],
      program,
      '/path/to/config.ts' as any, // AbsolutePath
    )

    expect(result).toEqual([
      {
        level: ERROR,
        message: 'A simple error',
        tags: ['ts1111'],
        file: '/path/to/config.ts',
        line: 1,
        column: 1,
        length: 10,
        source: '{"hello":"world"}',
      },
      {
        level: WARN,
        message: 'A simple warning',
        tags: ['ts2222'],
        file: '/path/to/another-config.ts',
      },
    ])
  })

  it('should add some tags to specific diagnostics', async () => {
    const result = await convertDiagnostics(
      [
        {
          category: DiagnosticCategory.Error,
          code: 1111,
          text: 'This is a simple error',
          pos: 0,
          end: 10,
          reportsUnnecessary: true,
        },
        {
          category: DiagnosticCategory.Warning,
          code: 2222,
          text: 'This is a simple warning',
          pos: 0,
          end: 10,
          reportsDeprecated: true,
        },
      ],
      program,
    )

    expect(result).toEqual([
      { level: ERROR, message: 'This is a simple error', tags: ['ts1111', 'unnecessary'] },
      { level: WARN, message: 'This is a simple warning', tags: ['ts2222', 'deprecated'] },
    ])
  })

  it('should correctly handle deprecation settings', async () => {
    const diagnostics = [
      {
        category: DiagnosticCategory.Error,
        code: 1234,
        text: 'This is a deprecation error',
        pos: 0,
        end: 10,
        reportsDeprecated: true,
      },
      {
        category: DiagnosticCategory.Suggestion,
        code: 1234,
        text: 'This is a deprecation warning',
        pos: 0,
        end: 10,
        reportsDeprecated: true,
      },
    ]

    const off = await convertDiagnostics(diagnostics, program, 'off')
    expect(off).toEqual([
      { level: ERROR, message: 'This is a deprecation error', tags: ['ts1234', 'deprecated'] }, //
    ])

    const notice = await convertDiagnostics(diagnostics, program, 'notice')
    expect(notice).toEqual([
      { level: ERROR, message: 'This is a deprecation error', tags: ['ts1234', 'deprecated'] },
      { level: NOTICE, message: 'This is a deprecation warning', tags: ['ts1234', 'deprecated'] },
    ])

    const warn = await convertDiagnostics(diagnostics, program, 'warn')
    expect(warn).toEqual([
      { level: ERROR, message: 'This is a deprecation error', tags: ['ts1234', 'deprecated'] },
      { level: WARN, message: 'This is a deprecation warning', tags: ['ts1234', 'deprecated'] },
    ])
  })

  it('should filter non-critical diagnostics from libraries', async () => {
    const result = await convertDiagnostics(
      [
        {
          category: DiagnosticCategory.Error,
          code: 1234,
          text: 'This is an external library error',
          pos: 0,
          end: 10,
          fileName: '/path/to/external.ts',
        },
        {
          category: DiagnosticCategory.Warning,
          code: 1234,
          text: 'This is an external library error',
          pos: 0,
          end: 10,
          fileName: '/path/to/external.ts',
        },
        {
          category: DiagnosticCategory.Error,
          code: 1234,
          text: 'This is a default library error',
          pos: 0,
          end: 10,
          fileName: '/path/to/default.ts',
        },
        {
          category: DiagnosticCategory.Warning,
          code: 1234,
          text: 'This is a default library error',
          pos: 0,
          end: 10,
          fileName: '/path/to/default.ts',
        },
        {
          category: DiagnosticCategory.Error,
          code: 1234,
          text: 'This is an internal file error',
          pos: 0,
          end: 10,
          fileName: '/path/to/internal.ts',
        },
        {
          category: DiagnosticCategory.Warning,
          code: 1234,
          text: 'This is an internal file warning',
          pos: 0,
          end: 10,
          fileName: '/path/to/internal.ts',
        },
      ],
      program,
    )

    expect(result).toEqual([
      { level: ERROR, message: 'This is an external library error', tags: ['ts1234'], file: '/path/to/external.ts' },
      { level: ERROR, message: 'This is a default library error', tags: ['ts1234'], file: '/path/to/default.ts' },
      { level: ERROR, message: 'This is an internal file error', tags: ['ts1234'], file: '/path/to/internal.ts' },
      { level: WARN, message: 'This is an internal file warning', tags: ['ts1234'], file: '/path/to/internal.ts' },
    ])
  })
})
