import { defineConfig } from "tsdown";

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm", "cjs"],
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  fixedExtension: false,
  exports: true,
  publint: {
    strict: true,
  },
});
