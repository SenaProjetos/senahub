import { describe, expect, it } from "vitest";
import {
  agruparPorRegra,
  contarPorSeveridade,
  verificarCronograma,
  type EntradaQualidade,
  type LinhaQualidade,
} from "./qualidade";
import { calcularSaude, faixaDaNota, principalCausa } from "./saude";

/** Linha saudável: nenhuma regra dispara. É a base de todos os testes. */
const boa = (extra: Partial<LinhaQualidade> = {}): LinhaQualidade => ({
  id: "t1",
  nome: "Modelagem estrutural",
  tipoEap: "atv",
  duracaoDias: 5,
  status: "nin",
  progresso: 0,
  // Depois da Data de Status (20/09) de propósito: linha "boa" não pode estar atrasada.
  inicioPrevisto: "2026-09-21",
  fimPrevisto: "2026-09-25",
  inicioReal: null,
  fimReal: null,
  temResponsavel: true,
  temRestricao: false,
  temPredecessora: true,
  temSucessora: true,
  ehResumo: false,
  critica: false,
  ...extra,
});

const rodar = (linhas: LinhaQualidade[], extra: Partial<EntradaQualidade> = {}) =>
  verificarCronograma({ linhas, dataStatus: "2026-09-20", ciclos: [], ...extra });

const regras = (linhas: LinhaQualidade[], extra: Partial<EntradaQualidade> = {}) =>
  rodar(linhas, extra).map((a) => a.regra);

describe("cronograma saudável não gera achado", () => {
  it("linha completa e no prazo passa limpo", () => {
    expect(rodar([boa()])).toEqual([]);
  });

  it("cronograma vazio não reclama de nada", () => {
    expect(rodar([])).toEqual([]);
  });
});

describe("regras estruturais", () => {
  it("acusa falta de responsável", () => {
    expect(regras([boa({ temResponsavel: false })])).toContain("sem_responsavel");
    // Etapa de terceiro (recurso "Externo"): cobrar responsável obrigaria a escalar alguém da
    // casa para esperar a prefeitura.
    expect(regras([boa({ temResponsavel: false, deTerceiro: true })])).not.toContain("sem_responsavel");
  });

  it("acusa atividade sem duração", () => {
    expect(regras([boa({ duracaoDias: 0 })])).toContain("sem_duracao");
  });

  it("marco com duração é ERRO — marco tem duração 0 por definição", () => {
    const a = rodar([boa({ tipoEap: "mrc", duracaoDias: 3 })]);
    const achado = a.find((x) => x.regra === "marco_com_duracao");
    expect(achado?.severidade).toBe("erro");
  });

  it("marco com duração 0 não é acusado de estar sem duração", () => {
    expect(regras([boa({ tipoEap: "mrc", duracaoDias: 0 })])).not.toContain("sem_duracao");
  });

  it("acusa atividade longa demais", () => {
    expect(regras([boa({ duracaoDias: 30 })])).toContain("duracao_excessiva");
    expect(regras([boa({ duracaoDias: 20 })])).not.toContain("duracao_excessiva");
  });

  it("acusa ponta solta nos dois sentidos", () => {
    expect(regras([boa({ temPredecessora: false })])).toContain("sem_predecessora");
    expect(regras([boa({ temSucessora: false })])).toContain("sem_sucessora");
  });

  it("linha-resumo é poupada: ela deriva dos filhos e não tem vida própria", () => {
    const r = regras([
      boa({ ehResumo: true, tipoEap: "res", temResponsavel: false, temPredecessora: false, temSucessora: false }),
    ]);
    expect(r).toEqual([]);
  });

  it("agrupador (fase, disciplina) também é poupado", () => {
    expect(regras([boa({ tipoEap: "disc", temResponsavel: false })])).toEqual([]);
  });
});

describe("regras de execução", () => {
  it("concluída sem término real é ERRO — o realizado fica sem prova", () => {
    const a = rodar([boa({ status: "con", progresso: 100, inicioReal: "2026-09-14", fimReal: null })]);
    expect(a.find((x) => x.regra === "concluida_sem_termino_real")?.severidade).toBe("erro");
  });

  it("em andamento sem início real vira alerta", () => {
    expect(regras([boa({ status: "and", inicioReal: null })])).toContain("iniciada_sem_inicio_real");
  });

  it("bloqueada é sinalizada", () => {
    expect(regras([boa({ status: "blq" })])).toContain("bloqueada");
  });
});

