import config from '@plugjs/oxc/configs/oxlint.node'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [config],
  ignorePatterns: ['test/resources'],
  env: { ...config.env }, // those don't seem to be copied over
})
