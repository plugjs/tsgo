import { install } from '@plugjs/plug/pipe'

import { TypeScript } from './typescript.ts'

/** Options for the {@link Pipe.typescript TypeScript} plug. */
export interface TypeScriptOptions {
  /** Whether referenced projects are built too. Defaults to `false`. */
  projectReferences?: boolean

  /**
   * Controls how deprecation diagnostics are reported. Use `'notice'` or
   * `true` for notices, `'warn'` for warnings, and `'off'` or `false` to
   * silence them. Defaults to `'notice'`.
   */
  reportDeprecations?: 'warn' | 'notice' | 'off' | boolean

  /**
   * Controls which files TypeScript emits. Use `'all'` or `true` for
   * JavaScript and declaration files, `'js'` for JavaScript files, `'dts'`
   * for declaration files, and `'none'` or `false` to type-check without
   * emitting files. Defaults to `'all'`.
   */
  emitOnly?: 'js' | 'dts' | 'all' | 'none' | boolean
}

/** Options for the {@link tsc} and {@link tsbuild} helpers. */
export interface TscOptions extends Omit<TypeScriptOptions, 'projectReferences'> {
  /** Base directory used to resolve the configuration path. */
  directory?: string
}

declare module '@plugjs/plug' {
  export interface Pipe {
    /**
     * Run the {@link https://www.typescriptlang.org/ TypeScript Compiler}
     * version 7 (native) over the `tsconfig.json` configuration files
     * given as input to this {@link Pipe} instance.
     */
    typescript(): Pipe

    /**
     * Run the {@link https://www.typescriptlang.org/ TypeScript Compiler}
     * version 7 (native) over the `tsconfig.json` configuration files
     * given as input to this {@link Pipe} instance.
     *
     * @param options {@link TypeScriptOptions} to use for the build.
     */
    typescript(options: TypeScriptOptions): Pipe
  }
}

install('typescript', TypeScript)

export { tsbuild, tsc } from './typescript.ts'
