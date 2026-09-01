import { inicioDoDia } from "@/lib/data";

/**
 * A reabertura de uma disciplina deve deslocar o prazo PLANEJADO do projeto?
 *
 * Sim só quando o projeto já tem prazo planejado e o novo prazo da disciplina o
 * ultrapassa — é o estado que a validação P-08 (disciplina ≤ prazo do projeto)
 * existe para impedir, e reabrir por um caminho que não passa por ela o criaria.
 *
 * Projeto SEM prazo planejado não desloca nada: não há prazo a mover, e inventar
 * um a partir de uma reabertura seria escrever uma data que ninguém pediu.
 *
 * Compara por DIA — as duas pontas vêm do banco em meia-noite UTC (ver `lib/data.ts`).
 */
export function deveDeslocarPrazoDoProjeto(
  novoPrazoDaDisciplina: Date | string | null | undefined,
  prazoPlanejadoDoProjeto: Date | string | null | undefined,
): boolean {
  const novo = inicioDoDia(novoPrazoDaDisciplina);
  const atual = inicioDoDia(prazoPlanejadoDoProjeto);
  if (!novo || !atual) return false;
  return novo > atual;
}
