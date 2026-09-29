"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Download, Folder, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { AcoesMenuItens, BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { ICONE_AREA, preCarregarConteudoArea } from "@/components/projetos/arquivos/painel-areas-projeto";
import { STATUS_LABEL, STATUS_TEXT } from "@/modules/projetos/status";
import { areaValida } from "@/modules/uploads/areas-projeto";
import { ACAO_ABRIR_PASTA, ACAO_COPIAR_LINK_PASTA, itensDePasta } from "@/modules/uploads/acoes-pasta";
import {
  hrefDaPasta,
  hrefZipDaPasta,
  type DestinoPasta,
  type PastaNaLista,
  type SegmentoTrilha,
} from "@/modules/uploads/pastas-da-lista";
import { copiarTexto } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/**
 * Pastas no topo da lista, como no Google Drive, e a trilha para voltar. Entrar numa pasta é o
 * mesmo que clicar nela na árvore: troca a posição na URL (`hrefDaPasta`), e o servidor devolve
 * o conteúdo daquele nível.
 */
export function useNavegacaoPastas() {
  const router = useRouter();
  const pathname = usePathname();
  const busca = useSearchParams().toString();
  const hrefDe = (destino: DestinoPasta) => hrefDaPasta(pathname, busca, destino);
  return {
    hrefDe,
    abrir: (destino: DestinoPasta) => router.push(hrefDe(destino), { scroll: false }),
  };
}

export type NavegacaoPastas = ReturnType<typeof useNavegacaoPastas>;

function rotuloTotal(pasta: PastaNaLista): string {
  if (pasta.tipo === "area") return pasta.total === 1 ? "1 item" : `${pasta.total} itens`;
  return pasta.total === 1 ? "1 documento" : `${pasta.total} documentos`;
}

function tituloDa(pasta: PastaNaLista): string | undefined {
  if (pasta.status) return STATUS_LABEL[pasta.status];
  return pasta.titulo ?? undefined;
}

/** Coluna Disc.: a disciplina onde a pasta mora (colorida pelo status na pasta da própria), ou o ícone da área. */
function IconeDaColuna({ pasta }: { pasta: PastaNaLista }) {
  const area = pasta.tipo === "area" ? areaValida(pasta.destino.area) : null;
  if (area) {
    const Icone = ICONE_AREA[area];
    return <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
  }
  if (!pasta.disciplinaNome) return null;
  return (
    <DisciplinaIcone
      nome={pasta.disciplinaNome}
      className={cn("size-4 shrink-0", pasta.status ? STATUS_TEXT[pasta.status] : "text-muted-foreground")}
      aria-hidden
    />
  );
}

/** Tudo o que a linha e o cartão fazem com a pasta: endereço, .zip e o menu (botão direito + `...`). */
function usePasta(pasta: PastaNaLista, nav: NavegacaoPastas) {
  const href = nav.hrefDe(pasta.destino);
  const hrefZip = pasta.zip ? hrefZipDaPasta(pasta.zip) : null;
  const itens = itensDePasta({ href, hrefZip });
  function aoSelecionar(item: AcaoItemAcao) {
    if (item.id === ACAO_ABRIR_PASTA) nav.abrir(pasta.destino);
    if (item.id === ACAO_COPIAR_LINK_PASTA) {
      void copiarTexto(new URL(href, window.location.origin).toString()).then((ok) =>
        ok ? toast.success("Link da pasta copiado.") : toast.error("Não foi possível copiar o link."),
      );
    }
  }
  // Área abre o conteúdo dela num chunk à parte: baixa no hover, como o painel da esquerda.
  const aoApontar = pasta.tipo === "area" ? preCarregarConteudoArea : undefined;
  return { href, hrefZip, itens, aoSelecionar, aoApontar };
}

/** Nome, contagem e o .zip — igual na tabela e no cartão. */
function NomeDaPasta({
  pasta,
  href,
  hrefZip,
  grande = false,
}: {
  pasta: PastaNaLista;
  href: string;
  hrefZip: string | null;
  grande?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Folder className="size-4 shrink-0 fill-primary/15 text-primary" aria-hidden />
      <Link
        href={href}
        scroll={false}
        title={tituloDa(pasta)}
        // A linha inteira também abre; o link cuida do próprio clique para não navegar duas vezes.
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "min-w-0 truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
          grande ? "text-sm" : "",
          pasta.tipo === "extensao" && "font-mono text-xs uppercase",
        )}
      >
        {pasta.rotulo}
      </Link>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{rotuloTotal(pasta)}</span>
      {hrefZip && (
        <a
          href={hrefZip}
          onClick={(e) => e.stopPropagation()}
          title={`Baixar a pasta ${pasta.rotulo} (.zip)`}
          aria-label={`Baixar a pasta ${pasta.rotulo} (.zip)`}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="size-3.5" aria-hidden />
        </a>
      )}
    </div>
  );
}

/**
 * Linha de pasta na tabela. O ícone da disciplina fica na coluna Disc., como nos documentos; o
 * nome vai do Nº até antes das ações — pasta não tem revisão, validação nem arquivo.
 */
