import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "key-derivation": "src/key-derivation.ts",
    vault: "src/vault.ts",
    envelope: "src/envelope.ts",
    keypair: "src/keypair.ts",
    sharing: "src/sharing.ts",
    ephemeral: "src/ephemeral.ts",
    "shared-vault": "src/shared-vault.ts",
    recovery: "src/recovery.ts",
    escrow: "src/escrow.ts",
    random: "src/random.ts",
    types: "src/types.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "es2022",
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  external: ["argon2-browser", "libsodium-wrappers-sumo"],
});
