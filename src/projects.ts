import { assert } from '@plugjs/plug/asserts'
import { assertAbsolutePath, getAbsoluteParent, resolveFile } from '@plugjs/plug/paths'
import { DiagnosticCategory } from 'typescript/unstable/async'

import type { AbsolutePath } from '@plugjs/plug/paths'
import type { API, Diagnostic } from 'typescript/unstable/async'

/** Interface describing the actual (resolved) config file and its references */
interface ProjectReferences {
  /** The actual path of the configuration file containing the references */
  path: AbsolutePath
  /** The actual paths of all configuration files referenced by this project */
  references: AbsolutePath[]
  /** Any errors encountered while reading the configuration file */
  errors: Diagnostic[]
}

/** Interface describing a group of cross referencing projects */
interface Projects {
  /** All projects to build, each associated with its referencing projects */
  projects: Map<AbsolutePath, Set<AbsolutePath>>
  /** Any errors encountered while reading the configuration file */
  errors: Diagnostic[]
}

/** Interface describing the order of projects, including any cycles and unresolved projects */
interface ProjectOrder {
  /** The order in which projects should be built */
  order: AbsolutePath[]
  /** Array of project reference cycles */
  cycles: AbsolutePath[][]
  /** Array containing all projects that could not be ordered because of cyclical dependencies */
  unresolved: AbsolutePath[]
}

/* ========================================================================== */

/**
 * Find the TypeScript project configuration file for a given path.
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
  // The specified path can be either a file or a directory containing a
  // "tsconfig.json" file: resolve as a file, then assume it's a directory
  let file = resolveFile(path)
  if (!file) file = resolveFile(path, 'tsconfig.json')
  assert(file, `TypeScript configuration file not found in "${path}"`)

  // Use the TypeScript API to parse the configuration file and get its references
  const parsed = await api.parseConfigFile(file)
  assert(parsed.options.configFilePath, `Failed to parse TypeScript configuration file "${file}"`)
  assertAbsolutePath(parsed.options.configFilePath)

  // Prepare our simplified result object
  const result: ProjectReferences = {
    path: parsed.options.configFilePath,
    errors: [...parsed.errors],
    references: [],
  }

  // Resolve the references to absolute paths
  const directory = getAbsoluteParent(path)
  for (const reference of parsed.projectReferences ?? []) {
    let resolved = resolveFile(directory, reference.path)
    if (!resolved) resolved = resolveFile(directory, reference.path, 'tsconfig.json')
    if (!resolved) {
      result.errors.push({
        fileName: result.path,
        category: DiagnosticCategory.Error, // DiagnosticCategory.Error
        code: 6053, // File not found
        pos: -1, // Dummy position
        end: -1, // Dummy position
        text: `Cannot resolve project reference "${reference.originalPath}"`,
      })
    } else result.references.push(resolved)
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
  const errors: Diagnostic[] = []

  // Add a referring project to the set of referring projects for a referred project
  function addProject(referredProject: AbsolutePath, referringProject?: AbsolutePath): void {
    let referringProjects = projects.get(referredProject)
    if (!referringProjects) {
      referringProjects = new Set()
      projects.set(referredProject, referringProjects)
    }
    if (referringProject) referringProjects.add(referringProject)
  }

  // The initial referring project for the loop below
  while (remainingProjects.size > 0) {
    for (const project of remainingProjects) {
      // Read the project configuration file and its references
      const { path, references, errors: e } = await readProjectConfig(api, project)
      // Push any errors encountered while reading the configuration file
      errors.push(...e)
      // Remove the project (might be a dir) from the remaining set
      remainingProjects.delete(project)
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
  if (unresolved.length === 0) return { order, unresolved, cycles: [] }

  // ===== FIND CYCLES =========================================================

  // Projects we _already_ visited (and thus don't need to visit again)
  const visited = new Set<AbsolutePath>()

  // The list of cycles we have found (each cycle is a list of projects)
  const cycles: AbsolutePath[][] = []

  // A recursive function to visit a project dependents, looking for cycles
  function visit(project: AbsolutePath, stack: AbsolutePath[] = [project]): void {
    for (const dependent of projects.get(project) ?? /* coverage ignore next */ []) {
      // If we have already seen this dependent in the current stack, we found
      // a cycle, otherwise, we need to visit the dependent and its dependents.
      if (stack.indexOf(dependent, 1) > 0) {
        cycles.push([...stack])
      } else {
        visit(dependent, [...stack, dependent])
      }
    }

    // Mark the project as visited and remove it from the stack (backtrack)
    visited.add(project)
    stack.pop()
  }

  // Visit all the unresolved projects, looking for cycles
  for (const project of unresolved) {
    if (!visited.has(project)) visit(project)
  }

  // Return the final order, unresolved projects, and cycles found
  return { order, unresolved, cycles }
}
