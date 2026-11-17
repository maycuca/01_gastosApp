// The app is type-checked without Node types. The one test that reads a source file from disk
// (src/index.css.test.ts) only needs these two functions.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}

declare module 'node:process' {
  export function cwd(): string
}
