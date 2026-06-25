import { defineConfig } from "vitest/config";

// Config dédiée aux tests : on n'active PAS le plugin PWA (inutile et plus lent
// en test). Tests sur les fonctions pures (protocole QN, métriques corporelles).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
