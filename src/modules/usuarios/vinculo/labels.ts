/**
 * Rótulos pt-BR dos eixos de vínculo. **Client-safe** — sem `server-only`, sem Prisma:
 * componentes client importam daqui, o servidor importa via `queries.ts`.
 * Mesmo padrão de `documentos/fontes-meta.ts`.
 */
import type { Contratacao, Setor, TipoUsuario } from "@/generated/prisma/client";

export const SETOR_LABELS: Record<Setor, string> = {
  diretoria: "Diretoria",
  administrativo: "Administrativo",
  juridico: "Jurídico",
  engenharia: "Engenharia",
  ti: "TI",
};

export const CONTRATACAO_LABELS: Record<Contratacao, string> = {
  clt: "CLT",
  estagio: "Estágio",
  pj: "PJ",
  autonomo_rpa: "Autônomo (RPA)",
  pro_labore: "Sócio (pró-labore)",
};

export const TIPO_USUARIO_LABELS: Record<TipoUsuario, string> = {
  interno: "Interno",
  externo: "Externo (portal)",
};
