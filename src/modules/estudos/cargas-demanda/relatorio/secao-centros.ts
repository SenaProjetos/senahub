import type { Mensagem } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";
import type { ResultadoNivel } from "@/modules/ferramentas/calc/cargas-demanda/niveis";

import { LIGACAO_ROTULO } from "@/modules/ferramentas/calc/cargas-demanda/corrente";
import { type ConteudoCargasDemanda } from "../conteudo";
import { apartamentosDistribuidos, entradaEfetiva, unidadesIndividuais, type AlvoEntrada } from "../edicao-centros";
import { calcularEntrada, metodosDeInstalacao, type ResultadoEntrada } from "../entrada-estudo";
import { calcularCalculoDeCargaInstalada, calcularPredio } from "../resultado";
import { fatorEmPercentual } from "../fator-escala";
import { comNomes, nomesDosTipos, type FonteDoValor } from "./secao-demandas";
import { type BlocoRel, type Celula, num, type TabelaRel } from "./tipos";

/**
 * Seção 5 do relatório — centros de medição e entradas — **puro**. Comparativo CMD 1, 2… e CPG (composição e demanda) e, por
 * nível, corrente, disjuntor e cabo com as condições de instalação. Devolve os avisos e as fontes para as seções 6 e 7.
 */

export type SecaoCentros = { blocos: BlocoRel[]; avisos: Mensagem[]; fontes: FonteDoValor[] };

const dash = "—";

function tabelaComparativa(c: ConteudoCargasDemanda): { tabela: TabelaRel | null; avisos: Mensagem[]; fontes: FonteDoValor[] } {
  const { predio } = calcularPredio(c);
  const avisos: Mensagem[] = [];
  const fontes: FonteDoValor[] = [];
  if (!predio || c.centros.cmds.length === 0) return { tabela: null, avisos, fontes };
  const dist = apartamentosDistribuidos(c);
  const niveis: { nome: string; r: ResultadoNivel; medidores: number | null; capacidade: number | null; apartamentos: number }[] = [
    ...predio.cmds.map((m) => {
      const cmd = c.centros.cmds.find((x) => x.id === m.id);
      const apts = (cmd?.medidores ?? []).reduce((s, md) => s + (md.tipo === "residencial" ? md.quantidade : 0), 0);
      return { nome: m.nome, r: m as ResultadoNivel, medidores: m.medidores, capacidade: cmd?.capacidade ?? null, apartamentos: apts };
    }),
    { nome: "CPG", r: predio.cpg, medidores: null, capacidade: null, apartamentos: dist.noPredio },
  ];
  const linha = (rotulo: string, f: (n: (typeof niveis)[number]) => Celula): Celula[] => [rotulo, ...niveis.map(f)];
  const linhas: Celula[][] = [
    linha("Capacidade de medidores", (n) => (n.capacidade == null ? dash : num(n.capacidade, 0))),
    linha("Medidores", (n) => (n.medidores == null ? dash : num(n.medidores, 0))),
    linha("Apartamentos", (n) => num(n.apartamentos, 0)),
  ];
  // Passos e fatores dos apartamentos, pela chave, na ordem em que o CPG os traz.
  const nomes = nomesDosTipos(c);
  const cpgApt = predio.cpg.apartamentos;
  for (const p of cpgApt?.passos ?? []) {
    linhas.push(linha(`${p.rotulo}${p.simbolo ? ` (${p.simbolo})` : ""}, ${p.unidade}`, (n) => num(n.r.apartamentos?.passos.find((x) => x.chave === p.chave)?.valor ?? null)));
  }
  for (const f of cpgApt?.fatores ?? []) {
    if (/^dapto/i.test(f.chave) || /demanda por apartamento/i.test(f.rotulo)) continue;
    const pct = fatorEmPercentual(c.concessionaria, f.chave);
    linhas.push(linha(`${comNomes(f.rotulo, nomes)}${f.simbolo ? ` (${f.simbolo})` : ""}${pct ? ", %" : ""}`, (n) => {
      const v = n.r.apartamentos?.fatores.find((x) => x.chave === f.chave)?.adotado ?? null;
      return num(v == null ? null : pct ? v * 100 : v);
    }));
    if (f.referencia) fontes.push({ valor: comNomes(f.rotulo, nomes), referencia: f.referencia });
  }
  if (cpgApt) linhas.push(linha("Demanda dos apartamentos (kVA)", (n) => num(n.r.apartamentos?.demandaKVA ?? null)));
  const chaves = new Map<string, string>();
  for (const n of niveis) for (const p of n.r.parcelas) if (!chaves.has(p.chave) && (p.calculos.length > 0 || p.valor !== 0)) chaves.set(p.chave, `${p.rotulo} (${p.unidade})`);
  for (const [chave, rotulo] of chaves) {
    linhas.push(linha(rotulo, (n) => {
      const p = n.r.parcelas.find((x) => x.chave === chave);
      return p ? num(p.valor) : dash;
    }));
  }
  linhas.push(linha("Demanda total (kVA)", (n) => num(n.r.demandaKVA)));
  linhas.push(linha("Carga instalada (kW)", (n) => num(n.r.cargaInstaladaKW)));
  for (const m of predio.cmds) for (const a of m.avisosDoCmd) avisos.push({ ...a, texto: `${m.nome}: ${a.texto}` });
  avisos.push(...predio.avisos);
  avisos.push(...predio.cpg.atendimento.mensagens);
  for (const n of niveis) avisos.push(...n.r.avisos);
  return { tabela: { colunas: ["Item", ...niveis.map((n) => n.nome)], linhas, ultimaEhTotal: false }, avisos, fontes };
}

