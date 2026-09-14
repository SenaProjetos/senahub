"use client";

import {
  Upload,
  MoreVertical,
  FileText,
  FileX,
  Download,
  Eye,
  PenLine,
  Trash2,
  History,
  UserPlus,
} from "lucide-react";
import { cn, formatarData } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { statusCertidao, textoValidade, type StatusCertidao } from "@/modules/certidoes/service";
import type { Certidao } from "@/components/certidoes/tipos";

/** Tom e rótulo por situação — vermelho só para o que já estourou (linguagem de /acessos). */
const SITUACAO_TONE: Record<StatusCertidao, "success" | "warning" | "danger"> = {
  vencida: "danger",
  vence_em_breve: "warning",
  ok: "success",
};
const SITUACAO_LABEL: Record<StatusCertidao, string> = {
  vencida: "Vencida",
  vence_em_breve: "Vence em breve",
  ok: "OK",
};

/**
 * Colunas que somem em tela estreita, em ordem de dispensabilidade (§19).
 *
 * Certidão, Validade, Situação e a ação principal NUNCA somem — são o que responde "o que é, como
 * está e o que faço". Responsável e Documento saem primeiro porque o drawer tem os dois.
 */
const SO_TABLET = "hidden md:table-cell";
const SO_LARGO = "hidden lg:table-cell";

const TOM_TEXTO = {
  danger: "text-destructive",
  warning: "text-warning",
  neutral: "text-muted-foreground",
} as const;

/**
 * Tabela principal (§7).
 *
 * Cada linha tem UMA ação primária contextual + menu "⋮" para o resto (§7): antes eram até seis
 * ícones competindo por atenção na mesma linha, e o que o usuário precisa fazer numa certidão
 * vencida é sempre a mesma coisa — atualizar.
 */
export function CertidoesTabela({
  certidoes,
  podeGerir,
  selecionadas,
  onAlternarSelecao,
  onAbrirDetalhe,
  onAtualizar,
  onEditar,
  onExcluir,
  onVisualizar,
}: {
  certidoes: Certidao[];
  podeGerir: boolean;
  selecionadas: Set<string>;
  onAlternarSelecao: (id: string) => void;
  onAbrirDetalhe: (c: Certidao) => void;
  /** Abre o fluxo de nova versão (§15) — o mesmo de sempre, só promovido a ação primária. */
  onAtualizar: (c: Certidao) => void;
  onEditar: (c: Certidao) => void;
  onExcluir: (c: Certidao) => void;
  onVisualizar: (c: Certidao) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-sm border">
      <Table>
        <TableHeader>
          <TableRow>
            {podeGerir && <TableHead className="w-8" />}
            <TableHead>Certidão</TableHead>
            <TableHead>Validade</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className={SO_TABLET}>Responsável</TableHead>
            <TableHead className={SO_LARGO}>Documento</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {certidoes.map((c) => {
            const situacao = statusCertidao(c.validade);
            const validade = textoValidade(c.validade);
            const temArquivo = !!c.arquivoNome;
            const ehPdf = temArquivo && c.arquivoNome!.toLowerCase().endsWith(".pdf");
            const precisaAcao = situacao !== "ok";
            // §14 — falta de responsável só é PENDÊNCIA quando a certidão é obrigatória e já
            // precisa de ação; numa certidão opcional e regular é só um campo em branco.
            const responsavelPendente = !c.responsavelNome && c.obrigatoria && precisaAcao;

            return (
              <TableRow key={c.id}>
                {podeGerir && (
                  <TableCell className="pr-0">
                    <Checkbox
                      checked={selecionadas.has(c.id)}
                      onCheckedChange={() => onAlternarSelecao(c.id)}
                      aria-label={`Selecionar ${c.tipo}`}
                    />
                  </TableCell>
                )}

                {/* §7 — nome + "Obrigatória" + descrição. O nome abre o drawer (§11). */}
                <TableCell className="max-w-72">
                  <button
                    type="button"
                    onClick={() => onAbrirDetalhe(c)}
                    className="block w-full min-w-0 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate font-medium" title={c.tipo}>
                      {c.tipo}
                    </span>
                  </button>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {c.obrigatoria && (
                      <Badge variant="outline" className="font-normal">
                        Obrigatória
                      </Badge>
                    )}
                    {c.descricao && (
                      <span className="truncate text-xs text-muted-foreground" title={c.descricao}>
                        {c.descricao}
                      </span>
                    )}
                  </span>
                </TableCell>

                {/* §6 — relativo em destaque, data absoluta abaixo. */}
                <TableCell className="whitespace-nowrap">
                  <span className={cn("block text-sm font-medium", TOM_TEXTO[validade.tom])}>
                    {validade.texto}
                  </span>
                  <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatarData(c.validade)}
                  </span>
                </TableCell>

                <TableCell>
                  <StatusBadge tone={SITUACAO_TONE[situacao]}>{SITUACAO_LABEL[situacao]}</StatusBadge>
                </TableCell>

                {/* §14 — ausência de responsável vira pendência acionável quando pesa. */}
                <TableCell className={cn(SO_TABLET, "max-w-40")}>
                  {c.responsavelNome ? (
                    <span className="block truncate text-sm">{c.responsavelNome}</span>
                  ) : responsavelPendente && podeGerir ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-1.5 text-xs text-warning"
                      onClick={() => onEditar(c)}
                    >
                      <UserPlus className="size-3.5" aria-hidden />
                      Atribuir
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem responsável</span>
                  )}
                </TableCell>

                {/* §5 — documento é dimensão própria, com rótulo textual (§20, não só cor). */}
                <TableCell className={SO_LARGO}>
                  {temArquivo ? (
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                      <FileText className="size-3.5" aria-hidden />
                      PDF disponível
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-warning">
                      <FileX className="size-3.5" aria-hidden />
                      Sem documento
                    </span>
                  )}
                </TableCell>

                {/* §7 — uma ação primária + "⋮" com o resto. */}
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {podeGerir && precisaAcao && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 whitespace-nowrap px-2 text-xs"
                        onClick={() => onAtualizar(c)}
                      >
                        <Upload className="size-3.5" aria-hidden />
                        Atualizar
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-7 p-0"
                            aria-label={`Mais ações para ${c.tipo}`}
                          >
                            <MoreVertical className="size-4" aria-hidden />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onAbrirDetalhe(c)}>
                          <History className="size-4" aria-hidden />
                          Abrir detalhes e histórico
                        </DropdownMenuItem>
                        {ehPdf && (
                          <DropdownMenuItem onClick={() => onVisualizar(c)}>
                            <Eye className="size-4" aria-hidden />
                            Visualizar documento
                          </DropdownMenuItem>
                        )}
                        {temArquivo && (
                          <DropdownMenuItem
                            onClick={() => window.open(`/api/certidoes/${c.id}/download`, "_blank", "noopener")}
                          >
                            <Download className="size-4" aria-hidden />
                            Baixar documento
                          </DropdownMenuItem>
                        )}
                        {podeGerir && (
                          <DropdownMenuItem onClick={() => onAtualizar(c)}>
                            <Upload className="size-4" aria-hidden />
                            {temArquivo ? "Nova versão" : "Adicionar documento"}
                          </DropdownMenuItem>
                        )}
                        {podeGerir && (
                          <DropdownMenuItem onClick={() => onEditar(c)}>
                            <PenLine className="size-4" aria-hidden />
                            Editar
                          </DropdownMenuItem>
                        )}
                        {podeGerir && (
                          <DropdownMenuItem onClick={() => onExcluir(c)}>
                            <Trash2 className="size-4" aria-hidden />
                            Excluir
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
  );
}
