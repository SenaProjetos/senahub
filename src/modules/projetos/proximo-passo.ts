/**
 * O "próximo passo" do card de disciplina (regra pura): UM aviso, com a ação que resolve, no
 * lugar dos até três avisos empilhados de antes (pronta para aprovar, falta enviar, fases
 * aguardando, confirmação pendente…). Redesenho aprovado pelo dono em 2026-09-29.
 *
 * A prioridade é a de quem olha o card: o que já acabou; depois a aprovação que alguém pode
 * fazer AGORA (fase entregue, confirmação, entrega pronta); por último o que falta para chegar
 * lá, na ordem em que o servidor cobraria. Os textos são os mesmos que o card já usava.
 */
import { podeSolicitarAprovacao } from "@/modules/projetos/aprovacao-disciplina/regras";
import { prontidaoAprovacao, uploadsDaValidacao, type DisciplinaProntidao } from "@/modules/projetos/prontidao";
import { entregaveisAtuais, statusValidacao } from "@/modules/uploads/validacao";

export type AcaoPasso = "aprovar" | "confirmar" | "solicitar" | "aprovar_fase" | "enviar" | "validar" | "responsavel";
export type TomPasso = "ok" | "pronto" | "confirmar" | "fase" | "aviso";
export type FasePendente = { id: string; sigla: string; nomeFase: string; percentual: number };

export type ProximoPasso = {
  tom: TomPasso;
  texto: string;
  /** Botão do aviso; `null` = só informa (a ação é de outra pessoa, ou não há). */
  acao: AcaoPasso | null;
  /** Só no tom "fase": cada fase entregue ganha o próprio "Aprovar {sigla}". */
  fases?: FasePendente[];
};

export type EntradaProximoPasso = DisciplinaProntidao & {
  ehResponsavel: boolean;
  aprovacaoSolicitadaPorNome: string | null;
  fasesPendentes: FasePendente[];
};

export type ContextoProximoPasso = {
  /** `aprovacoes:disciplina` — aprovar entrega, confirmar/recusar, aprovar fase. */
  podeAprovar: boolean;
  podeEnviar: boolean;
  /** `projetos:gerir` — define responsáveis. */
  podeGerir: boolean;
};

export const ROTULO_ACAO_PASSO: Record<AcaoPasso, string> = {
  aprovar: "Aprovar entrega",
  confirmar: "Confirmar",
  solicitar: "Marcar projeto aprovado",
  aprovar_fase: "Aprovar fase",
  enviar: "Enviar arquivos",
  validar: "Ver arquivos",
  responsavel: "Definir responsável",
};

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? um : varios;
}

