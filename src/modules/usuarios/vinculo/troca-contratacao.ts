/**
 * Regras puras da troca de contratação: abre um vínculo NOVO (nunca edita o antigo — quem faz
 * isso é `aplicarVinculo`). Aqui só o que barra a troca antes de chegar ao banco.
 *
 * Escopo aprovado em docs/superpowers/specs/2026-09-22-alterar-contratacao.md (auditoria de
 * campos): teto semanal de estágio (Lei 11.788, art. 10, II) e CLT (CF, art. 7º, XIII), PJ
 * exigindo `pjId`, autônomo/RPA exigindo CPF no cadastro. Jornada DIÁRIA, prazo de estágio e
 * regime de tempo parcial ficam de fora de propósito — o schema não tem campo para nenhum dos
 * três.
 */
import type { Contratacao } from "@/generated/prisma/client";

/** Teto semanal legal por contratação. Ausente = sem teto (PJ, autônomo/RPA, pró-labore). */
export const TETO_SEMANAL_HORAS: Partial<Record<Contratacao, number>> = {
  estagio: 30, // Lei 11.788, art. 10, II
  clt: 44, // CF, art. 7º, XIII
};

export type DadosTrocaContratacao = {
  contratacao: Contratacao;
  cargaSemanal: number | null;
  pjId: string | null;
  /** `User.cpf` preenchido — autônomo/RPA exige, e o dado não vem do Vínculo. */
  cpfPreenchido: boolean;
  /** Início do novo vínculo e do vínculo ativo (`null` = não há vínculo ativo). Ausentes = não confere. */
  dataInicio?: Date;
  inicioAtual?: Date | null;
};

const ddmmaaaa = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

/**
 * Valida a troca de contratação. Devolve a mensagem de erro pt-BR, ou `null` quando pode seguir.
 */
export function validarTrocaContratacao(d: DadosTrocaContratacao): string | null {
  // Vínculo novo começando no início do atual ou antes dele: o atual seria encerrado num dia só
  // (dataFim = dataInicio) e, por ser o de início mais recente, seguiria mandando na apuração do
  // mês — o ponto deixava de cobrar jornada a partir do dia seguinte. Corrigir a data de entrada
  // é outra operação: a Admissão no cadastro (`admissao.ts`).
  if (d.dataInicio && d.inicioAtual && d.dataInicio <= d.inicioAtual) {
    return `A nova contratação precisa começar depois do início do vínculo atual (${ddmmaaaa(d.inicioAtual)}). Para corrigir a data de entrada, edite a Admissão em Editar cadastro.`;
  }

  const teto = TETO_SEMANAL_HORAS[d.contratacao];
  if (teto !== undefined) {
    if (d.cargaSemanal == null) return "Informe a carga horária semanal.";
    if (d.cargaSemanal > teto) {
      const base = d.contratacao === "estagio" ? "Lei 11.788, art. 10, II" : "CF, art. 7º, XIII";
      const rotulo = d.contratacao === "estagio" ? "Estágio" : "CLT";
      return `${rotulo} não pode passar de ${teto}h semanais (${base}).`;
    }
  }

  if (d.contratacao === "pj" && !d.pjId) {
    return "Vínculo PJ exige uma pessoa jurídica vinculada.";
  }

  if (d.contratacao === "autonomo_rpa" && !d.cpfPreenchido) {
    return "Autônomo/RPA exige CPF cadastrado — preencha em Dados pessoais antes de trocar a contratação.";
  }

  return null;
}
