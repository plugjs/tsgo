import { $gry, async, BuildFailure, find, mkdtemp } from '@plugjs/plug'
import { realpath, rm } from '@plugjs/plug/fs'
import { resolveAbsolutePath } from '@plugjs/plug/paths'
import { Context } from '@plugjs/plug/pipe'
import { EmitOnly } from 'typescript/unstable/async'

import { tsc, tscBuild, TypeScript } from '../src/typescript.ts'

import type { AbsolutePath } from '@plugjs/plug'

describe('TypeScript Compiler', () => {
  let tempDir: AbsolutePath
  let context: Context

  beforeEach(async () => {
    tempDir = (await realpath(mkdtemp())) as AbsolutePath
    const buildFile = resolveAbsolutePath(tempDir, 'build.ts')
    context = new Context(buildFile, async.requireContext().taskName)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true })
  })

  describe('Constructor Options', () => {
    it('should construct with no options', async () => {
      const instance = new TypeScript()
      expect(instance)
        .toHaveProperty('_emitOnly', expect.toEqual(EmitOnly.All))
        .toHaveProperty('_reportDeprecations', expect.toEqual('notice'))
        .toHaveProperty('_projectReferences', expect.toBeFalse())
    })

    it('should correctly set the "emitOnly" option', async () => {
      expect(new TypeScript({ emitOnly: undefined })).toHaveProperty('_emitOnly', expect.toEqual(EmitOnly.All))
      expect(new TypeScript({ emitOnly: 'all' })).toHaveProperty('_emitOnly', expect.toEqual(EmitOnly.All))
      expect(new TypeScript({ emitOnly: true })).toHaveProperty('_emitOnly', expect.toEqual(EmitOnly.All))

      expect(new TypeScript({ emitOnly: 'js' })).toHaveProperty('_emitOnly', expect.toEqual(EmitOnly.OnlyJs))
      expect(new TypeScript({ emitOnly: 'dts' })).toHaveProperty('_emitOnly', expect.toEqual(EmitOnly.OnlyDts))

      expect(new TypeScript({ emitOnly: 'none' })).toHaveProperty('_emitOnly', expect.toEqual(null))
      expect(new TypeScript({ emitOnly: false })).toHaveProperty('_emitOnly', expect.toEqual(null))
    })

    it('should correctly set the "reportDeprecations" option', async () => {
      expect(new TypeScript({ reportDeprecations: undefined })).toHaveProperty(
        '_reportDeprecations',
        expect.toEqual('notice'),
      )
      expect(new TypeScript({ reportDeprecations: 'notice' })).toHaveProperty(
        '_reportDeprecations',
        expect.toEqual('notice'),
      )
      expect(new TypeScript({ reportDeprecations: true })).toHaveProperty(
        '_reportDeprecations',
        expect.toEqual('notice'),
      )

      expect(new TypeScript({ reportDeprecations: 'warn' })).toHaveProperty(
        '_reportDeprecations',
        expect.toEqual('warn'),
      )

      expect(new TypeScript({ reportDeprecations: 'off' })).toHaveProperty('_reportDeprecations', expect.toEqual('off'))
      expect(new TypeScript({ reportDeprecations: false })).toHaveProperty('_reportDeprecations', expect.toEqual('off'))
    })

    it('should correctly set the "projectReferences" option', async () => {
      expect(new TypeScript({ projectReferences: undefined })).toHaveProperty('_projectReferences', expect.toBeFalse())
      expect(new TypeScript({ projectReferences: false })).toHaveProperty('_projectReferences', expect.toBeFalse())
      expect(new TypeScript({ projectReferences: true })).toHaveProperty('_projectReferences', expect.toBeTrue())
    })
  })

  describe('Single Project Compilation', () => {
    it('should compile a project', async () => {
      const copied = await find('workspaces/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        const files = await tsc('workspaces/plug', { directory: '@' })
        expect([...files]).toMatchContents([
          'workspaces/plug/dist/plug.d.ts', // files emitted by the compiler
          'workspaces/plug/dist/plug.d.ts.map',
          'workspaces/plug/dist/plug.js',
          'workspaces/plug/dist/plug.js.map',
        ])

        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([
          ...copied, // all files we copied above plus...
          ...files, // ... all files emitted by the compiler
        ])
      })
    })

    it('should compile a project emitting only javascript files', async () => {
      const copied = await find('workspaces/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        const files = await tsc('workspaces/plug', { directory: '@', emitOnly: 'js' })
        expect([...files]).toMatchContents([
          'workspaces/plug/dist/plug.js', // files emitted by the compiler
          'workspaces/plug/dist/plug.js.map',
        ])

        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([
          ...copied, // all files we copied above plus...
          ...files, // ... all files emitted by the compiler
        ])
      })
    })

    it('should compile a project emitting only declaration files', async () => {
      const copied = await find('workspaces/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        const files = await tsc('workspaces/plug', { directory: '@', emitOnly: 'dts' })
        expect([...files]).toMatchContents([
          'workspaces/plug/dist/plug.d.ts', // files emitted by the compiler
          'workspaces/plug/dist/plug.d.ts.map',
        ])

        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([
          ...copied, // all files we copied above plus...
          ...files, // ... all files emitted by the compiler
        ])
      })
    })

    it('should compile a project without emitting files', async () => {
      const copied = await find('workspaces/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        const files = await tsc('workspaces/plug', { directory: '@', emitOnly: 'none' })
        expect([...files]).toMatchContents([])

        // Make sure we didn't write any files...
        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([...copied])
      })
    })

    it('should fail when compiling a project with an invalid configuration', async () => {
      log($gry('+------------------------------------------------------------------'))
      const copied = await find('configs/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        await expect(tsc('configs/tsconfig-bad-extend.json', { directory: '@' })).toBeRejectedWithError(BuildFailure)

        // Make sure we didn't write any files...
        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([...copied])
      })
    })

    it('should fail when compiling a project when errors are detected', async () => {
      log($gry('+------------------------------------------------------------------'))
      const copied = await find('failures/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        await expect(tsc('failures/tsconfig.json', { directory: '@' })).toBeRejectedWithError(BuildFailure)

        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([
          ...copied, // all files we copied above plus...
          'failures/dist/warnings.d.ts', // files emitted by the compiler (even though there were errors)
          'failures/dist/warnings.d.ts.map',
          'failures/dist/warnings.js',
          'failures/dist/warnings.js.map',
        ])
      })
    })

    it('should raise deprecation messages to warnings', async () => {
      log($gry('+------------------------------------------------------------------'))
      const copied = await find('deprecation/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        const files = await tsc('deprecation/tsconfig.json', { directory: '@', reportDeprecations: 'warn' })
        expect([...files]).toMatchContents([
          'deprecation/dist/warnings.d.ts',
          'deprecation/dist/warnings.d.ts.map',
          'deprecation/dist/warnings.js',
          'deprecation/dist/warnings.js.map',
        ])

        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([
          ...copied, // all files we copied above plus...
          ...files, // ... all files emitted by the compiler
        ])
      })
    })

    it('should silence deprecation messages', async () => {
      const copied = await find('deprecation/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        const files = await tsc('deprecation/tsconfig.json', { directory: '@', reportDeprecations: 'off' })
        expect([...files]).toMatchContents([
          'deprecation/dist/warnings.d.ts',
          'deprecation/dist/warnings.d.ts.map',
          'deprecation/dist/warnings.js',
          'deprecation/dist/warnings.js.map',
        ])

        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([
          ...copied, // all files we copied above plus...
          ...files, // ... all files emitted by the compiler
        ])
      })
    })
  })

  describe('Project References Compilation', () => {
    it('should compile a TypeScript project with references', async () => {
      const copied = await find('workspaces/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        const paths = ['cov8', 'eslint', 'expect5', 'plug', 'tsd', 'zip']
          .map((p) => `workspaces/${p}/dist/${p}`)
          .map((p) => [`${p}.d.ts`, `${p}.d.ts.map`, `${p}.js`, `${p}.js.map`])
          .flat()

        const files = await tscBuild('workspaces/tsconfig.json', { directory: '@' })
        expect([...files]).toMatchContents(paths)

        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([
          ...copied, // all files we copied above plus...
          ...paths, // ... all the files we should have generated
        ])
      })
    })

    it('should fail when compiling a project with an invalid configuration', async () => {
      log($gry('+------------------------------------------------------------------'))
      const copied = await find('configs/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        await expect(tscBuild('configs/tsconfig-bad-extend.json', { directory: '@' })) //
          .toBeRejectedWithError(BuildFailure)

        // Make sure we didn't write any files...
        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([...copied])
      })
    })

    it('should fail when compiling a project with recursive references', async () => {
      log($gry('+------------------------------------------------------------------'))
      const copied = await find('recursive/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

      await async.runAsync(context, async () => {
        await expect(tscBuild('recursive', { directory: '@' })) //
          .toBeRejectedWithError(BuildFailure)

        // Make sure we didn't write any files...
        const found = await find('**/*', { directory: '@' })
        expect([...found]).toMatchContents([...copied])
      })
    })
  })
})
