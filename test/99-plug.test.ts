// oxlint-disable typescript/unbound-method
import { merge } from '@plugjs/plug'

describe('Plug installation', () => {
  it('should install the "typescript" plug', async () => {
    // Initially, no plugs should be installed...
    expect(merge([]).typescript).toBeUndefined()

    // Then we import the index file (installing the plugs)
    await import('../src/index.ts')

    // The plugs should now be installed
    expect(merge([]).typescript).toBeA('function')
  })

  it('should export the "tsc" and "tscBuild" utility functions', async () => {
    const { tsc, tscBuild } = await import('../src/index.ts')
    expect(tsc).toBeA('function')
    expect(tscBuild).toBeA('function')
  })
})
