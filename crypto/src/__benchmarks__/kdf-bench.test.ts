// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Argon2id KDF benchmark — measures timing across parameter sets.
 *
 * Run via vitest:
 *   npx vitest run src/__benchmarks__/kdf-bench.test.ts
 */
import { describe, it } from 'vitest';
import { deriveVaultKey, generateSecretKey } from '../key-derivation';
import { generateSalt } from '../random';

const CONFIGS = [
  { label: 'Medium (128 MB, 3 iter)', memoryKiB: 131072, iterations: 3 },
  { label: 'High (256 MB, 3 iter)', memoryKiB: 262144, iterations: 3 },
  { label: 'High (256 MB, 4 iter)', memoryKiB: 262144, iterations: 4 },
  { label: 'Very High (512 MB, 4 iter)', memoryKiB: 524288, iterations: 4 },
  { label: 'Very High (512 MB, 5 iter)', memoryKiB: 524288, iterations: 5 },
];

const WARMUP_RUNS = 1;
const BENCH_RUNS = 5;

describe('Argon2id KDF Benchmark', () => {
  it('measures timing across parameter sets', async () => {
    const secretKey = generateSecretKey();
    const salt = generateSalt();

    console.log('');
    console.log('Argon2id KDF Benchmark');
    console.log('='.repeat(72));
    console.log(`Runs per config: ${BENCH_RUNS} (after ${WARMUP_RUNS} warmup)`);
    console.log('');

    for (const config of CONFIGS) {
      // Warmup: let WASM JIT settle
      for (let i = 0; i < WARMUP_RUNS; i++) {
        await deriveVaultKey({
          masterPassword: 'benchmark-test-password-2024',
          secretKey,
          salt,
          memoryKiB: config.memoryKiB,
          iterations: config.iterations,
        });
      }

      // Timed runs
      const times: number[] = [];
      for (let i = 0; i < BENCH_RUNS; i++) {
        const start = performance.now();
        await deriveVaultKey({
          masterPassword: 'benchmark-test-password-2024',
          secretKey,
          salt,
          memoryKiB: config.memoryKiB,
          iterations: config.iterations,
        });
        times.push(performance.now() - start);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];

      console.log(
        `${config.label.padEnd(30)} ` +
          `avg=${avg.toFixed(0).padStart(6)}ms  ` +
          `median=${median.toFixed(0).padStart(6)}ms  ` +
          `min=${min.toFixed(0).padStart(6)}ms  ` +
          `max=${max.toFixed(0).padStart(6)}ms`,
      );
    }

    console.log('');
    console.log(
      'Recommendation: choose the config closest to 200-500ms on your target device.',
    );
  }, 300_000);
});
