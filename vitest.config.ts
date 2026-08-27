import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // O vitest nao carrega `.env` (sem setupFiles/dotenv, e o carregamento do Next nao
    // vale fora do runtime dele). Sem isto, `lib/auth.ts` instancia o better-auth com
    // `baseURL: undefined` e loga um aviso no stderr a cada worker que importa a cadeia
    // de action. Nenhum teste faz requisicao HTTP por ele — o valor so precisa existir.
    // O ruido nao era so estetico: no PowerShell 5.1 o `2>&1` do "Verificar tudo"
    // embrulha cada linha de stderr num NativeCommandError, entao um stderr genuino de
    // teste se perdia no meio da decoracao.
    env: { BETTER_AUTH_URL: "http://localhost:3000" },
  },
});
