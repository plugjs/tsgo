import { logOptions } from '@plugjs/plug/logging'

// Disable GitHub annotations when *running* each test, as reports will
// actually generate those and we don't want to spam the GitHub Actions
// logs with them. However, we restore the default value after each test
// so that the overall build system is not affected by this test suite.
const annotationsEnabled: boolean = logOptions.githubAnnotations
beforeEach(() => (logOptions.githubAnnotations = false))
afterEach(() => (logOptions.githubAnnotations = annotationsEnabled))
