import type { FatorDoMetodo, PassoDoMetodo, ResultadoAreaUtil } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/tipos";
import type { Mensagem } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";

import { TIPO_CARGA_ROTULO, type CalculoEstudo, type ConteudoCargasDemanda } from "../conteudo";
import { fatorEmPercentual } from "../fator-escala";
import { formatarNumeroBR } from "../numero-br";
import { fdSugeridoComFonte, rotuloDaRegra } from "../fd-linha";
import { calcularCalculoDeCargaInstalada, resumoDoEstudo } from "../resultado";
import { type BlocoRel, type Celula, num, type TabelaRel } from "./tipos";

/**
 * Seção 4 do relatório — cálculos de demanda — **puro**. Cada cálculo de carga instalada vira uma tabela de linhas; os
 * apartamentos (método da área útil) viram tabela de tipos, de fatores (com a origem: norma ou digitado) e de passos; a
 * composição do empreendimento fecha a seção. Devolve também os avisos e a fonte de cada valor, para as seções 6 e 7.
 */

export type FonteDoValor = { valor: string; referencia: string };
export type SecaoDemandas = { blocos: BlocoRel[]; avisos: Mensagem[]; fontes: FonteDoValor[] };

const origemDoFator = (f: FatorDoMetodo) => (f.digitado ? "Digitado" : f.sugerido == null ? "Digitado (sem valor da norma)" : "Norma");

/** O motor recebe o id do tipo de apartamento; o relatório mostra o nome que a pessoa digitou (como a tela). */
export function nomesDosTipos(c: ConteudoCargasDemanda): Record<string, string> {
  return Object.fromEntries(c.calculos.filter((k) => k.metodo === "area_util").flatMap((k) => k.apartamentos.map((t, i) => [t.id, t.nome.trim() || `Tipo ${i + 1}`])));
}

export function comNomes(rotulo: string, nomes: Record<string, string>): string {
  let r = rotulo;
  for (const [id, nome] of Object.entries(nomes)) r = r.split(id).join(nome);
  return r;
}

/** Fator em fração; a Neoenergia (coincidência) aparece em %, como na tela. */
function celulaDoFator(concessionaria: string | null, f: FatorDoMetodo, v: number | null): Celula {
  if (v == null) return "—";
  return num(fatorEmPercentual(concessionaria, f.chave) ? v * 100 : v, 2);
}

function rotuloDoFator(concessionaria: string | null, f: FatorDoMetodo, nomes: Record<string, string>): string {
  return comNomes(f.rotulo, nomes) + (f.simbolo ? ` (${f.simbolo})` : "") + (fatorEmPercentual(concessionaria, f.chave) ? ", %" : f.unidade ? `, ${f.unidade}` : "");
}

function tabelaDeFatores(concessionaria: string | null, titulo: string, fatores: readonly FatorDoMetodo[], nomes: Record<string, string>): TabelaRel {
  return {
    titulo,
    colunas: ["Fator", "Sugerido pela norma", "Adotado", "Origem"],
    linhas: fatores.map((f) => [rotuloDoFator(concessionaria, f, nomes), celulaDoFator(concessionaria, f, f.sugerido), celulaDoFator(concessionaria, f, f.adotado), origemDoFator(f)]),
  };
}

function tabelaDePassos(passos: readonly PassoDoMetodo[]): TabelaRel {
  return {
    titulo: "Passos do cálculo",
    colunas: ["Passo", "Fórmula", "Valor", "Un."],
    linhas: passos.map((p) => [p.rotulo + (p.simbolo ? ` (${p.simbolo})` : ""), p.formula ?? "—", num(p.valor, 2), p.unidade]),
  };
}

function blocosDeAreaUtil(conc: string | null, titulo: string, r: ResultadoAreaUtil, fontes: FonteDoValor[], nomes: Record<string, string>): BlocoRel[] {
  const blocos: BlocoRel[] = [
    { tipo: "tabela", tabela: tabelaDeFatores(conc, titulo, r.fatores, nomes) },
    { tipo: "tabela", tabela: tabelaDePassos(r.passos) },
  ];
  if (r.fatorDoConjunto) blocos.push({ tipo: "tabela", tabela: tabelaDeFatores(conc, "Fator do conjunto", [r.fatorDoConjunto], nomes) });
  for (const f of [...r.fatores, ...(r.fatorDoConjunto ? [r.fatorDoConjunto] : [])]) if (f.referencia) fontes.push({ valor: comNomes(f.rotulo, nomes), referencia: f.referencia });
  return blocos;
}

function tabelaDeCarga(c: ConteudoCargasDemanda, k: CalculoEstudo, avisos: Mensagem[], fontes: FonteDoValor[]): TabelaRel {
  const r = calcularCalculoDeCargaInstalada(k, c.concessionaria);
  const ctx = { concessionaria: c.concessionaria, escopoN: k.escopo.quantidade, fdAquecimento: k.fdAquecimento, linhas: k.linhas };
  const linhas: Celula[][] = k.linhas.map((l, i) => {
    const calc = r.linhas[i];
    let origemFd = "—";
    if (calc.fd != null) {
      if (l.fd != null) origemFd = "Digitado";
      else {
        const s = fdSugeridoComFonte(ctx, l);
        origemFd = s ? "Tabela da concessionária" : "—";
        if (s) fontes.push({ valor: `FD de ${l.descricao.trim() || "linha"} (${k.nome}): ${rotuloDaRegra(s.regra) ?? s.regra}`, referencia: s.referencia });
      }
    }
    for (const m of calc.avisos) avisos.push({ ...m, texto: `${k.nome}, ${l.descricao.trim() || `linha ${i + 1}`}: ${m.texto}` });
    return [
      l.descricao.trim() || "—",
      l.tipoCarga ? TIPO_CARGA_ROTULO[l.tipoCarga] : "—",
      num(l.quantidade, 0),
      num(l.potenciaW == null ? null : l.potenciaW / 1000),
      l.fp == null ? "—" : formatarNumeroBR(l.fp, 2, 2),
      num(calc.cargaKW),
      num(calc.cargaKVA),
      num(calc.fd),
      origemFd,
      num(calc.demandaKVA),
    ];
  });
  linhas.push(["Total do cálculo", "", "", "", "", num(r.cargaKW), num(r.cargaKVA), "", "", num(r.demandaKVA)]);
  return {
    colunas: ["Descrição", "Tipo de carga", "Qtd", "Potência (kW)", "FP", "Carga inst. (kW)", "Carga inst. (kVA)", "FD", "Origem do FD", "Demanda (kVA)"],
    linhas,
    ultimaEhTotal: true,
  };
}

