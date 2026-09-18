"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpenText,
  CalendarClock,
  FileText,
  Handshake,
  KanbanSquare,
  LayoutDashboard,
  Megaphone,
  SlidersHorizontal,
  Table2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Item = { href: string; label: string; icon: LucideIcon; exato?: boolean };

const ITENS: Item[] = [
  { href: "/comercial", label: "Visão geral", icon: LayoutDashboard, exato: true },
  { href: "/comercial/inteligencia", label: "Inteligência", icon: BarChart3 },
  { href: "/comercial/funil", label: "Funil", icon: KanbanSquare },
  { href: "/comercial/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { href: "/comercial/parceiros", label: "Parceiros", icon: Handshake },
  { href: "/comercial/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/comercial/tabelas", label: "Tabelas de preço", icon: Table2 },
  { href: "/comercial/importar", label: "Importar", icon: Upload },
  { href: "/comercial/propostas", label: "Propostas", icon: FileText },
];

const CONFIG: Item = {
  href: "/comercial/configuracoes",
  label: "Configurações",
  icon: SlidersHorizontal,
};

function ativo(pathname: string, item: Item): boolean {
  return item.exato
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Barra de navegação do Comercial — fixa em toda rota `/comercial/**` (vive no `layout.tsx`).
 * Só o item da página atual fica em destaque; fichas individuais (`/comercial/[id]`) não marcam
 * nenhum, porque não são uma das telas do menu.
 */
export function ComercialNav({ podeGerir }: { podeGerir: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação do Comercial"
      className="sticky top-16 z-10 -mx-4 border-b bg-background/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:-mx-6 lg:px-6"
    >
      <div className="flex items-center gap-2 overflow-x-auto">
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          render={<Link href="/guias/clientes-comercial" />}
        >
          <BookOpenText className="size-4" /> Guia de uso
        </Button>
        {ITENS.map((item) => {
          const atual = ativo(pathname, item);
          const Icone = item.icon;
          return (
            <Button
              key={item.href}
              variant={atual ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              render={<Link href={item.href} aria-current={atual ? "page" : undefined} />}
            >
              <Icone className="size-4" /> {item.label}
            </Button>
          );
        })}
        {podeGerir && (
          <Button
            variant={ativo(pathname, CONFIG) ? "default" : "outline"}
            size="icon"
            className="shrink-0"
            render={
              <Link
                href={CONFIG.href}
                aria-label={CONFIG.label}
                title={CONFIG.label}
                aria-current={ativo(pathname, CONFIG) ? "page" : undefined}
              />
            }
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        )}
      </div>
    </nav>
  );
}
