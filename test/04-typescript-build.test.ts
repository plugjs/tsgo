import { $gry, async, BuildFailure, find, mkdtemp } from '@plugjs/plug'
import { realpath, rm } from '@plugjs/plug/fs'
import { resolveAbsolutePath } from '@plugjs/plug/paths'
import { Context } from '@plugjs/plug/pipe'

import { tsbuild } from '../src/typescript.ts'

import type { AbsolutePath } from '@plugjs/plug'

describe('TypeScript Builder', () => {
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

  it('should compile a TypeScript project with references', async () => {
    const copied = await find('workspaces/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

    await async.runAsync(context, async () => {
      const paths = ['cov8', 'eslint', 'expect5', 'plug', 'tsd', 'zip']
        .map((p) => `workspaces/${p}/dist/${p}`)
        .map((p) => [`${p}.d.ts`, `${p}.d.ts.map`, `${p}.js`, `${p}.js.map`])
        .flat()

      const result = await tsbuild('workspaces/tsconfig.json', { directory: '@' })
      expect(result).toBeUndefined()

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
      await expect(tsbuild('configs/tsconfig-bad-extend.json', { directory: '@' })).toBeRejectedWithError(BuildFailure)

      // In build mode, even with errors, output is created...
      const found = await find('**/*', { directory: '@' })
      expect([...found]).toMatchContents([...copied, 'configs/source.js'])
    })
  })

  it('should fail when compiling a project if errors are detected', async () => {
    log($gry('+------------------------------------------------------------------'))
    const copied = await find('failures/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

    await async.runAsync(context, async () => {
      await expect(tsbuild('failures/tsconfig.json', { directory: '@' })).toBeRejectedWithError(BuildFailure)

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

  it('should fail when compiling a project with recursive references', async () => {
    log($gry('+------------------------------------------------------------------'))
    const copied = await find('recursive/**/*', 'tsconfig.options.json', { directory: 'test' }).copy(tempDir)

    await async.runAsync(context, async () => {
      await expect(tsbuild('recursive', { directory: '@' })) //
        .toBeRejectedWithError(BuildFailure)

      // Make sure we didn't write any files...
      const found = await find('**/*', { directory: '@' })
      expect([...found]).toMatchContents([...copied])
    })
  })
})