export function proximoPasso(d: EntradaProximoPasso, ctx: ContextoProximoPasso): ProximoPasso | null {
  if (d.status === "aprovado") {
    return { tom: "ok", texto: "Entrega validada · pagamento liberado.", acao: null };
  }

  if (ctx.podeAprovar && d.fasesPendentes.length > 0) {
    const [primeira] = d.fasesPendentes;
    const texto =
      d.fasesPendentes.length === 1
        ? `Fase ${primeira.sigla} entregue (${primeira.percentual}%) — aguardando aprovação.`
        : `${d.fasesPendentes.length} fases entregues aguardando aprovação.`;
    return { tom: "fase", texto, acao: "aprovar_fase", fases: d.fasesPendentes };
  }

  if (d.usaPastas) {
    if (d.aprovacaoSolicitadaEm != null) {
      const quem = d.aprovacaoSolicitadaPorNome
        ? `${d.aprovacaoSolicitadaPorNome} marcou o projeto como aprovado`
        : "O projeto foi marcado como aprovado";
      return ctx.podeAprovar
        ? { tom: "confirmar", texto: `${quem} — falta a sua confirmação.`, acao: "confirmar" }
        : { tom: "confirmar", texto: `${quem} — aguardando a confirmação do gestor.`, acao: null };
    }
    if (podeSolicitarAprovacao({ ehResponsavel: d.ehResponsavel, status: d.status, aprovacaoSolicitadaEm: d.aprovacaoSolicitadaEm })) {
      return { tom: "pronto", texto: "Quando o projeto for aprovado, marque aqui para o gestor confirmar.", acao: "solicitar" };
    }
    if (d.qtdResponsaveis === 0) {
      return {
        tom: "aviso",
        texto: "Defina ao menos um responsável — só ele pode marcar o projeto como aprovado.",
        acao: ctx.podeGerir ? "responsavel" : null,
      };
    }
    if (d.status === "aguardando") {
      return { tom: "aviso", texto: "Coloque a disciplina em andamento para poder marcá-la como aprovada.", acao: null };
    }
    return { tom: "aviso", texto: "Aguardando o responsável marcar o projeto como aprovado.", acao: null };
  }

  const st = statusValidacao(uploadsDaValidacao(d), { exigePacoteA: d.exigePacoteA, exigePacoteB: d.exigePacoteB });
  const atuais = entregaveisAtuais(d.uploads);
  if (prontidaoAprovacao(d) === "pronta_validacao") {
    const validados =
      d.documentosSemPublicacao === undefined
        ? `${st.total} ${plural(st.total, "arquivo validado", "arquivos validados")}`
        : "Documentos publicados";
    return ctx.podeAprovar
      ? { tom: "pronto", texto: `${validados} — pronta para aprovação.`, acao: "aprovar" }
      : { tom: "pronto", texto: `${validados} — aguardando a aprovação do gestor.`, acao: null };
  }

  const faltam = [
    d.exigePacoteA && !atuais.some((u) => u.pacote === "A") ? "Pranchas e arquivos" : null,
    d.exigePacoteB && !atuais.some((u) => u.pacote === "B") ? "Backup do modelo" : null,
  ].filter((s): s is string => s !== null);
  const enviar = ctx.podeEnviar ? ("enviar" as const) : null;
  if (atuais.length === 0) return { tom: "aviso", texto: "Envie os arquivos da entrega para poder aprovar.", acao: enviar };
  if (faltam.length > 0) return { tom: "aviso", texto: `Para aprovar, falta enviar: ${faltam.join(" e ")}.`, acao: enviar };
  // 6-B: com o ciclo documental, o que falta é publicar (publicar já exige validar).
  if ((d.documentosSemPublicacao ?? 0) > 0) {
    const n = d.documentosSemPublicacao!;
    return {
      tom: "aviso",
      texto: `${n} ${plural(n, "documento sem revisão publicada", "documentos sem revisão publicada")} — publique para aprovar.`,
      acao: null,
    };
  }
  if (st.pendentes > 0) {
    return {
      tom: "aviso",
      texto: `${st.validados} de ${st.total} ${plural(st.total, "arquivo validado", "arquivos validados")} — valide ${plural(st.pendentes, "o restante", `os ${st.pendentes} restantes`)} para aprovar.`,
      acao: "validar",
    };
  }
  if (d.qtdResponsaveis === 0) {
    return { tom: "aviso", texto: "Defina ao menos um responsável para poder aprovar.", acao: ctx.podeGerir ? "responsavel" : null };
  }
  return null;
}

/**
 * Pagamento como etiqueta discreta no rodapé (antes era faixa colorida). Nada depois de aprovada:
 * o próprio aviso "pagamento liberado" já diz.
 */
export function etiquetaPagamento(d: {
  status: string;
  pagamentoLiberado: boolean;
  fasesLiberadas: { liberadas: number; total: number } | null;
}): { texto: string; dica: string } | null {
  if (d.status === "aprovado") return null;
  if (d.pagamentoLiberado) return { texto: "Pagamento já liberado", dica: "Aprovar não gera um novo pagamento." };
  if (d.fasesLiberadas && d.fasesLiberadas.liberadas > 0) {
    return {
      texto: `Pago ${d.fasesLiberadas.liberadas} de ${d.fasesLiberadas.total} fases`,
      dica: "Aprovar libera o pagamento das fases que faltam.",
    };
  }
  return null;
}
