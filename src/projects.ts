import { assert } from '@plugjs/plug/asserts'
import { $gry, $p, $ylw, ERROR } from '@plugjs/plug/logging'
import { assertAbsolutePath, getAbsoluteParent, resolveFile } from '@plugjs/plug/paths'

import { convertProjectDiagnostics } from './diagnostics.ts'

import type { ReportRecord } from '@plugjs/plug/logging'
import type { AbsolutePath } from '@plugjs/plug/paths'
import type { API, ParsedCommandLine } from 'typescript/unstable/async'

/** Interface describing the actual (resolved) config file and its references */
interface ProjectReferences {
  /** The actual path of the configuration file containing the references */
  path: AbsolutePath
  /** The actual configuration parsed from the configuration file */
  config: ParsedCommandLine
  /** The actual paths of all configuration files referenced by this project */
  references: AbsolutePath[]
  /** Any errors encountered while reading the configuration file */
  errors: ReportRecord[]
}

/** Interface describing a group of cross-referencing projects */
interface Projects {
  /** All projects to build, each associated with its referencing projects */
  projects: Map<AbsolutePath, Set<AbsolutePath>>
  /** Any errors encountered while reading the configuration files */
  errors: ReportRecord[]
}

/** Interface describing the order of projects, including any cycles and unresolved projects */
interface ProjectOrder {
  /** The order in which projects should be built */
  order: AbsolutePath[]
  /** Array of project reference cycles */
  cycles: AbsolutePath[][]
  /** Array containing all projects that could not be ordered because of cyclical dependencies */
  unresolved: AbsolutePath[]
  /** Any errors encountered while resolving the project order */
  errors: ReportRecord[]
}

/* ========================================================================== */

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

/**
 * Read the TypeScript project configuration file for a given path.
 *
 * The path specified can be a `tsconfig.json` file name or a directory
 * containing a `tsconfig.json` file.
 *
 * The returned object contains the resolved configuration file name (in `path`)
 * and the array of resolved project references (the actual resolved files on
 * disk in `references`).
 *
 * Any errors encountered while reading the configuration file or resolving its
 * references are returned in the `errors` array.
 */
export async function readProjectConfig(api: API, path: AbsolutePath): Promise<ProjectReferences> {
  const file = findProjectConfig(path)

  // Use the TypeScript API to load up this project... We already update the
  // snapshot here, so we don't need to do it again once we end up compiling
  // the whole project...
  const snapshot = await api.updateSnapshot({ openProjects: [file] })
  const project = snapshot.getProject(file)
  assert(project, `Failed to open TypeScript project from "${file}"`)
  assertAbsolutePath(project.configFileName)
  path = project.configFileName // rewrite the path to the actual

  // Get any diagnostics encountered while parsing the configuration file
  // and any "global" diagnostics (not associated with a specific file)...
  const diagnostics = await Promise.all([
    project.program.getGlobalDiagnostics(),
    project.program.getProgramDiagnostics(),
    project.program.getConfigFileParsingDiagnostics(),
  ]).then((results) => results.flat())

  // Convert the diagnostics to our simplified format
  const errors = await convertProjectDiagnostics(diagnostics, project.program, path)

  // Prepare our simplified result object
  const config = project.parsedCommandLine
  const result: ProjectReferences = { path, errors, config, references: [] }

  // Resolve the references to absolute paths
  const directory = getAbsoluteParent(path)
  for (const reference of config.projectReferences ?? []) {
    let resolved = resolveFile(directory, reference.path)
    if (!resolved) resolved = resolveFile(directory, reference.path, 'tsconfig.json')
    if (resolved) result.references.push(resolved)
  }

  // All done
  return result
}

/**
 * Find _all_ project references given a set of initial project paths.
 *
 * The returned map contains all the projects (resolved configuration file
 * names) and their referring projects as values.
 */
