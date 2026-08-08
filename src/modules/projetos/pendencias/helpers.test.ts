import { describe, expect, it } from "vitest";
import {
  enviaveis,
  mencionadosNovos,
  pesoSeveridade,
  proximoNumero,
  resolverMencionados,
  rotuloItemPendencia,
  SEVERIDADES,
  SEVERIDADE_LABEL,
  temImpeditivoAberto,
  estaAberta,
  podeTransicionar,
  transicoesPossiveis,
  STATUS_PENDENCIA,
  STATUS_LABEL,
  STATUS_TERMINAIS,
  TIPOS_PENDENCIA,
  TIPO_PENDENCIA_LABEL,
  temEvidencia,
  MOMENTOS_EVIDENCIA,
  MOMENTO_LABEL,
} from "@/modules/projetos/pendencias/helpers";

describe("rotuloItemPendencia", () => {
  it("formata número, página e texto", () => {
    expect(rotuloItemPendencia({ numero: 3, pagina: 2, texto: "Cota ausente" })).toBe(
      "#3 (pág. 2) — Cota ausente",
    );
  });
});

describe("proximoNumero", () => {
  it("começa em 1 quando não há pendências", () => {
    expect(proximoNumero([])).toBe(1);
  });
  it("é max+1, ignorando ordem/lacunas", () => {
    expect(proximoNumero([1, 2, 5])).toBe(6);
    expect(proximoNumero([3, 1, 2])).toBe(4);
  });
});

describe("enviaveis", () => {
  const base = { status: "aberta", tarefaId: null as string | null };
  it("inclui só abertas sem tarefa", () => {
    const lista = [
      { ...base },
      { status: "aberta", tarefaId: "t1" },
      { status: "resolvida", tarefaId: null },
      { status: "fechada", tarefaId: null },
    ];
    expect(enviaveis(lista)).toHaveLength(1);
  });
  it("vazio quando nada é enviável", () => {
    expect(enviaveis([{ status: "fechada", tarefaId: null }])).toHaveLength(0);
  });
});

describe("resolverMencionados", () => {
  const candidatos = [
    { userId: "u1", nome: "João Silva" },
    { userId: "u2", nome: "Maria Conceição" },
  ];

  it("casa pelo primeiro nome, case-insensitive", () => {
    expect(resolverMencionados("confere @joão a cota", candidatos)).toEqual([candidatos[0]]);
  });

  it("casa nome acentuado (primeiro nome do candidato)", () => {
    const comAcento = [{ userId: "u3", nome: "Conceição Duarte" }];
    expect(resolverMencionados("oi @Conceição", comAcento)).toEqual(comAcento);
  });

  it("várias menções distintas, sem duplicar", () => {
    const r = resolverMencionados("@João e @Maria e @joão de novo", candidatos);
    expect(r).toHaveLength(2);
  });

  it("ignora quem não é candidato (não recebe notificação daquele apontamento)", () => {
    expect(resolverMencionados("oi @Pedro", candidatos)).toEqual([]);
  });

  it("texto sem @ não casa nada", () => {
    expect(resolverMencionados("sem menção nenhuma aqui", candidatos)).toEqual([]);
  });
});

describe("mencionadosNovos", () => {
  const candidatos = [
    { userId: "u1", nome: "João Silva" },
    { userId: "u2", nome: "Maria Conceição" },
  ];

  it("só quem foi ADICIONADO na edição", () => {
    const r = mencionadosNovos("oi @João", "oi @João e @Maria", candidatos);
    expect(r).toEqual([candidatos[1]]);
  });

  it("vazio quando a menção já existia antes (evita renotificar)", () => {
    expect(mencionadosNovos("oi @João", "oi @João, tudo certo", candidatos)).toEqual([]);
  });

  it("vazio quando uma menção é removida (não é 'nova')", () => {
    expect(mencionadosNovos("oi @João e @Maria", "oi @João", candidatos)).toEqual([]);
  });
});

describe("catálogo de classificação (item 11)", () => {
  it("toda severidade e todo tipo têm rótulo pt-BR", () => {
    for (const s of SEVERIDADES) expect(SEVERIDADE_LABEL[s]).toBeTruthy();
    for (const t of TIPOS_PENDENCIA) expect(TIPO_PENDENCIA_LABEL[t]).toBeTruthy();
  });
  it("impeditivo é o topo da escala", () => {
    expect(SEVERIDADES[0]).toBe("impeditivo");
  });
});

