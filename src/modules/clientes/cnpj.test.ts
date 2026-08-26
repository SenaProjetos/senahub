import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarDadosCnpj } from "@/modules/clientes/cnpj";

afterEach(() => vi.unstubAllGlobals());

describe("buscarDadosCnpj", () => {
  it("transforma os dados públicos nos campos do cadastro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      razao_social: "Construtora Pedra Branca Ltda.",
      nome_fantasia: "Pedra Branca",
      email: "contato@pedrabranca.com.br",
      ddd_telefone_1: "11987654321",
      cep: "01311902",
      logradouro: "Avenida Paulista",
      numero: "1000",
      complemento: "Sala 12",
      bairro: "Bela Vista",
      municipio: "São Paulo",
      uf: "sp",
      porte: "EMPRESA DE PEQUENO PORTE",
      codigo_porte: 3,
    }), { status: 200 })));

    await expect(buscarDadosCnpj("19.131.243/0001-97")).resolves.toEqual({
      nome: "Construtora Pedra Branca Ltda.",
      nomeFantasia: "Pedra Branca",
      email: "contato@pedrabranca.com.br",
      telefone: "11987654321",
      cep: "01311902",
      logradouro: "Avenida Paulista",
      numero: "1000",
      complemento: "Sala 12",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      uf: "SP",
      porte: "empresa_pequeno_porte",
    });
  });

  it("não consulta a API com CNPJ inválido", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(buscarDadosCnpj("12")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("não importa dados quando o CNPJ não é encontrado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(buscarDadosCnpj("38.090.198/0001-14")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
