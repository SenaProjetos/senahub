import { emDaAtividade } from "@/modules/ferramentas/calc/cargas-demanda/atividades";
import { TIPO_COMODO_ROTULO } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/nbr5410-habitacao";
import type { Mensagem } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";

import { ambientesDoLevantamento, type AmbienteEstudo, type ConteudoCargasDemanda, type LevantamentoEstudo } from "../conteudo";
import { avisosDoAmbiente, iluminacaoDoAmbienteCompleta, luminariaDoAmbiente, pontoDoAmbiente } from "../ambiente";
import { totaisDosAmbientes, type Total } from "../levantamento";
import { formatarNumeroBR } from "../numero-br";
import { type BlocoRel, type Celula, num, type TabelaRel } from "./tipos";

/**
 * Seção 3 do relatório — levantamento de cargas, na ordem da tela (pavimento a pavimento, ambiente a ambiente). Devolve os
 * blocos e os avisos de ambiente (com a referência, para a seção 6) — **puro**.
 */

const FPTXT = (v: number | null) => (v == null ? "—" : formatarNumeroBR(v, 2, 2));

type ConteudoDoLevantamento = Pick<ConteudoCargasDemanda, "criterioIluminacao" | "peDireitoM" | "luminarias">;

function tugDoAmbiente(a: AmbienteEstudo, c: ConteudoDoLevantamento): { un: number | null; va: number | null; w: number | null } {
  const pts = a.pontos.filter((p) => p.tipo === "tug").map((p) => pontoDoAmbiente(a, p, c.criterioIluminacao));
  if (pts.length === 0) return { un: 0, va: 0, w: 0 };
  const soma = (f: (p: (typeof pts)[number]) => number | null) => (pts.some((p) => f(p) == null) ? null : pts.reduce((s, p) => s + (f(p) as number), 0));
  return { un: soma((p) => p.quantidade), va: soma((p) => p.vaTotal), w: soma((p) => p.w) };
}

function tueDoAmbiente(a: AmbienteEstudo, c: ConteudoDoLevantamento): number | null {
  const pts = a.pontos.filter((p) => p.tipo !== "tug").map((p) => pontoDoAmbiente(a, p, c.criterioIluminacao));
  if (pts.length === 0) return null;
  return pts.some((p) => p.vaTotal == null) ? null : pts.reduce((s, p) => s + (p.vaTotal as number), 0);
}

function totalTue(t: ReturnType<typeof totaisDosAmbientes>): number | null {
  if (t.equipamentos.length === 0) return null;
  return t.equipamentos.some((e) => e.total.va == null) ? null : t.equipamentos.reduce((s, e) => s + (e.total.va as number), 0);
}

function atividadeDoAmbiente(a: AmbienteEstudo): string {
  if (a.atividadeId == null) return a.iluminacao.emLux != null ? "Outra atividade (Em digitado)" : "—";
  return emDaAtividade(a.atividadeId).atividade?.atividade ?? "—";
}

const emTotal = (t: Total) => num(t.va, 0);

function tabelaDoPavimento(titulo: string | undefined, ambientes: readonly AmbienteEstudo[], c: ConteudoDoLevantamento, lux: boolean, totalRotulo: string): TabelaRel {
  const linhas: Celula[][] = ambientes.map((a) => {
    const il = iluminacaoDoAmbienteCompleta(a, c.criterioIluminacao, c.peDireitoM, c.luminarias);
    const tug = tugDoAmbiente(a, c);
    const tue = tueDoAmbiente(a, c);
    if (!lux) {
      return [a.nome, a.tipo ? TIPO_COMODO_ROTULO[a.tipo] : "—", num(a.areaM2), num(a.perimetroM), num(il.va, 0), num(tug.un, 0), num(tug.va, 0), num(tug.w), tue == null ? "—" : num(tue, 0)];
    }
    const lum = luminariaDoAmbiente(a, c.luminarias ?? []);
    const cod = a.iluminacao.luminariaId ? (c.luminarias.find((l) => l.id === a.iluminacao.luminariaId)?.codigo ?? "—") : lum.fluxoLm != null ? "digitada" : "—";
    return [
      a.nome, atividadeDoAmbiente(a), num(a.areaM2), num(a.perimetroM), num(a.alturaPlanoM),
      num(a.iluminacao.emLux ?? emDaAtividade(a.atividadeId).emLux, 0), num(a.iluminacao.fu), num(a.iluminacao.fm), cod,
      num(il.lux?.quantidade ?? null, 0), num(il.va, 0), num(tug.un, 0), num(tug.va, 0), num(tug.w), tue == null ? "—" : num(tue, 0),
    ];
  });
  const t = totaisDosAmbientes(ambientes, c);
  const tue = totalTue(t);
  const total: Celula[] = lux
    ? [totalRotulo, "", "", "", "", "", "", "", "", "", emTotal(t.iluminacao), num(t.tug.quantidade, 0), num(t.tug.va, 0), num(t.tug.w), tue == null ? "—" : num(tue, 0)]
    : [totalRotulo, "", "", "", emTotal(t.iluminacao), num(t.tug.quantidade, 0), num(t.tug.va, 0), num(t.tug.w), tue == null ? "—" : num(tue, 0)];
  return {
    titulo,
    colunas: lux
      ? ["Ambiente", "Atividade", "Área (m²)", "Perím. (m)", "Plano (m)", "Em (lux)", "Fu", "Fm", "Luminária", "Qtd", "Ilum. (VA)", "TUG (un)", "TUG (VA)", "TUG (W)", "TUE (VA)"]
      : ["Ambiente", "Tipo", "Área (m²)", "Perím. (m)", "Ilum. (VA)", "TUG (un)", "TUG (VA)", "TUG (W)", "TUE (VA)"],
    linhas: [...linhas, total],
    ultimaEhTotal: true,
  };
}

