"use client";

import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useSetParams } from "@/lib/use-set-param";
import { PERIODOS, PERIODO_LABEL } from "@/modules/comercial/filtros";
import { TEMPERATURAS, TEMPERATURA_ICONE, TEMPERATURA_LABEL } from "@/modules/comercial/temperatura";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Sentinela de "sem filtro" — base-ui recusa `value=""` em `SelectItem`. */
const TODOS = "__todos";

export type OpcoesFiltro = {
  responsaveis: { id: string; name: string }[];
  campanhas: { id: string; nome: string }[];
  canais: { id: string; nome: string }[];
  empresas: { id: string; nome: string }[];
  disciplinas: { id: string; nome: string }[];
};

/**
 * Filtros dos boards comerciais (F2.15) — **um componente só, usado pelos dois**.
 *
 * Todo estado vive na URL, via `useSetParams` (`lib/use-set-param.ts`, o mesmo helper das listas
 * do resto do sistema). Não há `useState` de filtro aqui: é isso que faz copiar a URL e abrir
 * noutra aba reproduzir exatamente a mesma tela, que é o aceite da tarefa.
 *
 * `disciplinas` é opcional porque prospecção não tem disciplina — passar a lista é o que liga o
 * filtro, em vez de uma flag booleana dizendo "esconde esse aí".
 */
export function FiltrosComerciais({
  opcoes,
  mostrarDisciplina = false,
}: {
  opcoes: OpcoesFiltro;
  mostrarDisciplina?: boolean;
}) {
  const sp = useSearchParams();
  const setParams = useSetParams();
  const val = (k: string) => sp.get(k) ?? TODOS;
  const trocar = (k: string) => (v: string | null) =>
    setParams({ [k]: v && v !== TODOS ? v : null });

  const ativos = ["resp", "camp", "canal", "empresa", "temp", "periodo", "disc"].filter((k) =>
    sp.get(k),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Campo
        valor={val("resp")}
        onTrocar={trocar("resp")}
        placeholder="Responsável"
        vazio="Todos os responsáveis"
        itens={opcoes.responsaveis.map((r) => ({ id: r.id, nome: r.name }))}
      />
      <Campo
        valor={val("empresa")}
        onTrocar={trocar("empresa")}
        placeholder="Empresa"
        vazio="Todas as empresas"
        itens={opcoes.empresas}
      />
      <Campo
        valor={val("canal")}
        onTrocar={trocar("canal")}
        placeholder="Canal"
        vazio="Todos os canais"
        itens={opcoes.canais}
      />
      <Campo
        valor={val("camp")}
        onTrocar={trocar("camp")}
        placeholder="Campanha"
        vazio="Todas as campanhas"
        itens={opcoes.campanhas}
      />
      <Campo
        valor={val("temp")}
        onTrocar={trocar("temp")}
        placeholder="Temperatura"
        vazio="Todas"
        itens={TEMPERATURAS.map((t) => ({
          id: t,
          nome: `${TEMPERATURA_ICONE[t]} ${TEMPERATURA_LABEL[t]}`,
        }))}
      />
      <Campo
        valor={val("periodo")}
        onTrocar={trocar("periodo")}
        placeholder="Período"
        vazio="Qualquer data"
        itens={PERIODOS.map((p) => ({ id: p, nome: PERIODO_LABEL[p] }))}
      />
      {mostrarDisciplina && (
        <Campo
          valor={val("disc")}
          onTrocar={trocar("disc")}
          placeholder="Disciplina"
          vazio="Todas as disciplinas"
          itens={opcoes.disciplinas}
        />
      )}

      {ativos.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setParams(Object.fromEntries(ativos.map((k) => [k, null])))
          }
        >
          <X className="size-3.5" /> Limpar ({ativos.length})
        </Button>
      )}
    </div>
  );
}

function Campo({
  valor,
  onTrocar,
  placeholder,
  vazio,
  itens,
}: {
  valor: string;
  onTrocar: (v: string | null) => void;
  placeholder: string;
  vazio: string;
  itens: { id: string; nome: string }[];
}) {
  if (itens.length === 0) return null;
  return (
    <Select value={valor} onValueChange={onTrocar}>
      <SelectTrigger className="h-8 w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{vazio}</SelectItem>
        {itens.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