const PAPEL: Record<string, string> = {
  condominio: "condomínio", incendio: "incêndio", especial: "cargas especiais", comercial: "cargas comerciais (lojas)",
  recarga: "recarga de veículos elétricos", duplex: "duplex (aquecimento e ar-condicionado)", apartamentos: "apartamentos por carga instalada",
};

export function secaoDemandas(c: ConteudoCargasDemanda, levantamentoNome: (id: string) => string): SecaoDemandas {
  const blocos: BlocoRel[] = [];
  const avisos: Mensagem[] = [];
  const fontes: FonteDoValor[] = [];
  const resumo = resumoDoEstudo(c);
  const nomes = nomesDosTipos(c);
  let n = 0;

  // Apartamentos pelo método da área útil: um bloco só (os tipos de todos os cálculos de área útil).
  const tiposPorCalculo = c.calculos.filter((k) => k.metodo === "area_util");
  if (tiposPorCalculo.length > 0) {
    n += 1;
    blocos.push({ tipo: "subtitulo", texto: `4.${n} Apartamentos, método da área útil (todos os CMDs)` });
    blocos.push({
      tipo: "tabela",
      tabela: {
        titulo: "Tipos de apartamento",
        colunas: ["Cálculo", "Tipo", "Área útil (m²)", "Nº de apartamentos", "Duplex", "Carga instalada da unidade (kW)"],
        linhas: tiposPorCalculo.flatMap((k) =>
          k.apartamentos.map((t): Celula[] => {
            const t2 = resumo.tipos.tipos.find((x) => x.nome === t.id);
            return [k.nome, t.nome, num(t.areaUtilM2), num(t.quantidade, 0), t.duplex ? "Sim" : "Não", num(t2?.cargaInstaladaKW ?? null)];
          }),
        ),
      },
    });
    if (resumo.nivel?.apartamentos) blocos.push(...blocosDeAreaUtil(c.concessionaria, "Fatores dos apartamentos", resumo.nivel.apartamentos, fontes, nomes));
    if (resumo.nivel?.duplex) blocos.push(...blocosDeAreaUtil(c.concessionaria, "Fatores dos duplex", resumo.nivel.duplex, fontes, nomes));
    avisos.push(...resumo.tipos.avisos);
  }

  for (const k of c.calculos) {
    if (k.metodo !== "carga_instalada") continue;
    n += 1;
    const papel = k.papel ? PAPEL[k.papel] : "unidade individual (não entra no prédio)";
    blocos.push({ tipo: "subtitulo", texto: `4.${n} ${k.nome || "Cálculo"}, carga instalada` });
    const escopo = k.escopo.levantamentoIds.map(levantamentoNome).filter(Boolean);
    blocos.push({ tipo: "texto", texto: `Papel: ${papel}. ${escopo.length > 0 ? `Levantamentos do escopo: ${escopo.join(", ")}; quantidade (× N): ${k.escopo.quantidade}.` : "Sem levantamento no escopo: cargas digitadas."}` });
    if (k.linhas.length === 0) blocos.push({ tipo: "texto", texto: "O cálculo não tem linhas de carga." });
    else blocos.push({ tipo: "tabela", tabela: tabelaDeCarga(c, k, avisos, fontes) });
  }

  // Composição do empreendimento (todos os cálculos com papel + apartamentos).
  const nivel = resumo.nivel;
  if (nivel) {
    n += 1;
    blocos.push({ tipo: "subtitulo", texto: `4.${n} Demanda do empreendimento (composição)` });
    blocos.push({ tipo: "texto", texto: `Fórmula da concessionária: ${nivel.formula}.` });
    blocos.push({
      tipo: "tabela",
      tabela: {
        colunas: ["Parcela", "Símbolo", "Valor", "Un."],
        linhas: [...nivel.parcelas.filter((p) => p.calculos.length > 0 || p.valor !== 0).map((p): Celula[] => [p.rotulo, p.simbolo, num(p.valor), p.unidade]), ["Demanda do empreendimento", "", num(nivel.demandaKVA), "kVA"]],
        ultimaEhTotal: true,
      },
    });
    if (nivel.fatores.length > 0) blocos.push({ tipo: "tabela", tabela: tabelaDeFatores(c.concessionaria, "Fatores da composição", nivel.fatores, nomes) });
    for (const f of nivel.fatores) if (f.referencia) fontes.push({ valor: f.rotulo, referencia: f.referencia });
    if (nivel.referencia) fontes.push({ valor: "Fórmula da demanda do empreendimento", referencia: nivel.referencia });
    avisos.push(...nivel.avisos);
    if (resumo.atendimento) {
      avisos.push(...resumo.atendimento.mensagens);
    }
  }
  if (blocos.length === 0) blocos.push({ tipo: "texto", texto: "Nenhum cálculo de demanda foi lançado neste estudo." });
  return { blocos, avisos, fontes };
}
