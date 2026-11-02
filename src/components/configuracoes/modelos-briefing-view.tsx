"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Plus } from "lucide-react";
import {
  arquivarModeloBriefing,
  criarModeloBriefing,
  definirModeloPadraoBriefing,
} from "@/modules/inputs/modelo-actions";
import { itensDoModelo } from "@/modules/inputs/acoes-modelo";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatarData } from "@/lib/utils";

type Modelo = {
  id: string;
  nome: string;
  descricao: string | null;
  padrao: boolean;
  ativo: boolean;
  secoes: number;
  perguntas: number;
  projetos: number;
  atualizadoEm: string;
};

const EM_BRANCO = "__em_branco";

/** Lista dos modelos de formulário do briefing (Configurações → Inputs → Modelos). */
export function ModelosBriefingView({ modelos }: { modelos: Modelo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novo, setNovo] = useState<{ nome: string; descricao: string; copiarDeId: string } | null>(null);

  function rodar(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(ok);
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });
  }

  function aoSelecionar(m: Modelo, acao: AcaoItemAcao) {
    if (acao.id === "duplicar") setNovo({ nome: `${m.nome} (cópia)`, descricao: m.descricao ?? "", copiarDeId: m.id });
    else if (acao.id === "padrao") rodar(() => definirModeloPadraoBriefing({ id: m.id }), "Modelo padrão alterado.");
    else if (acao.id === "arquivar") rodar(() => arquivarModeloBriefing({ id: m.id, arquivar: true }), "Modelo arquivado.");
    else if (acao.id === "restaurar") rodar(() => arquivarModeloBriefing({ id: m.id, arquivar: false }), "Modelo restaurado.");
  }

  function criar() {
    if (!novo) return;
    start(async () => {
      const r = await criarModeloBriefing({
        nome: novo.nome,
        descricao: novo.descricao,
        copiarDeId: novo.copiarDeId === EM_BRANCO ? undefined : novo.copiarDeId,
      });
      if (r.ok) {
        setNovo(null);
        router.push(`/configuracoes/inputs/modelos/${r.data.id}`);
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Modelos de formulário"
        descricao="Formulários de briefing do cliente: cada projeto usa um modelo, o padrão ou o que a equipe escolher."
        acoes={
          <Button size="sm" onClick={() => setNovo({ nome: "", descricao: "", copiarDeId: EM_BRANCO })}>
            <Plus className="size-3.5" /> Novo modelo
          </Button>
        }
      />
      <p className="text-xs text-muted-foreground">
        As perguntas avulsas por disciplina continuam em{" "}
        <Link href="/configuracoes/inputs" className="underline underline-offset-2">
          Inputs padrão
        </Link>
        .
      </p>

      {modelos.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum modelo cadastrado"
          description="Rode o seed (npm run db:seed) para criar o modelo padrão ou crie um modelo novo."
        />
      ) : (
        <ul className="space-y-2">
          {modelos.map((m) => {
            const itens = itensDoModelo(m, true);
            return (
              <LinhaComMenu
                key={m.id}
                itens={itens}
                onSelect={(a) => aoSelecionar(m, a)}
                render={<li className="flex items-start justify-between gap-3 rounded-sm border bg-card p-3 data-[popup-open]:bg-muted/30" />}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/configuracoes/inputs/modelos/${m.id}`}
                      className="truncate text-sm font-semibold underline-offset-2 hover:underline"
                    >
                      {m.nome}
                    </Link>
                    {m.padrao && <Badge>Padrão</Badge>}
                    {!m.ativo && <Badge variant="outline">Arquivado</Badge>}
                  </div>
                  {m.descricao && <p className="text-xs text-muted-foreground">{m.descricao}</p>}
                  <p className="text-xs text-muted-foreground">
                    {m.secoes} seção(ões) · {m.perguntas} pergunta(s) · {m.projetos} briefing(s) usando · editado em{" "}
                    {formatarData(m.atualizadoEm)}
                  </p>
                </div>
                <BotaoAcoes itens={itens} onSelect={(a) => aoSelecionar(m, a)} rotulo={`Ações do modelo ${m.nome}`} />
              </LinhaComMenu>
            );
          })}
        </ul>
      )}

      <Dialog open={novo !== null} onOpenChange={(o) => !o && setNovo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo modelo de formulário</DialogTitle>
            <DialogDescription>
              Comece em branco ou a partir de um modelo existente (as perguntas copiadas compartilham as respostas).
            </DialogDescription>
          </DialogHeader>
          {novo && (
            <DialogBody className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="modelo-nome">Nome</Label>
                <Input
                  id="modelo-nome"
                  value={novo.nome}
                  maxLength={80}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  placeholder="Ex.: Incorporadora, Pessoa física"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modelo-descricao">Descrição (opcional)</Label>
                <Input
                  id="modelo-descricao"
                  value={novo.descricao}
                  maxLength={400}
                  onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modelo-origem">Começar de</Label>
                <Select value={novo.copiarDeId} onValueChange={(v) => setNovo({ ...novo, copiarDeId: v ?? EM_BRANCO })}>
                  <SelectTrigger id="modelo-origem" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EM_BRANCO}>Em branco</SelectItem>
                    {modelos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNovo(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={pending || !novo?.nome.trim()}>
              Criar e editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
