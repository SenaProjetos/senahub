import { describe, expect, it } from "vitest";
import {
  diasParaVencimento,
  statusCertidao,
  textoValidade,
  prioridadeCertidao,
  ordenarPorPrioridade,
  janelaAtencaoUtc,
  panoramaCompliance,
  tiposObrigatoriosFaltantes,
  type CertidaoParaPanorama,
  type CertidaoParaChecklist,
  type TipoObrigatorio,
} from "./service";

const HOJE = "2026-08-05";
/** A janela padrão (`PRAZOS_CERTIDOES_PADRAO.diasEmBreve`). */
const JANELA = 30;

describe("diasParaVencimento", () => {
  it("positivo quando a validade está no futuro", () => {
    expect(diasParaVencimento("2026-08-15", HOJE)).toBe(10);
  });
  it("negativo quando já venceu", () => {
    expect(diasParaVencimento("2026-08-01", HOJE)).toBe(-4);
  });
  it("zero no próprio dia", () => {
    expect(diasParaVencimento(HOJE, HOJE)).toBe(0);
  });
});

describe("statusCertidao", () => {
  it("vencida quando dias < 0", () => {
    expect(statusCertidao("2026-08-01", JANELA, HOJE)).toBe("vencida");
  });
  it("vence_em_breve até 30 dias", () => {
    expect(statusCertidao("2026-09-04", JANELA, HOJE)).toBe("vence_em_breve");
  });
  it("ok acima de 30 dias", () => {
    expect(statusCertidao("2026-09-06", JANELA, HOJE)).toBe("ok");
  });
  it("a janela é a configurada, não fixa em 30", () => {
    // 2026-08-20 = 15 dias
    expect(statusCertidao("2026-08-20", 15, HOJE)).toBe("vence_em_breve");
    expect(statusCertidao("2026-08-21", 15, HOJE)).toBe("ok");
    expect(statusCertidao("2026-10-04", 60, HOJE)).toBe("vence_em_breve");
    expect(textoValidade("2026-08-21", 15, HOJE).tom).toBe("neutral");
    expect(prioridadeCertidao({ validade: "2026-08-21", obrigatoria: true, arquivoNome: "a.pdf" }, 15, HOJE)).toBe(5);
    expect(prioridadeCertidao({ validade: "2026-08-21", obrigatoria: true, arquivoNome: "a.pdf" }, 30, HOJE)).toBe(2);
  });
  it("no dia exato da validade ainda é vence_em_breve (não vencida)", () => {
    expect(statusCertidao(HOJE, JANELA, HOJE)).toBe("vence_em_breve");
  });
});

describe("textoValidade", () => {
  it("vencida mostra o atraso em dias", () => {
    expect(textoValidade("2026-07-12", JANELA, HOJE)).toEqual({ texto: "Vencida há 24 dias", tom: "danger" });
  });
  it("singular quando é 1 dia", () => {
    expect(textoValidade("2026-08-04", JANELA, HOJE).texto).toBe("Vencida há 1 dia");
    expect(textoValidade("2026-08-06", JANELA, HOJE).texto).toBe("Vence em 1 dia");
  });
  it("no próprio dia é 'Vence hoje', não 'em 0 dias'", () => {
    expect(textoValidade(HOJE, JANELA, HOJE)).toEqual({ texto: "Vence hoje", tom: "warning" });
  });
  it("dentro da janela de alerta é warning", () => {
    expect(textoValidade("2026-09-04", JANELA, HOJE)).toEqual({ texto: "Vence em 30 dias", tom: "warning" });
  });
  it("regular é neutro (não pinta a tabela inteira de alarme)", () => {
    expect(textoValidade("2026-09-05", JANELA, HOJE)).toEqual({ texto: "Válida por 31 dias", tom: "neutral" });
  });
  // O texto e o badge saem da MESMA contagem de dias — não podem discordar em nenhum dia.
  it("o tom acompanha o statusCertidao em toda a faixa", () => {
    for (let offset = -10; offset <= 45; offset++) {
      const d = new Date(Date.UTC(2026, 7, 5) + offset * 86_400_000).toISOString().slice(0, 10);
      const esperado = { vencida: "danger", vence_em_breve: "warning", ok: "neutral" } as const;
      expect({ offset, tom: textoValidade(d, JANELA, HOJE).tom }).toEqual({
        offset,
        tom: esperado[statusCertidao(d, JANELA, HOJE)],
      });
    }
  });
});

