/**
 * O modelo de EAP no Gantt (plano 2026-09-27-editar-modelo-eap, M2). PURO e seguro no navegador: a tela de
 * edição reagenda a cada mudança, sem ir ao servidor.
 *
 * As datas são do MESMO motor do projeto (`agendar`), a partir de um início de referência e com o calendário
 * da empresa (feriados vindos do servidor). Não são gravadas: o modelo não tem data, quem manda nas datas é o
 * motor quando o modelo vira EAP de um projeto. Servem para ver a forma do cronograma — término em dias
 * úteis, caminho crítico, o que corre em paralelo.
 */
import { agendar, type LinhaEntrada, type ResultadoMotor } from "../motor";
import { calcularCodigos } from "../codigo-eap";
import type { EapTarefaDTO } from "../queries";
import type { Calendario, Dia } from "@/lib/calendario-trabalho";
import type { LinhaModelo } from "./estrutura";

export function entradaDoMotor(linhas: readonly LinhaModelo[]): LinhaEntrada[] {
  return linhas.map((l) => ({
    id: l.id,
    parentId: l.parentId,
    duracaoDias: l.tipoEap === "mrc" ? 0 : l.duracaoDias,
    predecessoras: l.predecessoras.map((p) => ({ predecessoraId: p.id, tipo: p.tipo, lagDias: p.lagDias })),
    progresso: 0,
  }));
}

export function agendarModelo(linhas: readonly LinhaModelo[], inicio: Dia, cal: Calendario): ResultadoMotor {
  return agendar(entradaDoMotor(linhas), inicio, cal);
}

/**
 * As linhas no formato do `PlanoGantt` (o mesmo da EAP do projeto). O que o modelo não tem sai vazio:
 * sem linha de base, sem data real, sem gente, sem custo, 0% — e a disciplina e a fase pelo nome do catálogo.
 */
export function linhasDoGantt(
  linhas: readonly LinhaModelo[],
  resultado: ResultadoMotor,
  /** O início de referência: reserva para linha que o motor não devolveu (não acontece com dado íntegro). */
  inicio: Dia,
  nomes: { disciplina: ReadonlyMap<string, string>; faseSigla: ReadonlyMap<string, string | null> },
): EapTarefaDTO[] {
  const codigos = new Map(calcularCodigos(linhas.map((l) => ({ id: l.id, parentId: l.parentId, ordem: l.ordem }))).map((c) => [c.id, c.codigo]));
  return linhas.map((l) => {
    const a = resultado.linhas.get(l.id);
    return {
      id: l.id,
      idCorporativo: null,
      codigoEap: codigos.get(l.id) ?? null,
      parentId: l.parentId,
      nome: l.nome,
      ordem: l.ordem,
      progresso: 0,
      progressoDerivado: a?.ehResumo ?? false,
      inicioPrevisto: a?.inicio ?? inicio,
      fimPrevisto: a?.fim ?? inicio,
      inicioBaseline: null,
      fimBaseline: null,
      disciplinaId: l.disciplinaCatalogoId,
      disciplinaNome: l.disciplinaCatalogoId ? (nomes.disciplina.get(l.disciplinaCatalogoId) ?? null) : null,
      etapaId: l.etapaId,
      etapaSigla: l.etapaId ? (nomes.faseSigla.get(l.etapaId) ?? null) : null,
      inicioReal: null,
      fimReal: null,
      predecessoraIds: l.predecessoras.map((p) => p.id),
      predecessoras: l.predecessoras.map((p) => ({ predecessoraId: p.id, tipo: p.tipo, lagDias: p.lagDias })),
      marco: l.tipoEap === "mrc",
      tipoEap: l.tipoEap,
      duracaoDias: a?.ehResumo ? a.duracaoDias : l.tipoEap === "mrc" ? 0 : l.duracaoDias,
      status: "nin",
      restricaoTipo: null,
      restricaoData: null,
      motivoBloqueio: null,
      previsaoDesbloqueio: null,
      critica: resultado.criticas.has(l.id),
      folgaTotal: a?.folgaTotal ?? 0,
      folgaLivre: a?.folgaLivre ?? 0,
      conflitoRestricao: false,
      reprogramada: false,
      ehResumo: a?.ehResumo ?? false,
      deTerceiro: l.deTerceiro,
      trabalhoHoras: null,
      atribuicoes: [],
      horasApontadas: 0,
      sugestoesProgresso: [],
      contextoArquivos: null,
      custo: null,
      custoMotivo: null,
    };
  });
}
