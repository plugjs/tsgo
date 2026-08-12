import config from '@plugjs/oxc/configs/oxfmt'
import { defineConfig } from 'oxfmt'

export default defineConfig({
  ...config,
  ignorePatterns: [...config.ignorePatterns, 'test/resources'],
})
