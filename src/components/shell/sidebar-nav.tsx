"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import {
  Briefcase,
  ChevronRight,
  LayoutGrid,
  Ruler,
  Settings,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { salvarPreferencia } from "@/modules/usuarios/preferencias/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hrefAtivo, navItemsPara, type AlertaNav, type ContextoNav, type NavGroup, type NavItem } from "@/lib/nav-config";
import { ChatBadge } from "@/components/chat/chat-badge";
import { NavBadge } from "@/components/shell/nav-badge";

/** Chave em `UserPreference` dos atalhos fixados (lista de `href`, na ordem em que foram fixados). */
export const CHAVE_MENU_FIXADOS = "menu_fixados";

/** Chave em `UserPreference` das seções do menu aberto que ficaram abertas (títulos das seções). */
export const CHAVE_MENU_SECOES = "menu_secoes_abertas";

/**
 * Último estado do menu NESTA aba. A gaveta do celular desmonta ao fechar e o `nav` do layout é o da
 * carga da página: sem isto, o que a pessoa fixou ou abriu na gaveta sumia ao reabrir, até recarregar.
 * Só é escrito no navegador (efeitos), nunca no servidor — então não vaza entre requests.
 */
const memoria: { fixados?: string[]; secoesAbertas?: string[]; secoesSalvas?: string } = {};

/** Acrescenta a seção à lista (sem repetir); `null` = página fora das seções. */
function comSecao(abertas: string[], secao: string | null) {
  return secao && !abertas.includes(secao) ? [...abertas, secao] : abertas;
}

/** Teto de atalhos fixados (modelo aprovado): mais que isso empurra as seções do trilho para fora da tela. */
const MAXIMO_FIXADOS = 5;

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

type Fixacao = {
  fixados: string[];
  alternar: (href: string) => void;
};

/**
 * Altura e fonte de cada linha, do modelo aprovado: linha solta (Início, Chat, Fixados, lista do
 * trilho) 32 px / 13 px; item de seção, recuado sob a linha-guia, 30 px / 12,5 px. Em tela de toque
 * as duas vão a 40 px, a mesma regra de botões e campos (`pointer-coarse`).
 */
const LINHA = {
  solta: "h-8 text-[13px]",
  secao: "h-[30px] text-[12.5px]",
} as const;

