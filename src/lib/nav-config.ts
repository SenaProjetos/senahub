import {
  Home,
  Tags,
  Users,
  FolderKanban,
  Wallet,
  MessageSquare,
  Clock,
  HeartPulse,
  UserCog,
  Banknote,
  FileText,
  TrendingUp,
  KanbanSquare,
  CalendarDays,
  Scale,
  Gavel,
  Gauge,
  GanttChart,
  LifeBuoy,
  Settings,
  ScrollText,
  Briefcase,
  Calculator,
  Activity,
  Package,
  HardDrive,
  BookOpen,
  IdCard,
  FolderArchive,
  ClipboardCheck,
  ShieldCheck,
  Library,
  BookMarked,
  Notebook,
  Coins,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import type { Setor } from "@/generated/prisma/enums";

/**
 * Visibilidade de um item de menu. `roles[]` saiu na Onda D, e a substituição **não** é uma
 * permissão para tudo: o `roles[]` antigo codificava TRÊS eixos distintos, e só um era permissão.
 *
 *   - **permissão de verdade** (Clientes, Comercial, Folha, Jurídico, …) → `permissao`;
 *   - **interno × externo** (Início, Tarefas, Agenda, Ponto, RH, …) → `tipo`. Não existe
 *     `recurso:acao` que signifique "é gente de dentro", e inventar 14 pares falsos seria pior:
 *     eles seriam semeados em todo perfil e medidos pelo gate como se fossem acesso a algo;
 *   - **nenhum dos dois** (Ajuda, Suporte) → todo mundo vê.
 *
 * `permissao` aceita LISTA porque `/financeiro` é visto tanto por quem gere o financeiro quanto
 * por quem só enxerga o próprio extrato — campo único esconderia a tela de metade das pessoas.
 *
 * `setorExcluido` existe para um caso só, e é deliberado: o setor de **TI** não vê os itens de
 * projeto/RH de uso geral. É decisão do dono (2026-08-09), mantendo o comportamento de hoje.
 * Note que isto **esconde**, não concede — não contraria §2.1 ("Setor nunca concede permissão"),
 * porque nenhum acesso é liberado por setor; a página em si continua protegida pelo seu próprio
 * gate. Se o item fosse alcançável só pelo menu, isto seria segurança por obscuridade.
 */
export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** `"recurso:acao"` — ou lista, satisfeita por QUALQUER uma. Ausente = não exige permissão. */
  permissao?: string | string[];
  /** Exige ser interno (ou externo). Ausente = não exige. */
  tipo?: "interno" | "externo";
  /** Some para estes setores. Ver a nota acima antes de acrescentar outro. */
  setorExcluido?: Setor[];
  /** Aparece na barra inferior do mobile. */
  mobile?: boolean;
};

/** O que o menu precisa saber sobre quem está olhando. Calculado no servidor, passado como prop. */
export type ContextoNav = {
  /** `["recurso:acao", …]` — de `permissoesEfetivas()`. */
  permitidas: string[];
  tipo: "interno" | "externo" | null;
  setor: Setor | null;
};

export type NavGroup = {
  title?: string;
  items: NavItem[];
};

