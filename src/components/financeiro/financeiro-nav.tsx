"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { itemAtual, type ItemNavFinanceiro, type NavFinanceiro } from "@/modules/financeiro/nav";

/**
 * Subnavegação do Financeiro (mock de 2026-10-02): três links diretos e quatro menus que abrem.
 * Cada tela a desenha logo DEPOIS do próprio `CabecalhoPagina` (via `NavFinanceiro`, que resolve as
 * permissões) — o cabeçalho precisa ser o 1º elemento da página. Em cada menu o item continua um `<a>`
 * de verdade (nova aba, copiar link); o item atual leva `aria-current="page"`.
 */
export function FinanceiroNav({
  nav,
  contagens,
}: {
  nav: NavFinanceiro;
  /** Pendências por id de item (contas vencidas, aprovações, conciliação): selo só quando > 0. */
  contagens: Record<string, number>;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções do Financeiro"
      className="sticky top-16 z-10 md:top-14 -mx-4 border-b bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:-mx-6 lg:px-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        {nav.principais.map((item) => {
          const atual = itemAtual(item, pathname);
          return (
            <Button
              key={item.id}
              variant={atual ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              render={<Link href={item.href} aria-current={atual ? "page" : undefined} />}
            >
              {item.rotulo}
              <Contagem n={contagens[item.id]} />
            </Button>
          );
        })}
        <Menu rotulo="Movimentações" itens={nav.movimentacoes} pathname={pathname} contagens={contagens} />
        <Menu rotulo="Planejamento" itens={nav.planejamento} pathname={pathname} contagens={contagens} />
        <Menu rotulo="Resultados" itens={nav.resultados} pathname={pathname} contagens={contagens} />
        <Menu rotulo="Mais" itens={nav.mais} pathname={pathname} contagens={contagens} />
      </div>
    </nav>
  );
}

function Contagem({ n }: { n?: number }) {
  if (!n || n <= 0) return null;
  return (
    <span className="rounded-sm bg-destructive px-1 font-mono text-[11px] text-white" aria-label={`${n} pendentes`}>
      {n}
    </span>
  );
}

function Menu({
  rotulo,
  itens,
  pathname,
  contagens,
}: {
  rotulo: string;
  itens: ItemNavFinanceiro[];
  pathname: string;
  contagens: Record<string, number>;
}) {
  if (itens.length === 0) return null;
  const atual = itens.some((i) => itemAtual(i, pathname));
  const pendentes = itens.reduce((s, i) => s + (contagens[i.id] ?? 0), 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant={atual ? "default" : "outline"} size="sm" className="shrink-0" aria-label={`${rotulo}, mais telas`} />
        }
      >
        {rotulo}
        <Contagem n={pendentes} />
        <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        {itens.map((i) => (
          <DropdownMenuLinkItem key={i.id} href={i.href} aria-current={itemAtual(i, pathname) ? "page" : undefined}>
            <span className="flex min-w-0 flex-col">
              <span>{i.rotulo}</span>
              {i.desc && <span className="text-xs text-muted-foreground">{i.desc}</span>}
            </span>
            {i.novo && <span className="ml-auto rounded-sm border border-info px-1 text-[11px] font-semibold text-info">novo</span>}
            <Contagem n={contagens[i.id]} />
          </DropdownMenuLinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
