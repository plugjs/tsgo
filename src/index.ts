import { install } from '@plugjs/plug/pipe'

import { TypeScript } from './typescript.ts'

export interface TypeScriptOptions {
  projectReferences?: boolean
  reportDeprecations?: 'warn' | 'notice' | 'off' | boolean
  emitOnly?: 'js' | 'dts' | 'all' | 'none' | boolean
}

export interface TscOptions extends Omit<TypeScriptOptions, 'projectReferences'> {
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

export { tsc, tscBuild } from './typescript.ts'