type AlvoComNome = { nome: string; alvo: AlvoEntrada; demandaKVA: number | null };

function textoDasCondicoes(c: ConteudoCargasDemanda, alvo: AlvoEntrada): string {
  const e = entradaEfetiva(c, alvo);
  const metodo = e.metodoInstalacao ? metodosDeInstalacao().find((m) => m.valor === e.metodoInstalacao) : null;
  const partes = [
    metodo ? `método de instalação ${metodo.referencia} (${metodo.descricao})` : "método de instalação não escolhido",
    e.isolacao ? (e.isolacao === "PVC" ? "isolação PVC 70 °C" : "isolação EPR ou XLPE 90 °C") : "isolação não escolhida",
    e.material ? (e.material === "cobre" ? "cobre" : "alumínio") : "material não escolhido",
    e.carregados ? `${e.carregados} condutores carregados` : "condutores carregados não escolhidos",
  ];
  if (e.temperaturaC != null) partes.push(`${String(e.temperaturaC).replace(".", ",")} °C`);
  if (e.circuitos != null && e.circuitos > 1) partes.push(`${e.circuitos} circuitos agrupados`);
  return partes.join(", ");
}

function linhaDaEntrada(a: AlvoComNome, r: ResultadoEntrada): Celula[] {
  return [
    a.nome,
    num(a.demandaKVA),
    num(r.correnteA),
    num(r.fct?.adotado ?? null),
    num(r.fca?.adotado ?? null),
    num(r.ibCorrigidaA),
    num(r.disjuntorAdotadoA, 0),
    num(r.secaoFinal?.adotadaMm2 ?? null, Number.isInteger(r.secaoFinal?.adotadaMm2 ?? 0) ? 0 : 1),
    num(r.neutro?.sugeridaMm2 ?? null, 0),
    num(r.protecao?.sugeridaMm2 ?? null, 0),
  ];
}