describe("Data de Status separa atrasado de não apurado", () => {
  it("sem Data de Status, avisa e NÃO acusa atraso", () => {
    const r = regras([boa({ inicioPrevisto: "2026-08-24", fimPrevisto: "2026-09-01" })], { dataStatus: null });
    expect(r).toContain("sem_data_status");
    expect(r).not.toContain("atrasada");
  });

  it("com Data de Status, o que passou do prazo vira atrasada", () => {
    expect(regras([boa({ inicioPrevisto: "2026-09-07", fimPrevisto: "2026-09-10" })])).toContain("atrasada");
  });

  it("L1: a previsão reprogramada para depois da Data de Status ainda é atrasada contra o combinado", () => {
    // O motor pôs o restante depois da Data de Status (fimPrevisto 25/09), mas a linha de base dizia 10/09.
    const r = rodar([boa({ inicioPrevisto: "2026-09-07", fimPrevisto: "2026-09-25", fimReferencia: "2026-09-10", progresso: 40 })]);
    const achado = r.find((x) => x.regra === "atrasada");
    expect(achado?.mensagem).toContain("2026-09-10");
  });

  it("L1: combinado depois da Data de Status não é atraso, mesmo com a previsão antes", () => {
    const r = regras([boa({ inicioPrevisto: "2026-09-07", fimPrevisto: "2026-09-10", fimReferencia: "2026-09-30" })]);
    expect(r).not.toContain("atrasada");
  });

  it("linha crítica atrasada é ERRO, não alerta — arrasta o projeto", () => {
    const a = rodar([boa({ inicioPrevisto: "2026-09-07", fimPrevisto: "2026-09-10", critica: true })]);
    const achado = a.find((x) => x.regra === "critica_atrasada");
    expect(achado?.severidade).toBe("erro");
    expect(a.map((x) => x.regra)).not.toContain("atrasada");
  });

  it("concluída não é atrasada, mesmo tendo passado do prazo", () => {
    const r = regras([
      boa({ inicioPrevisto: "2026-09-07", fimPrevisto: "2026-09-10", status: "con", progresso: 100, inicioReal: "2026-09-01", fimReal: "2026-09-15" }),
    ]);
    expect(r).not.toContain("atrasada");
  });

  it("cancelada e arquivada também saem da conta de atraso", () => {
    const passado = { inicioPrevisto: "2026-09-07", fimPrevisto: "2026-09-10" };
    expect(regras([boa({ ...passado, status: "can" })])).not.toContain("atrasada");
    expect(regras([boa({ ...passado, status: "arq" })])).not.toContain("atrasada");
  });

  it("avanço informado em linha que nem começou é ERRO", () => {
    const a = rodar([boa({ inicioPrevisto: "2026-10-01", fimPrevisto: "2026-10-10", progresso: 30 })]);
    expect(a.find((x) => x.regra === "futura_com_avanco")?.severidade).toBe("erro");
  });
});

describe("regras do cronograma inteiro", () => {
  it("ciclo vira erro por vínculo", () => {
    const a = rodar([boa()], { ciclos: [{ tarefaId: "t1", predecessoraId: "t2" }] });
    expect(a.find((x) => x.regra === "vinculo_circular")?.severidade).toBe("erro");
  });

  it("excesso de restrições é medido em PROPORÇÃO, não em número absoluto", () => {
    // 3 em 10 = 30% → acusa.
    const dez = Array.from({ length: 10 }, (_, i) => boa({ id: `t${i}`, temRestricao: i < 3 }));
    expect(regras(dez)).toContain("excesso_de_restricoes");

    // 3 em 100 = 3% → não acusa.
    const cem = Array.from({ length: 100 }, (_, i) => boa({ id: `t${i}`, temRestricao: i < 3 }));
    expect(regras(cem)).not.toContain("excesso_de_restricoes");
  });

  it("cronograma pequeno não é cobrado por proporção de restrição", () => {
    const tres = Array.from({ length: 3 }, (_, i) => boa({ id: `t${i}`, temRestricao: true }));
    expect(regras(tres)).not.toContain("excesso_de_restricoes");
  });
});

