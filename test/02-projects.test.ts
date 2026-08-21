import { async, BuildFailure } from '@plugjs/plug'
import { ERROR } from '@plugjs/plug/logging'
import { API } from 'typescript/unstable/async'

import { findProjectReferences, readProjectConfig, resolveProjectOrder } from '../src/projects.ts'

import type { ReportRecord } from '@plugjs/plug/logging'

describe('Projects', () => {
  const context = async.requireContext()
  let api: API

  beforeAll(() => (api = new API()))
  afterAll(() => api.close())

  afterEach(async () => {
    const snapshot = await api.updateSnapshot()
    const projects = snapshot.getProjects().map((project) => project.configFileName)
    await api.updateSnapshot({ closeProjects: projects })
  })

  function printReport(errors: ReportRecord[]): void {
    if (errors.length < 1) return
    const report = context.log.report('Test Report').add(...errors)
    expect(() => report.done()).toThrowError()
  }

  describe('Read Project Config', () => {
    it('should read the project references from a file', async () => {
      const file = context.resolve('test', 'recursive', 'tsconfig.json')
      const parsed = await readProjectConfig(api, file)

      expect(parsed).toEqual({
        path: file,
        errors: [],
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
      const parsed = await readProjectConfig(api, dir)

      expect(parsed).toEqual({
        path: file,
        errors: [],
        references: expect.toMatchContents([
          context.resolve('test', 'recursive', 'a', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'b', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'c', 'tsconfig.json'),
          context.resolve('test', 'recursive', 'd', 'tsconfig.json'),
        ]),
      })
    })

    it('should return no references for an empty project', async () => {
      const file = context.resolve('test', 'configs', 'tsconfig-empty.json')
      const parsed = await readProjectConfig(api, file)

      expect(parsed).toEqual({
        path: file,
        errors: [],
        references: expect.toMatchContents([]),
      })
    })

    it('should report errors when a "tsconfig.json" file is not a valid JSON', async () => {
      const file = context.resolve('test', 'configs', 'source.ts')
      const parsed = await readProjectConfig(api, file)

      // NOTE: this does not *throw*, but rather returns errors...
      expect(parsed).toEqual({
        path: file,
        errors: expect.toHaveProperty('length', expect.toBeGreaterThan(0)),
        references: expect.toMatchContents([]),
      })

      printReport(parsed.errors)
    })

    it('should report errors when a "tsconfig.json" file is not a valid TypeScript configuration', async () => {
      const file = context.resolve('test', 'configs', 'tsconfig-wrong.json')
      const parsed = await readProjectConfig(api, file)

      // NOTE: this does not *throw*, but rather returns errors...
      expect(parsed).toEqual({
        path: file,
        errors: expect.toHaveProperty('length', expect.toBeGreaterThan(0)),
        references: expect.toMatchContents([]),
      })

      printReport(parsed.errors)
    })

    it('should report errors when a "tsconfig.json" file extends a missing file', async () => {
      const file = context.resolve('test', 'configs', 'tsconfig-bad-extend.json')
      const parsed = await readProjectConfig(api, file)

      // NOTE: this does not *throw*, but rather returns errors...
      expect(parsed).toEqual({
        path: file,
        errors: expect.toHaveProperty('length', expect.toBeGreaterThan(0)),
        references: expect.toMatchContents([]),
      })

      // This produces a diagnostic with no file name, so we make sure to
      // *assign* the file name of the config file
      for (const error of parsed.errors) {
        expect(error.file).toEqual(file)
      }

      printReport(parsed.errors)
    })

    it('should report errors when a project reference in "tsconfig.json" is invalid', async () => {
      const file = context.resolve('test', 'configs', 'tsconfig-missing.json')
      const parsed = await readProjectConfig(api, file)

      // NOTE: this does not *throw*, but rather returns (our) errors...
      expect(parsed).toEqual({
        path: file,
        references: expect.toMatchContents([]),
        errors: expect.toMatchContents([
          {
            file,
            level: ERROR,
            tags: ['ts6053'],
            message: expect.toMatch(/missing\.json'/),
            line: expect.toBeA('number'),
            column: expect.toBeA('number'),
            length: expect.toBeA('number'),
            source: expect.toBeA('string'),
          },
          {
            file,
            level: ERROR,
            tags: ['ts6053'],
            message: expect.toMatch(/missing'/),
            line: expect.toBeA('number'),
            column: expect.toBeA('number'),
            length: expect.toBeA('number'),
            source: expect.toBeA('string'),
          },
        ]),
      })

      printReport(parsed.errors)
    })

    it('should fail when a "tsconfig.json" file can not be found in a directory', async () => {
      const dir = context.resolve('test', 'configs')

      await expect(readProjectConfig(api, dir)) //
        .toBeRejectedWithError(BuildFailure, `TypeScript configuration file not found in "${dir}"`)
    })
  })

  describe('Find Project References', () => {
    it('should read the project references from a directory', async () => {
      const dir = context.resolve('test', 'recursive')

      const result = await findProjectReferences(api, dir)
      const projects = Object.fromEntries(
        result.projects.entries().map(([project, referringProjects]) => {
          return [project, [...referringProjects]]
        }),
      )

      expect(projects).toEqual({
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

      expect(result.errors).toEqual([])
    })

    it('should read the project references from a file', async () => {
      const file = context.resolve('test', 'recursive', 'a', 'tsconfig.json')

      const result = await findProjectReferences(api, file)
      const projects = Object.fromEntries(
        result.projects.entries().map(([project, referringProjects]) => {
          return [project, [...referringProjects]]
        }),
      )

      expect(projects).toEqual({
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

      expect(result.errors).toEqual([])
    })

    it('should read the project references from a set of files or directories', async () => {
      const a = context.resolve('test', 'recursive', 'a')
      const d = context.resolve('test', 'recursive', 'd')
      const x = context.resolve('test', 'recursive', 'tsconfig.json')

      const result = await findProjectReferences(api, a, d, x)
      const projects = Object.fromEntries(
        result.projects.entries().map(([project, referringProjects]) => {
          return [project, [...referringProjects]]
        }),
      )

      expect(projects).toEqual({
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

      expect(result.errors).toEqual([])
    })

    it('should report errors when a "tsconfig.json" file is not a valid JSON', async () => {
      const file = context.resolve('test', 'configs', 'source.ts')
      const result = await findProjectReferences(api, file)

      const projects = Object.fromEntries(
        result.projects.entries().map(([project, referringProjects]) => {
          return [project, [...referringProjects]]
        }),
      )

      expect(projects).toEqual({ [file]: [] })
      expect(result.errors).toHaveProperty('length', expect.toBeGreaterThan(0))
      printReport(result.errors)
    })

    it('should report errors when a reference in "tsconfig.json" is invalid', async () => {
      const file = context.resolve('test', 'configs', 'tsconfig-missing.json')
      const result = await findProjectReferences(api, file)

      const projects = Object.fromEntries(
        result.projects.entries().map(([project, referringProjects]) => {
          return [project, [...referringProjects]]
        }),
      )

      expect(projects).toEqual({ [file]: [] })
      expect(result.errors).toMatchContents([
        {
          file,
          level: ERROR,
          tags: ['ts6053'],
          message: expect.toMatch(/missing\.json'/),
          line: expect.toBeA('number'),
          column: expect.toBeA('number'),
          length: expect.toBeA('number'),
          source: expect.toBeA('string'),
        },
        {
          file,
          level: ERROR,
          tags: ['ts6053'],
          message: expect.toMatch(/missing'/),
          line: expect.toBeA('number'),
          column: expect.toBeA('number'),
          length: expect.toBeA('number'),
          source: expect.toBeA('string'),
        },
      ])
      printReport(result.errors)
    })
  })

  describe('Resolve Project Order', () => {
    it('should resolve the order of projects based on their references', async () => {
      const dir = context.resolve('test', 'workspaces')

      const { projects } = await findProjectReferences(api, dir)
      const result = resolveProjectOrder(projects)

      // No unresolved projects, no cycles, and all projects are resolved...
      expect(result).toEqual({
        unresolved: [],
        cycles: [],
        errors: [],
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

    it('should report errors when not all projects can be resolved', async () => {
      const dir = context.resolve('test', 'recursive')
      const file = context.resolve('test', 'recursive', 'x', 'tsconfig.json')
      const dir2 = context.resolve('test', 'recursive', 'z')

      const { projects } = await findProjectReferences(api, dir, file, dir2)
      const result = resolveProjectOrder(projects)

      // No unresolved projects, no cycles, and all projects are resolved...
      expect(result).toEqual({
        order: [context.resolve('test', 'recursive', 'd', 'tsconfig.json')],
        errors: expect.toHaveProperty('length', expect.toBeGreaterThan(0)),
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

      printReport(result.errors)
    })
  })
})
