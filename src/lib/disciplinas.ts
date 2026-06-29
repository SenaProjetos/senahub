/**
 * Mapa único `disciplina → ícone` do sistema (Mód 15 do CONSELHO1).
 * Cliente-safe (importa lucide). A lógica de match é pura e vive em `disciplinas-core.ts`.
 *
 * A COR do ícone, no contexto de projeto, vem do STATUS da disciplina (ver `STATUS_TEXT` em
 * `modules/projetos/status.ts`), nunca de uma cor fixa por disciplina — para não duplicar fonte
 * de cor nem fugir dos tokens `--color-status-*`.
 */
import {
  DraftingCompass,
  Frame,
  Droplets,
  Zap,
  Flame,
  AirVent,
  Layers,
  Mountain,
  Network,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import { keyDisciplina, type DisciplinaKey } from "./disciplinas-core";

export { keyDisciplina, type DisciplinaKey } from "./disciplinas-core";

const ICONE_POR_KEY: Record<DisciplinaKey, LucideIcon> = {
  arquitetura: DraftingCompass,
  estrutural: Frame,
  fundacoes: Layers,
  hidrossanitario: Droplets,
  eletrico: Zap,
  incendio: Flame,
  climatizacao: AirVent,
  terraplenagem: Mountain,
  telecom: Network,
  outra: Shapes,
};

/** Ícone fallback p/ disciplinas não mapeadas. */
export const ICONE_DISCIPLINA_PADRAO: LucideIcon = Shapes;

/** Ícone da disciplina pelo nome (tolerante a variações e acentos). */
export function iconeDisciplina(nome: string): LucideIcon {
  return ICONE_POR_KEY[keyDisciplina(nome)];
}
