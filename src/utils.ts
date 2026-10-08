import { assert } from '@plugjs/plug/asserts'
import { resolveFile } from '@plugjs/plug/paths'
import { EmitOnly } from 'typescript/unstable/async'

import type { TypeScriptOptions } from './index.ts'
import type { AbsolutePath } from '@plugjs/plug/paths'

/**
 * Find the TypeScript project configuration file for a given path.
 *
 * The path specified can be a `tsconfig.json` file name or a directory
 * containing a `tsconfig.json` file.
 *
 * The returned path is the absolute path of the actual `tsconfig.json` file.
 */
export function findProjectConfig(path: AbsolutePath): AbsolutePath {
  // The specified path can be either a file or a directory containing a
  // "tsconfig.json" file: resolve as a file, then assume it's a directory
  let file = resolveFile(path)
  if (!file) file = resolveFile(path, 'tsconfig.json')
  assert(file, `TypeScript configuration file not found in "${path}"`)
  return file
}

/** Convert a diagnostic level option for deprecations into a consistent value. */
export function diagnosticDeprecationLevel(
  deprecations?: TypeScriptOptions['reportDeprecations'],
): 'warn' | 'notice' | 'off' {
  switch (deprecations) {
    // If *warn* we report deprecations as warnings
    case 'warn':
      return 'warn'
    // If *off* or *false* we don't report deprecations at all
    case 'off':
    case false:
      return 'off'
    // If *notice* or *true* (default) we report deprecations as notices
    /* coverage ignore next */ case 'notice':
    /* coverage ignore next */ case true:
    default:
      return 'notice'
  }
}

/** Convert a emit only option into its corresponding enum value. */
export function emitOnlyOption(emitOnly?: TypeScriptOptions['emitOnly']): EmitOnly | null {
  switch (emitOnly) {
    // If *none* or *false* we don't emit anything
    case 'none':
    case false:
      return null // This is "none"
    // If *js* we only emit JavaScript files
    case 'js':
      return EmitOnly.OnlyJs
    // If *dts* we only emit declaration files
    case 'dts':
      return EmitOnly.OnlyDts
    // In all other cases we emit all files
    /* coverage ignore next */ case 'all':
    /* coverage ignore next */ case true:
    default:
      return EmitOnly.All
  }
}
