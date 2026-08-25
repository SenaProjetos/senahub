import { describe, expect, it } from "vitest";
import { criarLimitador } from "@/lib/rate-limit";

describe("criarLimitador", () => {
  it("permite até o máximo e bloqueia o restante na mesma janela", () => {
    let agora = 1_000;
    const limitar = criarLimitador(undefined, () => agora);
    const config = { chave: "cliente:1", maximo: 2, janelaMs: 60_000 };

    expect(limitar(config)).toMatchObject({ permitido: true, restantes: 1 });
    expect(limitar(config)).toMatchObject({ permitido: true, restantes: 0 });
    expect(limitar(config)).toMatchObject({ permitido: false, primeiroBloqueio: true, retryDepoisSegundos: 60 });
    expect(limitar(config)).toMatchObject({ permitido: false, primeiroBloqueio: false });

    agora += 60_000;
    expect(limitar(config)).toMatchObject({ permitido: true, restantes: 1 });
  });

  it("mantém baldes independentes por chave", () => {
    const limitar = criarLimitador();
    const config = { maximo: 1, janelaMs: 60_000 };

    expect(limitar({ ...config, chave: "a" }).permitido).toBe(true);
    expect(limitar({ ...config, chave: "b" }).permitido).toBe(true);
    expect(limitar({ ...config, chave: "a" }).permitido).toBe(false);
  });
});
