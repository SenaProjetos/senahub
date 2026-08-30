import {
  Flame,
  Landmark,
  Building2,
  Monitor,
  Globe,
  Briefcase,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import type { StatusCredencial } from "./service";

/**
 * Rótulos e ícones do cofre. Client-safe (sem `server-only`, sem Prisma): a tabela e o drawer
 * são componentes de cliente e precisam do mesmo mapa que o servidor usa nos contadores.
 */

export const STATUS_LABEL: Record<StatusCredencial, string> = {
  ativo: "Ativo",
  atencao: "Atenção",
  expirando: "Expirando",
  bloqueado: "Bloqueado",
  inativo: "Inativo",
};

/** Tom do `StatusBadge` por status (§19: vermelho só para o que é de fato crítico). */
export const STATUS_TONE: Record<StatusCredencial, "success" | "warning" | "danger" | "neutral"> = {
  ativo: "success",
  atencao: "warning",
  expirando: "warning",
  bloqueado: "danger",
  inativo: "neutral",
};

/**
 * Categorias tratadas como "portal público" no card §7-02. Casadas pelo NOME da categoria, que
 * é editável pelo admin — por isso a comparação é frouxa (`inclui`), e a lista vive aqui em vez
 * de ser uma coluna: marcar cada categoria como pública seria um campo a mais para alguém
 * esquecer de preencher, e o nome já diz.
 */
export const CATEGORIAS_PUBLICAS = [
  "Corpo de Bombeiros",
  "CREA",
  "Prefeitura",
  "Governo",
  "Conselho",
];

/**
 * Ícone por categoria (§70). Casado pelo nome, com fallback — categoria nova criada pelo admin
 * não pode quebrar a tela nem ficar sem ícone.
 */
const ICONE_POR_NOME: Array<[RegExp, LucideIcon]> = [
  [/bombeiro/i, Flame],
  [/crea|conselho|cau/i, Landmark],
  [/prefeitura|municip/i, Building2],
  [/software|licen/i, Monitor],
  [/governo|federal|estadual|portal/i, Globe],
  [/cliente|plataforma|servi/i, Briefcase],
];

export function iconeDaCategoria(nome: string | null | undefined): LucideIcon {
  if (!nome) return KeyRound;
  for (const [re, icone] of ICONE_POR_NOME) if (re.test(nome)) return icone;
  return KeyRound;
}

/** UF exibida na tabela (§15): software nacional mostra travessão, não vazio. */
export function estadoLabel(estado: string | null | undefined): string {
  if (!estado || estado === "NA") return "—";
  if (estado === "NACIONAL") return "Nacional";
  return estado;
}

/** Descreve um alvo de compartilhamento para o badge da coluna (§18). */
export const TIPO_ALVO_LABEL: Record<string, string> = {
  usuario: "Pessoa",
  perfil: "Perfil",
  setor: "Setor",
};
