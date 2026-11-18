import { describe, expect, it } from "vitest";
import { criarPiscina } from "./piscina";

function piscinaDeTeste() {
  const abertos: string[] = [];
  const fechados: string[] = [];
  let falhar = false;
  const piscina = criarPiscina(
    async (chave: string) => {
      abertos.push(chave);
      if (falhar) throw new Error("rede");
      return { chave };
    },
    (v) => fechados.push(v.chave),
  );
  return { piscina, abertos, fechados, setFalhar: (f: boolean) => (falhar = f) };
}

describe("criarPiscina", () => {
  it("dois usos ao mesmo tempo dividem uma abertura e fecham uma vez, só depois do último", async () => {
    const { piscina, abertos, fechados } = piscinaDeTeste();
    let soltar!: () => void;
    const segura = new Promise<void>((r) => (soltar = r));
    const longo = piscina.usar("a", async () => {
      await segura;
      return 1;
    });
    const curto = await piscina.usar("a", async () => 2);
    expect(curto).toBe(2);
    expect(fechados).toEqual([]); // o longo ainda usa o documento
    soltar();
    expect(await longo).toBe(1);
    await Promise.resolve();
    expect(abertos).toEqual(["a"]);
    expect(fechados).toEqual(["a"]);
    expect(piscina.abertos()).toBe(0);
  });

  it("depois de fechado, o próximo uso abre de novo", async () => {
    const { piscina, abertos } = piscinaDeTeste();
    await piscina.usar("a", async () => null);
    await piscina.usar("a", async () => null);
    expect(abertos).toEqual(["a", "a"]);
  });

  it("erro dentro do uso também solta e fecha", async () => {
    const { piscina, fechados } = piscinaDeTeste();
    await expect(
      piscina.usar("a", async () => {
        throw new Error("render");
      }),
    ).rejects.toThrow("render");
    await Promise.resolve();
    expect(fechados).toEqual(["a"]);
    expect(piscina.abertos()).toBe(0);
  });

  it("falha ao abrir: o erro sobe, nada é fechado e o próximo uso tenta de novo", async () => {
    const { piscina, abertos, fechados, setFalhar } = piscinaDeTeste();
    setFalhar(true);
    await expect(piscina.usar("a", async () => null)).rejects.toThrow("rede");
    setFalhar(false);
    await piscina.usar("a", async () => null);
    await Promise.resolve();
    expect(abertos).toEqual(["a", "a"]);
    expect(fechados).toEqual(["a"]);
  });
});