export function LinhaPasta({
  pasta,
  colunasDoNome,
  nav,
}: {
  pasta: PastaNaLista;
  /** Colunas que a célula do nome atravessa (do Nº até antes das ações). */
  colunasDoNome: number;
  nav: NavegacaoPastas;
}) {
  const { href, hrefZip, itens, aoSelecionar, aoApontar } = usePasta(pasta, nav);
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <TableRow
            className="cursor-pointer data-[popup-open]:bg-muted/50"
            onClick={() => nav.abrir(pasta.destino)}
            onPointerEnter={aoApontar}
          />
        }
      >
        <TableCell />
        <TableCell>
          <span className="flex items-center" title={pasta.disciplinaNome ?? undefined}>
            <IconeDaColuna pasta={pasta} />
          </span>
        </TableCell>
        <TableCell colSpan={colunasDoNome}>
          <NomeDaPasta pasta={pasta} href={href} hrefZip={hrefZip} />
        </TableCell>
        <TableCell className="text-right">
          {/* O menu do `...` vive num portal, mas o evento React sobe pela árvore até a linha. */}
          <span onClick={(e) => e.stopPropagation()}>
            <BotaoAcoes itens={itens} onSelect={aoSelecionar} rotulo={`Ações da pasta ${pasta.rotulo}`} className="size-7" />
          </span>
        </TableCell>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <AcoesMenuItens itens={itens} onSelect={aoSelecionar} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** A mesma pasta no celular, no topo da lista de cartões (toque longo abre o menu). */
export function CartaoPasta({ pasta, nav }: { pasta: PastaNaLista; nav: NavegacaoPastas }) {
  const { href, hrefZip, itens, aoSelecionar, aoApontar } = usePasta(pasta, nav);
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <li
            className="flex cursor-pointer items-center gap-3 border-b border-border p-3 last:border-b-0 data-[popup-open]:bg-muted/50"
            onClick={() => nav.abrir(pasta.destino)}
            onPointerEnter={aoApontar}
          />
        }
      >
        <IconeDaColuna pasta={pasta} />
        <div className="min-w-0 flex-1">
          <NomeDaPasta pasta={pasta} href={href} hrefZip={hrefZip} grande />
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <BotaoAcoes itens={itens} onSelect={aoSelecionar} rotulo={`Ações da pasta ${pasta.rotulo}`} className="size-7" />
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <AcoesMenuItens itens={itens} onSelect={aoSelecionar} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * Onde se está: "Todos os documentos › Estrutural › EX › PDF". Cada trecho volta para aquela
 * pasta; o último é a pasta aberta e não é link. No diretório geral a trilha começa acima do
 * projeto ("Todos os projetos › 2026 › 260004 · Galpão › Estrutural").
 */
export function TrilhaPastas({
  trilha,
  inicio = [],
  rotuloRaiz = "Todos os documentos",
}: {
  trilha: SegmentoTrilha[];
  /** Trechos acima da raiz, com endereço pronto (diretório geral: todos os projetos, o ano). */
  inicio?: { rotulo: string; href: string }[];
  /** Nome da raiz: "Todos os documentos" na aba do projeto; o projeto, no diretório. */
  rotuloRaiz?: string;
}) {
  const nav = useNavegacaoPastas();
  // Na raiz da aba do projeto não há para onde voltar; no diretório, há (o ano, todos).
  if (trilha.length === 0 && inicio.length === 0) return null;
  const naRaiz = trilha.length === 0;

  const classeLink =
    "truncate rounded-sm text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <nav aria-label="Caminho da pasta" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs">
        {inicio.map((t) => (
          <li key={t.href} className="flex min-w-0 items-center gap-1">
            <Link href={t.href} scroll={false} className={classeLink}>
              {t.rotulo}
            </Link>
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          </li>
        ))}
        <li className="min-w-0">
          {naRaiz ? (
            <span aria-current="page" className="truncate font-medium text-foreground">
              {rotuloRaiz}
            </span>
          ) : (
            <Link href={nav.hrefDe({ disciplinaId: null, fase: null, ext: null, area: null })} scroll={false} className={classeLink}>
              {rotuloRaiz}
            </Link>
          )}
        </li>
        {trilha.map((segmento, i) => {
          const ultimo = i === trilha.length - 1;
          return (
            <li key={segmento.chave} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              {ultimo ? (
                <span aria-current="page" title={segmento.titulo ?? undefined} className="truncate font-medium text-foreground">
                  {segmento.rotulo}
                </span>
              ) : (
                <Link href={nav.hrefDe(segmento.destino)} scroll={false} title={segmento.titulo ?? undefined} className={classeLink}>
                  {segmento.rotulo}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Lista só de pastas, para os níveis do diretório geral acima do projeto (os anos; os projetos
 * de um ano). As linhas são as mesmas das pastas da aba Arquivos; sem documento, a tabela só tem
 * nome e ações.
 */
export function TabelaPastas({ pastas, vazio }: { pastas: PastaNaLista[]; vazio: { title: string; description: string } }) {
  const nav = useNavegacaoPastas();
  if (pastas.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card">
        <EmptyState icon={FolderOpen} title={vazio.title} description={vazio.description} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="overflow-hidden rounded-md border border-border bg-card md:hidden" aria-label="Pastas">
        {pastas.map((pasta) => (
          <CartaoPasta key={pasta.chave} pasta={pasta} nav={nav} />
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-md border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-9" />
              <TableHead className="w-12" />
              <TableHead>Nome</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pastas.map((pasta) => (
              <LinhaPasta key={pasta.chave} pasta={pasta} colunasDoNome={1} nav={nav} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
