import { statusValidacao, type UploadValidavel } from "@/modules/uploads/validacao";
import type { StatusDisciplina } from "@/generated/prisma/client";

/**
 * FONTE ÚNICA de "esta disciplina está pronta para virar `aprovado`" — pura, sem I/O e
 * sem `server-only` (o card client-side importa daqui, igual `regras.ts`/`estrutura-tipo.ts`).
 *
 * Existe porque `aprovado` é terminal e nunca aparece no seletor de status: quem precisa
 * agir só descobre pelo card, pela lista de projetos, pelo dashboard e pelo painel de
 * Aprovações. Se cada tela recalculasse a prontidão do seu jeito, a lista mostraria
 * "pronta para aprovar" e o card abriria sem botão — exatamente a confusão que essa
 * sinalização quer eliminar.
 *
 * Os dois fluxos de conclusão têm sinais diferentes:
 *  - pacote A/B (`particular`/`licitacao`): todos os entregáveis validados → `validarEntrega`
 *  - árvore de pastas (`aprovacao`/`laudo`): passo 1 já dado → `confirmarAprovacaoDisciplina`
 */
export type Prontidao = "pronta_validacao" | "aguardando_confirmacao";

export type DisciplinaProntidao = {
  status: StatusDisciplina;
  /** Usa a árvore de pastas (fluxo de aprovação em 2 etapas) — ver `disciplinaUsaPastas`. */
  usaPastas: boolean;
  aprovacaoSolicitadaEm: Date | string | null;
  exigePacoteA: boolean;
  exigePacoteB: boolean;
  /** `validarEntrega` recusa disciplina sem responsável — sem isso não está pronta. */
  qtdResponsaveis: number;
  uploads: readonly UploadValidavel[];
  /**
   * Ciclo documental (6-B, 2026-10-09): documentos do pacote A sem revisão publicada. Informado, o
   * pacote A passa a ser julgado pela publicação (publicar já exige tudo validado) e só o pacote B pela
   * validação arquivo a arquivo — o mesmo que `validarEntrega` cobra. Ausente = regra antiga.
   */
  documentosSemPublicacao?: number;
};

/** Uploads que ainda passam pela validação arquivo a arquivo: com o ciclo, só o backup do modelo (B). */
export function uploadsDaValidacao(d: Pick<DisciplinaProntidao, "uploads" | "documentosSemPublicacao">): readonly UploadValidavel[] {
  return d.documentosSemPublicacao === undefined ? d.uploads : d.uploads.filter((u) => u.pacote === "B");
}

/**
 * `null` = ninguém precisa agir para aprovar (já aprovada, ou ainda falta algo).
 * As condições espelham as pré-condições que `validarEntrega`/`confirmarAprovacaoDisciplina`
 * cobram, para nenhuma tela anunciar uma ação que a action vai recusar.
 */
export function prontidaoAprovacao(d: DisciplinaProntidao): Prontidao | null {
  if (d.status === "aprovado") return null;

  // Fluxo de 2 etapas: a prontidão é a solicitação em aberto, não os arquivos —
  // essas disciplinas nem passam pela validação por-arquivo.
  if (d.usaPastas) {
    return d.aprovacaoSolicitadaEm != null ? "aguardando_confirmacao" : null;
  }

  if (d.qtdResponsaveis === 0) return null;
  if ((d.documentosSemPublicacao ?? 0) > 0) return null;
  const opts = { exigePacoteA: d.exigePacoteA, exigePacoteB: d.exigePacoteB };
  // Pacotes presentes vêm da lista toda (como se tudo estivesse validado); pendências de validação, só
  // do que ainda passa por ela (com o ciclo, o B). `total > 0`: disciplina vazia não é "pronta".
  const pacotes = statusValidacao(d.uploads.map((u) => ({ ...u, validado: true })), opts);
  const pendentes = statusValidacao(uploadsDaValidacao(d), opts).pendentes;
  return pacotes.completo && pacotes.total > 0 && pendentes === 0 ? "pronta_validacao" : null;
}

export const PRONTIDAO_LABEL: Record<Prontidao, string> = {
  pronta_validacao: "Pronta para aprovar",
  aguardando_confirmacao: "Aguardando confirmação",
};

/** Quem resolve cada caso — texto de apoio nas filas (lista, dashboard, Aprovações). */
export const PRONTIDAO_ACAO: Record<Prontidao, string> = {
  pronta_validacao: "Todos os arquivos validados — falta aprovar a entrega.",
  aguardando_confirmacao: "Responsável marcou como aprovado — falta a confirmação.",
};
