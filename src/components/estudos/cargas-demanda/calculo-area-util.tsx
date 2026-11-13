"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, TriangleAlert } from "lucide-react";

import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACAO_TIPO_DESCER, ACAO_TIPO_DUPLICAR, ACAO_TIPO_EXCLUIR, ACAO_TIPO_SUBIR, itensDeTipoApartamento } from "@/modules/estudos/cargas-demanda/acoes-calculo";
import type { CalculoEstudo } from "@/modules/estudos/cargas-demanda/conteudo";
import { mover, novoId } from "@/modules/estudos/cargas-demanda/edicao";
import { mapCalculo, novoTipoApartamento, removerTipoApartamento } from "@/modules/estudos/cargas-demanda/edicao-calculo";
import { formatarNumeroBR } from "@/modules/estudos/cargas-demanda/numero-br";
import { tiposDoEstudo } from "@/modules/estudos/cargas-demanda/resultado";
import { demandaDoNivel, type IdConcessionaria } from "@/modules/ferramentas/calc/cargas-demanda/composicao";

import { CampoNumero } from "./campos";
import { useAcoesDoCalculo, type PropsCalculo } from "./calculo-carga-instalada";
import { BlocoDeFatores } from "./fatores";

const fmt = (v: number | null, casas = 2) => (v == null ? "—" : formatarNumeroBR(v, casas, casas));
const SEM = "__sem__";

