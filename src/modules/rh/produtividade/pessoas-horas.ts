import { whereAudiencia } from "@/lib/audiencias";

/**
 * Quem aparece em RH → Produtividade num período — puro (só monta o `where`).
 *
 * A audiência `projeto_membro` exige `ativo: true`. Com período livre, isso apagava do "Mês anterior"
 * as horas de quem foi desligado na semana passada. Então entram também os INATIVOS do mesmo grupo de
 * papéis que têm sessão no período (mesma janela da consulta de sessões). Se a audiência deixar de ser
 * por papel, o 2º ramo muda junto.
 */
export function wherePessoasDasHoras(inicio: Date, fimExclusivo: Date) {
  return {
    OR: [
      whereAudiencia("projeto_membro"),
      {
        ativo: false,
        // Desligado perde o setor no cache: o histórico vem do vínculo (Onda F, bloco D).
        vinculos: { some: { setor: "engenharia" as const } },
        sessoes: { some: { inicio: { lt: fimExclusivo }, OR: [{ fim: { gte: inicio } }, { fim: null }] } },
      },
    ],
  };
}
