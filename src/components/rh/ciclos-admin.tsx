"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks, Plus } from "lucide-react";
import { abrirCiclo } from "@/modules/rh/ciclo/actions";
import { modeloSugerido, MOTIVO_SAIDA_SEM_DESLIGAMENTO, PUBLICO_LABEL, TIPO_CICLO_LABEL, type TipoCiclo } from "@/modules/rh/ciclo/regras";
import type { CicloAberto, ModeloCiclo, PendenciasCiclo, PessoaParaCiclo } from "@/modules/rh/ciclo/queries";
import { CicloCartao } from "@/components/rh/ciclo-cartao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dataCurta } from "@/lib/dias-iso";

const GRUPOS: { chave: keyof PendenciasCiclo; rotulo: string }[] = [
  { chave: "rh", rotulo: "RH (inclui líder e coordenador)" },
  { chave: "ti", rotulo: "TI" },
  { chave: "pessoa", rotulo: "A própria pessoa" },
];

/**
 * Fila de entrada e saída do RH (Gestão de Pessoas F4): pendências por responsável, listas em
 * andamento e "abrir lista" para qualquer pessoa, com a lista-modelo sugerida pela contratação.
 */
export function CiclosAdmin({
  abertos,
  pendencias,
  pessoas,
  modelos,
  quemId,
}: {
  abertos: CicloAberto[];
  pendencias: PendenciasCiclo;
  pessoas: PessoaParaCiclo[];
  modelos: ModeloCiclo[];
  quemId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [tipo, setTipo] = useState<TipoCiclo>("entrada");
  const [templateId, setTemplateId] = useState("");
  const [grupo, setGrupo] = useState<keyof PendenciasCiclo>("rh");

  const pessoa = pessoas.find((p) => p.id === userId) ?? null;
  const ativos = useMemo(() => modelos.filter((m) => m.ativo), [modelos]);
  const doTipo = ativos.filter((m) => m.tipo === tipo);
  const bloqueioSaida = tipo === "saida" && pessoa && !pessoa.ultimoDiaVinculo ? MOTIVO_SAIDA_SEM_DESLIGAMENTO : null;

  function sugerir(novaPessoa: PessoaParaCiclo | null, novoTipo: TipoCiclo) {
    setTemplateId(modeloSugerido(ativos, novoTipo, novaPessoa?.contratacao)?.id ?? "");
  }

  function abrir() {
    if (!userId || !templateId) {
      toast.error("Escolha a pessoa e a lista-modelo.");
      return;
    }
    start(async () => {
      const r = await abrirCiclo({ userId, tipo, templateId });
      if (r.ok) {
        toast.success(`Lista de ${TIPO_CICLO_LABEL[tipo].toLowerCase()} aberta.`);
        setUserId("");
        setTemplateId("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const linhasGrupo = pendencias[grupo];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Entrada e saída</CardTitle>
        <CardDescription>Listas de admissão e desligamento, com dono e prazo por item.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed p-3">
          <Select
            value={userId}
            onValueChange={(v) => {
              const id = v ?? "";
              setUserId(id);
              sugerir(pessoas.find((p) => p.id === id) ?? null, tipo);
            }}
          >
            <SelectTrigger className="w-52" aria-label="Pessoa">
              <SelectValue placeholder="Pessoa…" />
            </SelectTrigger>
            <SelectContent>
              {pessoas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={tipo}
            onValueChange={(v) => {
              const t = (v as TipoCiclo) ?? "entrada";
              setTipo(t);
              sugerir(pessoa, t);
            }}
          >
            <SelectTrigger className="w-32" aria-label="Tipo de lista">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
            </SelectContent>
          </Select>
          <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
            <SelectTrigger className="w-64" aria-label="Lista-modelo">
              <SelectValue placeholder="Lista-modelo…" />
            </SelectTrigger>
            <SelectContent>
              {doTipo.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome} · {PUBLICO_LABEL[m.publico]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={abrir} disabled={pending || !!bloqueioSaida}>
            <Plus className="size-3.5" /> Abrir lista
          </Button>
          {bloqueioSaida && <p className="w-full text-xs text-warning">{bloqueioSaida}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pendências por responsável">
            {GRUPOS.map((g) => {
              const total = pendencias[g.chave].length;
              const atrasados = pendencias[g.chave].filter((l) => l.atrasado).length;
              return (
                <button
                  key={g.chave}
                  type="button"
                  aria-pressed={grupo === g.chave}
                  onClick={() => setGrupo(g.chave)}
                  className={`rounded-sm border px-2.5 py-1 text-xs ${grupo === g.chave ? "border-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {g.rotulo}: <span className="font-mono">{total}</span>
                  {atrasados > 0 && <span className="ml-1 font-medium text-destructive">({atrasados} atrasado{atrasados === 1 ? "" : "s"})</span>}
                </button>
              );
            })}
          </div>
          {linhasGrupo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendente com este responsável.</p>
          ) : (
            <ul className="divide-y rounded-sm border text-sm">
              {linhasGrupo.slice(0, 30).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0">
                    <Link href={`/rh/pessoas/${l.userId}`} className="font-medium hover:underline">
                      {l.nome}
                    </Link>
                    <span className="text-muted-foreground"> · {TIPO_CICLO_LABEL[l.tipo]} · </span>
                    {l.descricao}
                  </span>
                  {l.prazoEm && (
                    <span className={`shrink-0 font-mono text-xs ${l.atrasado ? "text-destructive" : "text-muted-foreground"}`}>
                      {l.atrasado ? "atrasado " : "até "}
                      {dataCurta(l.prazoEm)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {abertos.length === 0 ? (
          <EmptyState icon={ListChecks} title="Nenhuma lista em andamento" />
        ) : (
          <div className="space-y-3">
            {abertos.map((c) => (
              <CicloCartao
                key={c.id}
                ciclo={c}
                nome={c.nome}
                hrefFicha={`/rh/pessoas/${c.userId}`}
                podeGerir
                quem={{ id: quemId, ehRh: true, ehTi: false }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