describe("pesoSeveridade", () => {
  it("ordena do mais grave pro menos grave", () => {
    expect(pesoSeveridade("impeditivo")).toBeLessThan(pesoSeveridade("alta"));
    expect(pesoSeveridade("alta")).toBeLessThan(pesoSeveridade("media"));
    expect(pesoSeveridade("media")).toBeLessThan(pesoSeveridade("baixa"));
  });
  it("não classificado vai pro FIM, não pro topo (null não é 'pouco grave')", () => {
    expect(pesoSeveridade(null)).toBeGreaterThan(pesoSeveridade("baixa"));
    expect(pesoSeveridade(undefined)).toBeGreaterThan(pesoSeveridade("baixa"));
  });
  it("valor desconhecido cai no mesmo balde do não classificado", () => {
    expect(pesoSeveridade("catastrofico")).toBe(pesoSeveridade(null));
  });
});

describe("temImpeditivoAberto (base do item 19)", () => {
  const PUB = new Date("2026-08-01");
  it("true só com impeditivo ABERTO e publicado", () => {
    expect(temImpeditivoAberto([{ status: "aberta", severidade: "impeditivo", publicadoEm: PUB }])).toBe(true);
  });
  it("impeditivo em RASCUNHO não trava — o revisor ainda não entregou (item 31)", () => {
    expect(temImpeditivoAberto([{ status: "aberta", severidade: "impeditivo", publicadoEm: null }])).toBe(false);
  });
  it("impeditivo já fechado/resolvido/descartado não trava", () => {
    expect(
      temImpeditivoAberto([
        { status: "fechada", severidade: "impeditivo", publicadoEm: PUB },
        { status: "resolvida", severidade: "impeditivo", publicadoEm: PUB },
        { status: "descartada", severidade: "impeditivo", publicadoEm: PUB },
      ]),
    ).toBe(false);
  });
  it("aberto de severidade menor (ou sem severidade) não trava", () => {
    expect(
      temImpeditivoAberto([
        { status: "aberta", severidade: "alta", publicadoEm: PUB },
        { status: "aberta", severidade: null, publicadoEm: PUB },
        { status: "aberta", publicadoEm: PUB },
      ]),
    ).toBe(false);
  });
  it("lista vazia não trava", () => {
    expect(temImpeditivoAberto([])).toBe(false);
  });
});

describe("máquina de estados (item 22)", () => {
  const VALIDADOR = { ehValidador: true, ehResponsavel: false, ehGlobal: false };
  const PROJETISTA = { ehValidador: false, ehResponsavel: true, ehGlobal: false };
  const GLOBAL = { ehValidador: true, ehResponsavel: true, ehGlobal: true };
  const NINGUEM = { ehValidador: false, ehResponsavel: false, ehGlobal: false };

  it("todo estado tem rótulo, e 'descartada' é lida como 'Não procede'", () => {
    for (const s of STATUS_PENDENCIA) expect(STATUS_LABEL[s]).toBeTruthy();
    // O valor GRAVADO segue sendo `descartada` (auditoria antiga continua verdadeira).
    expect(STATUS_LABEL.descartada).toBe("Não procede");
  });

  // ── cada seta do diagrama aprovado ──
  it.each([
    ["aberta", "em_correcao", PROJETISTA],
    ["em_correcao", "aberta", PROJETISTA],
    ["aberta", "resolvida", PROJETISTA],
    ["em_correcao", "resolvida", PROJETISTA],
    ["resolvida", "aberta", PROJETISTA],
    ["resolvida", "fechada", VALIDADOR],
    ["aberta", "descartada", VALIDADOR],
    ["resolvida", "descartada", VALIDADOR],
    ["aberta", "adiado", GLOBAL],
    ["em_correcao", "adiado", GLOBAL],
    ["adiado", "aberta", GLOBAL],
  ])("permite %s → %s para quem tem o papel", (de, para, papeis) => {
    expect(podeTransicionar(de, para, papeis).ok).toBe(true);
  });

  // ── espaço NEGATIVO: todo par fora do diagrama tem que ser recusado ──
  it("recusa qualquer par que não esteja no diagrama, mesmo para perfil global", () => {
    const permitidos = new Set([
      "aberta>em_correcao", "aberta>resolvida", "aberta>descartada", "aberta>adiado",
      "em_correcao>aberta", "em_correcao>resolvida", "em_correcao>descartada", "em_correcao>adiado",
      "resolvida>aberta", "resolvida>fechada", "resolvida>descartada",
      "adiado>aberta",
    ]);
    for (const de of STATUS_PENDENCIA) {
      for (const para of STATUS_PENDENCIA) {
        const esperado = permitidos.has(`${de}>${para}`);
        const r = podeTransicionar(de, para, GLOBAL);
        expect({ par: `${de}>${para}`, ok: r.ok }).toEqual({ par: `${de}>${para}`, ok: esperado });
      }
    }
  });

  it("estado terminal não sai do lugar", () => {
    for (const terminal of STATUS_TERMINAIS) {
      for (const para of STATUS_PENDENCIA) {
        if (para === terminal) continue;
        expect(podeTransicionar(terminal, para, GLOBAL).ok).toBe(false);
      }
    }
  });

  it("adiar e reativar são SÓ de perfil global (restrição do solicitante)", () => {
    for (const papeis of [VALIDADOR, PROJETISTA]) {
      const r = podeTransicionar("aberta", "adiado", papeis);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toContain("admin ou supervisor");
      expect(podeTransicionar("adiado", "aberta", papeis).ok).toBe(false);
    }
  });

  it("fechar é do validador; resolver é do projetista — não se cruzam", () => {
    expect(podeTransicionar("resolvida", "fechada", PROJETISTA).ok).toBe(false);
    expect(podeTransicionar("aberta", "resolvida", VALIDADOR).ok).toBe(false);
  });

  it("sem papel nenhum não move nada", () => {
    for (const de of STATUS_PENDENCIA) {
      for (const para of STATUS_PENDENCIA) {
        expect(podeTransicionar(de, para, NINGUEM).ok).toBe(false);
      }
    }
  });

  it("'não procede' exige justificativa; as outras transições não", () => {
    const desc = podeTransicionar("aberta", "descartada", VALIDADOR);
    expect(desc.ok && desc.exigeJustificativa).toBe(true);
    const fecha = podeTransicionar("resolvida", "fechada", VALIDADOR);
    expect(fecha.ok && fecha.exigeJustificativa).toBe(false);
  });

  it("estado igual, ou desconhecido, é recusado com motivo", () => {
    expect(podeTransicionar("aberta", "aberta", GLOBAL).ok).toBe(false);
    expect(podeTransicionar("inventado", "aberta", GLOBAL).ok).toBe(false);
    expect(podeTransicionar("aberta", "inventado", GLOBAL).ok).toBe(false);
  });

  it("transicoesPossiveis bate com o que podeTransicionar libera", () => {
    for (const de of STATUS_PENDENCIA) {
      for (const papeis of [VALIDADOR, PROJETISTA, GLOBAL]) {
        for (const para of transicoesPossiveis(de, papeis)) {
          expect(podeTransicionar(de, para, papeis).ok).toBe(true);
        }
      }
    }
  });
});