/** Cartão de cálculo por ÁREA ÚTIL: tipos de apartamento, fatores do método da concessionária (azul) e a demanda. */
export function CardAreaUtil(props: PropsCalculo) {
  const { conteudo, calculo: k, atualizar, podeEditar } = props;
  const confirm = useConfirm();
  const [aberto, setAberto] = useState(true);
  const { itens, executar } = useAcoesDoCalculo(props);
  const setK = (f: (x: CalculoEstudo) => CalculoEstudo) => atualizar((c) => mapCalculo(c, k.id, f));
  const concessionaria = conteudo.concessionaria;
  const comDuplex = concessionaria === "equatorial" || concessionaria === "energisa";

  // O resultado deste cartão é o dos tipos DELE (o resumo do empreendimento junta todos os cartões).
  const resultado = useMemo(() => {
    if (!concessionaria) return null;
    const so = { ...conteudo, calculos: [k] };
    const { tipos } = tiposDoEstudo(so);
    if (tipos.length === 0) return null;
    // Neste cartão não há CMD citando o tipo: o nome mostrado nos fatores é o que a pessoa digitou (o id só serve ao medidor).
    const nomes = new Map(k.apartamentos.map((t, i) => [t.id, t.nome.trim() || `Tipo ${i + 1}`]));
    return demandaDoNivel({
      concessionaria: concessionaria as IdConcessionaria,
      tipos: tipos.filter((t) => t.quantidade > 0).map((t) => ({ ...t, nome: nomes.get(t.nome) ?? t.nome })),
      calculos: [],
      ajustes: k.ajustes,
      opcoes: conteudo.centros.opcoes,
    });
  }, [conteudo, k, concessionaria]);
  const avisosDosTipos = useMemo(() => tiposDoEstudo({ ...conteudo, calculos: [k] }).avisos, [conteudo, k]);

  const medidoresDoTipo = (tipoId: string) => conteudo.centros.cmds.flatMap((m) => m.medidores).filter((md) => md.tipo === "residencial" && md.tipoApartamentoId === tipoId).length;

  async function acaoTipo(tipoId: string, item: AcaoItemAcao) {
    if (item.confirmar) {
      const ok = await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" });
      if (!ok) return;
    }
    if (item.id === ACAO_TIPO_EXCLUIR) return atualizar((c) => removerTipoApartamento(c, k.id, tipoId));
    setK((x) => {
      const i = x.apartamentos.findIndex((t) => t.id === tipoId);
      if (i < 0) return x;
      if (item.id === ACAO_TIPO_DUPLICAR) return { ...x, apartamentos: [...x.apartamentos.slice(0, i + 1), { ...x.apartamentos[i], id: novoId("tipo_") }, ...x.apartamentos.slice(i + 1)] };
      if (item.id === ACAO_TIPO_SUBIR) return { ...x, apartamentos: mover(x.apartamentos, i, i - 1) };
      if (item.id === ACAO_TIPO_DESCER) return { ...x, apartamentos: mover(x.apartamentos, i, i + 1) };
      return x;
    });
  }

  /** Fator digitado: grava no ajuste do cálculo; esvaziar volta ao sugerido (a chave sai). */
  function ajustar(grupo: "apartamentos" | "duplex", chave: string, valor: number | null) {
    setK((x) => {
      const atual = { ...(x.ajustes[grupo] ?? {}) };
      if (valor == null || !(valor > 0)) delete atual[chave];
      else atual[chave] = valor;
      return { ...x, ajustes: { ...x.ajustes, [grupo]: atual } };
    });
  }

  const demanda = (resultado?.demandaKVA ?? null) as number | null;

  return (
    <section aria-label={`Cálculo ${k.nome}`} className="rounded-lg border bg-card">
      <LinhaComMenu itens={itens} onSelect={(i) => void executar(i)} render={<header className="flex flex-wrap items-center gap-2 border-b px-4 py-3" />}>
        <Input aria-label="Nome do cálculo" value={k.nome} maxLength={120} disabled={!podeEditar} onChange={(e) => setK((x) => ({ ...x, nome: e.target.value }))} className="h-8 max-w-64 border-transparent bg-transparent font-semibold hover:border-input" />
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Área útil</span>
        <span className="ml-auto" />
        <span className="text-base font-bold tabular-nums">{fmt(demanda)} kVA</span>
        <Button type="button" variant="ghost" size="sm" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
          {aberto ? <ChevronUp aria-hidden className="mr-1 size-4" /> : <ChevronDown aria-hidden className="mr-1 size-4" />}
          {aberto ? "Fechar" : "Abrir cálculo"}
        </Button>
        <BotaoAcoes itens={itens} onSelect={(i) => void executar(i)} rotulo={`Ações do cálculo ${k.nome}`} className="size-8" />
      </LinhaComMenu>

      {aberto && (
        <div className="space-y-3 px-4 py-3">
          {!concessionaria && <p className="rounded-md bg-warning/15 px-3 py-2 text-sm text-warning-text">Escolha a concessionária acima: cada uma tem o seu método de área útil.</p>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">Tipos de apartamento de {k.nome}</caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="w-6" aria-label="Reordenar" />
                  <th className="px-1 pb-1 font-medium">Tipo</th>
                  <th className="px-1 pb-1 font-medium">Área útil (m²)</th>
                  <th className="px-1 pb-1 font-medium">Nº de apartamentos</th>
                  {comDuplex && <th className="px-1 pb-1 font-medium">Duplex</th>}
                  <th className="px-1 pb-1 font-medium">Levantamento da unidade</th>
                  <th className="w-10" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {k.apartamentos.map((t, i) => {
                  const it = podeEditar ? itensDeTipoApartamento({ indice: i, total: k.apartamentos.length, tiposNoCalculo: k.apartamentos.length, medidoresQueCitam: medidoresDoTipo(t.id) }) : [];
                  const nome = t.nome || `tipo ${i + 1}`;
                  const soltar = (origem: string) =>
                    setK((x) => {
                      const de = x.apartamentos.findIndex((y) => y.id === origem);
                      const para = x.apartamentos.findIndex((y) => y.id === t.id);
                      return de < 0 || para < 0 || de === para ? x : { ...x, apartamentos: mover(x.apartamentos, de, para) };
                    });
                  return (
                    <LinhaComMenu
                      key={t.id}
                      itens={it}
                      onSelect={(item) => void acaoTipo(t.id, item)}
                      render={
                        <tr
                          className="border-t align-top"
                          onDragOver={(e) => e.dataTransfer.types.includes("application/x-senahub-tipo") && e.preventDefault()}
                          onDrop={(e) => {
                            const o = e.dataTransfer.getData("application/x-senahub-tipo");
                            if (o) {
                              e.preventDefault();
                              soltar(o);
                            }
                          }}
                        />
                      }
                    >
                      <td className="px-1 py-1.5">
                        <span
                          draggable={podeEditar}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/x-senahub-tipo", t.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          aria-hidden
                          className={podeEditar ? "inline-flex cursor-grab touch-none text-muted-foreground/60 hover:text-foreground" : "inline-flex text-muted-foreground/30"}
                        >
                          <GripVertical className="size-4" />
                        </span>
                      </td>
                      <td className="px-1 py-1.5">
                        <Input aria-label={`Nome do tipo ${i + 1}`} value={t.nome} maxLength={80} disabled={!podeEditar} onChange={(e) => setK((x) => ({ ...x, apartamentos: x.apartamentos.map((y) => (y.id === t.id ? { ...y, nome: e.target.value } : y)) }))} className="min-w-32 text-center" />
                      </td>
                      <td className="px-1 py-1.5">
                        <CampoNumero rotulo={`Área útil de ${nome} (m²)`} valor={t.areaUtilM2} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => setK((x) => ({ ...x, apartamentos: x.apartamentos.map((y) => (y.id === t.id ? { ...y, areaUtilM2: v } : y)) }))} className="min-w-24" />
                      </td>
                      <td className="px-1 py-1.5">
                        <CampoNumero rotulo={`Número de apartamentos de ${nome}`} valor={t.quantidade} casas={0} placeholder="digite" desabilitado={!podeEditar} onChange={(v) => setK((x) => ({ ...x, apartamentos: x.apartamentos.map((y) => (y.id === t.id ? { ...y, quantidade: v == null ? null : Math.round(v) } : y)) }))} className="min-w-24" />
                      </td>
                      {comDuplex && (
                        <td className="px-1 py-1.5 text-center">
                          <input type="checkbox" aria-label={`${nome} é duplex`} checked={t.duplex} disabled={!podeEditar} onChange={(e) => setK((x) => ({ ...x, apartamentos: x.apartamentos.map((y) => (y.id === t.id ? { ...y, duplex: e.target.checked } : y)) }))} className="size-4 accent-primary" />
                        </td>
                      )}
                      <td className="px-1 py-1.5">
                        <Select value={t.levantamentoId ?? SEM} disabled={!podeEditar} onValueChange={(v) => setK((x) => ({ ...x, apartamentos: x.apartamentos.map((y) => (y.id === t.id ? { ...y, levantamentoId: v && v !== SEM ? v : null } : y)) }))}>
                          <SelectTrigger className="w-48 max-w-48" aria-label={`Levantamento da unidade de ${nome}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM}>Nenhum</SelectItem>
                            {conteudo.levantamentos.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <BotaoAcoes itens={it} onSelect={(item) => void acaoTipo(t.id, item)} rotulo={`Ações do tipo ${nome}`} className="size-7" />
                      </td>
                    </LinhaComMenu>
                  );
                })}
              </tbody>
            </table>
          </div>
          {podeEditar && (
            <Button type="button" variant="ghost" size="sm" disabled={k.apartamentos.length >= 40} onClick={() => setK((x) => ({ ...x, apartamentos: [...x.apartamentos, novoTipoApartamento(`Apartamento tipo ${x.apartamentos.length + 1}`)] }))}>
              <Plus aria-hidden className="mr-1 size-3.5" /> Tipo de apartamento
            </Button>
          )}

          {avisosDosTipos.length > 0 && (
            <ul className="space-y-1 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-xs text-warning-text">
              {avisosDosTipos.map((m) => (
                <li key={m.id} className="flex items-start gap-2">
                  <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {m.texto}
                </li>
              ))}
            </ul>
          )}

          {resultado?.apartamentos && <BlocoDeFatores concessionaria={concessionaria!} titulo={comDuplex && resultado.duplex ? "Apartamentos tipo" : undefined} r={resultado.apartamentos} grupo="apartamentos" podeEditar={podeEditar} onAjustar={ajustar} />}
          {resultado?.duplex && <BlocoDeFatores concessionaria={concessionaria!} titulo="Duplex" r={resultado.duplex} grupo="duplex" podeEditar={podeEditar} onAjustar={ajustar} />}
        </div>
      )}
    </section>
  );
}