describe("prioridadeCertidao / ordenarPorPrioridade", () => {
  const linha = (validade: string, obrigatoria: boolean, temArquivo: boolean) => ({
    validade,
    obrigatoria,
    arquivoNome: temArquivo ? "certidao.pdf" : null,
  });

  it("segue os 6 níveis do §8", () => {
    expect(prioridadeCertidao(linha("2026-08-01", true, true), JANELA, HOJE)).toBe(0); // obrigatória vencida
    expect(prioridadeCertidao(linha("2026-08-01", false, true), JANELA, HOJE)).toBe(1); // vencida
    expect(prioridadeCertidao(linha("2026-08-10", true, true), JANELA, HOJE)).toBe(2); // obrigatória em breve
    expect(prioridadeCertidao(linha("2026-08-10", false, true), JANELA, HOJE)).toBe(3); // em breve
    expect(prioridadeCertidao(linha("2026-12-01", false, false), JANELA, HOJE)).toBe(4); // ok sem documento
    expect(prioridadeCertidao(linha("2026-12-01", false, true), JANELA, HOJE)).toBe(5); // ok com documento
  });

  it("obrigatória vencida vem antes mesmo sem documento na concorrente", () => {
    // Documento só desempata no grupo OK — uma obrigatória vencida não é rebaixada por ter PDF.
    expect(prioridadeCertidao(linha("2026-08-01", true, true), JANELA, HOJE)).toBeLessThan(
      prioridadeCertidao(linha("2026-08-01", false, false), JANELA, HOJE),
    );
  });

  it("dentro do grupo, validade mais próxima primeiro", () => {
    const ordenadas = ordenarPorPrioridade(
      [
        linha("2026-12-01", false, true), // ok com doc
        linha("2026-07-01", false, true), // vencida (mais antiga)
        linha("2026-08-01", true, true), // obrigatória vencida
        linha("2026-08-02", false, true), // vencida
      ],
      JANELA,
      HOJE,
    );
    expect(ordenadas.map((c) => c.validade)).toEqual([
      "2026-08-01", // obrigatória vencida primeiro, mesmo sendo a mais recente das vencidas
      "2026-07-01",
      "2026-08-02",
      "2026-12-01",
    ]);
  });

  it("não muta o array recebido", () => {
    const entrada = [linha("2026-12-01", false, true), linha("2026-07-01", false, true)];
    const copia = [...entrada];
    ordenarPorPrioridade(entrada, JANELA, HOJE);
    expect(entrada).toEqual(copia);
  });
});

