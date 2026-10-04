"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  MoreHorizontal,
  Archive,
  XCircle,
  RefreshCw,
  Copy,
  FileText,
  MessageSquare,
  Pencil,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cancelarOuArquivarProjeto } from "@/modules/projetos/actions";
import { DuplicarProjetoButton } from "@/components/projetos/duplicar-projeto-button";
import { EditarProjetoDialog, type ProjetoEditavel } from "@/components/projetos/editar-projeto-dialog";
import { useConcluirProjeto } from "@/components/projetos/concluir-projeto";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * O ⋯ do cabeçalho do projeto. No computador: Duplicar, Gerar documento e o ciclo de vida
 * (Chat e Editar ficam como ícones ao lado). No celular (`celular`), ao lado das abas, leva também
 * Chat e Editar — o cabeçalho do projeto não aparece nessa largura.
 */
export function ProjetoAcoesMenu({
  projetoId,
  situacao,
  podeGerir,
  modelosDoc,
  motivoNaoConcluir,
  celular = false,
  canalChatId,
  editar,
}: {
  projetoId: string;
  situacao: string;
  podeGerir: boolean;
  modelosDoc: { id: string; nome: string }[];
  /** `null` = pode concluir (todas as disciplinas aprovadas); senão, o motivo do item desabilitado. */
  motivoNaoConcluir: string | null;
  celular?: boolean;
  canalChatId?: string | null;
  editar?: {
    projeto: ProjetoEditavel;
    clientes: { id: string; nome: string }[];
    tiposEmpreendimento: { id: string; nome: string }[];
  } | null;
}) {
  const [dialog, setDialog] = useState<"cancelar" | "arquivar" | null>(null);
  const [duplicar, setDuplicar] = useState(false);
  const [editarAberto, setEditarAberto] = useState(false);
  // remonta a janela de edição a cada abertura para recarregar os valores atuais do projeto
  const [chaveEditar, setChaveEditar] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  const ativo = situacao === "em_andamento";
  const confirm = useConfirm();
  const { concluir, pending: concluindo } = useConcluirProjeto(projetoId);

  const handleConcluir = async () => {
    // confirm SEMPRE antes da transição (await dentro de startTransition trava no React 19).
    const ok = await confirm({
      title: "Concluir projeto?",
      description: "Todas as disciplinas estão aprovadas. O projeto sai da lista de ativos; dá para reativá-lo depois pelo mesmo menu.",
      confirmLabel: "Concluir projeto",
    });
    if (ok) concluir();
  };

  const handleConfirm = () => {
    if (!dialog) return;
    startTransition(async () => {
      const res = await cancelarOuArquivarProjeto({
        projetoId,
        situacao: dialog === "cancelar" ? "cancelado" : "arquivado",
        motivo: motivo || undefined,
      });
      if (!res?.ok) {
        toast.error(res?.ok === false ? res.error : "Erro ao atualizar projeto.");
      } else {
        toast.success(dialog === "cancelar" ? "Projeto cancelado." : "Projeto arquivado.");
        setDialog(null);
        setMotivo("");
      }
    });
  };

  const handleReativar = () => {
    startTransition(async () => {
      const res = await cancelarOuArquivarProjeto({ projetoId, situacao: "em_andamento" });
      if (!res?.ok) {
        toast.error(res?.ok === false ? res.error : "Erro ao reativar.");
      } else {
        toast.success("Projeto reativado.");
      }
    });
  };

  const temChat = celular && !!canalChatId;
  const temEditar = celular && !!editar;
  const temDocs = modelosDoc.length > 0;
  if (!podeGerir && !temDocs && !temChat && !temEditar) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" className="size-8" aria-label="Mais ações">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {temChat && (
            <DropdownMenuItem className="gap-2" render={<Link href={`/chat?c=${canalChatId}`} />}>
              <MessageSquare className="size-4" /> Chat do projeto
            </DropdownMenuItem>
          )}
          {temEditar && (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => {
                setChaveEditar((k) => k + 1);
                setEditarAberto(true);
              }}
            >
              <Pencil className="size-4" /> Editar projeto
            </DropdownMenuItem>
          )}
          {podeGerir && (
            <DropdownMenuItem className="gap-2" onClick={() => setDuplicar(true)}>
              <Copy className="size-4" /> Duplicar projeto
            </DropdownMenuItem>
          )}
          {temDocs && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <FileText className="size-4" /> Gerar documento
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {modelosDoc.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    render={<Link href={`/documentos/${m.id}/preview?projetoId=${encodeURIComponent(projetoId)}`} />}
                  >
                    {m.nome}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {podeGerir && <DropdownMenuSeparator />}
          {!podeGerir ? null : ativo ? (
            <>
              <DropdownMenuItem
                onClick={handleConcluir}
                className="gap-2"
                disabled={motivoNaoConcluir !== null || concluindo}
              >
                <CheckCircle2 className="size-4" />
                <span className="flex flex-col">
                  Concluir projeto
                  {motivoNaoConcluir && (
                    <span className="text-xs text-muted-foreground">{motivoNaoConcluir}</span>
                  )}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("arquivar")} className="gap-2">
                <Archive className="size-4" /> Arquivar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDialog("cancelar")}
                className="gap-2 text-destructive"
              >
                <XCircle className="size-4" /> Cancelar projeto
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onClick={handleReativar} className="gap-2" disabled={pending}>
              <RefreshCw className="size-4" /> Reativar projeto
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {podeGerir && <DuplicarProjetoButton projetoId={projetoId} semBotao aberto={duplicar} onAbertoChange={setDuplicar} />}
      {temEditar && editar && (
        <EditarProjetoDialog
          key={chaveEditar}
          projeto={editar.projeto}
          clientes={editar.clientes}
          tiposEmpreendimento={editar.tiposEmpreendimento}
          gatilho="nenhum"
          aberto={editarAberto}
          onAbertoChange={setEditarAberto}
        />
      )}

      <Dialog open={dialog !== null} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>
            {dialog === "cancelar" ? "Cancelar projeto" : "Arquivar projeto"}
          </DialogTitle>
          <DialogDescription>
            {dialog === "cancelar"
              ? "O projeto será marcado como cancelado e os membros serão notificados."
              : "O projeto será arquivado e removido do painel ativo."}
          </DialogDescription>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="motivo-proj">Motivo (opcional)</Label>
              <textarea
                id="motivo-proj"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Informe o motivo..."
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant={dialog === "cancelar" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={pending}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
