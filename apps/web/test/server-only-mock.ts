// server-only always throws when imported outside Next's own bundler,
// which is exactly what happens when Vitest imports a module that starts
// with `import 'server-only'`. Aliased in vitest.config.ts so tests can
// exercise that server-side logic directly.
export {};