describe("janelaAtencaoUtc", () => {
  // O badge do menu e o card do Início contam por SQL (`validade < hojeUtc`, `<= limiteUtc`);
  // a tela classifica linha a linha com `statusCertidao`. Se as duas fronteiras discordarem em
  // um dia, o badge mostra um número que a tela não confirma. Este teste prende o acordo.
  //
  // A hora do dia é o que costuma quebrar: às 21h em America/Sao_Paulo (UTC-3) um
  // `toISOString()` já aponta o dia seguinte — por isso os dois instantes abaixo.
  const INSTANTES = [
    new Date(2026, 7, 5, 9, 30), // 05/08/2026, manhã
    new Date(2026, 7, 5, 21, 0), // 05/08/2026, 21h — mesmo dia-calendário local
  ];

  for (const agora of INSTANTES) {
    it(`o recorte SQL casa com statusCertidao às ${agora.getHours()}h`, () => {
      const { hojeUtc, limiteUtc } = janelaAtencaoUtc(JANELA, agora);
      const hojeISO = "2026-08-05";

      for (let offset = -5; offset <= 40; offset++) {
        // A validade como o Postgres devolve um `@db.Date`: meia-noite UTC.
        const validade = new Date(hojeUtc.getTime() + offset * 86_400_000);
        const validadeISO = validade.toISOString().slice(0, 10);

        const status = statusCertidao(validadeISO, JANELA, hojeISO);
        const contadaComoVencida = validade < hojeUtc;
        const contadaComoEmBreve = validade >= hojeUtc && validade <= limiteUtc;

        expect({ offset, vencida: contadaComoVencida, emBreve: contadaComoEmBreve }).toEqual({
          offset,
          vencida: status === "vencida",
          emBreve: status === "vence_em_breve",
        });
      }
    });
  }

  it("a janela cobre exatamente os dias configurados", () => {
    for (const dias of [1, 15, 30, 90]) {
      const { hojeUtc, limiteUtc } = janelaAtencaoUtc(dias, new Date(2026, 7, 5, 12));
      expect((limiteUtc.getTime() - hojeUtc.getTime()) / 86_400_000).toBe(dias);
    }
  });

  it("com outra janela, o recorte SQL continua casando com statusCertidao", () => {
    const dias = 12;
    const { hojeUtc, limiteUtc } = janelaAtencaoUtc(dias, new Date(2026, 7, 5, 21));
    for (let offset = -3; offset <= 20; offset++) {
      const validade = new Date(hojeUtc.getTime() + offset * 86_400_000);
      const status = statusCertidao(validade.toISOString().slice(0, 10), dias, "2026-08-05");
      expect({ offset, emBreve: validade >= hojeUtc && validade <= limiteUtc }).toEqual({
        offset,
        emBreve: status === "vence_em_breve",
      });
    }
  });
});

describe("panoramaCompliance", () => {
  it("conta vencidas/vence_em_breve/ok e sem arquivo separadamente", () => {
    const certidoes: CertidaoParaPanorama[] = [
      { id: "1", tipoId: "t1", validade: "2026-08-01", arquivoPath: "a.pdf" }, // vencida, com arquivo
      { id: "2", tipoId: "t1", validade: "2026-08-10", arquivoPath: null }, // vence_em_breve, sem arquivo
      { id: "3", tipoId: "t2", validade: "2027-01-01", arquivoPath: "c.pdf" }, // ok
      { id: "4", tipoId: "t2", validade: "2026-08-01", arquivoPath: null }, // vencida, sem arquivo
    ];
    expect(panoramaCompliance(certidoes, JANELA, HOJE)).toEqual({
      vencidas: 2,
      venceEmBreve: 1,
      ok: 1,
      semArquivo: 2,
    });
  });
});

describe("tiposObrigatoriosFaltantes", () => {
  const tipos: TipoObrigatorio[] = [
    { id: "t1", nome: "CND Federal", obrigatoria: true },
    { id: "t2", nome: "FGTS", obrigatoria: true },
    { id: "t3", nome: "Opcional", obrigatoria: false },
  ];

  it("sinaliza tipo obrigatório nunca registrado", () => {
    const certidoes: CertidaoParaChecklist[] = [{ tipoId: "t2", validade: "2027-01-01" }];
    expect(tiposObrigatoriosFaltantes(tipos, certidoes, HOJE)).toEqual([tipos[0]]);
  });

  it("sinaliza tipo obrigatório cuja única certidão está vencida", () => {
    const certidoes: CertidaoParaChecklist[] = [
      { tipoId: "t1", validade: "2026-08-01" },
      { tipoId: "t2", validade: "2027-01-01" },
    ];
    expect(tiposObrigatoriosFaltantes(tipos, certidoes, HOJE)).toEqual([tipos[0]]);
  });

  it("não sinaliza tipo opcional faltando", () => {
    expect(tiposObrigatoriosFaltantes(tipos, [{ tipoId: "t1", validade: "2027-01-01" }, { tipoId: "t2", validade: "2027-01-01" }], HOJE)).toEqual([]);
  });
});
