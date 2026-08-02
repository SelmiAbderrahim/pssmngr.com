/**
 * Vitest setup: patch WebAssembly.instantiateStreaming so that Emscripten-compiled
 * WASM modules (argon2-browser) fall back to the ArrayBuffer path which uses
 * fs.readFileSync in Node.js, instead of trying to `fetch()` a file-system path.
 *
 * Node 22+ exposes global `fetch` and `WebAssembly.instantiateStreaming`, which
 * causes Emscripten code to call `fetch("/path/to/argon2.wasm")` — that fails
 * because Node's fetch requires http(s) URLs.
 */
const originalInstantiateStreaming = WebAssembly.instantiateStreaming;

// Remove instantiateStreaming so Emscripten falls back to readBinary + instantiate
Object.defineProperty(WebAssembly, 'instantiateStreaming', {
  value: undefined,
  writable: true,
  configurable: true,
});

// Restore after all modules are loaded
afterAll(() => {
  Object.defineProperty(WebAssembly, 'instantiateStreaming', {
    value: originalInstantiateStreaming,
    writable: true,
    configurable: true,
  });
});
