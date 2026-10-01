"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, Wallet, Users } from "lucide-react";
import { criarSocio, removerSocio, removerRetiradaSocio } from "@/modules/financeiro/cadastros/actions";
import { brl, formatarData } from "@/lib/utils";
import { RetiradaDialog, type TipoRetirada } from "./retirada-dialog";
import { percentualParaBp } from "@/modules/financeiro/socios/calculo";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { InputPercentual } from "@/components/ui/input-percentual";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Retirada = { id: string; data: string; valor: number; tipo: string; observacao: string | null };
type Socio = { id: string; nome: string; ativo: boolean; percentual: number; retiradas: Retirada[] };
type Usuario = { id: string; name: string };

const TIPO_RET: Record<string, string> = { pro_labore: "Pró-labore", distribuicao: "Distribuição", adiantamento: "Adiantamento" };

export function SociosSection({ socios, usuarios, hoje }: { socios: Socio[]; usuarios: Usuario[]; hoje: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [retirada, setRetirada] = useState<TipoRetirada | null>(null);
  const [userId, setUserId] = useState("");
  const [percentual, setPercentual] = useState<number | null>(null);

  // Participação só conta sócios ativos (inativos ficam visíveis pelo histórico de retiradas).
  const total = socios.filter((x) => x.ativo).reduce((s, x) => s + x.percentual, 0);

  function adicionar() {
    if (!userId || percentual === null) {
      toast.error("Selecione o sócio e o percentual.");
      return;
    }
    start(async () => {
      const r = await criarSocio({ userId, percentual });
      if (r.ok) {
        toast.success("Sócio adicionado.");
        setUserId("");
        setPercentual(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function remover(id: string) {
    start(async () => {
      const r = await removerSocio({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-sm border">
        {socios.length === 0 ? (
          <li><EmptyState icon={Users} title="Nenhum sócio." /></li>
        ) : (
          socios.map((s) => <SocioRow key={s.id} s={s} onRemover={remover} />)
        )}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${total !== 100 ? "text-destructive" : "text-muted-foreground"}`}>
          Participação total: {total.toFixed(2)}%
          {total !== 100 && socios.some((s) => s.ativo) ? " — a distribuição de lucros exige 100%." : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setRetirada("distribuicao")} disabled={!socios.some((s) => s.ativo)}>
            Distribuir lucros
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRetirada("adiantamento")} disabled={!socios.some((s) => s.ativo)}>
            Adiantar lucros
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        As duas criam contas a pagar por sócio, fora do resultado. Pró-labore é outra coisa: é despesa, e se cadastra em
        Compromissos recorrentes.
      </p>

      <RetiradaDialog
        aberto={retirada !== null}
        tipo={retirada ?? "distribuicao"}
        socios={socios.filter((s) => s.ativo).map((s) => ({ id: s.id, nome: s.nome, percentualBp: percentualParaBp(s.percentual) }))}
        hoje={hoje}
        onFechar={() => setRetirada(null)}
      />

      <div className="flex flex-wrap items-end gap-2 rounded-sm border border-dashed p-3">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Sócio</Label>
          <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-28 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Participação</Label>
          <InputPercentual value={percentual} onChange={setPercentual} />
        </div>
        <Button onClick={adicionar} disabled={pending}>
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>
    </div>
  );
}

/**
 * A lista de retiradas é só HISTÓRICO (F6D): o registro antigo não virava lançamento, então não
 * entrava no caixa nem na DRE. Retirada nova sai pelos botões de lucros (conta a pagar por sócio) ou
 * por Compromissos recorrentes, no caso do pró-labore. Remover segue aqui para corrigir o histórico.
 */
function SocioRow({ s, onRemover }: { s: Socio; onRemover: (id: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const totalRet = s.retiradas.reduce((a, r) => a + r.valor, 0);

  function rmRetirada(id: string) {
    start(async () => {
      const r = await removerRetiradaSocio({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <li className="p-3">
      <div className="flex items-center justify-between gap-2">
        <button className="inline-flex items-center gap-1.5 text-left" onClick={() => setAberto(!aberto)}>
          <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
          <span className="text-sm font-medium">{s.nome}</span>
          {!s.ativo && (
            <span className="rounded-sm border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              Inativo
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Wallet className="size-3" /> {s.retiradas.length} · {brl(totalRet)}
          </span>
        </button>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm">{s.percentual.toFixed(2)}%</span>
          <Button size="icon" variant="ghost" onClick={() => onRemover(s.id)} aria-label="Remover">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {aberto && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <p className="text-xs text-muted-foreground">
            Histórico de retiradas anteriores aos lançamentos — estes registros não entram no caixa nem na DRE.
          </p>
          {s.retiradas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma retirada no histórico.</p>
          ) : (
            <ul className="divide-y text-xs">
              {s.retiradas.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-muted-foreground">
                    {formatarData(r.data)} · {TIPO_RET[r.tipo] ?? r.tipo}
                    {r.observacao ? ` · ${r.observacao}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{brl(r.valor)}</span>
                    <button
                      onClick={() => rmRetirada(r.id)}
                      disabled={pending}
                      aria-label="Remover retirada do histórico"
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
