"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  type SecaoBriefing,
  type CampoBriefing,
  progressoObrigatorios,
} from "@/modules/inputs/briefing-schema";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Briefing de Start multi-etapas (Mód 3). Reusável: a persistência é injetada via `onSalvar`
 * (Server Action no uso interno; rota pública por token no preenchimento do cliente).
 * Autosave com debounce; navegação por seções; progresso de campos obrigatórios.
 */
export function BriefingForm({
  respostasIniciais,
  secoes,
  canEdit = true,
  onSalvar,
}: {
  respostasIniciais: Record<string, unknown>;
  secoes: SecaoBriefing[];
  canEdit?: boolean;
  onSalvar: (respostas: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [respostas, setRespostas] = useState<Record<string, unknown>>(respostasIniciais);
  const [secaoAtiva, setSecaoAtiva] = useState(secoes[0]?.id ?? "");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const salvar = useCallback(
    async (dados: Record<string, unknown>) => {
      setSaveStatus("saving");
      const r = await onSalvar(dados);
      setSaveStatus(r.ok ? "saved" : "error");
      setTimeout(() => setSaveStatus("idle"), r.ok ? 2000 : 3000);
    },
    [onSalvar],
  );

  const alterar = useCallback(
    (chave: string, valor: unknown, delay = 800) => {
      setRespostas((prev) => {
        const novo = { ...prev, [chave]: valor };
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => void salvar(novo), delay);
        return novo;
      });
    },
    [salvar],
  );

  const idxAtivo = secoes.findIndex((s) => s.id === secaoAtiva);
  const total = secoes.length;
  const prog = progressoObrigatorios(respostas, secoes);

  return (
    <div className="space-y-4">
      {/* Cabeçalho: progresso + status de salvamento */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {prog.preenchidos}/{prog.total} obrigatórios preenchidos
        </span>
        <span className="h-5 text-xs">
          {saveStatus === "saving" && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Salvando…
            </span>
          )}
          {saveStatus === "saved" && <span className="text-success">Salvo automaticamente</span>}
          {saveStatus === "error" && <span className="text-destructive">Erro ao salvar</span>}
        </span>
      </div>

      {/* Tabs de seções (numeradas) */}
      <div className="-mb-px flex gap-1 overflow-x-auto border-b">
        {secoes.map((secao, idx) => (
          <button
            key={secao.id}
            type="button"
            onClick={() => setSecaoAtiva(secao.id)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              secaoAtiva === secao.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {idx + 1}. {secao.titulo}
          </button>
        ))}
      </div>

      {/* Conteúdo da seção ativa */}
      {secoes.map((secao) => (
        <div key={secao.id} className={secao.id === secaoAtiva ? "block space-y-5" : "hidden"}>
          {secao.descricao && <p className="text-xs text-muted-foreground">{secao.descricao}</p>}
          {secao.campos.map((campo) => (
            <CampoView
              key={campo.chave}
              campo={campo}
              valor={respostas[campo.chave]}
              canEdit={canEdit}
              onChange={alterar}
            />
          ))}
        </div>
      ))}

      {/* Navegação */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={idxAtivo <= 0}
          onClick={() => setSecaoAtiva(secoes[idxAtivo - 1].id)}
        >
          ← Anterior
        </Button>
        {idxAtivo < total - 1 ? (
          <Button type="button" size="sm" onClick={() => setSecaoAtiva(secoes[idxAtivo + 1].id)}>
            Próximo →
          </Button>
        ) : (
          canEdit && (
            <Button type="button" size="sm" onClick={() => void salvar(respostas)} disabled={saveStatus === "saving"}>
              Finalizar
            </Button>
          )
        )}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50";

function CampoView({
  campo,
  valor,
  canEdit,
  onChange,
}: {
  campo: CampoBriefing;
  valor: unknown;
  canEdit: boolean;
  onChange: (chave: string, valor: unknown, delay?: number) => void;
}) {
  const disabled = !canEdit;
  return (
    <div className="space-y-1.5">
      <label htmlFor={campo.chave} className="block text-sm font-medium">
        {campo.label}
        {campo.obrigatorio && <span className="ml-1 text-destructive">*</span>}
      </label>
      {campo.hint && <p className="text-xs text-muted-foreground">{campo.hint}</p>}

      {campo.tipo === "text" && (
        <input
          id={campo.chave}
          type="text"
          className={inputClass}
          value={(valor as string) ?? ""}
          placeholder={campo.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(campo.chave, e.target.value)}
        />
      )}

      {campo.tipo === "textarea" && (
        <textarea
          id={campo.chave}
          className={cn(inputClass, "min-h-[90px] resize-y")}
          value={(valor as string) ?? ""}
          placeholder={campo.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(campo.chave, e.target.value)}
        />
      )}

      {campo.tipo === "select" && (
        <select
          id={campo.chave}
          className={cn(inputClass, "cursor-pointer")}
          value={(valor as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(campo.chave, e.target.value, 0)}
        >
          <option value="">Selecione…</option>
          {campo.opcoes?.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      )}

      {campo.tipo === "radio" && (
        <div className="flex flex-wrap gap-3">
          {campo.opcoes?.map((op) => (
            <label key={op} className={cn("flex cursor-pointer items-center gap-2", disabled && "cursor-not-allowed opacity-50")}>
              <input
                type="radio"
                name={campo.chave}
                value={op}
                checked={(valor as string) === op}
                disabled={disabled}
                onChange={() => onChange(campo.chave, op, 0)}
                className="accent-primary"
              />
              <span className="text-sm">{op}</span>
            </label>
          ))}
        </div>
      )}

      {campo.tipo === "checkbox" && (
        <div className="flex flex-col gap-2">
          {campo.opcoes?.map((op) => {
            const checked = Array.isArray(valor) ? (valor as string[]).includes(op) : false;
            return (
              <label key={op} className={cn("flex cursor-pointer items-start gap-2", disabled && "cursor-not-allowed opacity-50")}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    const atual = Array.isArray(valor) ? [...(valor as string[])] : [];
                    const novo = checked ? atual.filter((v) => v !== op) : [...atual, op];
                    onChange(campo.chave, novo, 0);
                  }}
                  className="mt-0.5 accent-primary"
                />
                <span className="text-sm">{op}</span>
              </label>
            );
          })}
        </div>
      )}

      {campo.tipo === "checkbox-single" && campo.opcoes && (
        <label className={cn("flex cursor-pointer items-start gap-2", disabled && "cursor-not-allowed opacity-50")}>
          <input
            type="checkbox"
            checked={Boolean(valor)}
            disabled={disabled}
            onChange={() => onChange(campo.chave, !valor, 0)}
            className="mt-0.5 accent-primary"
          />
          <span className="text-sm">{campo.opcoes[0]}</span>
        </label>
      )}
    </div>
  );
}
