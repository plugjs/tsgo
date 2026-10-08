import { $gry, async, BuildFailure, find, mkdtemp } from '@plugjs/plug'
import { realpath, rm } from '@plugjs/plug/fs'
import { resolveAbsolutePath } from '@plugjs/plug/paths'
import { Context } from '@plugjs/plug/pipe'

import { tsc } from '../src/typescript.ts'

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

  it('should compile a project emitting only JavaScript files', async () => {
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

      // To be in-line with the build part, we always emit files
      const found = await find('**/*', { directory: '@' })
      expect([...found]).toMatchContents([...copied, 'configs/source.js'])
    })
  })

  it('should fail when compiling a project if errors are detected', async () => {
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