describe("resumos para a tela", () => {
  it("conta por severidade", () => {
    const a = rodar([boa({ tipoEap: "mrc", duracaoDias: 3, temResponsavel: false })]);
    const c = contarPorSeveridade(a);
    expect(c.erro).toBeGreaterThan(0);
    expect(c.alerta).toBeGreaterThan(0);
  });

  it("agrupa por regra para a tela dizer '12 sem responsável' em vez de listar 12", () => {
    const linhas = Array.from({ length: 12 }, (_, i) => boa({ id: `t${i}`, temResponsavel: false }));
    const g = agruparPorRegra(rodar(linhas));
    expect(g.get("sem_responsavel")).toHaveLength(12);
  });
});

describe("Saúde do Cronograma", () => {
  it("cronograma limpo tira 100 e é saudável", () => {
    const s = calcularSaude(rodar([boa()]), 1);
    expect(s?.nota).toBe(100);
    expect(s?.faixa).toBe("saudavel");
  });

  it("cronograma VAZIO devolve null, não 100", () => {
    // "Nada a reclamar" e "nada a mostrar" são coisas diferentes: um projeto sem EAP
    // aparecendo como 100% saudável seria a pior leitura possível do indicador.
    expect(calcularSaude([], 0)).toBeNull();
  });

  it("nasce sempre marcada como provisória", () => {
    expect(calcularSaude(rodar([boa()]), 1)?.provisoria).toBe(true);
  });

  it("um problema grave derruba mais que muitos pequenos", () => {
    const comCiclo = calcularSaude(rodar([boa()], { ciclos: [{ tarefaId: "t1", predecessoraId: "t2" }] }), 1);
    const semPredecessora = calcularSaude(rodar([boa({ temPredecessora: false })]), 1);
    expect(comCiclo!.nota).toBeLessThan(semPredecessora!.nota);
  });

  it("uma regra sozinha não zera a nota e esconde as outras", () => {
    // 60 linhas sem responsável: o teto por regra impede que isso sozinho zere tudo.
    const muitas = Array.from({ length: 60 }, (_, i) => boa({ id: `t${i}`, temResponsavel: false }));
    const s = calcularSaude(rodar(muitas), 60);
    expect(s!.descontos.find((d) => d.regra === "sem_responsavel")!.pontos).toBeLessThanOrEqual(20);
    expect(s!.nota).toBeGreaterThan(0);
  });

  it("ordena os descontos do que mais dói para o que menos dói", () => {
    const s = calcularSaude(
      rodar([boa({ temPredecessora: false, temResponsavel: false })], {
        ciclos: [{ tarefaId: "t1", predecessoraId: "t2" }],
      }),
      1,
    );
    const pontos = s!.descontos.map((d) => d.pontos);
    expect(pontos).toEqual([...pontos].sort((a, b) => b - a));
    expect(s!.descontos[0].regra).toBe("vinculo_circular");
  });

  it("nota nunca fica negativa", () => {
    const horror = Array.from({ length: 50 }, (_, i) =>
      boa({
        id: `t${i}`,
        temResponsavel: false,
        temPredecessora: false,
        temSucessora: false,
        duracaoDias: 40,
        status: "blq",
        inicioPrevisto: "2026-08-24",
        fimPrevisto: "2026-09-01",
        critica: true,
      }),
    );
    const s = calcularSaude(rodar(horror), 50);
    expect(s!.nota).toBeGreaterThanOrEqual(0);
    expect(s!.faixa).toBe("critico");
  });

  it("faixas seguem o corte documentado", () => {
    expect(faixaDaNota(100)).toBe("saudavel");
    expect(faixaDaNota(85)).toBe("saudavel");
    expect(faixaDaNota(84)).toBe("atencao");
    expect(faixaDaNota(60)).toBe("atencao");
    expect(faixaDaNota(59)).toBe("critico");
  });

  it("a causa principal vem em português, com a contagem", () => {
    const linhas = Array.from({ length: 5 }, (_, i) => boa({ id: `t${i}`, temResponsavel: false }));
    expect(principalCausa(calcularSaude(rodar(linhas), 5))).toBe("5 × linha sem responsável");
  });

  it("sem desconto nenhum, não há causa a mostrar", () => {
    expect(principalCausa(calcularSaude(rodar([boa()]), 1))).toBeNull();
  });
});