describe("estaAberta / STATUS_ABERTOS", () => {
  it("aberta e em_correcao são trabalho pendente", () => {
    expect(estaAberta("aberta")).toBe(true);
    expect(estaAberta("em_correcao")).toBe(true);
  });
  it("resolvida ainda NÃO está aberta (espera verificação, o trabalho saiu do projetista)", () => {
    expect(estaAberta("resolvida")).toBe(false);
  });
  it("adiado sai da fila — senão adiar não teria efeito", () => {
    expect(estaAberta("adiado")).toBe(false);
  });
  it("terminais e valores inválidos não contam", () => {
    for (const s of ["fechada", "descartada", "", null, undefined, "xpto"]) expect(estaAberta(s)).toBe(false);
  });
});

describe("temImpeditivoAberto acompanha em_correcao (item 19 × item 22)", () => {
  it("impeditivo ASSUMIDO pelo projetista continua travando", () => {
    expect(temImpeditivoAberto([{ status: "em_correcao", severidade: "impeditivo", publicadoEm: new Date() }])).toBe(true);
  });
  it("impeditivo adiado ou encerrado não trava", () => {
    for (const s of ["adiado", "fechada", "descartada", "resolvida"]) {
      expect(temImpeditivoAberto([{ status: s, severidade: "impeditivo", publicadoEm: new Date() }])).toBe(false);
    }
  });
});

describe("temEvidencia (item 7)", () => {
  it("todo momento tem rótulo pt-BR", () => {
    for (const m of MOMENTOS_EVIDENCIA) expect(MOMENTO_LABEL[m]).toBeTruthy();
  });

  it("acha o momento pedido e ignora o outro", () => {
    const anexos = [{ momento: "antes" }, { momento: null }];
    expect(temEvidencia(anexos, "antes")).toBe(true);
    expect(temEvidencia(anexos, "depois")).toBe(false);
  });

  it("anexo comum (sem momento) não conta como evidência", () => {
    // É o que faz o aviso do fechamento significar algo: juntar uma norma em PDF não é
    // provar que o ajuste foi feito.
    expect(temEvidencia([{ momento: null }, {}], "depois")).toBe(false);
  });

  it("lista vazia não quebra", () => {
    expect(temEvidencia([], "antes")).toBe(false);
  });
});
