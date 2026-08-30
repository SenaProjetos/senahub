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

/**
 * §10 — filtro "Nível de acesso". Descreve COMO a credencial é compartilhada, que é a pergunta
 * que a tela faz ("quem alcança isto?"), e não um campo próprio: sai do `tipoAlvo` das linhas de
 * `CredencialCompartilhamento`.
 *
 * `restrito` não é um `tipoAlvo` — é a ausência de alcance coletivo: credencial partilhada só
 * com pessoas nominais. É o que o card "Acessos restritos" (§7-04) conta.
 */
export const NIVEL_ACESSO_LABEL: Record<string, string> = {
  setor: "Setor",
  perfil: "Perfil de acesso",
  usuario: "Pessoa específica",
  restrito: "Restrito (só nominal)",
};

/** Versão curta, para a coluna "Acesso" da tabela — a longa não cabe e seria truncada. */
export const NIVEL_ACESSO_CURTO: Record<string, string> = {
  setor: "Setor",
  perfil: "Perfil",
  usuario: "Nominal",
  restrito: "Restrito",
};

/**
 * Cor de apoio por categoria (§14 pede badge DISCRETO, a referência usa tons pastel).
 *
 * Só o ÍCONE recebe cor; o badge continua neutro. Assim o olho ganha o atalho de varredura que
 * a referência propõe sem pintar um retângulo colorido por linha — e sem inventar paleta: são
 * os tokens de chart que já existem no tema, então funcionam no claro e no escuro.
 */
const COR_POR_NOME: Array<[RegExp, string]> = [
  [/bombeiro/i, "text-[var(--chart-5)]"],
  [/crea|conselho|cau/i, "text-[var(--chart-1)]"],
  [/prefeitura|municip/i, "text-[var(--chart-4)]"],
  [/software|licen/i, "text-[var(--chart-2)]"],
  [/governo|federal|estadual|portal|plataforma/i, "text-[var(--chart-3)]"],
];

export function corDaCategoria(nome: string | null | undefined): string {
  if (!nome) return "text-muted-foreground";
  for (const [re, cor] of COR_POR_NOME) if (re.test(nome)) return cor;
  return "text-muted-foreground";
}