function tabelaTue(ambientes: readonly AmbienteEstudo[], c: ConteudoDoLevantamento): TabelaRel | null {
  const linhas: Celula[][] = [];
  for (const a of ambientes) {
    for (const p of a.pontos) {
      if (p.tipo === "tug") continue;
      const e = pontoDoAmbiente(a, p, c.criterioIluminacao);
      linhas.push([a.nome, p.descricao.trim() || "—", num(e.quantidade, 0), num(e.vaTotal, 0), FPTXT(e.fp), num(e.w)]);
    }
  }
  return linhas.length === 0 ? null : { titulo: "Tomadas de uso específico e outras cargas", colunas: ["Ambiente", "Descrição", "Qtd", "Potência (VA)", "FP", "Potência (W)"], linhas };
}

export type SecaoLevantamento = { blocos: BlocoRel[]; avisos: Mensagem[]; referencias: string[] };

export function secaoLevantamento(c: ConteudoCargasDemanda): SecaoLevantamento {
  const blocos: BlocoRel[] = [];
  const avisos: Mensagem[] = [];
  const lux = c.criterioIluminacao === "lux";
  if (c.levantamentos.length === 0) return { blocos: [{ tipo: "texto", texto: "Nenhum levantamento foi lançado neste estudo." }], avisos, referencias: [] };

  if (lux && c.luminarias.length > 0) {
    blocos.push({
      tipo: "tabela",
      tabela: {
        titulo: "Luminárias deste estudo",
        colunas: ["Código", "Descrição", "Fluxo (lm)", "Potência (W)", "FP"],
        linhas: c.luminarias.map((l) => [l.codigo, l.descricao || "—", num(l.fluxoLm, 0), num(l.potenciaW), FPTXT(l.fp)]),
      },
    });
  }
  if (c.peDireitoM != null && lux) blocos.push({ tipo: "texto", texto: `Pé-direito: ${String(c.peDireitoM).replace(".", ",")} m.` });

  c.levantamentos.forEach((l: LevantamentoEstudo, i) => {
    blocos.push({ tipo: "subtitulo", texto: `3.${i + 1} Levantamento: ${l.nome}` });
    blocos.push({ tipo: "texto", texto: `FP da iluminação: ${FPTXT(l.fpIluminacao)}. FP das tomadas de uso geral: ${FPTXT(l.fpTomadas)}.` });
    for (const p of l.pavimentos) {
      if (p.ambientes.length === 0) continue;
      blocos.push({ tipo: "tabela", tabela: tabelaDoPavimento(l.pavimentos.length > 1 ? `Pavimento: ${p.nome}` : undefined, p.ambientes, c, lux, l.pavimentos.length > 1 ? "Total do pavimento" : "Total") });
    }
    const todos = ambientesDoLevantamento(l);
    if (l.pavimentos.filter((p) => p.ambientes.length > 0).length > 1) {
      const t = totaisDosAmbientes(todos, c);
      blocos.push({
        tipo: "tabela",
        tabela: { titulo: "Total do levantamento", colunas: ["Ilum. (VA)", "TUG (un)", "TUG (VA)", "TUG (W)", "TUE (VA)"], linhas: [[emTotal(t.iluminacao), num(t.tug.quantidade, 0), num(t.tug.va, 0), num(t.tug.w), totalTue(t) == null ? "—" : num(totalTue(t), 0)]], primeiraColunaTexto: false },
      });
    }
    const tue = tabelaTue(todos, c);
    if (tue) blocos.push({ tipo: "tabela", tabela: tue });
    for (const a of todos) for (const m of avisosDoAmbiente(a, c.criterioIluminacao, c.peDireitoM, c.luminarias)) avisos.push({ ...m, texto: `${a.nome}: ${m.texto}` });
  });

  const referencias = avisos.flatMap((m) => (m.referencia ? [m.referencia] : []));
  return { blocos, avisos, referencias };
}
