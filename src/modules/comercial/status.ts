/**
 * Regras puras de status do módulo Comercial (F1.1, docs/crm/04-plano-fases.md).
 * Sem I/O — recebem dados já buscados, sem Prisma/server-only. Ver src/modules/projetos/health.ts
 * para o mesmo padrão (relógio/estado injetado, tipo exportado, `*.test.ts` irmão).
 */

/**
 * Detecta se uma etapa do funil de Lead é "Perdido" (exige `motivoPerda` — ver `moverLead` em
 * actions.ts). Não há flag em `FunilEtapa` que marque isso — é inferido pelo NOME da etapa.
 *
 * Comparação case-insensitive por substring "perdid", cobrindo "Perdido"/"Perdida" com uma
 * única checagem. Mesma regra que já existia (antes uma arrow function anônima dentro de
 * actions.ts, sem teste) — aqui ela ganha nome, documentação e cobertura.
 *
 * ⚠️ LIMITAÇÃO CONHECIDA (docs/crm/00-auditoria.md §E.1): se um admin renomear a etapa
 * "Perdido" para algo que não contenha essa substring (ex.: "Não avançou"), esta função para
 * de reconhecê-la SILENCIOSAMENTE — `moverLead` deixa de exigir motivo. O teste "etapa
 * renomeada" em status.test.ts documenta esse comportamento de propósito — não é um bug
 * escondido, é a regra atual com seu limite explícito. Correção definitiva só chega na Fase 2
 * (`StatusProspeccao` vira enum fixo, não mais nome de texto livre — ver 02-schema.md §8.3).
 */
export function etapaEhPerdido(nome: string): boolean {
  return nome.toLowerCase().includes("perdid");
}

/** Status comercial da Empresa (`Cliente.status`, docs/crm/02-schema.md §6). Chega via migration
 * na Fase 1 (F1.5) — este tipo é a versão do módulo comercial, independente do client Prisma
 * gerado, porque a coluna ainda não existe no schema real quando este arquivo nasce (F1.1 é a
 * única parte da Fase 1 sem mudança de schema). */
export type StatusComercial = "PROSPECT" | "CLIENTE" | "EX_CLIENTE" | "PARCEIRO";

/**
 * Deriva o status comercial da Empresa (ADR-08, docs/crm/01-decisoes.md).
 *
 *   se override != null → retorna override        (override sempre vence)
 *   senão se temPropostaAceita → CLIENTE
 *   senão → PROSPECT
 *
 * `EX_CLIENTE` e `PARCEIRO` NUNCA são calculados automaticamente — não existe sinal de dado no
 * sistema hoje que justifique inferir "parou de comprar" ou "é uma parceria" (não inventar,
 * conforme o guardrail do playbook). Os dois só entram via `override` manual.
 */
export function calcularStatusComercial(
  temPropostaAceita: boolean,
  override: StatusComercial | null,
): StatusComercial {
  if (override != null) return override;
  return temPropostaAceita ? "CLIENTE" : "PROSPECT";
}
