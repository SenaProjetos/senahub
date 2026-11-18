import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { LinhaCarga } from "@/modules/ferramentas/calc/cargas-demanda/carga-instalada";
import type { AjustesDoNivel, IdConcessionaria, OpcoesDoNivel, PapelCalculo } from "@/modules/ferramentas/calc/cargas-demanda/composicao";
import type { UsoDaEdificacao } from "@/modules/ferramentas/calc/cargas-demanda/atendimento";
import type { Ligacao } from "@/modules/ferramentas/calc/cargas-demanda/corrente";
import type { Ajustes, TipoApartamento } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/tipos";

import {
  CONCESSIONARIAS,
  MAX_LEVANTAMENTOS,
  conteudoSchema,
  conteudoVazio,
  lerConteudo,
  nomeEstudoSchema,
  TIPO_ESTUDO_CARGAS_DEMANDA,
  type CalculoEstudo,
  type CmdEstudo,
  type ConteudoCargasDemanda,
  type LinhaCargaEstudo,
} from "./conteudo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documento JSON mexido à mão nos testes
type Doc = Record<string, any>;

const mensagens = (r: { error?: { issues: { message: string }[] } }) => (r.error?.issues ?? []).map((i) => i.message);

function base(): Record<string, unknown> {
  return {
    levantamentos: [{ id: "lev", nome: "Flat", pavimentos: [{ id: "pav", nome: "T", ambientes: [{ id: "amb", nome: "Sala" }] }] }],
    calculos: [
      {
        id: "k1",
        nome: "Apartamentos",
        metodo: "area_util",
        papel: "apartamentos",
        escopo: { levantamentoIds: ["lev"], quantidade: 1 },
        apartamentos: [{ id: "t1", nome: "Tipo A", quantidade: 10, areaUtilM2: 40 }],
      },
      { id: "k2", nome: "Condomínio", metodo: "carga_instalada", papel: "condominio" },
    ],
    centros: {
      cmds: [
        {
          id: "c1",
          nome: "CMD 1",
          capacidade: 18,
          medidores: [
            { tipo: "residencial", tipoApartamentoId: "t1", quantidade: 10 },
            { tipo: "condominio", calculoId: "k2" },
          ],
        },
      ],
    },
    entradas: [{ alvo: { nivel: "cmd", cmdId: "c1" } }, { alvo: { nivel: "cpg" } }],
  };
}

