"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
 * Subnavegação do Financeiro. Cada tela a desenha logo DEPOIS do próprio `CabecalhoPagina` (via
 * `NavFinanceiro`, que resolve as permissões) — o cabeçalho precisa ser o 1º elemento da página.
 * "Resultados" e "Mais" são menus: cada item continua um `<a>` de verdade (nova aba, copiar link).
 * Padrão da `ComercialNav`; o item atual leva `aria-current="page"`.
 */
export function FinanceiroNav({
  nav,
  contagens,
}: {
  nav: NavFinanceiro;
  /** Pendências por id de item (aprovações, conciliação): selo só quando > 0. */
  contagens: Record<string, number>;
}) {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");

  return (
    <nav
      aria-label="Seções do Financeiro"
      className="sticky top-16 z-10 md:top-14 -mx-4 border-b bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:-mx-6 lg:px-6"
    >
      <div className="flex items-center gap-2 overflow-x-auto">
        {nav.principais.map((item) => {
          const atual = itemAtual(item, pathname, tab);
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
        <Menu rotulo="Resultados" itens={nav.resultados} pathname={pathname} tab={tab} contagens={contagens} />
        <Menu rotulo="Mais" itens={nav.mais} pathname={pathname} tab={tab} contagens={contagens} />
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
  tab,
  contagens,
}: {
  rotulo: string;
  itens: ItemNavFinanceiro[];
  pathname: string;
  tab: string | null;
  contagens: Record<string, number>;
}) {
  if (itens.length === 0) return null;
  const atual = itens.some((i) => itemAtual(i, pathname, tab));
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
      <DropdownMenuContent align="start">
        {itens.map((i) => (
          <DropdownMenuLinkItem key={i.id} href={i.href} aria-current={itemAtual(i, pathname, tab) ? "page" : undefined}>
            {i.rotulo}
            <Contagem n={contagens[i.id]} />
          </DropdownMenuLinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
