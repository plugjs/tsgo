import { install } from '@plugjs/plug/pipe'

import { TypeScript, TypeScriptBuild } from './typescript.ts'

import type { OverrideCompilerOptions } from 'typescript/unstable/async'

/** Options for the `typescriptBuild` plug. */
export interface TypeScriptBuildOptions {
  /**
   * Force building all projects in the build. Defaults to `true`.
   *
   * This is equivalent to running `tsc --build --force`.
   */
  force?: boolean

  /**
   * Skip building downstream projects on error in upstream project. Defaults
   * to `false`.
   *
   * This is equivalent to running `tsc --build --stopBuildOnErrors`.
   */
  stopBuildOnErrors?: boolean

  /**
   * Enable verbose logging during the build. Defaults to `true`.
   *
   * This is equivalent to running `tsc --build --verbose`.
   */
  verbose?: boolean

  /** Override the default TypeScript compiler options for the build. */
  overrideCompilerOptions?: OverrideCompilerOptions
}

/** Options for the `typescript` plug. */
export interface TypeScriptOptions {
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

/** Options for the {@link tsc} helper. */
export interface TscOptions extends TypeScriptOptions {
  /** Base directory used to resolve the configuration path. */
  directory?: string
}

/** Options for the {@link tscBuild} helper. */
export interface TscBuildOptions extends TypeScriptBuildOptions {
  /** Base directory used to resolve the configuration path. */
  directory?: string
}

declare module '@plugjs/plug' {
  export interface Pipe {
    /**
     * Run the {@link https://www.typescriptlang.org/ TypeScript Compiler}
     * version 7 (native) over the `tsconfig.json` configuration files
     * given as input to this {@link Pipe} instance.
     *
     * This is equivalent to running `tsc --project`.
     */
    typescript(): Pipe

    /**
     * Run the {@link https://www.typescriptlang.org/ TypeScript Compiler}
     * version 7 (native) over the `tsconfig.json` configuration files
     * given as input to this {@link Pipe} instance.
     *
     * This is equivalent to running `tsc --project`.
     *
     * @param options {@link TypeScriptOptions} to use for the build.
     */
    typescript(options: TypeScriptOptions): Pipe

    /**
     * Run the {@link https://www.typescriptlang.org/ TypeScript Builder}
     * version 7 (native) over the `tsconfig.json` configuration files
     * given as input to this {@link Pipe} instance.
     *
     * This is equivalent to running `tsc --build`.
     */
    typescriptBuild(): Promise<undefined>

    /**
     * Run the {@link https://www.typescriptlang.org/ TypeScript Builder}
     * version 7 (native) over the `tsconfig.json` configuration files
     * given as input to this {@link Pipe} instance.
     *
     * This is equivalent to running `tsc --build`.
     *
     * @param options {@link TypeScriptBuildOptions} to use for the build.
     */
    typescriptBuild(options: TypeScriptBuildOptions): Promise<undefined>
  }
}

install('typescript', TypeScript)
install('typescriptBuild', TypeScriptBuild)

export { tsbuild, tsc } from './typescript.ts'
