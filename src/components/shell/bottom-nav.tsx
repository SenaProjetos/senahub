"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hrefAtivo, navItemsPara, type ContextoNav } from "@/lib/nav-config";
import { ChatBadge } from "@/components/chat/chat-badge";
import { Menu } from "lucide-react";
import { EVENTO_ABRIR_MENU } from "@/components/shell/mobile-nav";


export function BottomNav({ nav }: { nav: ContextoNav }) {
  const pathname = usePathname();
  const disponiveis = navItemsPara(nav)
    .flatMap((g) => g.items)
    .filter((i) => i.mobile);
  // Ordem fixa (não a do menu): o que se usa no dia a dia no celular, com o Ponto no meio. Quem não
  // tem algum destes (cliente, sem chat…) completa com o que sobrar, e o resto fica em "Mais".
  const ORDEM = ["/", "/portal", "/projetos", "/tarefas", "/ponto", "/chat", "/ajuda"];
  const items = ORDEM.map((href) => disponiveis.find((i) => i.href === href))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .slice(0, 5);
  const ativo = hrefAtivo(pathname, items);

  return (
    // `max-w-[100vw]` é trava de segurança, não enfeite: no celular o Chrome dimensiona elemento
    // `fixed` pela viewport de LAYOUT, e estica essa viewport quando a página tem uma área de
    // rolagem horizontal que não contém a própria pintura (as abas do projeto faziam isso). Sem a
    // trava, a barra saía com a largura do conteúdo rolável — 859px numa tela de 390 — e ficava
    // mais larga que o resto. O cap nunca encurta a barra no caso normal, em que ela já mede o
    // tamanho da tela.
    <nav
      className="pb-safe fixed inset-x-0 bottom-0 z-30 max-w-[100vw] border-t border-border bg-background/95 backdrop-blur lg:hidden"
      data-foco-celular
    >
      <ul className="flex items-stretch justify-around">
        {items.map((item) => {
          const active = item.href === ativo;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <item.icon className="size-5" />
                  {item.href === "/chat" && (
                    <ChatBadge className="absolute -right-2 -top-1.5 h-4" />
                  )}
                </span>
                <span className="truncate">{item.title}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_MENU))}
            className="flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Menu className="size-5" />
            <span className="truncate">Mais</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
