import {
  Home,
  Settings,
  ScrollText,
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
      { title: "Início", href: "/", icon: Home, mobile: true },
    ],
  },
  {
    title: "Sistema",
    items: [
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
