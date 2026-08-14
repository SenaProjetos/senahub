"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  Eye,
  GitCompare,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";
import {
  renomearUpload,
  excluirUpload,
  validarArquivo,
  reverterValidacaoArquivo,
  solicitarAjusteArquivo,
  solicitarExclusaoUpload,
} from "@/modules/uploads/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { LinhaDocumento } from "@/modules/uploads/lista-documentos";

type Formulario = "renomear" | "ajuste" | "solicitar-exclusao" | null;

/**
 * Menu "..." por linha da tabela de documentos (F1-PR5, item 10 da spec).
 *
 * Só reúne ações que JÁ existem como Server Action/rota — nada novo é implementado aqui.
 * As ações da spec que dependem de schema novo ("Alterar status", "Adicionar a lista",
 * "Histórico de revisões" como painel próprio) chegam na Fase 2 e por isso NÃO aparecem
 * nem desabilitadas: item invisível é mais honesto que item morto.
 *
 * Permissões: cada item é escondido quando o usuário não pode executá-lo (requisito do
 * prompt da Fase 1). Os gates aqui são só de UI — o gate real continua no `defineAction`
 * de cada action, que roda no servidor de qualquer jeito.
 */
export function MenuDocumento({
  projetoId,
  linha,
  podeValidar,
  podeExcluir,
  podeSolicitarExclusao,
}: {
  projetoId: string;
  linha: LinhaDocumento;
  podeValidar: boolean;
  podeExcluir: boolean;
  podeSolicitarExclusao: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, start] = useTransition();
  const [form, setForm] = useState<Formulario>(null);
  const [novoNome, setNovoNome] = useState(linha.nome);
  const [texto, setTexto] = useState("");

  const ehPdf = linha.ext === "pdf";
  // Validação por-arquivo só existe em arquivo de pacote (`validado` null = PastaProjeto).
  const temValidacao = linha.validado !== null;

  function fechar() {
    setForm(null);
    setTexto("");
  }

  function executar(fn: () => Promise<{ ok: boolean; error?: string }>, sucesso: string) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(sucesso);
        fechar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  async function confirmarExclusao() {
    const ok = await confirm({
      title: "Enviar para a lixeira?",
      description: `"${linha.nome}" sai da árvore do projeto e pode ser restaurado enquanto estiver na lixeira.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    executar(() => excluirUpload({ uploadId: linha.id }), "Arquivo enviado para a lixeira.");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Ações de ${linha.nome}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          {ehPdf && (
            <DropdownMenuItem
              render={
                <Link
                  href={`/projetos/${projetoId}/arquivos/${linha.id}/visualizar`}
                  target="_blank"
                  rel="noopener"
                />
              }
            >
              <Eye /> Visualizar
            </DropdownMenuItem>
          )}
          {ehPdf && linha.versao > 1 && (
            <DropdownMenuItem
              render={<Link href={`/projetos/${projetoId}/arquivos/${linha.id}/comparar`} />}
            >
              <GitCompare /> Comparar revisões
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<a href={linha.downloadUrl} />}>
            <Download /> Baixar
          </DropdownMenuItem>

          {podeValidar && temValidacao && (
            <>
              <DropdownMenuSeparator />
              {linha.validado ? (
                <DropdownMenuItem
                  disabled={pendente}
                  onClick={() =>
                    executar(
                      () => reverterValidacaoArquivo({ uploadId: linha.id }),
                      "Validação desfeita.",
                    )
                  }
                >
                  <Undo2 /> Desfazer validação
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    disabled={pendente}
                    onClick={() =>
                      executar(() => validarArquivo({ uploadId: linha.id }), "Arquivo validado.")
                    }
                  >
                    <ShieldCheck /> Validar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setForm("ajuste")}>
                    <XCircle /> Solicitar ajuste
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}

          {linha.podeGerir && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setNovoNome(linha.nome);
                  setForm("renomear");
                }}
              >
                <Pencil /> Renomear
              </DropdownMenuItem>
            </>
          )}

          {podeExcluir && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={confirmarExclusao} disabled={pendente}>
                <Trash2 /> Excluir
              </DropdownMenuItem>
            </>
          )}
          {!podeExcluir && podeSolicitarExclusao && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setForm("solicitar-exclusao")}>
                <Trash2 /> Solicitar exclusão
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={form === "renomear"} onOpenChange={(v) => !v && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear documento</DialogTitle>
            <DialogDescription className="truncate">{linha.nome}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`nome-${linha.id}`}>Novo nome</Label>
            <Input
              id={`nome-${linha.id}`}
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              maxLength={255}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Muda apenas o nome exibido — o arquivo enviado e a revisão continuam os mesmos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                executar(
                  () => renomearUpload({ uploadId: linha.id, nome: novoNome.trim() }),
                  "Documento renomeado.",
                )
              }
              disabled={pendente || !novoNome.trim() || novoNome.trim() === linha.nome}
            >
              Renomear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={form === "ajuste"} onOpenChange={(v) => !v && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar ajuste</DialogTitle>
            <DialogDescription className="truncate">{linha.nome}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`ajuste-${linha.id}`}>Motivo do ajuste</Label>
            <Input
              id={`ajuste-${linha.id}`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: prancha sem selo / cota errada na planta baixa"
              maxLength={500}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              O projetista será notificado e poderá reenviar apenas este arquivo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                executar(
                  () => solicitarAjusteArquivo({ uploadId: linha.id, motivo: texto.trim() }),
                  "Ajuste solicitado.",
                )
              }
              disabled={pendente || !texto.trim()}
            >
              Solicitar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={form === "solicitar-exclusao"} onOpenChange={(v) => !v && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar exclusão</DialogTitle>
            <DialogDescription className="truncate">{linha.nome}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`exclusao-${linha.id}`}>Justificativa</Label>
            <Input
              id={`exclusao-${linha.id}`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Por que este arquivo deve ser excluído?"
              maxLength={1000}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              O arquivo continua disponível até um administrador aprovar o pedido em Aprovações.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                executar(
                  () => solicitarExclusaoUpload({ uploadId: linha.id, justificativa: texto.trim() }),
                  "Pedido de exclusão enviado.",
                )
              }
              disabled={pendente || texto.trim().length < 10}
            >
              Solicitar exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
