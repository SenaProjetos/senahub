"use client";

import { KeyRound, Star, ExternalLink, MoreVertical, Users, Lock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead } from "@/components/ui/sortable-head";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarData, cn } from "@/lib/utils";
import {
  iconeDaCategoria,
  corDaCategoria,
  estadoLabel,
  STATUS_LABEL,
  STATUS_TONE,
  NIVEL_ACESSO_CURTO,
} from "@/modules/acessos/labels";
import type { StatusCredencial } from "@/modules/acessos/service";

export type LinhaAcesso = {
  id: string;
  nome: string;
  nomeCompleto: string | null;
  estado: string | null;
  url: string | null;
  vencimentoEm: Date | null;
  favorita: boolean;
  statusExibido: StatusCredencial;
  /**
   * Login em claro — **só preenchido para quem tem `podeVerCredencial` naquele registro**.
   * `null` para o resto, e a célula mostra `—`: uma máscara (`•••`) diria "há algo aqui que
   * você não pode ver", que é a mesma fuga de existência fechada no resto do módulo.
   */
  usuario: string | null;
  /** Como a credencial é alcançada (§18): `setor` | `perfil` | `usuario` | `restrito`. */
  nivelAcesso: string;
  categoria: { id: string; nome: string; icone: string | null };
  responsavel: { id: string; name: string; image: string | null; cargo: string | null } | null;
};

/**
 * Colunas que somem em tela estreita, em ordem de dispensabilidade.
 *
 * Com nove colunas a tabela pede ~1200px, e a coluna do meio tem ~690px numa tela de 1600 —
 * medido, não estimado. Rolar na horizontal para achar Status e Ação é o pior desfecho, então
 * o que sai primeiro é o que tem substituto visual ou é secundário:
 *
 *   - Categoria: o ícone colorido da coluna Plataforma já a identifica;
 *   - Usuário/Conta: só interessa a quem vai copiar, e o drawer sempre a tem;
 *   - Estado e Acesso: viram filtro quando o usuário precisa deles.
 *
 * Plataforma, Status e Ação nunca somem — são o que faz a linha ser útil.
 */
// Os limiares são arbitrários (`min-[…]`) e não os breakpoints padrão de propósito: o que
// importa aqui não é o tamanho da JANELA, é quanto sobra para a coluna do meio depois da
// sidebar do app (256px) e das duas colunas laterais (~470px). Em 1600px de janela sobram
// 750px — medido —, e `2xl` (1536) deixaria tudo visível justamente aí.
const SO_LARGO = "hidden min-[1800px]:table-cell";
const SO_MEDIO = "hidden min-[1500px]:table-cell";
// §59 — no celular a tabela não deve tentar manter muitas colunas comprimidas. Sobram as três
// que respondem "que conta é, como está, e o que faço": Plataforma, Status e Ação.
const SO_TABLET = "hidden md:table-cell";

/**
 * Tabela principal (§12–§20).
 *
 * A SENHA nunca aparece aqui — nem mascarada, nem sob permissão: revelar é sempre pelo drawer,
 * numa ação auditada (§16/§45). O USUÁRIO aparece, porque §16 o permite a quem tem a permissão
 * e a referência visual do dono o mostra na coluna "Usuário / Conta".
 */