function NavList({
  items,
  ativo,
  alertas,
  onNavigate,
  fixacao,
  linha = "solta",
  className,
  id,
}: {
  items: NavItem[];
  /** `href` do item da página atual (`hrefAtivo`): só ele acende. */
  ativo: string | null;
  alertas?: Record<string, AlertaNav>;
  onNavigate?: () => void;
  fixacao?: Fixacao;
  linha?: keyof typeof LINHA;
  className?: string;
  id?: string;
}) {
  const cheio = (fixacao?.fixados.length ?? 0) >= MAXIMO_FIXADOS;
  return (
    <ul id={id} className={cn("flex flex-col gap-px", className)}>
      {items.map((item) => {
        const active = item.href === ativo;
        // Chat tem badge próprio (socket, tempo real); o resto vem do servidor por request.
        const isChat = item.href === "/chat";
        const alerta = isChat ? undefined : alertas?.[item.href];
        const fixado = fixacao?.fixados.includes(item.href) ?? false;
        const bloqueado = !fixado && cheio;
        return (
          // A linha inteira (com a ☆) é o alvo do destaque, como no modelo; o link ocupa o resto dela.
          <li
            key={item.href}
            className={cn(
              "group/item flex shrink-0 items-center rounded-sm transition-colors pointer-coarse:h-10",
              LINHA[linha],
              active
                ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60",
            )}
          >
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={item.title}
              className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-sm px-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
                <item.icon className="size-[18px]" />
              </span>
              <span className="truncate">{item.title}</span>
              {isChat && <ChatBadge className="ml-auto" />}
              {alerta && <NavBadge alerta={alerta} className="ml-auto" />}
            </Link>
            {fixacao && (
              <button
                type="button"
                onClick={() => {
                  if (!bloqueado) fixacao.alternar(item.href);
                }}
                aria-label={fixado ? `Desafixar ${item.title}` : `Fixar ${item.title} no topo do menu`}
                aria-pressed={fixado}
                aria-disabled={bloqueado || undefined}
                title={fixado ? "Desafixar" : bloqueado ? `Máximo de ${MAXIMO_FIXADOS} atalhos` : "Fixar no topo"}
                className={cn(
                  "mr-1 grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  fixado ? "opacity-100" : "opacity-55 group-hover/item:opacity-100",
                )}
              >
                <Star className={cn("size-3", fixado && "fill-warning text-warning")} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Seção do menu aberto (modelo aprovado): um botão de 34 px com seta, nome em negrito e a
 * contagem de itens à direita; aberta, os itens ficam recuados sob uma linha-guia vertical.
 * Aberta ou fechada é decidido pelo `SidebarNav` (lembrado na conta), não aqui.
 */
function CollapsibleGroup({
  group,
  ativo,
  expanded,
  onToggle,
  alertas,
  onNavigate,
  fixacao,
}: {
  group: NavGroup & { title: string };
  ativo: string | null;
  expanded: boolean;
  onToggle: () => void;
  alertas?: Record<string, AlertaNav>;
  onNavigate?: () => void;
  fixacao?: Fixacao;
}) {
  const idLista = useId();

  // Grupo fechado esconde os itens — e esconderia o badge junto. Some os alertas de dentro e
  // mostra o total no cabeçalho enquanto está fechado, senão "3 certidões vencidas" fica
  // invisível para quem deixou "Gestão" recolhido (que é o padrão de quem não usa o grupo).
  const alertaDoGrupo = somarAlertas(group.items, alertas);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={expanded ? idLista : undefined}
        className="flex h-[34px] w-full shrink-0 items-center gap-2.5 rounded-sm px-2 text-left text-[13.5px] font-semibold text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-sidebar-ring pointer-coarse:h-10"
      >
        <span aria-hidden className="w-2.5 shrink-0 text-[11px] text-muted-foreground">
          {expanded ? "▾" : "▸"}
        </span>
        <span className="min-w-0 truncate">{group.title}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {!expanded && alertaDoGrupo && <NavBadge alerta={alertaDoGrupo} />}
          <span className="font-mono text-[10.5px] font-medium text-muted-foreground">
            {group.items.length}
            <span className="sr-only">{group.items.length === 1 ? " item" : " itens"}</span>
          </span>
        </span>
      </button>
      {expanded && (
        <NavList
          items={group.items}
          ativo={ativo}
          alertas={alertas}
          onNavigate={onNavigate}
          fixacao={fixacao}
          linha="secao"
          id={idLista}
          className="ml-[17px] border-l border-sidebar-border pl-3.5"
        />
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
function ItemTrilho({ item, ativo, alertas }: { item: NavItem; ativo: string | null; alertas?: Record<string, AlertaNav> }) {
  const isChat = item.href === "/chat";
  const alerta = isChat ? undefined : alertas?.[item.href];
  return (
    <li>
      <Link href={item.href} className={classeTrilho(item.href === ativo)} title={item.title}>
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
  ativo,
  alertas,
}: {
  group: NavGroup & { title: string };
  ativo: string | null;
  alertas?: Record<string, AlertaNav>;
}) {
  const [aberta, setAberta] = useState(false);
  const Icone = ICONE_DA_SECAO[group.title] ?? LayoutGrid;
  const ativa = group.items.some((i) => i.href === ativo);
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
            ativo={ativo}
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
  // Inclui o que mora fora do menu (Minha conta, Ajuda…): na página deles, nada do menu acende.
  const todosOsItens = visiveis.flatMap((g) => g.items);
  const ativo = hrefAtivo(pathname, todosOsItens);
  const recolhivel = (g: NavGroup): g is NavGroup & { title: string } => !!g.title && g.items.length > 1;
  const secaoAtual = groups.find((g) => recolhivel(g) && g.items.some((i) => i.href === ativo))?.title ?? null;

  const [fixados, setFixados] = useState<string[]>(() => memoria.fixados ?? nav.fixados ?? []);
  const [, iniciar] = useTransition();

  // Seções abertas, lembradas na conta: o que está aberto continua aberto ao minimizar, trocar de
  // página e recarregar. A seção da página atual abre ao entrar nela e fica aberta até a pessoa
  // fechar (na primeira vez, é só ela, como no modelo aprovado).
  const [abertas, setAbertas] = useState<string[]>(() =>
    comSecao(memoria.secoesAbertas ?? nav.secoesAbertas ?? [], secaoAtual),
  );
  const [secaoVista, setSecaoVista] = useState(secaoAtual);
  if (secaoAtual !== secaoVista) {
    setSecaoVista(secaoAtual);
    setAbertas((a) => comSecao(a, secaoAtual));
  }

  useEffect(() => {
    memoria.fixados = fixados;
  }, [fixados]);

  useEffect(() => {
    memoria.secoesAbertas = abertas;
    const json = JSON.stringify(abertas);
    if (json === (memoria.secoesSalvas ?? JSON.stringify(nav.secoesAbertas ?? []))) return;
    // Espera a pessoa parar de clicar: uma gravação por rajada, não uma por seção.
    const t = setTimeout(() => {
      memoria.secoesSalvas = json;
      salvarPreferencia({ chave: CHAVE_MENU_SECOES, valor: abertas }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [abertas, nav.secoesAbertas]);

  function alternarSecao(titulo: string) {
    setAbertas((a) => (a.includes(titulo) ? a.filter((t) => t !== titulo) : [...a, titulo]));
  }

  // Só fixa o que esta pessoa pode ver (permissão pode ter mudado depois) — inclusive o que mora
  // fora do menu (Minha conta, Ajuda…): quem fixou continua com o atalho.
  const itensFixados = fixados
    .map((href) => todosOsItens.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i);

  function alternar(href: string) {
    const fixando = !fixados.includes(href);
    if (fixando && fixados.length >= MAXIMO_FIXADOS) return;
    const proximo = fixando ? [...fixados, href] : fixados.filter((h) => h !== href);
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
      <nav className="rolagem-fina relative flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2" aria-label="Menu principal">
        <ul className="space-y-0.5">
          {itensFixados.map((item) => (
            <ItemTrilho key={`fixo-${item.href}`} item={item} ativo={ativo} alertas={nav.alertas} />
          ))}
          {itensFixados.length > 0 && <li aria-hidden className="mx-2 my-1 border-t border-sidebar-border" />}
          {groups.map((group, gi) =>
            !recolhivel(group) ? (
              group.items.map((item) => (
                <ItemTrilho key={item.href} item={item} ativo={ativo} alertas={nav.alertas} />
              ))
            ) : (
              <SecaoTrilho key={group.title ?? gi} group={group} ativo={ativo} alertas={nav.alertas} />
            ),
          )}
        </ul>
      </nav>
    );
  }

  // Menu aberto, como no modelo aprovado: "Fixados" no topo, linhas soltas (Início, Chat e seção de
  // um item só, como no trilho) e as demais seções recolhíveis. `*:shrink-0`: a lista rola dentro
  // da coluna flex sem espremer as linhas.
  // `relative` (aqui e no trilho): a lista tem de ser a referência de posição do que é absoluto lá
  // dentro. Sem isso, o `sr-only` da contagem de cada seção ("6 itens") se posicionava pela coluna
  // inteira (`aside` sticky), escapava do recorte da lista e fazia a COLUNA rolar também — duas
  // barras de rolagem no menu (2026-09-28).
  return (
    <nav
      className="rolagem-fina relative flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-2.5 *:shrink-0"
      aria-label="Menu principal"
    >
      {itensFixados.length > 0 && (
        <>
          <p className="px-2 pt-1.5 pb-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
            Fixados
          </p>
          <NavList
            items={itensFixados}
            ativo={ativo}
            alertas={nav.alertas}
            onNavigate={onNavigate}
            fixacao={fixacao}
            className="gap-0.5"
          />
          <hr className="mx-1 my-1.5 border-sidebar-border" />
        </>
      )}
      {groups.map((group, gi) =>
        !recolhivel(group) ? (
          <NavList
            key={group.title ?? `solta-${gi}`}
            items={group.items}
            ativo={ativo}
            alertas={nav.alertas}
            onNavigate={onNavigate}
            className="gap-0.5"
          />
        ) : (
          <CollapsibleGroup
            key={group.title}
            group={group}
            ativo={ativo}
            expanded={abertas.includes(group.title)}
            onToggle={() => alternarSecao(group.title)}
            alertas={nav.alertas}
            onNavigate={onNavigate}
            fixacao={fixacao}
          />
        ),
      )}
    </nav>
  );
}
