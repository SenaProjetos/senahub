"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Star, Trash2 } from "lucide-react";
import {
  salvarAtribuicao,
  removerAtribuicao,
  definirPrincipal,
} from "@/modules/planejamento/recursos-actions";
import {
  linhaAceitaAtribuicao,
  linhaAceitaHoras,
  ROTULO_PAPEL,
  type Papel,
  type TipoLinha,
} from "@/modules/planejamento/recursos";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";

const PAPEIS = Object.keys(ROTULO_PAPEL) as Papel[];
const PERFIL = "__perfil";

export type AtribuicaoEditavel = {
  id: string;
  userId: string | null;
  nome: string | null;
  image: string | null;
  papel: Papel;
  horas: number;
  principal: boolean;
};

export type LinhaParaAtribuicoes = {
  id: string;
  tipoEap: TipoLinha;
  ehResumo: boolean;
  duracaoDias: number;
  deTerceiro: boolean;
  trabalhoHoras: number | null;
  atribuicoes: AtribuicaoEditavel[];
};

/**
 * Recursos na linha (F5 — D17, D22, D23, D41): pessoa ou perfil, papel, horas, principal.
 *
 * Espelha `linhaAceitaAtribuicao`/`linhaAceitaHoras` de `recursos.ts` (regra pura, mesma
 * usada pelo servidor) — a tela nunca oferece o que o servidor recusaria, e a mensagem é
 * literalmente a mesma (ADR-0002).
 */
