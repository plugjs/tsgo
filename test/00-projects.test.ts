import { async } from '@plugjs/plug'

import { findProjectReferences, readProjectConfig, resolveProjectOrder } from '../src/projects.ts'

describe('Projects', () => {
  const context = async.requireContext()

  describe('Read Project Config', () => {
    it('should read the project references from a file', async () => {
      const file = context.resolve('test', 'recursive', 'tsconfig.json')
      const references = await readProjectConfig(file)

      expect(references).toEqual({
        path: file,
        references: expect.toMatchContents([
          context.resolve('test', 'recursive', 'a', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'b', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'c', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'd', 'tsconfig.json'),
        ]),
      })
    })

    it('should read the project config from a directory', async () => {
      const dir = context.resolve('test', 'recursive')
      const file = context.resolve('test', 'recursive', 'tsconfig.json')
      const references = await readProjectConfig(dir)

      expect(references).toEqual({
        path: file,
        references: expect.toMatchContents([
          context.resolve('test', 'recursive', 'a', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'b', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'c', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'd', 'tsconfig.json'),
        ]),
      })
    })

    it('should return no references for an empty project', async () => {
      const file = context.resolve('test', 'empty', 'empty.json')

      const references = await readProjectConfig(file)
      expect(references).toEqual({
        path: file,
        references: expect.toMatchContents([]),
      })
    })

    it('should fail when a "tsconfig.json" file can not be found in a directory', async () => {
      const dir = context.resolve('test', 'empty')
      const file = context.resolve('test', 'empty', 'tsconfig.json')

      await expect(readProjectConfig(dir)).toBeRejected((assert) => {
        assert.toBeError(`TypeScript configuration file "${file}" not found`)
        expect(assert.value).toHaveProperty('cause', expect.toBeError(/ENOENT/))
      })
    })

    it('should fail when a "tsconfig.json" file is not a valid JSON', async () => {
      const file = context.resolve('test', 'empty', 'empty.txt')

      await expect(readProjectConfig(file)).toBeRejected((assert) => {
        assert.toBeError(`Failed to read project references from "${file}"`)
        expect(assert.value).toHaveProperty('cause', expect.toBeError(/error parsing/))
      })
    })

    it('should fail when a project reference in "tsconfig.json" is invalid', async () => {
      const dir = context.resolve('test', 'missing')
      const file = context.resolve('test', 'missing', 'tsconfig.json')

      await expect(readProjectConfig(dir)).toBeRejectedWithError(
        `Failed to resolve project reference "./tsconfig-missing.json" from "${file}"`,
      )
    })
  })

  describe('Find Project References', () => {
    it('should read the project references from a directory', async () => {
      const dir = context.resolve('test', 'recursive')

      const references = await findProjectReferences(dir)
      const result = Object.fromEntries(
        references.entries().map(([project, referringProjects]) => {
          return [project, [...referringProjects]]
        }),
      )

      expect(result).toEqual({
        [context.resolve('test', 'recursive', 'tsconfig.json')]: [],
        [context.resolve('test', 'recursive', 'a', 'tsconfig.json')]: expect.toMatchContents([
          context.resolve('test', 'recursive', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'b', 'tsconfig.json'),
        ]),
        [context.resolve('test', 'recursive', 'b', 'tsconfig.json')]: expect.toMatchContents([
          context.resolve('test', 'recursive', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'c', 'tsconfig.json'),
        ]),
        [context.resolve('test', 'recursive', 'c', 'tsconfig.json')]: expect.toMatchContents([
          context.resolve('test', 'recursive', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'a', 'tsconfig.json'),
        ]),
        [context.resolve('test', 'recursive', 'd', 'tsconfig.json')]: [
          context.resolve('test', 'recursive', 'tsconfig.json'),
        ],
      })
    })

    it('should read the project references from a file', async () => {
      const file = context.resolve('test', 'recursive', 'a', 'tsconfig.json')

      const references = await findProjectReferences(file)
      const result = Object.fromEntries(
        references.entries().map(([project, referringProjects]) => {
          return [project, [...referringProjects]]
        }),
      )

      expect(result).toEqual({
        [context.resolve('test', 'recursive', 'a', 'tsconfig.json')]: [
          context.resolve('test', 'recursive', 'b', 'tsconfig.json'),
        ],
        [context.resolve('test', 'recursive', 'b', 'tsconfig.json')]: [
          context.resolve('test', 'recursive', 'c', 'tsconfig.json'),
        ],
        [context.resolve('test', 'recursive', 'c', 'tsconfig.json')]: [
          context.resolve('test', 'recursive', 'a', 'tsconfig.json'),
        ],
      })
    })

    it('should read the project references from a set of files or directories', async () => {
      const a = context.resolve('test', 'recursive', 'a')
      const d = context.resolve('test', 'recursive', 'd')
      const x = context.resolve('test', 'recursive', 'tsconfig.json')

      const references = await findProjectReferences(a, d, x)
      const result = Object.fromEntries(
        references.entries().map(([project, referringProjects]) => {
          return [project, [...referringProjects]]
        }),
      )

      expect(result).toEqual({
        [context.resolve('test', 'recursive', 'tsconfig.json')]: [],
        [context.resolve('test', 'recursive', 'a', 'tsconfig.json')]: expect.toMatchContents([
          context.resolve('test', 'recursive', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'b', 'tsconfig.json'),
        ]),
        [context.resolve('test', 'recursive', 'b', 'tsconfig.json')]: expect.toMatchContents([
          context.resolve('test', 'recursive', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'c', 'tsconfig.json'),
        ]),
        [context.resolve('test', 'recursive', 'c', 'tsconfig.json')]: expect.toMatchContents([
          context.resolve('test', 'recursive', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'a', 'tsconfig.json'),
        ]),
        [context.resolve('test', 'recursive', 'd', 'tsconfig.json')]: [
          context.resolve('test', 'recursive', 'tsconfig.json'),
        ],
      })
    })

    it('should fail when a "tsconfig.json" file is not a valid JSON', async () => {
      const file = context.resolve('test', 'empty', 'empty.txt')

      await expect(findProjectReferences(file)).toBeRejected((assert) => {
        assert.toBeError(`Failed to read project references from "${file}"`)
        expect(assert.value).toHaveProperty('cause', expect.toBeError(/error parsing/))
      })
    })

    it('should fail when a project reference in "tsconfig.json" is invalid', async () => {
      const dir = context.resolve('test', 'missing')
      const file = context.resolve('test', 'missing', 'tsconfig.json')

      await expect(findProjectReferences(dir)).toBeRejectedWithError(
        `Failed to resolve project reference "./tsconfig-missing.json" from "${file}"`,
      )
    })
  })

  describe('Resolve Project Order', () => {
    it('should resolve the order of projects based on their references', async () => {
      const dir = context.resolve('test', 'workspaces')

      const references = await findProjectReferences(dir)
      const result = resolveProjectOrder(references)

      // No unresolved projects, no cycles, and all projects are resolved...
      expect(result).toEqual({
        unresolved: [],
        cycles: [],
        order: expect.toMatchContents([
          context.resolve('test', 'workspaces', 'plug', 'tsconfig.json'),
          context.resolve('test', 'workspaces', 'cov8', 'tsconfig.json'),
          context.resolve('test', 'workspaces', 'eslint', 'tsconfig.json'),
          context.resolve('test', 'workspaces', 'expect5', 'tsconfig.json'),
          context.resolve('test', 'workspaces', 'tsd', 'tsconfig.json'),
          context.resolve('test', 'workspaces', 'zip', 'tsconfig.json'),
          context.resolve('test', 'workspaces', 'tsconfig.json'),
        ]),
      })

      // The first project is "plug", the last is the root "tsconf.json"...
      expect(result.order.shift()).toEqual(context.resolve('test', 'workspaces', 'plug', 'tsconfig.json'))
      expect(result.order.pop()).toEqual(context.resolve('test', 'workspaces', 'tsconfig.json'))
    })

    it('should resolve the order of projects based on their references', async () => {
      const dir = context.resolve('test', 'recursive')
      const file = context.resolve('test', 'recursive', 'x', 'tsconfig.json')
      const dir2 = context.resolve('test', 'recursive', 'z')

      const references = await findProjectReferences(dir, file, dir2)
      const result = resolveProjectOrder(references)

      // No unresolved projects, no cycles, and all projects are resolved...
      expect(result).toEqual({
        order: [context.resolve('test', 'recursive', 'd', 'tsconfig.json')],
        unresolved: expect.toMatchContents([
          context.resolve('test', 'recursive', 'a', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'b', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'c', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'x', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'y', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'z', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'tsconfig.json'),
        ]),
        cycles: expect.toMatchContents([
          [
            context.resolve('test', 'recursive', 'a', 'tsconfig.json'),
            context.resolve('test', 'recursive', 'b', 'tsconfig.json'),
            context.resolve('test', 'recursive', 'c', 'tsconfig.json'),
            context.resolve('test', 'recursive', 'a', 'tsconfig.json'),
          ],
          [
            context.resolve('test', 'recursive', 'x', 'tsconfig.json'),
            context.resolve('test', 'recursive', 'y', 'tsconfig.json'),
            context.resolve('test', 'recursive', 'x', 'tsconfig.json'),
          ],
          [
            context.resolve('test', 'recursive', 'z', 'tsconfig.json'),
            context.resolve('test', 'recursive', 'z', 'tsconfig.json'),
          ],
        ]),
      })
    })
  })
})
