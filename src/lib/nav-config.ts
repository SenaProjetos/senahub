import {
  Home,
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
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/roles";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Perfis que veem o item. Ausente = todos. */
  roles?: Role[];
  /** Aparece na barra inferior do mobile. */
  mobile?: boolean;
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
        roles: ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj", "freelancer"],
        mobile: true,
      },
      { title: "Meus projetos", href: "/portal", icon: FolderKanban, roles: ["cliente"], mobile: true },
      {
        title: "Projetos",
        href: "/projetos",
        icon: FolderKanban,
        roles: ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj", "freelancer"],
        mobile: true,
      },
      {
        title: "Meu trabalho",
        href: "/projetos/meu-trabalho",
        icon: Briefcase,
        roles: ["clt", "estagiario", "projetista_pj", "freelancer"],
        mobile: true,
      },
      {
        title: "Clientes",
        href: "/clientes",
        icon: Users,
        roles: ["admin", "supervisor", "administrativo"],
      },
      {
        title: "Comercial",
        href: "/comercial",
        icon: TrendingUp,
        roles: ["admin", "supervisor", "administrativo"],
      },
      {
        title: "Tarefas",
        href: "/tarefas",
        icon: KanbanSquare,
        roles: ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj", "freelancer"],
        mobile: true,
      },
      {
        title: "Agenda",
        href: "/agenda",
        icon: CalendarDays,
        roles: ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj", "freelancer"],
      },
      {
        title: "Chat",
        href: "/chat",
        icon: MessageSquare,
        roles: ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj"],
        mobile: true,
      },
    ],
  },
  {
    title: "RH",
    items: [
      {
        title: "Ponto",
        href: "/ponto",
        icon: Clock,
        roles: ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj", "freelancer"],
        mobile: true,
      },
      {
        title: "RH",
        href: "/rh",
        icon: HeartPulse,
        roles: ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj", "freelancer"],
      },
      {
        title: "RH — admin",
        href: "/rh/admin",
        icon: UserCog,
        roles: ["admin", "supervisor", "administrativo"],
      },
      {
        title: "Folha CLT",
        href: "/rh/folha",
        icon: Banknote,
        roles: ["admin", "supervisor", "administrativo"],
      },
      {
        title: "Funcionários",
        href: "/rh/funcionarios",
        icon: UserCog,
        roles: ["admin", "supervisor", "administrativo"],
      },
      {
        title: "Produtividade",
        href: "/rh/produtividade",
        icon: TrendingUp,
        roles: ["admin", "supervisor", "administrativo"],
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
        roles: ["admin", "supervisor", "administrativo", "clt", "projetista_pj", "freelancer", "cliente"],
      },
      {
        title: "Documentos",
        href: "/documentos",
        icon: FileText,
        roles: ["admin", "supervisor", "administrativo"],
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
        roles: ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj"],
      },
      {
        title: "Recursos",
        href: "/recursos",
        icon: Users,
        roles: ["admin", "supervisor", "administrativo"],
      },
      {
        title: "Jurídico",
        href: "/juridico",
        icon: Scale,
        roles: ["admin", "supervisor", "administrativo"],
      },
      {
        title: "Licitações",
        href: "/licitacoes",
        icon: Gavel,
        roles: ["admin", "supervisor", "administrativo"],
      },
      {
        title: "Qualidade",
        href: "/qualidade",
        icon: Gauge,
        roles: ["admin", "supervisor"],
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
        roles: ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj", "freelancer"],
      },
      {
        title: "Configurações",
        href: "/configuracoes",
        icon: Settings,
        roles: ["admin", "supervisor", "administrativo"],
        mobile: true,
      },
      {
        title: "Auditoria",
        href: "/auditoria",
        icon: ScrollText,
        roles: ["admin"],
      },
    ],
  },
];

export function navItemsForRole(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