export function EapAtribuicoes({
  linha,
  pessoas,
}: {
  linha: LinhaParaAtribuicoes;
  pessoas: { id: string; name: string; image: string | null }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [novaPessoa, setNovaPessoa] = useState(PERFIL);
  const [novoPapel, setNovoPapel] = useState<Papel>("pro");

  const aceita = linhaAceitaAtribuicao(linha);
  const aceitaHoras = linhaAceitaHoras(linha);
  const jaAtribuidos = new Set(linha.atribuicoes.map((a) => a.userId).filter((u): u is string => u != null));

  function adicionar() {
    start(async () => {
      const r = await salvarAtribuicao({
        tarefaId: linha.id,
        userId: novaPessoa === PERFIL ? null : novaPessoa,
        papel: novoPapel,
        horasPrevistas: 0,
      });
      if (r.ok) {
        setNovaPessoa(PERFIL);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function remover(a: AtribuicaoEditavel) {
    const ok = await confirm({
      title: `Remover ${a.nome ?? "este perfil"} da linha?`,
      description: a.principal ? "Era o principal — outra atribuição assume, se houver." : undefined,
      confirmLabel: "Remover",
    });
    if (!ok) return;
    start(async () => {
      const r = await removerAtribuicao({ id: a.id });
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  function tornarPrincipal(a: AtribuicaoEditavel) {
    start(async () => {
      const r = await definirPrincipal({ id: a.id });
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  function salvarCampo(a: AtribuicaoEditavel, patch: Partial<Pick<AtribuicaoEditavel, "papel" | "horas">>) {
    start(async () => {
      const r = await salvarAtribuicao({
        id: a.id,
        tarefaId: linha.id,
        userId: a.userId,
        papel: patch.papel ?? a.papel,
        horasPrevistas: patch.horas ?? a.horas,
      });
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  // Resumo com gente ainda atribuída (atribuicao_em_resumo): mostra só-leitura + remover,
  // pra dar um jeito de limpar sem reabrir outra tela.
  if (linha.ehResumo) {
    if (linha.atribuicoes.length === 0) {
      return <p className="text-xs text-muted-foreground">{aceita.ok ? "" : (aceita as { motivo: string }).motivo}</p>;
    }
    return (
      <div className="space-y-2">
        <p className="text-xs text-warning">
          Linha de agrupamento com pessoas atribuídas — as horas delas não contam em lugar nenhum.
        </p>
        <ul className="divide-y rounded-sm border">
          {linha.atribuicoes.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <span className="flex items-center gap-2 text-sm">
                {a.userId ? <AvatarUsuario nome={a.nome ?? ""} image={a.image} size="sm" className="size-5 shrink-0" /> : null}
                {a.nome ?? `(perfil) ${ROTULO_PAPEL[a.papel]}`}
              </span>
              <Button size="icon-sm" variant="ghost" aria-label="Remover" disabled={pending} onClick={() => remover(a)}>
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!aceita.ok) {
    return <p className="text-xs text-muted-foreground">{aceita.motivo}</p>;
  }

  const livres = pessoas.filter((p) => !jaAtribuidos.has(p.id));

  return (
    <div className="space-y-2">
      {linha.atribuicoes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem ninguém nesta linha ainda.</p>
      ) : (
        <ul className="divide-y rounded-sm border">
          {linha.atribuicoes.map((a) => (
            <LinhaAtribuicao
              key={`${a.id}:${a.horas}`}
              atribuicao={a}
              podeHoras={aceitaHoras}
              pending={pending}
              onSalvarCampo={(patch) => salvarCampo(a, patch)}
              onTornarPrincipal={() => tornarPrincipal(a)}
              onRemover={() => remover(a)}
            />
          ))}
        </ul>
      )}

      {!aceitaHoras && (
        <p className="text-[11px] text-muted-foreground">Marco não tem horas — ele não ocupa dia no cronograma.</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={novaPessoa} onValueChange={(v) => v && setNovaPessoa(v)}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PERFIL}>(perfil — sem pessoa)</SelectItem>
            {livres.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={novoPapel} onValueChange={(v) => v && setNovoPapel(v as Papel)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAPEIS.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                {ROTULO_PAPEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={pending} onClick={adicionar}>
          <Plus className="size-3.5" /> Adicionar
        </Button>
      </div>
    </div>
  );
}

function LinhaAtribuicao({
  atribuicao,
  podeHoras,
  pending,
  onSalvarCampo,
  onTornarPrincipal,
  onRemover,
}: {
  atribuicao: AtribuicaoEditavel;
  podeHoras: boolean;
  pending: boolean;
  onSalvarCampo: (patch: Partial<Pick<AtribuicaoEditavel, "papel" | "horas">>) => void;
  onTornarPrincipal: () => void;
  onRemover: () => void;
}) {
  // Horas em estado local, gravadas no blur/Enter — mesma razão do editor de etapas: gravar
  // a cada tecla dispara uma action (e um registro de auditoria) por dígito.
  const [horas, setHoras] = useState(String(atribuicao.horas));

  function gravarHoras() {
    const n = Number(horas.replace(",", "."));
    if (Number.isFinite(n) && n >= 0 && n !== atribuicao.horas) onSalvarCampo({ horas: n });
    else setHoras(String(atribuicao.horas));
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        {atribuicao.userId ? (
          <AvatarUsuario nome={atribuicao.nome ?? ""} image={atribuicao.image} size="sm" className="size-5 shrink-0" />
        ) : (
          <span className="rounded-sm border border-dashed px-1 py-0.5 text-[10px] text-muted-foreground">perfil</span>
        )}
        <span className="truncate">{atribuicao.nome ?? "(sem pessoa)"}</span>
        {atribuicao.principal && <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Principal" />}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <Select value={atribuicao.papel} onValueChange={(v) => v && v !== atribuicao.papel && onSalvarCampo({ papel: v as Papel })}>
          <SelectTrigger className="h-7 w-32 text-[11px]" disabled={pending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROTULO_PAPEL) as Papel[]).map((p) => (
              <SelectItem key={p} value={p} className="text-[11px]">
                {ROTULO_PAPEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="number"
          min={0}
          step="0.5"
          value={horas}
          disabled={pending || !podeHoras}
          onChange={(e) => setHoras(e.target.value)}
          onBlur={gravarHoras}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          title="Horas previstas"
          className="h-7 w-16 rounded-sm border bg-background px-1.5 text-[11px] disabled:opacity-50"
        />
        <span className="text-[10px] text-muted-foreground">h</span>
        {atribuicao.userId && !atribuicao.principal && (
          <Button size="icon-sm" variant="ghost" aria-label="Tornar principal" disabled={pending} onClick={onTornarPrincipal}>
            <Star className="size-3.5" />
          </Button>
        )}
        <Button size="icon-sm" variant="ghost" aria-label="Remover" disabled={pending} onClick={onRemover}>
          <Trash2 className="size-3.5" />
        </Button>
      </span>
    </li>
  );
}
