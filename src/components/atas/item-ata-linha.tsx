"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DESCRICAO_ITEM_MAX, ROTULO_TIPO_ITEM, TITULO_ITEM_MAX, type ItemRascunho, type TipoItem } from "@/modules/portal/atas/regras";
import { CLASSE_TEXTAREA } from "./motivo-dialog";

const CLASSE_SELECT =
  "h-9 w-full rounded-sm border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11";

/** Uma linha do editor de itens da ata: tipo, título, descrição, responsável (tarefa da equipe) e prazo. */
export function ItemAtaLinha({
  item,
  indice,
  total,
  membros,
  desabilitado,
  onMudar,
  onMover,
  onRemover,
}: {
  item: ItemRascunho;
  indice: number;
  total: number;
  membros: { id: string; nome: string }[];
  desabilitado: boolean;
  onMudar: (i: ItemRascunho) => void;
  onMover: (delta: -1 | 1) => void;
  onRemover: () => void;
}) {
  const base = `item-${indice}`;
  const nome = item.titulo.trim() || `item ${indice + 1}`;
  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="space-y-1">
          <label htmlFor={`${base}-tipo`} className="text-xs text-muted-foreground">
            Tipo
          </label>
          <select
            id={`${base}-tipo`}
            className={CLASSE_SELECT}
            value={item.tipo}
            disabled={desabilitado}
            onChange={(e) => onMudar({ ...item, tipo: e.target.value as TipoItem })}
          >
            {(Object.keys(ROTULO_TIPO_ITEM) as TipoItem[]).map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_ITEM[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${base}-titulo`} className="text-xs text-muted-foreground">
            Título
          </label>
          <Input
            id={`${base}-titulo`}
            value={item.titulo}
            maxLength={TITULO_ITEM_MAX}
            disabled={desabilitado}
            aria-invalid={item.titulo.trim() ? undefined : true}
            onChange={(e) => onMudar({ ...item, titulo: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${base}-descricao`} className="text-xs text-muted-foreground">
          Descrição (opcional)
        </label>
        <textarea
          id={`${base}-descricao`}
          rows={2}
          maxLength={DESCRICAO_ITEM_MAX}
          className={CLASSE_TEXTAREA}
          value={item.descricao ?? ""}
          disabled={desabilitado}
          onChange={(e) => onMudar({ ...item, descricao: e.target.value || null })}
        />
      </div>
      {item.tipo !== "decisao" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {item.tipo === "tarefa_equipe" ? (
            <div className="space-y-1">
              <label htmlFor={`${base}-resp`} className="text-xs text-muted-foreground">
                Responsável
              </label>
              <select
                id={`${base}-resp`}
                className={CLASSE_SELECT}
                value={item.responsavelId ?? ""}
                disabled={desabilitado}
                aria-invalid={item.responsavelId ? undefined : true}
                onChange={(e) => onMudar({ ...item, responsavelId: e.target.value || null })}
              >
                <option value="">Escolha…</option>
                {membros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="self-end text-xs text-muted-foreground">Pendência do cliente: aparece para ele no portal.</p>
          )}
          <div className="space-y-1">
            <label htmlFor={`${base}-prazo`} className="text-xs text-muted-foreground">
              Prazo (opcional)
            </label>
            <Input
              id={`${base}-prazo`}
              type="date"
              value={item.prazo ?? ""}
              disabled={desabilitado}
              onChange={(e) => onMudar({ ...item, prazo: e.target.value || null })}
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-1">
        <Button size="icon" variant="ghost" aria-label={`Subir ${nome}`} disabled={desabilitado || indice === 0} onClick={() => onMover(-1)}>
          <ArrowUp className="size-4" aria-hidden />
        </Button>
        <Button size="icon" variant="ghost" aria-label={`Descer ${nome}`} disabled={desabilitado || indice === total - 1} onClick={() => onMover(1)}>
          <ArrowDown className="size-4" aria-hidden />
        </Button>
        <Button size="icon" variant="ghost" aria-label={`Remover ${nome}`} disabled={desabilitado} onClick={onRemover}>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
