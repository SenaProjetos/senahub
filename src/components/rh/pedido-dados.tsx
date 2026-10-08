"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardEdit, Send } from "lucide-react";
import {
  cancelarPedidoDados,
  pedirAtualizacaoDados,
  pedirAtualizacaoEmLote,
  pedirReconfirmacaoEmLote,
  reenviarLembretePedido,
} from "@/modules/rh/cadastro/pedido-actions";
import { itensDoPedidoDados } from "@/modules/rh/cadastro/acoes-pedido";
import { MOTIVO_NADA_A_PEDIR } from "@/modules/rh/cadastro/preencher";
import type { PedidoDadosLinha, PedidoDaPessoa } from "@/modules/rh/cadastro/queries";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dataCurta } from "@/lib/dias-iso";
import { formatarData } from "@/lib/utils";

const STATUS_LABEL = { aberto: "Aberto", atendido: "Atendido", cancelado: "Cancelado" } as const;

/** Prazo + mensagem opcionais — o mesmo diálogo para uma pessoa ou para o lote. */
function DialogoPedido({
  aberto,
  titulo,
  descricao,
  pending,
  onClose,
  onEnviar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  pending: boolean;
  onClose: () => void;
  onEnviar: (dados: { prazo: string | null; mensagem: string | null }) => void;
}) {
  const [prazo, setPrazo] = useState("");
  const [mensagem, setMensagem] = useState("");
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pedido-prazo">Prazo (opcional)</Label>
            <Input id="pedido-prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            <p className="text-xs text-muted-foreground">Depois do prazo a faixa fica em destaque. O sistema nunca bloqueia o acesso.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pedido-mensagem">Mensagem (opcional)</Label>
            <textarea
              id="pedido-mensagem"
              rows={2}
              maxLength={300}
              value={mensagem}
              placeholder="Ex.: precisamos para o cadastro no eSocial."
              onChange={(e) => setMensagem(e.target.value)}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending} onClick={() => onEnviar({ prazo: prazo || null, mensagem: mensagem.trim() || null })}>
            <Send className="size-3.5" /> Enviar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useAcoesPedido() {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  async function executar(id: string, acao: AcaoItemAcao) {
    if (acao.confirmar) {
      const ok = await confirm({
        title: acao.confirmar.titulo,
        description: acao.confirmar.descricao,
        confirmLabel: acao.confirmar.rotuloConfirmar,
        variant: "destructive",
      });
      if (!ok) return;
    }
    start(async () => {
      const r = acao.id === "lembrar" ? await reenviarLembretePedido({ id }) : acao.id === "cancelar" ? await cancelarPedidoDados({ id }) : null;
      if (!r) return;
      if (r.ok) {
        toast.success(acao.id === "lembrar" ? "Lembrete enviado." : "Pedido cancelado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  return { executar, pending, start, router };
}

/** Cartão na aba Cadastro da ficha: o que falta, o pedido aberto e "Pedir atualização". */
export function PedidoDadosFicha({ userId, pedido }: { userId: string; pedido: NonNullable<PedidoDaPessoa> }) {
  const { executar, pending, start, router } = useAcoesPedido();
  const [dialogo, setDialogo] = useState(false);
  const acoes = pedido.aberto ? itensDoPedidoDados({ status: "aberto", userId }, { hrefFicha: false }) : [];
  const podePedir = pedido.faltam > 0;

  function enviar(dados: { prazo: string | null; mensagem: string | null }) {
    start(async () => {
      const r = await pedirAtualizacaoDados({ userId, ...dados });
      if (r.ok) {
        toast.success("Pedido enviado. A pessoa verá a faixa no topo.");
        setDialogo(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-sm border px-3 py-2.5 text-sm">
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">
          {pedido.aberto
            ? `Pedido de atualização aberto desde ${formatarData(pedido.aberto.criadoEm)}${pedido.aberto.prazo ? ` · prazo ${dataCurta(pedido.aberto.prazo)}` : ""}`
            : pedido.faltam > 0
              ? "A pessoa pode completar o próprio cadastro"
              : "Nada para a pessoa preencher"}
        </p>
        {pedido.faltam > 0 && (
          <p className="text-muted-foreground">
            Falta: {[...pedido.campos, ...(pedido.contaBancaria === "falta" ? ["Conta bancária"] : [])].join(", ")}.
          </p>
        )}
        {pedido.aguardandoRh.length > 0 && <p className="text-muted-foreground">Preenchido, aguardando sua validação: {pedido.aguardandoRh.join(", ")}.</p>}
        {pedido.soRh.length > 0 && <p className="text-muted-foreground">Só o RH completa: {pedido.soRh.join(", ")}.</p>}
      </div>
      {pedido.aberto ? (
        <BotaoAcoes itens={acoes} onSelect={(a) => executar(pedido.aberto!.id, a)} rotulo="Ações do pedido de atualização" className="size-8" />
      ) : (
        <Button size="sm" variant="outline" disabled={!podePedir || pending} title={podePedir ? undefined : MOTIVO_NADA_A_PEDIR} onClick={() => setDialogo(true)}>
          <ClipboardEdit className="size-3.5" /> Pedir atualização
        </Button>
      )}
      <DialogoPedido
        aberto={dialogo}
        titulo="Pedir atualização de dados"
        descricao="A pessoa verá uma faixa no topo e recebe um aviso. Só os campos vazios que ela mesma pode preencher entram."
        pending={pending}
        onClose={() => setDialogo(false)}
        onEnviar={enviar}
      />
    </div>
  );
}

/** Em /rh/pessoas: pedidos abertos e recentes, com "Pedir a quem tem cadastro incompleto". */
export function PedidosDadosAdmin({ pedidos }: { pedidos: PedidoDadosLinha[] }) {
  const { executar, pending, start, router } = useAcoesPedido();
  const [dialogo, setDialogo] = useState(false);
  const [dialogoReconf, setDialogoReconf] = useState(false);
  const abertos = pedidos.filter((p) => p.status === "aberto").length;

  function enviarReconfirmacao(dados: { prazo: string | null; mensagem: string | null }) {
    start(async () => {
      const r = await pedirReconfirmacaoEmLote(dados);
      if (r.ok) {
        toast.success(r.data.pedidos === 0 ? "Todos já têm pedido aberto." : `${r.data.pedidos} pedido(s) de conferência enviado(s).`);
        setDialogoReconf(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function enviarLote(dados: { prazo: string | null; mensagem: string | null }) {
    start(async () => {
      const r = await pedirAtualizacaoEmLote(dados);
      if (r.ok) {
        toast.success(r.data.pedidos === 0 ? "Ninguém tinha o que preencher sem pedido aberto." : `${r.data.pedidos} pedido(s) enviado(s).`);
        setDialogo(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function linha(p: PedidoDadosLinha) {
    const acoes = itensDoPedidoDados(p, { hrefFicha: true });
    return (
      <LinhaComMenu
        key={p.id}
        itens={acoes}
        onSelect={(a) => executar(p.id, a)}
        render={<li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40 data-[popup-open]:bg-muted/30" />}
      >
        <div className="min-w-0 text-sm">
          <p className="font-medium">{p.nome}</p>
          <p className="text-xs text-muted-foreground">
            {p.tipo === "reconfirmar" ? "Conferência" : "Completar"} · {STATUS_LABEL[p.status]} · pedido em {formatarData(p.criadoEm)} por {p.solicitadoPor}
            {p.prazo && ` · prazo ${dataCurta(p.prazo)}`}
            {p.status === "aberto" && p.tipo === "completar" && ` · ${p.faltam === 1 ? "falta 1 campo" : `faltam ${p.faltam} campos`}`}
            {p.aguardandoRh.length > 0 && ` · aguardando você: ${p.aguardandoRh.join(", ")}`}
            {p.atendidoEm && ` · atendido em ${formatarData(p.atendidoEm)}`}
          </p>
        </div>
        <BotaoAcoes itens={acoes} onSelect={(a) => executar(p.id, a)} rotulo={`Ações do pedido de ${p.nome}`} />
      </LinhaComMenu>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Pedidos de atualização de dados</CardTitle>
          <CardDescription>
            {abertos > 0 ? `${abertos} aberto(s).` : "Nenhum aberto."} Cada pessoa vê uma faixa no topo até completar.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialogo(true)}>
            <Send className="size-3.5" /> Pedir a quem tem cadastro incompleto
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialogoReconf(true)}>
            <Send className="size-3.5" /> Pedir a todos que confiram os dados
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pedidos.length === 0 ? (
          <EmptyState icon={ClipboardEdit} title="Nenhum pedido nos últimos 30 dias" />
        ) : (
          <ul className="divide-y rounded-sm border">{pedidos.map(linha)}</ul>
        )}
      </CardContent>
      <DialogoPedido
        aberto={dialogo}
        titulo="Pedir a todos com cadastro incompleto"
        descricao="Vai para quem tem algo que ele mesmo pode preencher e ainda não tem pedido aberto. Quem só depende do RH (cargo, salário…) fica de fora."
        pending={pending}
        onClose={() => setDialogo(false)}
        onEnviar={enviarLote}
      />
      <DialogoPedido
        aberto={dialogoReconf}
        titulo="Pedir a todos que confiram os dados"
        descricao="Cada pessoa sem pedido aberto vê a faixa até clicar em Está tudo certo (ou corrigir). Depois desta rodada, o sistema pede de novo sozinho a cada 12 meses."
        pending={pending}
        onClose={() => setDialogoReconf(false)}
        onEnviar={enviarReconfirmacao}
      />
    </Card>
  );
}