export function secaoCentros(c: ConteudoCargasDemanda): SecaoCentros {
  const blocos: BlocoRel[] = [];
  const avisos: Mensagem[] = [];
  const fontes: FonteDoValor[] = [];

  const comp = tabelaComparativa(c);
  avisos.push(...comp.avisos);
  fontes.push(...comp.fontes);
  blocos.push({ tipo: "subtitulo", texto: "5.1 Composição e demanda" });
  if (comp.tabela) {
    blocos.push({ tipo: "tabela", tabela: comp.tabela });
    const dist = apartamentosDistribuidos(c);
    const { predio } = calcularPredio(c);
    if (dist.noPredio > 0 && predio) {
      const soma = predio.cmds.reduce((s, m) => s + (m.demandaKVA ?? 0), 0);
      blocos.push({ tipo: "texto", texto: `O CPG usa o total de apartamentos do prédio (${dist.noPredio}), e não a soma das demandas dos CMDs (${soma.toFixed(2).replace(".", ",")} kVA).` });
    }
  } else {
    blocos.push({ tipo: "texto", texto: "Nenhum CMD foi lançado neste estudo." });
  }

  // Entradas: CMDs, CPG e unidades individuais.
  const { predio } = calcularPredio(c);
  const alvos: AlvoComNome[] = [];
  for (const m of c.centros.cmds) alvos.push({ nome: m.nome, alvo: { nivel: "cmd", cmdId: m.id }, demandaKVA: predio?.cmds.find((x) => x.id === m.id)?.demandaKVA ?? null });
  if (predio && c.centros.cmds.length > 0) alvos.push({ nome: "CPG", alvo: { nivel: "cpg" }, demandaKVA: predio.cpg.demandaKVA });
  for (const k of unidadesIndividuais(c)) alvos.push({ nome: k.nome || "Unidade", alvo: { nivel: "calculo", calculoId: k.id }, demandaKVA: calcularCalculoDeCargaInstalada(k, c.concessionaria).demandaKVA });

  blocos.push({ tipo: "subtitulo", texto: "5.2 Corrente, disjuntor e cabo" });
  if (alvos.length === 0) {
    blocos.push({ tipo: "texto", texto: "Sem CMD, CPG ou unidade individual para dimensionar." });
    return { blocos, avisos, fontes };
  }
  const sistema = c.sistema ? `${c.sistema} V` : null;
  blocos.push({ tipo: "texto", texto: `${sistema ?? "Sistema de tensão não informado"}${c.ligacao ? `, ${LIGACAO_ROTULO[c.ligacao].toLowerCase()}` : ", ligação não informada"}. Seção sugerida pela capacidade de condução, sem queda de tensão.` });
  const linhas: Celula[][] = [];
  const condicoes = new Map<string, string[]>();
  const vistos = new Set<string>();
  for (const a of alvos) {
    const r = calcularEntrada(entradaEfetiva(c, a.alvo), a.demandaKVA, c.sistema, c.ligacao);
    linhas.push(linhaDaEntrada(a, r));
    const texto = textoDasCondicoes(c, a.alvo);
    condicoes.set(texto, [...(condicoes.get(texto) ?? []), a.nome]);
    for (const m of r.avisos) {
      const t = `${a.nome}: ${m.texto}`;
      if (!vistos.has(t)) {
        vistos.add(t);
        avisos.push({ ...m, texto: t });
      }
    }
    for (const f of [r.fct, r.fca, r.fatorResistividade]) if (f?.referencia) fontes.push({ valor: f.rotulo, referencia: f.referencia });
    if (r.secao?.referencia) fontes.push({ valor: "Capacidade de condução", referencia: r.secao.referencia });
    if (r.neutro?.referencia) fontes.push({ valor: "Neutro", referencia: r.neutro.referencia });
    if (r.protecao?.referencia) fontes.push({ valor: "Proteção", referencia: r.protecao.referencia });
  }
  blocos.push({
    tipo: "tabela",
    tabela: {
      colunas: ["Circuito", "Demanda (kVA)", "Corrente de projeto (A)", "FCT", "FCA", "Corrente corrigida (A)", "Disjuntor (A)", "Seção (mm²)", "Neutro (mm²)", "Proteção (mm²)"],
      linhas,
    },
  });
  blocos.push({ tipo: "lista", itens: [...condicoes].map(([texto, nomesDosAlvos]) => `${nomesDosAlvos.join(", ")}: ${texto}.`) });
  return { blocos, avisos, fontes };
}
