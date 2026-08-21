TypeScript 7 support for PlugJS
===============================

This plugin adds support for [TypeScript 7](https://www.typescriptlang.org/)
in [PlugJS](https://github.com/plugjs/plug/) builds.

### Contents

- [Installation](#installation)
- [Helpers](#helpers)
- [Pipes](#pipes)
- [Apache 2.0 License](./LICENSE.md)
- [Copyright Notice](./NOTICE.md)

Installation
------------

```bash
npm install --save-dev @plugjs/tsgo
```

Helpers
-------

The package exports helper pipes for the most common TypeScript compiler
workflows. Import them in your PlugJS build file and await them from your
tasks.

```ts
import { plugjs } from '@plugjs/plug'
import { tsc } from '@plugjs/tsgo'

export default plugjs({
  async build(): Promise<void> {
    await tsc('src/tsconfig.json')
  },
})
```

The `tsc(...)` helper compiles one TypeScript project, identified either by a
`tsconfig.json` file or by a directory containing one. This is roughly
equivalent to `tsc --project <config>` and returns a pipe containing the files
emitted by the compiler.

The `tsbuild(...)` helper compiles a project and all of its TypeScript project
references. This is roughly equivalent to `tsc --build <config>` and is useful
for workspaces or packages linked through `references` in `tsconfig.json`.

```ts
import { plugjs } from '@plugjs/plug'
import { tsbuild } from '@plugjs/tsgo'

export default plugjs({
  async build(): Promise<void> {
    await tsbuild('src/tsconfig.json', { directory: '@' })
  },
})
```

Both helpers take the same options:

- `directory`: base directory used to resolve the configuration path.
- `emitOnly`: controls which files TypeScript emits. Use:
  - `'all'` or `true` to emit JavaScript and declaration files _(default)_,
  - `'js'` to emit only JavaScript files,
  - `'dts'` to emit only declaration files,
  - `'none'` or `false` to type-check without emitting files.
- `reportDeprecations`: controls how deprecation diagnostics are reported. Use:
  - `'notice'` or `true` to report them as notices _(default)_,
  - `'warn'` to report them as warnings,
  - `'off'` or `false` to silence them.

Pipes
-----

You can also use the TypeScript plug directly in a pipe. Whatever files are in
the pipe are treated as TypeScript project configs:

```ts
import '@plugjs/tsgo'
import { find, plugjs } from '@plugjs/plug'

export default plugjs({
  async build(): Promise<void> {
    await find('**/tsconfig.json').typescript()
  },
})
```

This compiles all TypeScript projects in the pipe.

The `.typescript()` plug takes these options:

- `emitOnly`: controls which files TypeScript emits
  _(as in the [Helpers](#helpers) section above)
- `reportDeprecations`: controls how deprecation diagnostics are reported
  _(as in the [Helpers](#helpers) section above)
- `projectReferences`: controls whether referenced projects are built too. Use:
  - `false` to build only the projects in the pipe _(default)_,
  - `true` to build those projects and their project references.