/**
 * Navegação por onda de entrega — novos módulos entram aqui conforme
 * as ondas avançam (projetos, financeiro, RH, chat...).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        title: "Início",
        href: "/",
        icon: Home,
        tipo: "interno",
        setorExcluido: ["ti"],
        mobile: true,
      },
      { title: "Meus projetos", href: "/portal", icon: FolderKanban, tipo: "externo", mobile: true },
      {
        title: "Projetos",
        href: "/projetos",
        icon: FolderKanban,
        permissao: "projetos:ver",
        tipo: "interno",
        mobile: true,
      },
      {
        title: "Meu trabalho",
        href: "/projetos/meu-trabalho",
        icon: Briefcase,
        tipo: "interno",
        setorExcluido: ["ti"],
        mobile: true,
      },
      {
        title: "Arquivos",
        href: "/arquivos",
        icon: FolderArchive,
        permissao: "arquivos:ver",
      },
      {
        title: "Aprovações",
        href: "/aprovacoes",
        icon: ClipboardCheck,
        permissao: "uploads:validar",
      },
      {
        title: "Clientes",
        href: "/clientes",
        icon: Users,
        permissao: "clientes:ver",
      },
      {
        // Cofre de contas, portais e licenças. Fica junto dos itens administrativos, não em
        // Configurações: é ferramenta de trabalho do dia a dia (§4), não ajuste de sistema.
        title: "Acessos",
        href: "/acessos",
        icon: KeyRound,
        permissao: "acessos:ver",
        tipo: "interno",
      },
      {
        title: "Comercial",
        href: "/comercial",
        icon: TrendingUp,
        permissao: "comercial:ver",
      },
      {
        title: "Tarefas",
        href: "/tarefas",
        icon: KanbanSquare,
        tipo: "interno",
        setorExcluido: ["ti"],
        mobile: true,
      },
      {
        title: "Agenda",
        href: "/agenda",
        icon: CalendarDays,
        tipo: "interno",
        setorExcluido: ["ti"],
      },
      {
        title: "Chat",
        href: "/chat",
        icon: MessageSquare,
        permissao: "chat:usar",
        mobile: true,
      },
      // Ajuda/Manual — sem `roles`: visível a todos os perfis (inclusive cliente).
      { title: "Ajuda", href: "/ajuda", icon: BookOpen, mobile: true },
    ],
  },
  {
    title: "RH",
    items: [
      {
        title: "Ponto",
        href: "/ponto",
        icon: Clock,
        tipo: "interno",
        setorExcluido: ["ti"],
        mobile: true,
      },
      {
        title: "Minha conta",
        href: "/minha-ficha",
        icon: IdCard,
        tipo: "interno",
      },
      {
        title: "RH",
        href: "/rh",
        icon: HeartPulse,
        tipo: "interno",
        setorExcluido: ["ti"],
      },
      {
        title: "Pessoas",
        href: "/rh/pessoas",
        icon: Users,
        permissao: "rh:cadastro",
      },
      {
        title: "Cargos e departamentos",
        href: "/rh/catalogos",
        icon: Tags,
        permissao: "rh:catalogos",
      },
      {
        title: "RH — admin",
        href: "/rh/admin",
        icon: UserCog,
        permissao: "rh:cadastro",
      },
      {
        title: "Folha CLT",
        href: "/rh/folha",
        icon: Banknote,
        permissao: "rh:folha",
      },
      {
        title: "Produtividade",
        href: "/rh/produtividade",
        icon: TrendingUp,
        permissao: "rh:cadastro",
      },
      {
        title: "Pessoas Jurídicas",
        href: "/rh/pessoas-juridicas",
        icon: Briefcase,
        permissao: "rh:cadastro",
      },
      {
        title: "Escalas",
        href: "/rh/escalas",
        icon: Clock,
        permissao: "ponto:gerir_escalas",
      },
    ],
  },
  {
    title: "Financeiro",
    items: [
      {
        title: "Financeiro",
        href: "/financeiro",
        icon: Wallet,
        permissao: ["financeiro:ver", "financeiro:extrato"],
      },
      {
        title: "Doc Studio",
        href: "/documentos",
        icon: FileText,
        permissao: "documentos:ver",
      },
    ],
  },
  {
    title: "Engenharia",
    items: [
      {
        title: "Ferramentas",
        href: "/ferramentas",
        icon: Calculator,
        permissao: "ferramentas:usar",
        mobile: true,
      },
      {
        title: "Padrões Técnicos",
        href: "/engenharia/padroes",
        icon: Library,
        permissao: "biblioteca_tecnica:ver",
      },
      {
        title: "Normas Técnicas",
        href: "/engenharia/normas",
        icon: BookMarked,
        permissao: "biblioteca_tecnica:ver",
      },
      {
        title: "Referências Técnicas",
        href: "/engenharia/referencias",
        icon: Notebook,
        permissao: "biblioteca_tecnica:ver",
      },
      {
        title: "Engenharia de Custos",
        href: "/custos",
        icon: Coins,
        permissao: "custos:ver",
      },
    ],
  },
  {
    title: "Gestão",
    items: [
      {
        title: "Planejamento",
        href: "/planejamento",
        icon: GanttChart,
        permissao: "planejamento:ver",
      },
      {
        title: "Recursos",
        href: "/recursos",
        icon: Users,
        permissao: "recursos:ver",
      },
      {
        title: "Apontamentos",
        href: "/pendencias",
        icon: ClipboardCheck,
        permissao: "projetos:ver",
        tipo: "interno",
      },
      {
        title: "Jurídico",
        href: "/juridico",
        icon: Scale,
        permissao: "juridico:ver",
      },
      {
        title: "Certidões",
        href: "/certidoes",
        icon: ShieldCheck,
        permissao: "certidoes:ver",
      },
      {
        title: "Licitações",
        href: "/licitacoes",
        icon: Gavel,
        permissao: "licitacoes:ver",
      },
      {
        title: "Qualidade",
        href: "/qualidade",
        icon: Gauge,
        permissao: "qualidade:ver",
      },
      {
        title: "Patrimônio",
        href: "/patrimonio",
        icon: Package,
        permissao: "patrimonio:ver",
      },
      {
        title: "TI",
        href: "/patrimonio/ti",
        icon: HardDrive,
        permissao: "patrimonio:ti",
      },
      {
        title: "Suporte",
        href: "/suporte",
        icon: LifeBuoy,
      },
    ],
  },
  {
    title: "Sistema",
    items: [
      {
        title: "Preferências",
        href: "/preferencias",
        icon: UserCog,
        tipo: "interno",
        setorExcluido: ["ti"],
      },
      {
        title: "Configurações",
        href: "/configuracoes",
        icon: Settings,
        permissao: "configuracoes:gerir",
        mobile: true,
      },
      {
        title: "Auditoria",
        href: "/auditoria",
        icon: ScrollText,
        permissao: "auditoria:ver",
      },
      {
        title: "Uso por seção",
        href: "/auditoria/uso",
        icon: Activity,
        permissao: "auditoria:ver",
      },
    ],
  },
];

/**
 * Itens visíveis para um usuário. PURA de propósito: `nav-config.ts` é importado por componentes
 * client (`sidebar-nav`, `bottom-nav`, `header`), então nada aqui pode tocar Prisma. O contexto é
 * calculado uma vez no servidor (`(dashboard)/layout.tsx`) e desce como prop — o que também evita
 * as 41 consultas por render que uma checagem item a item custaria.
 */
export function navItemsPara(ctx: ContextoNav): NavGroup[] {
  const permitidas = new Set(ctx.permitidas);
  const temPermissao = (p: NavItem["permissao"]) =>
    p === undefined || (Array.isArray(p) ? p.some((k) => permitidas.has(k)) : permitidas.has(p));

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        temPermissao(item.permissao) &&
        (item.tipo === undefined || item.tipo === ctx.tipo) &&
        !(ctx.setor !== null && item.setorExcluido?.includes(ctx.setor)),
    ),
  })).filter((group) => group.items.length > 0);
}
