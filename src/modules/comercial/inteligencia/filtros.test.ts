import { describe, expect, it } from "vitest";
import {
  lerFiltrosInteligencia,
  periodoInteligencia,
  whereNegociacaoInteligencia,
  temRecorteDaNegociacao,
} from "./filtros";

describe("filtros da Inteligência Comercial", () => {
  it("lê todos os recortes da URL e normaliza a UF", () => {
    const filtros = lerFiltrosInteligencia({
      periodo: "90d",
      resp: "u1",
      segmento: "s1",
      tipo: "t1",
      uf: "pe",
      perfil: "recorrente",
      parceiro: "p1",
      foco: "clientes_inativos",
    });

    expect(filtros).toMatchObject({
      periodo: "90d",
      responsavelId: "u1",
      segmentoId: "s1",
      tipoEmpreendimentoId: "t1",
      uf: "PE",
      perfilCliente: "recorrente",
      parceiroId: "p1",
      focoReativacao: "clientes_inativos",
    });
  });

  it("ignora perfil inválido em vez de quebrar uma URL editada à mão", () => {
    expect(lerFiltrosInteligencia({ perfil: "vip" }).perfilCliente).toBeNull();
  });

  it("não aplica período no where geral porque cada métrica tem seu próprio campo de data", () => {
    const filtros = lerFiltrosInteligencia({ periodo: "7d", segmento: "s1" });
    const where = whereNegociacaoInteligencia(filtros);

    expect(where).not.toHaveProperty("createdAt");
    expect(where.cliente).toMatchObject({ segmentoId: "s1" });
  });

  it("usa todo o histórico quando não há período e intervalo aberto no fim", () => {
    const agora = new Date("2026-08-23T12:00:00.000Z");
    const periodo = periodoInteligencia(lerFiltrosInteligencia({}), agora);

    expect(periodo.inicio).toEqual(new Date(0));
    expect(periodo.fim.getTime()).toBe(agora.getTime() + 1);
  });

  it("período sozinho não exclui proposta histórica sem negociação", () => {
    expect(temRecorteDaNegociacao(lerFiltrosInteligencia({ periodo: "12m" }))).toBe(false);
    expect(temRecorteDaNegociacao(lerFiltrosInteligencia({ canal: "c1" }))).toBe(true);
  });
});
