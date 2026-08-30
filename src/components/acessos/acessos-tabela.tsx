"use client";

import { KeyRound, Star, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead } from "@/components/ui/sortable-head";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/utils";
import { iconeDaCategoria, estadoLabel, STATUS_LABEL, STATUS_TONE } from "@/modules/acessos/labels";
import type { StatusCredencial } from "@/modules/acessos/service";

export type LinhaAcesso = {
  id: string;
  nome: string;
  nomeCompleto: string | null;
  estado: string | null;
  status: string;
  url: string | null;
  vencimentoEm: Date | null;
  ultimaRevisaoEm: Date | null;
  favorita: boolean;
  /** Já resolvido no servidor — considera vencimento e revisão, não só o campo gravado. */
  statusExibido: StatusCredencial;
  categoria: { id: string; nome: string; icone: string | null };
  responsavel: { id: string; name: string; image: string | null; cargo: string | null } | null;
  tags: Array<{ tag: string }>;
};

/**
 * Tabela principal (§12–§20). Nunca mostra senha (§16) — nem mascarada: a coluna de credencial
 * simplesmente não existe aqui, e revelar é sempre pelo drawer, auditado.
 *
 * A linha inteira abre o drawer, mas o alvo acessível é o botão do nome — linha clicável sem
 * elemento focável seria inalcançável por teclado (§60).
 */
export function AcessosTabela({
  items,
  temFiltro,
  podeGerir,
  onAbrir,
}: {
  items: LinhaAcesso[];
  temFiltro: boolean;
  podeGerir: boolean;
  onAbrir: (id: string) => void;
}) {
  if (items.length === 0) {
    return temFiltro ? (
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
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <SortableHead field="nome">Plataforma</SortableHead>
            <SortableHead field="categoria">Categoria</SortableHead>
            <SortableHead field="estado">UF</SortableHead>
            <SortableHead field="responsavel">Responsável</SortableHead>
            <SortableHead field="vencimento">Vencimento</SortableHead>
            <SortableHead field="status">Status</SortableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => {
            const Icone = iconeDaCategoria(c.categoria.nome);
            return (
              <TableRow key={c.id}>
                <TableCell className="pr-0">
                  {c.favorita && (
                    <Star
                      className="size-3.5 fill-warning text-warning"
                      aria-label="Marcado como favorito"
                    />
                  )}
                </TableCell>

                {/* §13 — ícone da categoria + nome + subtítulo */}
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onAbrir(c.id)}
                    className="flex items-start gap-2 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>
                      <span className="block font-medium">{c.nome}</span>
                      {c.nomeCompleto && (
                        <span className="block text-xs text-muted-foreground">{c.nomeCompleto}</span>
                      )}
                    </span>
                  </button>
                </TableCell>

                {/* §14 — badge neutro, sem cor por categoria */}
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {c.categoria.nome}
                  </Badge>
                </TableCell>

                <TableCell className="tabular-nums text-muted-foreground">
                  {estadoLabel(c.estado)}
                </TableCell>

                {/* §17 — avatar + nome + cargo */}
                <TableCell>
                  {c.responsavel ? (
                    <span className="flex items-center gap-2">
                      <AvatarUsuario nome={c.responsavel.name} image={c.responsavel.image} className="size-6" />
                      <span>
                        <span className="block text-sm">{c.responsavel.name}</span>
                        {c.responsavel.cargo && (
                          <span className="block text-xs text-muted-foreground">{c.responsavel.cargo}</span>
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem responsável</span>
                  )}
                </TableCell>

                {/* §75 — data só vira alerta quando pede atenção */}
                <TableCell className="tabular-nums">
                  {c.vencimentoEm ? (
                    <span className="text-sm">{formatarData(c.vencimentoEm)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* §19 — badge discreto; o texto acompanha a cor (§60) */}
                <TableCell>
                  <StatusBadge tone={STATUS_TONE[c.statusExibido]}>{STATUS_LABEL[c.statusExibido]}</StatusBadge>
                </TableCell>

                <TableCell className="text-right">
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      // §55: `noopener` impede a aba aberta de manipular esta via window.opener.
                      rel="noopener noreferrer"
                      className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Abrir portal de ${c.nome} em nova aba`}
                      title="Abrir plataforma"
                    >
                      <ExternalLink className="size-4" aria-hidden />
                    </a>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
