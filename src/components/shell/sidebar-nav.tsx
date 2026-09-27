"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Pin,
  PinOff,
  Ruler,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { salvarPreferencia } from "@/modules/usuarios/preferencias/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { navItemsPara, type AlertaNav, type ContextoNav, type NavGroup, type NavItem } from "@/lib/nav-config";
import { ChatBadge } from "@/components/chat/chat-badge";
import { NavBadge } from "@/components/shell/nav-badge";

/** Chave em `UserPreference` dos atalhos fixados (lista de `href`, na ordem em que foram fixados). */
export const CHAVE_MENU_FIXADOS = "menu_fixados";

/** Ícone de cada seção no trilho (a seção não tem ícone próprio em `NAV_GROUPS`). */
const ICONE_DA_SECAO: Record<string, LucideIcon> = {
  Trabalho: Briefcase,
  Comercial: TrendingUp,
  RH: Users,
  Financeiro: Wallet,
  Engenharia: Ruler,
  Gestão: ShieldCheck,
  Sistema: Settings,
};

function isItemActive(item: NavItem, pathname: string) {
  return item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
}

type Fixacao = {
  fixados: string[];
  alternar: (href: string) => void;
};

function NavList({
  items,
  pathname,
  alertas,
  onNavigate,
  fixacao,
}: {
  items: NavItem[];
  pathname: string;
  alertas?: Record<string, AlertaNav>;
  onNavigate?: () => void;
  fixacao?: Fixacao;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = isItemActive(item, pathname);
        // Chat tem badge próprio (socket, tempo real); o resto vem do servidor por request.
        const isChat = item.href === "/chat";
        const alerta = isChat ? undefined : alertas?.[item.href];
        const fixado = fixacao?.fixados.includes(item.href) ?? false;
        return (
          <li key={item.href} className="group/item flex items-center">
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-3 rounded-sm px-2.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="size-[18px] shrink-0" />
              <span className="truncate">{item.title}</span>
              {isChat && <ChatBadge className="ml-auto" />}
              {alerta && <NavBadge alerta={alerta} className="ml-auto" />}
            </Link>
            {fixacao && (
              <button
                type="button"
                onClick={() => fixacao.alternar(item.href)}
                aria-label={fixado ? `Desafixar ${item.title}` : `Fixar ${item.title} no topo do menu`}
                aria-pressed={fixado}
                title={fixado ? "Desafixar" : "Fixar no topo"}
                className={cn(
                  "ml-0.5 grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none transition-opacity hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  fixado ? "opacity-100" : "opacity-0 group-hover/item:opacity-100 pointer-coarse:opacity-50",
                )}
              >
                {fixado ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CollapsibleGroup({
  group,
  pathname,
  alertas,
  onNavigate,
  fixacao,
}: {
  group: NavGroup & { title: string };
  pathname: string;
  alertas?: Record<string, AlertaNav>;
  onNavigate?: () => void;
  fixacao?: Fixacao;
}) {
  // Modelo aprovado: só a seção da página atual vem aberta. O clique abre/fecha as outras durante
  // a sessão (sem gravar: ao voltar, o menu mostra de novo só onde a pessoa está).
  const hasActive = group.items.some((item) => isItemActive(item, pathname));
  const [manual, setManual] = useState<boolean | null>(null);
  const expanded = manual ?? hasActive;

  function toggle() {
    setManual(!expanded);
  }

  // Grupo fechado esconde os itens — e esconderia o badge junto. Some os alertas de dentro e
  // mostra o total no cabeçalho enquanto está fechado, senão "3 certidões vencidas" fica
  // invisível para quem deixou "Gestão" recolhido (que é o padrão de quem não usa o grupo).
  const alertaDoGrupo = somarAlertas(group.items, alertas);

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left transition-colors outline-none hover:bg-sidebar-accent/40 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {group.title}
        </span>
        <span className="flex items-center gap-1.5">
          {!expanded && alertaDoGrupo && <NavBadge alerta={alertaDoGrupo} />}
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="mt-1">
          <NavList
            items={group.items}
            pathname={pathname}
            alertas={alertas}
            onNavigate={onNavigate}
            fixacao={fixacao}
          />
        </div>
      )}
    </div>
  );
}

/** Alerta agregado de um grupo — soma as contagens, crítico se qualquer item estiver crítico. */
function somarAlertas(items: NavItem[], alertas?: Record<string, AlertaNav>): AlertaNav | null {
  if (!alertas) return null;
  const dos = items.map((i) => alertas[i.href]).filter((a): a is AlertaNav => !!a && a.total > 0);
  if (dos.length === 0) return null;
  return {
    total: dos.reduce((s, a) => s + a.total, 0),
    critico: dos.some((a) => a.critico),
    descricao: dos.map((a) => a.descricao).join(" · "),
  };
}

const CLASSE_ENTRADA_TRILHO =
  "relative flex w-full flex-col items-center gap-0.5 rounded-sm px-1 py-1.5 text-[10px] font-medium leading-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";

function classeTrilho(ativo: boolean) {
  return cn(
    CLASSE_ENTRADA_TRILHO,
    ativo
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
  );
}

/** Item avulso do trilho: ícone com o nome embaixo (o trilho antigo só tinha ícones, sem nome). */
function ItemTrilho({ item, pathname, alertas }: { item: NavItem; pathname: string; alertas?: Record<string, AlertaNav> }) {
  const isChat = item.href === "/chat";
  const alerta = isChat ? undefined : alertas?.[item.href];
  return (
    <li>
      <Link href={item.href} className={classeTrilho(isItemActive(item, pathname))} title={item.title}>
        <span className="relative">
          <item.icon className="size-[18px]" />
          {isChat && <ChatBadge dot className="absolute -right-1 -top-1" />}
          {alerta && <NavBadge alerta={alerta} dot className="absolute -right-1 -top-1" />}
        </span>
        <span className="w-full truncate text-center">{item.title}</span>
      </Link>
    </li>
  );
}

/** Seção inteira do trilho: um botão com o nome da seção que abre a lista dos itens ao lado. */
function SecaoTrilho({
  group,
  pathname,
  alertas,
}: {
  group: NavGroup & { title: string };
  pathname: string;
  alertas?: Record<string, AlertaNav>;
}) {
  const [aberta, setAberta] = useState(false);
  const Icone = ICONE_DA_SECAO[group.title] ?? LayoutGrid;
  const ativa = group.items.some((i) => isItemActive(i, pathname));
  const alerta = somarAlertas(group.items, alertas);

  return (
    <li>
      <Popover open={aberta} onOpenChange={setAberta}>
        <PopoverTrigger
          openOnHover
          delay={120}
          closeDelay={250}
          render={
            <button type="button" className={classeTrilho(ativa)} aria-label={`Seção ${group.title}: abre a lista`} title={group.title}>
              <span className="relative">
                <Icone className="size-[18px]" />
                {alerta && <NavBadge alerta={alerta} dot className="absolute -right-1 -top-1" />}
              </span>
              <span className="w-full truncate text-center">{group.title}</span>
              {/* Seta: diferencia a seção (abre uma lista) do item que vai direto para a página. */}
              <ChevronRight className="absolute top-1/2 right-0 size-3 -translate-y-1/2 opacity-60" aria-hidden />
            </button>
          }
        />
        <PopoverContent side="right" align="start" sideOffset={8} className="w-60 p-2">
          <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{group.title}</p>
          <NavList
            items={group.items}
            pathname={pathname}
            alertas={alertas}
            onNavigate={() => setAberta(false)}
          />
        </PopoverContent>
      </Popover>
    </li>
  );
}

/**
 * Conteúdo de navegação compartilhado entre a sidebar fixa (desktop) e o
 * drawer mobile. `collapsed` só é usado no trilho do desktop; o drawer
 * sempre passa `collapsed={false}` e um `onNavigate` para fechar ao navegar.
 */
export function SidebarNav({
  nav,
  collapsed = false,
  onNavigate,
}: {
  nav: ContextoNav;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const visiveis = navItemsPara(nav);
  const groups = visiveis
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.foraDoMenu) }))
    .filter((g) => g.items.length > 0);
  const [fixados, setFixados] = useState<string[]>(nav.fixados ?? []);
  const [, iniciar] = useTransition();

  // Só fixa o que esta pessoa pode ver (permissão pode ter mudado depois) — inclusive o que mora
  // fora do menu (Minha conta, Ajuda…): quem fixou continua com o atalho.
  const todosOsItens = visiveis.flatMap((g) => g.items);
  const itensFixados = fixados
    .map((href) => todosOsItens.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i);

  function alternar(href: string) {
    const proximo = fixados.includes(href) ? fixados.filter((h) => h !== href) : [...fixados, href];
    setFixados(proximo);
    iniciar(async () => {
      const r = await salvarPreferencia({ chave: CHAVE_MENU_FIXADOS, valor: proximo });
      if (!r.ok) {
        setFixados(fixados);
        toast.error("Não foi possível salvar os atalhos fixados.");
      }
    });
  }
  const fixacao: Fixacao = { fixados, alternar };

  if (collapsed) {
    return (
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2" aria-label="Menu principal">
        <ul className="space-y-0.5">
          {itensFixados.map((item) => (
            <ItemTrilho key={`fixo-${item.href}`} item={item} pathname={pathname} alertas={nav.alertas} />
          ))}
          {itensFixados.length > 0 && <li aria-hidden className="mx-2 my-1 border-t border-sidebar-border" />}
          {groups.map((group, gi) =>
            !group.title || group.items.length === 1 ? (
              group.items.map((item) => (
                <ItemTrilho key={item.href} item={item} pathname={pathname} alertas={nav.alertas} />
              ))
            ) : (
              <SecaoTrilho
                key={group.title ?? gi}
                group={group as NavGroup & { title: string }}
                pathname={pathname}
                alertas={nav.alertas}
              />
            ),
          )}
        </ul>
      </nav>
    );
  }

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4">
      {itensFixados.length > 0 && (
        <div>
          <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Fixados</p>
          <NavList
            items={itensFixados}
            pathname={pathname}
            alertas={nav.alertas}
            onNavigate={onNavigate}
            fixacao={fixacao}
          />
        </div>
      )}
      {groups.map((group, gi) => {
        // Sem título ou grupo de item único: estático, sem seta de expandir.
        if (!group.title || group.items.length === 1) {
          return (
            <div key={group.title ?? gi}>
              {group.title && (
                <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {group.title}
                </p>
              )}
              <NavList
                items={group.items}
                pathname={pathname}
                alertas={nav.alertas}
                onNavigate={onNavigate}
                fixacao={fixacao}
              />
            </div>
          );
        }
        return (
          <CollapsibleGroup
            key={group.title}
            group={group as NavGroup & { title: string }}
            pathname={pathname}
            alertas={nav.alertas}
            onNavigate={onNavigate}
            fixacao={fixacao}
          />
        );
      })}
    </nav>
  );
}