describe("estudo vazio e leitura", () => {
  it("o estudo vazio é válido e NADA vem preenchido por padrão", () => {
    const c = conteudoVazio();
    expect(conteudoSchema.safeParse(c).success).toBe(true);
    expect(c).toMatchObject({
      versaoEsquema: 1,
      concessionaria: null,
      tipoEmpreendimento: null,
      sistema: null,
      ligacao: null,
      criterioIluminacao: null,
      peDireitoM: null,
      levantamentos: [],
      calculos: [],
      entradas: [],
    });
    expect(c.centros).toMatchObject({ cmds: [], calculosSoNoCpg: [], uso: null });
    expect(c.responsavel).toMatchObject({ nome: "", crea: "", uf: null, declaracaoConferencia: false, conferidoEm: null });
  });

  it("o tipo do estudo é cargas_demanda (sem migração: EstudoProjeto.tipo é texto)", () => {
    expect(TIPO_ESTUDO_CARGAS_DEMANDA).toBe("cargas_demanda");
  });

  it("nenhum campo técnico de um ambiente novo vem preenchido", () => {
    const c = conteudoSchema.parse(base());
    const a = c.levantamentos[0].pavimentos[0].ambientes[0];
    expect(a).toMatchObject({ areaM2: null, perimetroM: null, alturaPlanoM: null, tipo: null, atividadeId: null, pontos: [] });
    expect(a.iluminacao).toMatchObject({ vaAdotado: null, fp: null, emLux: null, fu: null, fm: null, quantidade: null });
    const l = conteudoSchema.parse({ calculos: [{ id: "k", nome: "K", linhas: [{ id: "l" }] }] }).calculos[0].linhas[0];
    expect(l).toMatchObject({ quantidade: null, potenciaW: null, fp: null, fd: null, vinculo: null, tipoCarga: null });
  });

  it("documento gravado antes de um campo existir continua abrindo (campo novo é opcional)", () => {
    expect(lerConteudo({})).not.toBeNull();
    expect(lerConteudo({ concessionaria: "copel" })?.concessionaria).toBe("copel");
  });

  it("é idempotente e sobrevive ao JSON gravado no banco", () => {
    const a = conteudoSchema.parse(base());
    const b = conteudoSchema.parse(JSON.parse(JSON.stringify(a)));
    expect(b).toEqual(a);
    expect(lerConteudo(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });

  it("devolve null para lixo, versão futura ou concessionária fora da lista", () => {
    expect(lerConteudo(null)).toBeNull();
    expect(lerConteudo("texto")).toBeNull();
    expect(lerConteudo({ versaoEsquema: 2 })).toBeNull();
    expect(lerConteudo({ concessionaria: "outra" })).toBeNull();
  });

  it("a lista de concessionárias é a dos anexos A a G", () => {
    expect([...CONCESSIONARIAS].sort()).toEqual(["celesc", "cemig", "copel", "enel", "energisa", "equatorial", "neoenergia"]);
  });

  it("nome do estudo", () => {
    expect(nomeEstudoSchema.safeParse("  ").success).toBe(false);
    expect(nomeEstudoSchema.parse(" Edifício X ")).toBe("Edifício X");
  });
});

describe("faixas válidas, com o texto da spec §6", () => {
  const com = (mexe: (c: Doc) => void) => {
    const c = base() as Doc;
    mexe(c);
    return conteudoSchema.safeParse(c);
  };

  it("área menor ou igual a zero", () => {
    const r = com((c) => (c.levantamentos[0].pavimentos[0].ambientes[0].areaM2 = 0));
    expect(mensagens(r)).toContain("Área inválida. Informe um valor maior que zero (m²).");
  });

  it("FP fora de 0 a 1, em qualquer lugar", () => {
    const texto = "Fator de potência inválido. Informe um valor maior que 0 e até 1.";
    expect(mensagens(com((c) => (c.levantamentos[0].pavimentos[0].ambientes[0].iluminacao = { fp: 1.2 })))).toContain(texto);
    expect(mensagens(com((c) => (c.calculos[1].linhas = [{ id: "l", fp: 0 }])))).toContain(texto);
    expect(mensagens(com((c) => (c.levantamentos[0].pavimentos[0].ambientes[0].pontos = [{ id: "p", tipo: "tug", fp: 2 }])))).toContain(texto);
  });

  it("quantidade (× N) do escopo: inteiro maior ou igual a 1", () => {
    const texto = "Quantidade inválida. Informe um número inteiro maior ou igual a 1.";
    expect(mensagens(com((c) => (c.calculos[0].escopo.quantidade = 0)))).toContain(texto);
    expect(mensagens(com((c) => (c.calculos[0].escopo.quantidade = 1.5)))).toContain(texto);
    expect(com((c) => (c.calculos[0].escopo.quantidade = 12)).success).toBe(true);
  });

  it("número de apartamentos: inteiro", () => {
    const texto = "Número de apartamentos inválido. Informe um número inteiro maior que zero.";
    expect(mensagens(com((c) => (c.calculos[0].apartamentos[0].quantidade = 2.5)))).toContain(texto);
    expect(mensagens(com((c) => (c.calculos[0].apartamentos[0].areaUtilM2 = -1)))).toContain("Área inválida. Informe um valor maior que zero (m²).");
  });

  it("nomes obrigatórios", () => {
    expect(com((c) => (c.levantamentos[0].nome = "  ")).success).toBe(false);
    expect(com((c) => (c.levantamentos[0].pavimentos[0].ambientes[0].nome = "")).success).toBe(false);
    expect(com((c) => (c.calculos[0].nome = "")).success).toBe(false);
    expect(com((c) => (c.centros.cmds[0].nome = "")).success).toBe(false);
  });

  it("listas fechadas", () => {
    expect(com((c) => (c.sistema = "127/220")).success).toBe(false);
    expect(com((c) => (c.sistema = "380/220")).success).toBe(true);
    expect(com((c) => (c.ligacao = "penta")).success).toBe(false);
    expect(com((c) => (c.tipoEmpreendimento = "galpao")).success).toBe(false);
    expect(com((c) => (c.criterioIluminacao = "ambos")).success).toBe(false);
    expect(com((c) => (c.responsavel = { uf: "XX" })).success).toBe(false);
    expect(com((c) => (c.responsavel = { uf: "PE", crea: "123456D" })).success).toBe(true);
  });

  it(`limite de ${MAX_LEVANTAMENTOS} levantamentos`, () => {
    const r = com((c) => (c.levantamentos = Array.from({ length: MAX_LEVANTAMENTOS + 1 }, (_, i) => ({ id: `x${i}`, nome: `L${i}` }))));
    expect(r.success).toBe(false);
  });
});

describe("integridade do documento", () => {
  const com = (mexe: (c: Doc) => void) => {
    const c = base() as Doc;
    mexe(c);
    return conteudoSchema.safeParse(c);
  };

  it("o documento-base é válido", () => {
    expect(conteudoSchema.safeParse(base()).success).toBe(true);
  });

  it("recusa identificadores repetidos, de qualquer tipo de item", () => {
    expect(mensagens(com((c) => (c.calculos[1].id = "k1")))).toContain("Há identificadores repetidos no estudo.");
    expect(mensagens(com((c) => (c.centros.cmds[0].id = "lev")))).toContain("Há identificadores repetidos no estudo.");
  });

  it("escopo só cita levantamento que existe e sem repetir", () => {
    expect(mensagens(com((c) => (c.calculos[0].escopo.levantamentoIds = ["sumiu"])))).toContain("O escopo cita um levantamento que não existe mais.");
    expect(mensagens(com((c) => (c.calculos[0].escopo.levantamentoIds = ["lev", "lev"])))).toContain("O escopo repete um levantamento.");
  });

  it("medidor só cita tipo de apartamento e cálculo que existem", () => {
    expect(mensagens(com((c) => (c.centros.cmds[0].medidores[0].tipoApartamentoId = "t9")))).toContain(
      "O medidor cita um tipo de apartamento que não existe mais.",
    );
    expect(mensagens(com((c) => (c.centros.cmds[0].medidores[1].calculoId = "k9")))).toContain("O medidor cita um cálculo que não existe mais.");
    expect(mensagens(com((c) => (c.centros.calculosSoNoCpg = ["k9"])))).toContain("O CPG cita um cálculo que não existe mais.");
  });

  it("entrada só cita CMD ou cálculo que existe, e uma por destino", () => {
    expect(mensagens(com((c) => (c.entradas = [{ alvo: { nivel: "cmd", cmdId: "c9" } }])))).toContain("A entrada cita um CMD que não existe mais.");
    expect(mensagens(com((c) => (c.entradas = [{ alvo: { nivel: "calculo", calculoId: "k9" } }])))).toContain(
      "A entrada cita um cálculo que não existe mais.",
    );
    expect(mensagens(com((c) => (c.entradas = [{ alvo: { nivel: "cpg" } }, { alvo: { nivel: "cpg" } }])))).toContain("Há duas entradas para o mesmo destino.");
  });

  it("vínculo da linha: origem e valores trazidos", () => {
    const ok = com((c) => {
      c.calculos[1].linhas = [{ id: "l", quantidade: 5, potenciaW: 160, fp: 0.8, vinculo: { origem: { tipo: "tug" }, trazido: { quantidade: 5, potenciaW: 160, fp: 0.8 } } }];
    });
    expect(ok.success).toBe(true);
    const ruim = com((c) => {
      c.calculos[1].linhas = [{ id: "l", vinculo: { origem: { tipo: "lareira" }, trazido: { quantidade: 5, potenciaW: 160, fp: 0.8 } } }];
    });
    expect(ruim.success).toBe(false);
  });
});

describe("encaixe com o motor (conferido pelo tsc)", () => {
  it("os tipos do esquema entram direto nos do motor", () => {
    // Só tipos: o `tsc` falha se o esquema se afastar do que o motor recebe. Em execução não faz nada.
    const encaixe = (c: ConteudoCargasDemanda, cmd: CmdEstudo, calculo: CalculoEstudo, linha: LinhaCargaEstudo) => {
      const concessionaria: IdConcessionaria | "enel" | null = c.concessionaria;
      const ligacao: Ligacao | null = c.ligacao;
      const uso: UsoDaEdificacao | null = c.centros.uso;
      const opcoes: OpcoesDoNivel = c.centros.opcoes;
      const ajustesCpg: AjustesDoNivel = c.centros.ajustesCpg;
      const ajustesCmd: AjustesDoNivel = cmd.ajustes;
      const ajustes: Ajustes | undefined = calculo.ajustes.apartamentos;
      const papel: PapelCalculo | null = calculo.papel;
      const tipo: TipoApartamento = { nome: calculo.apartamentos[0].nome, quantidade: calculo.apartamentos[0].quantidade ?? 0, areaUtilM2: calculo.apartamentos[0].areaUtilM2 ?? 0 };
      const l: LinhaCarga = { quantidade: linha.quantidade ?? 0, potenciaW: linha.potenciaW ?? 0, fp: linha.fp ?? 1 };
      return [concessionaria, ligacao, uso, opcoes, ajustesCpg, ajustesCmd, ajustes, papel, tipo, l];
    };
    expect(typeof encaixe).toBe("function");
  });
});

describe("é puro", () => {
  const PROIBIDO =
    /from\s+["'](@\/lib\/prisma|server-only|next\/[^"']*|@\/generated\/prisma[^"']*|@\/lib\/session|@\/lib\/with-action|node:[^"']*)["']|import\s+["']server-only["']/;
  for (const f of ["conteudo.ts", "levantamento.ts"]) {
    it(`${f} não importa banco, sessão, Next nem node:`, () => {
      expect(readFileSync(join(__dirname, f), "utf8")).not.toMatch(PROIBIDO);
    });
  }
});
