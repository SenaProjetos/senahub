/**
 * F3.5 — Modelos de follow-up / notas prontas (canned templates).
 *
 * Guardados em `ConfigSistema`, chave `comercial.templateNotas` — array de
 * {id, titulo, texto} editável pela tela de configurações. Sem entidade nova, sem migration.
 *
 * `TemplateNota` é puro (client-safe); `lerTemplates()` é server-only.
 */

export interface TemplateNota {
  id: string;
  titulo: string;
  texto: string;
}

/**
 * Padrão: 3 templates. Produção começa vazia, populada manualmente via
 * configurações quando houver a UI.
 */
export const TEMPLATES_PADRAO: TemplateNota[] = [
  { id: "1", titulo: "Follow-up simples", texto: "Seguindo up conforme conversado." },
  { id: "2", titulo: "Reunião agendada", texto: "Reunião agendada conforme solicitado." },
  { id: "3", titulo: "Enviando documento", texto: "Enviando documentação conforme solicitado." },
];

/**
 * (Server-only) Lê templates do banco. Retorna padrão se nenhum cadastrado.
 */
export async function lerTemplates(prisma: typeof import("@/lib/prisma").prisma): Promise<TemplateNota[]> {
  const chave = "comercial.templateNotas";
  const cfg = await prisma.configSistema.findUnique({ where: { chave } });

  if (!cfg || !Array.isArray(cfg.valor)) return TEMPLATES_PADRAO;

  // Validar estrutura, descartar inválidos
  return (cfg.valor as unknown[]).filter(
    (t) => typeof t === "object" && t !== null && "id" in t && "titulo" in t && "texto" in t,
  ) as TemplateNota[];
}
