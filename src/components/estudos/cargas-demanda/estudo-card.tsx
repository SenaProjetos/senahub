"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CONCESSIONARIAS,
  CONCESSIONARIA_ROTULO,
  TIPOS_EMPREENDIMENTO,
  TIPO_EMPREENDIMENTO_ROTULO,
  type ConteudoCargasDemanda,
} from "@/modules/estudos/cargas-demanda/conteudo";
import { LIGACAO_ROTULO, LIGACOES, SISTEMAS } from "@/modules/ferramentas/calc/cargas-demanda/corrente";

import { Rotulo } from "./campos";
import type { Atualizar } from "./tipos";

/** Como a tela mostra o sistema de tensão: "380/220 V". */
export const SISTEMA_ROTULO = Object.fromEntries(Object.keys(SISTEMAS).map((k) => [k, `${k} V`])) as Record<string, string>;

const SEM = "__sem__";

/** Cartão do estudo: concessionária, tipo de empreendimento, sistema de tensão e ligação (spec §3.3, bloco "Estudo"). */
export function CartaoDoEstudo({ conteudo, atualizar, podeEditar }: { conteudo: ConteudoCargasDemanda; atualizar: Atualizar; podeEditar: boolean }) {
  return (
    <section aria-label="Dados do estudo" className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Rotulo>Concessionária</Rotulo>
        <Select
          value={conteudo.concessionaria ?? SEM}
          disabled={!podeEditar}
          onValueChange={(v) => atualizar((c) => ({ ...c, concessionaria: v && v !== SEM ? (v as (typeof CONCESSIONARIAS)[number]) : null }))}
        >
          <SelectTrigger className="w-full" aria-label="Concessionária">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM}>Escolha…</SelectItem>
            {CONCESSIONARIAS.map((k) => (
              <SelectItem key={k} value={k}>
                {CONCESSIONARIA_ROTULO[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Distribuidora (opcional)"
          placeholder="Distribuidora (opcional)"
          value={conteudo.distribuidora}
          maxLength={80}
          disabled={!podeEditar}
          onChange={(e) => atualizar((c) => ({ ...c, distribuidora: e.target.value }))}
          className="text-sm"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <Rotulo>Tipo de empreendimento</Rotulo>
        <Select
          value={conteudo.tipoEmpreendimento ?? SEM}
          disabled={!podeEditar}
          onValueChange={(v) => atualizar((c) => ({ ...c, tipoEmpreendimento: v && v !== SEM ? (v as (typeof TIPOS_EMPREENDIMENTO)[number]) : null }))}
        >
          <SelectTrigger className="w-full" aria-label="Tipo de empreendimento">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM}>Escolha…</SelectItem>
            {TIPOS_EMPREENDIMENTO.map((k) => (
              <SelectItem key={k} value={k}>
                {TIPO_EMPREENDIMENTO_ROTULO[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <Rotulo>Sistema de tensão</Rotulo>
        <Select
          value={conteudo.sistema ?? SEM}
          disabled={!podeEditar}
          onValueChange={(v) => atualizar((c) => ({ ...c, sistema: v && v !== SEM ? (v as keyof typeof SISTEMAS) : null }))}
        >
          <SelectTrigger className="w-full" aria-label="Sistema de tensão">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM}>Escolha…</SelectItem>
            {(Object.keys(SISTEMAS) as (keyof typeof SISTEMAS)[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SISTEMA_ROTULO[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <Rotulo>Ligação</Rotulo>
        <Select
          value={conteudo.ligacao ?? SEM}
          disabled={!podeEditar}
          onValueChange={(v) => atualizar((c) => ({ ...c, ligacao: v && v !== SEM ? (v as (typeof LIGACOES)[number]) : null }))}
        >
          <SelectTrigger className="w-full" aria-label="Ligação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM}>Escolha…</SelectItem>
            {LIGACOES.map((k) => (
              <SelectItem key={k} value={k}>
                {LIGACAO_ROTULO[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