export async function findProjectReferences(api: API, ...paths: AbsolutePath[]): Promise<Projects> {
  // The set of *all* projects, whether we have resolved them yet or not.
  const remainingProjects = new Set<AbsolutePath>(paths)
  // The set of all *resolved* projects (that is, opened and parsed)
  const resolvedProjects = new Set<AbsolutePath>()

  // The map of all our projects, keyed by their resolved configuration file
  // name and having the set of projects that refer to it as a value
  const projects = new Map<AbsolutePath, Set<AbsolutePath>>()

  // An array of all errors encountered while reading the configuration files
  const errors: ReportRecord[] = []

  // Add a referring project to the set of referring projects for a referred project
  function addProject(referredProject: AbsolutePath, referringProject?: AbsolutePath): void {
    let referringProjects = projects.get(referredProject)
    if (!referringProjects) {
      referringProjects = new Set()
      projects.set(referredProject, referringProjects)
    }
    if (referringProject) referringProjects.add(referringProject)
  }

  while (remainingProjects.size > 0) {
    // Take and remove the next project from the remaining set
    const project = remainingProjects.values().next().value!
    remainingProjects.delete(project)

    // Read the project configuration file and its references
    const { path, references, errors: e } = await readProjectConfig(api, project)
    // If we already resolved this project, skip it
    if (resolvedProjects.has(path)) continue
    // Push any errors encountered while reading the configuration file
    errors.push(...e)
    // Add the project (resolved filename) to the resolved set
    resolvedProjects.add(path)
    // Record the project and its references in our map of projects
    addProject(path)

    // Look at all the project references
    for (const reference of references) {
      // If we haven't resolved this reference yet, add it to the remaining
      if (!resolvedProjects.has(reference)) remainingProjects.add(reference)
      // Then make sure that we record the referring project for this reference
      addProject(reference, path)
    }
  }

  // Return our projects map and all errors
  return { projects, errors }
}

/**
 * Use Kahn's topological-sort algorithm on a map of projects and their
 * references to determine the order in which they should be built.
 *
 * @param projects A map of projects and their referring projects
 * @returns The order of projects, any unresolved projects, and cycles found
 */
export function resolveProjectOrder(projects: ReadonlyMap<AbsolutePath, Set<AbsolutePath>>): ProjectOrder {
  // The number of unresolved dependencies for each project
  const counts: Record<AbsolutePath, number> = Object.create(null)

  // Iterate through all the projects (and their referring projects), counting
  // the number of unresolved dependencies for each project.
  for (const [referred, referring] of projects.entries()) {
    // Ensure the referred project has a dependencies count (even if it is zero)
    counts[referred] = counts[referred] ?? 0
    // For each referring project, increment its count of unresolved dependencies
    for (const ref of referring) counts[ref] = (counts[ref] ?? 0) + 1
  }

  // The unique set of all known projects (referred and referring)
  const uniques = Object.keys(counts) as AbsolutePath[]

  // Projects are "ready" when all dependencies have been resolved (zero count)
  const ready = uniques.filter((project) => counts[project] === 0)

  // The final order of projects (in dependency order)
  const order: AbsolutePath[] = []

  // While there are still projects ready to be processed, take the first one
  for (let project = ready.shift(); project; project = ready.shift()) {
    // Add the project to the final order
    order.push(project)

    // For each project that depends on this project, decrement its unresolved
    // dependency count. If it reaches zero, add it to the ready queue.
    for (const dependent of projects.get(project) ?? /* coverage ignore next */ []) {
      const remaining = (counts[dependent] = counts[dependent]! - 1)
      if (remaining === 0) ready.push(dependent)
    }
  }

  // When no more projects are "ready", the remaining projects are unresolved
  const unresolved = uniques.filter((project) => counts[project])

  // If we have no unresolved projects, we can return the order (no cycles)
  if (unresolved.length === 0) return { order, unresolved, cycles: [], errors: [] }

  // ===== FIND CYCLES =========================================================

  // Projects we _already_ visited (and thus don't need to visit again)
  const visited = new Set<AbsolutePath>()

  // The list of cycles we have found (each cycle is a list of projects)
  const cycles: AbsolutePath[][] = []

  // Recursively visit a project's dependents, looking for cycles
  function visit(project: AbsolutePath, stack: AbsolutePath[] = []): void {
    // If this project is already in the current path, we found a cycle
    const index = stack.indexOf(project)
    if (index >= 0) {
      cycles.push([...stack.slice(index), project])
      return
    }

    // Don't revisit projects whose dependents have all been processed
    if (visited.has(project)) return

    // Add this project to the current path and visit its dependents
    const next = [...stack, project]
    for (const dependent of projects.get(project) ?? /* coverage ignore next */ []) {
      if (unresolved.includes(dependent)) visit(dependent, next)
    }

    // Mark the project as visited after all its dependents have been processed
    visited.add(project)
  }

  // Visit all the unresolved projects, looking for cycles
  for (const project of unresolved) visit(project)

  // Prep our errors
  const errors: ReportRecord[] = []
  errors.push({
    level: ERROR,
    message:
      `Found ${$ylw(unresolved.length)} unresolved projects (${$ylw(cycles.length)} cycles)` +
      `\n${$gry('-')} ${unresolved.map($p).join(`\n${$gry('-')} `)}`,
  })

  for (const cycle of cycles) {
    errors.push({
      level: ERROR,
      message: `Project reference cycle:\n${$gry('-')} ${cycle.map($p).join(`\n${$gry('-')} `)}`,
    })
  }

  // Return the final order, unresolved projects, and cycles found
  return { order, unresolved, cycles, errors }
}
