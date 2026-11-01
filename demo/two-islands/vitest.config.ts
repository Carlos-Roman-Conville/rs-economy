import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['demo/two-islands/**/*.test.ts'],
  },
})
