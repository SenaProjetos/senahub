"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Ruler, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { formatarDataHora } from "@/lib/utils";
import { AVISO_EM_VALIDACAO, MOTIVO_SEM_EDICAO } from "@/modules/estudos/acesso";
import { ACAO_ESTUDO_DUPLICAR, ACAO_ESTUDO_EXCLUIR, MOTIVO_LIMITE_ESTUDOS, hrefDoEstudo, itensDeEstudo } from "@/modules/estudos/acoes";
import { MAX_ESTUDOS_POR_PROJETO } from "@/modules/estudos/conteudo";
import { criarEstudoAction, duplicarEstudoAction, excluirEstudoAction } from "@/modules/estudos/actions";
import { fmtNum } from "@/modules/ferramentas/memoria";
import type { EstudoResumo } from "@/modules/estudos/queries";

type Props = { projetoId: string; estudos: EstudoResumo[]; podeEditar: boolean; emValidacao: boolean };

export function EstudosView({ projetoId, estudos, podeEditar, emValidacao }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();
  const [novoAberto, setNovoAberto] = useState(false);
  const noLimite = estudos.length >= MAX_ESTUDOS_POR_PROJETO;

  async function executar(estudo: EstudoResumo, item: AcaoItemAcao) {
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar,
        variant: item.variant === "destructive" ? "destructive" : "default",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      if (item.id === ACAO_ESTUDO_DUPLICAR) {
        const r = await duplicarEstudoAction({ id: estudo.id });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Estudo duplicado.");
        router.push(hrefDoEstudo(projetoId, r.data.id));
      } else if (item.id === ACAO_ESTUDO_EXCLUIR) {
        const r = await excluirEstudoAction({ id: estudo.id });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Estudo excluído.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">Estudos</h2>
          <p className="text-sm text-muted-foreground">
            Levantamento de cargas elétricas do projeto, por ambiente, calculado pelo mesmo motor da calculadora Corrente e demanda.
          </p>
        </div>
        {podeEditar && (
          <Button type="button" size="sm" disabled={noLimite} title={noLimite ? MOTIVO_LIMITE_ESTUDOS : undefined} onClick={() => setNovoAberto(true)}>
            <Plus aria-hidden className="mr-1.5 size-4" /> Novo estudo
          </Button>
        )}
      </div>
      {podeEditar && noLimite && <p className="text-xs text-muted-foreground">{MOTIVO_LIMITE_ESTUDOS}</p>}

      {emValidacao && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-warning/40 p-3 text-sm text-warning">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Motor em validação.</strong> {AVISO_EM_VALIDACAO} Só quem gere as ferramentas vê esta aba por enquanto.
          </span>
        </p>
      )}
      {!podeEditar && estudos.length > 0 && <p className="text-xs text-muted-foreground">{MOTIVO_SEM_EDICAO}</p>}

      {estudos.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="Nenhum estudo neste projeto"
          description={podeEditar ? "Crie o primeiro para lançar os ambientes e as cargas." : MOTIVO_SEM_EDICAO}
          action={
            podeEditar ? (
              <Button type="button" size="sm" onClick={() => setNovoAberto(true)}>
                <Plus aria-hidden className="mr-1.5 size-4" /> Novo estudo
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2" aria-label="Estudos do projeto">
          {estudos.map((e) => (
            <LinhaEstudo key={e.id} projetoId={projetoId} estudo={e} podeEditar={podeEditar} total={estudos.length} onExecutar={(item) => void executar(e, item)} />
          ))}
        </ul>
      )}

      <NovoEstudoDialog projetoId={projetoId} aberto={novoAberto} onOpenChange={setNovoAberto} />
    </div>
  );
}

function LinhaEstudo({
  projetoId,
  estudo,
  podeEditar,
  total,
  onExecutar,
}: {
  projetoId: string;
  estudo: EstudoResumo;
  podeEditar: boolean;
  total: number;
  onExecutar: (item: AcaoItemAcao) => void;
}) {
  const itens = itensDeEstudo({ projetoId, estudoId: estudo.id, podeEditar, totalEstudos: total });
  return (
    <LinhaComMenu itens={itens} onSelect={onExecutar} render={<li className="group flex items-center gap-2 rounded-lg border bg-card p-3" />}>
      <Link href={hrefDoEstudo(projetoId, estudo.id)} className="min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="block truncate text-sm font-medium">{estudo.nome}</span>
        <span className="block text-xs text-muted-foreground">
          {estudo.cargas == null
            ? "Conteúdo ilegível — abra para ver"
            : `${estudo.ambientes} ambiente(s) · ${estudo.cargas} carga(s)${estudo.demandaKw != null ? ` · demanda ${fmtNum(estudo.demandaKw, 2)} kW` : ""}`}
        </span>
        <span className="block text-xs text-muted-foreground">
          Alterado por {estudo.atualizadoPor} em {formatarDataHora(estudo.atualizadoEm)}
        </span>
      </Link>
      <BotaoAcoes itens={itens} onSelect={onExecutar} rotulo={`Ações do estudo ${estudo.nome}`} className="size-8" />
    </LinhaComMenu>
  );
}

function NovoEstudoDialog({ projetoId, aberto, onOpenChange }: { projetoId: string; aberto: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [nome, setNome] = useState("");

  function criar(ev: React.FormEvent) {
    ev.preventDefault();
    startTransition(async () => {
      const r = await criarEstudoAction({ projetoId, nome });
      if (!r.ok) return void toast.error(r.error);
      onOpenChange(false);
      setNome("");
      router.push(hrefDoEstudo(projetoId, r.data.id));
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={criar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Novo estudo</DialogTitle>
            <DialogDescription>Dê um nome ao levantamento (ex.: Edificação principal, Casa de apoio). Os ambientes e as cargas entram na próxima tela.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="novo-estudo-nome">Nome do estudo</Label>
            <Input id="novo-estudo-nome" value={nome} maxLength={120} autoFocus onChange={(e) => setNome(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente || nome.trim() === ""}>
              Criar estudo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