export function AcessosTabela({
  items,
  temFiltro,
  podeGerir,
  podeRevelar,
  onAbrir,
  total,
  skip,
  page,
  pageCount,
  pageSize,
}: {
  items: LinhaAcesso[];
  temFiltro: boolean;
  podeGerir: boolean;
  podeRevelar: boolean;
  onAbrir: (id: string) => void;
  total: number;
  skip: number;
  page: number;
  pageCount: number;
  pageSize: number;
}) {
  if (items.length === 0) {
    return (
      <div className="p-4">
        {temFiltro ? (
          <EmptyState
            icon={KeyRound}
            title="Nenhum acesso encontrado"
            description="Ajuste os filtros ou tente outro termo."
          />
        ) : (
          <EmptyState
            icon={KeyRound}
            title="Nenhum acesso cadastrado"
            description="Cadastre portais, contas e softwares utilizados pela empresa."
            action={
              podeGerir ? (
                <Button disabled title="O formulário de cadastro entra na Fase 6">
                  Cadastrar primeiro acesso
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    );
  }

  const ate = Math.min(skip + items.length, total);

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <SortableHead field="nome">Plataforma / Órgão</SortableHead>
              <SortableHead field="categoria" className={SO_LARGO}>Categoria</SortableHead>
              <SortableHead field="estado" className={SO_MEDIO}>Estado</SortableHead>
              <TableHead className={SO_LARGO}>Usuário / Conta</TableHead>
              <SortableHead field="responsavel" className={SO_TABLET}>Responsável</SortableHead>
              <TableHead className={SO_MEDIO}>Acesso</TableHead>
              <SortableHead field="status">Status</SortableHead>
              <TableHead className="w-20 text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => {
              const Icone = iconeDaCategoria(c.categoria.nome);
              return (
                <TableRow key={c.id} className="[&>td]:align-top">
                  <TableCell className="pr-0">
                    {c.favorita && (
                      <Star className="size-3.5 fill-warning text-warning" aria-label="Favorito" />
                    )}
                  </TableCell>

                  {/* §13 — ícone da categoria + nome + subtítulo */}
                  <TableCell className="max-w-44">
                    <button
                      type="button"
                      onClick={() => onAbrir(c.id)}
                      // `w-full min-w-0`: sem isto o botão flex cresce até o conteúdo e o
                      // `truncate` do subtítulo nunca dispara — o texto vazava por cima da
                      // coluna seguinte.
                      className="flex w-full min-w-0 items-start gap-2 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icone
                        className={cn("mt-0.5 size-4 shrink-0", corDaCategoria(c.categoria.nome))}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.nome}</span>
                        {c.nomeCompleto && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.nomeCompleto}
                          </span>
                        )}
                      </span>
                    </button>
                  </TableCell>

                  {/* §14 — badge neutro; a cor fica no ícone, não num retângulo por linha */}
                  <TableCell className={SO_LARGO}>
                    <Badge variant="outline" className="font-normal">
                      {c.categoria.nome}
                    </Badge>
                  </TableCell>

                  <TableCell className={cn(SO_MEDIO, "tabular-nums text-muted-foreground")}>
                    {estadoLabel(c.estado)}
                  </TableCell>

                  {/* §16 — só para quem pode ver a credencial daquele registro */}
                  <TableCell className={cn(SO_LARGO, "max-w-40")}>
                    {c.usuario ? (
                      <span className="block truncate font-mono text-xs" title={c.usuario}>
                        {c.usuario}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* §17 — avatar + nome + cargo */}
                  <TableCell className={cn(SO_TABLET, "max-w-36")}>
                    {c.responsavel ? (
                      <span className="flex items-center gap-2">
                        <AvatarUsuario
                          nome={c.responsavel.name}
                          image={c.responsavel.image}
                          className="size-6"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{c.responsavel.name}</span>
                          {c.responsavel.cargo && (
                            <span className="hidden truncate text-xs text-muted-foreground min-[1800px]:block">
                              {c.responsavel.cargo}
                            </span>
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem responsável</span>
                    )}
                  </TableCell>

                  {/* §18 — como a credencial é alcançada */}
                  <TableCell className={SO_MEDIO}>
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                      {c.nivelAcesso === "restrito" ? (
                        <Lock className="size-3.5" aria-hidden />
                      ) : (
                        <Users className="size-3.5" aria-hidden />
                      )}
                      {NIVEL_ACESSO_CURTO[c.nivelAcesso] ?? c.nivelAcesso}
                    </span>
                  </TableCell>

                  {/* §19 — badge discreto; o texto acompanha a cor (§60) */}
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[c.statusExibido]}>
                      {STATUS_LABEL[c.statusExibido]}
                    </StatusBadge>
                    {c.vencimentoEm && c.statusExibido === "expirando" && (
                      <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                        {formatarData(c.vencimentoEm)}
                      </span>
                    )}
                  </TableCell>

                  {/* §20 — "Ver" explícito + menu de contexto */}
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onAbrir(c.id)}
                      >
                        Ver
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-7 p-0"
                              aria-label={`Mais ações para ${c.nome}`}
                            >
                              <MoreVertical className="size-4" aria-hidden />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onAbrir(c.id)}>
                            Abrir detalhes
                          </DropdownMenuItem>
                          {c.url && (
                            <DropdownMenuItem
                              onClick={() => window.open(c.url ?? "", "_blank", "noopener,noreferrer")}
                            >
                              <ExternalLink className="size-4" aria-hidden />
                              Abrir portal
                            </DropdownMenuItem>
                          )}
                          {podeRevelar && (
                            <DropdownMenuItem onClick={() => onAbrir(c.id)}>
                              <KeyRound className="size-4" aria-hidden />
                              Ver credencial
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* §57 — "Mostrando X a Y de Z", como a referência */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
        <p className="text-xs tabular-nums text-muted-foreground">
          Mostrando {skip + 1} a {ate} de {total} {total === 1 ? "conta" : "contas"}
        </p>
        <Pagination page={page} pageCount={pageCount} pageSize={pageSize} />
      </div>
    </>
  );
}
