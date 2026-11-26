/**
 * Tela por pessoa (pool de recursos, parte 2 — o "Planejador de Equipe" do MS Project; decisões G–L do planejamento):
 * uma faixa por pessoa com tudo o que ela faz em todos os cronogramas, as barras que se sobrepõem empilhadas, o dia
 * acima da jornada marcado e, no fim, a faixa das tarefas sem ninguém.
 *
 * PURO e seguro no cliente: recebe as linhas agendadas, as pessoas e as sobrecargas DIÁRIAS que `cargaDaEquipe` já
 * calcula (a mesma régua do alerta do cronograma) e monta o que a tela desenha. Nada aqui grava: o arrasto (parte 4) tem as
 * regras em `planejador-acoes.ts` e escreve pelos serviços da EAP.
 */
import type { Dia } from "@/lib/calendario-trabalho";
import { corDoProjeto, type CorProjeto } from "./cor-projeto";
import type { SobrecargaDia } from "./recursos";

export type EscalaPlanejador = "dias" | "semanas";

/** O que a tela recebe de `cargaDaEquipe` (`LinhaAgendada`), sem depender do arquivo server-only. */
export type LinhaDoPlanejador = {
  id: string;
  projetoId: string;
  nome: string;
  disciplina: string | null;
  inicio: Dia;
  fim: Dia;
  rascunho: boolean;
  marco: boolean;
  /** Tem início real (a data não se arrasta). Ausente = não. */
  iniciada?: boolean;
  deTerceiro: boolean;
  /** O parceiro da etapa de terceiro (pool de recursos, parte 6). Ausente ou nulo = Externo sem nome (sem faixa). */
  parceiro?: { id: string; nome: string } | null;
  pessoas: readonly { userId: string; horas: number }[];
};

/** Parceiro externo cadastrado (os ativos têm faixa mesmo sem tarefa na janela). */
export type ParceiroDoPlanejador = { id: string; nome: string; disciplina: string | null };

/** A faixa de um parceiro externo: só prazos, sem horas, sem carga e sem alerta (decisão 4). */
export type FaixaDoParceiro = {
  parceiroId: string;
  nome: string;
  disciplina: string | null;
  barras: BarraDoPlanejador[];
  niveis: number;
};

export type PessoaDoPlanejador = { userId: string; nome: string; horasPorDia: number; disciplinas: readonly string[] };

export type ProjetoDoPlanejador = { codigo: string; nome: string; cor: string | null };

export type BarraDoPlanejador = {
  /** Linha + pessoa: a mesma linha aparece na faixa de cada pessoa dela. */
  chave: string;
  linhaId: string;
  projetoId: string;
  codigoProjeto: string;
  nome: string;
  disciplina: string | null;
  inicio: Dia;
  fim: Dia;
  rascunho: boolean;
  marco: boolean;
  iniciada: boolean;
  /** Todas as pessoas da linha (trocar para quem já está nela é recusado). */
  pessoasDaLinha: string[];
  /** Horas da pessoa nesta linha (0 na faixa "sem ninguém"). */
  horas: number;
  cor: CorProjeto;
  /** Andar da barra dentro da faixa (0 = em cima). */
  nivel: number;
};

export type ParcelaDoDia = { projetoId: string; codigoProjeto: string; linha: string; horas: number; rascunho: boolean };

export type DiaDeConflito = {
  dia: Dia;
  carga: number;
  capacidade: number;
  parcelas: ParcelaDoDia[];
  /** Códigos dos projetos em RASCUNHO que entram no dia ("com Z (rascunho)"). */
  rascunhos: string[];
  motivos: string[];
};

export type FaixaDaPessoa = {
  userId: string;
  nome: string;
  disciplinas: string[];
  horasPorDia: number;
  barras: BarraDoPlanejador[];
  niveis: number;
  conflitos: DiaDeConflito[];
};

export type Planejador = {
  faixas: FaixaDaPessoa[];
  /** Faixas dos parceiros externos, depois das pessoas (some com o filtro de pessoa). */
  parceiros: FaixaDoParceiro[];
  semNinguem: { barras: BarraDoPlanejador[]; niveis: number };
  /** Projetos com barra na janela (a legenda e o filtro de cronograma). */
  projetos: { id: string; codigo: string; nome: string; cor: CorProjeto; rascunho: boolean }[];
  /** Disciplinas das barras da janela (o filtro). */
  disciplinas: string[];
  /** Pessoa-dia acima da jornada nas faixas mostradas. */
  totalConflitos: number;
};

export type FiltrosDoPlanejador = { disciplina?: string | null; projetoId?: string | null; userId?: string | null };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Empilha as barras: cada uma no primeiro andar em que não encosta na anterior. Devolve quantos andares usou. */
export function empilhar<T extends { inicio: Dia; fim: Dia; nivel: number }>(barras: T[]): number {
  const fimDoAndar: Dia[] = [];
  const ordem = [...barras].sort((a, b) => a.inicio.localeCompare(b.inicio) || b.fim.localeCompare(a.fim));
  for (const b of ordem) {
    let andar = fimDoAndar.findIndex((fim) => fim < b.inicio);
    if (andar === -1) {
      andar = fimDoAndar.length;
      fimDoAndar.push(b.fim);
    } else fimDoAndar[andar] = b.fim;
    b.nivel = andar;
  }
  return fimDoAndar.length;
}

export function montarPlanejador(entrada: {
  linhas: readonly LinhaDoPlanejador[];
  pessoas: readonly PessoaDoPlanejador[];
  sobrecargas: readonly SobrecargaDia[];
  projetos: Readonly<Record<string, ProjetoDoPlanejador>>;
  linhasNomes: Readonly<Record<string, { nome: string }>>;
  janela: { de: Dia; ate: Dia };
  filtros?: FiltrosDoPlanejador;
  /** Parceiros externos ativos (pool de recursos, parte 6). */
  parceiros?: readonly ParceiroDoPlanejador[];
}): Planejador {
  const { de, ate } = entrada.janela;
  const f = entrada.filtros ?? {};
  const naJanelaTodas = entrada.linhas.filter((l) => l.fim >= de && l.inicio <= ate);
  // A etapa de terceiro não entra na faixa de ninguém da casa; com parceiro, vai para a faixa dele.
  const naJanela = naJanelaTodas.filter((l) => !l.deTerceiro);
  const deParceiro = naJanelaTodas.filter((l) => l.deTerceiro && l.parceiro);

  const projetoDe = (id: string) => entrada.projetos[id] ?? { codigo: "?", nome: "Projeto", cor: null };
  const disciplinas = [...new Set([...naJanela, ...deParceiro].map((l) => l.disciplina).filter((d): d is string => !!d))].sort((a, b) =>
    a.localeCompare(b),
  );
  const projetosVistos = new Map<string, { id: string; codigo: string; nome: string; cor: CorProjeto; rascunho: boolean }>();
  for (const l of [...naJanela, ...deParceiro]) {
    const p = projetoDe(l.projetoId);
    projetosVistos.set(l.projetoId, { id: l.projetoId, codigo: p.codigo, nome: p.nome, cor: corDoProjeto({ id: l.projetoId, cor: p.cor }), rascunho: l.rascunho });
  }

  const passa = (l: LinhaDoPlanejador) =>
    (!f.disciplina || (l.disciplina != null && semAcento(l.disciplina) === semAcento(f.disciplina))) && (!f.projetoId || l.projetoId === f.projetoId);
  const filtradas = naJanela.filter(passa);

  const barra = (l: LinhaDoPlanejador, userId: string | null, horas: number, chave?: string): BarraDoPlanejador => {
    const p = projetoDe(l.projetoId);
    return {
      chave: chave ?? `${l.id}:${userId ?? "-"}`,
      linhaId: l.id,
      projetoId: l.projetoId,
      codigoProjeto: p.codigo,
      nome: l.nome,
      disciplina: l.disciplina,
      inicio: l.inicio,
      fim: l.fim,
      rascunho: l.rascunho,
      marco: l.marco,
      iniciada: l.iniciada ?? false,
      pessoasDaLinha: l.pessoas.map((x) => x.userId),
      horas,
      cor: corDoProjeto({ id: l.projetoId, cor: p.cor }),
      nivel: 0,
    };
  };

  const porPessoa = new Map<string, BarraDoPlanejador[]>();
  const semNinguem: BarraDoPlanejador[] = [];
  for (const l of filtradas) {
    if (l.pessoas.length === 0) {
      semNinguem.push(barra(l, null, 0));
      continue;
    }
    for (const p of l.pessoas) porPessoa.set(p.userId, [...(porPessoa.get(p.userId) ?? []), barra(l, p.userId, p.horas)]);
  }

  const conflitosPorPessoa = new Map<string, DiaDeConflito[]>();
  for (const s of entrada.sobrecargas) {
    if (s.dia < de || s.dia > ate) continue;
    const parcelas = s.parcelas.map((pc) => ({
      projetoId: pc.projetoId,
      codigoProjeto: projetoDe(pc.projetoId).codigo,
      linha: entrada.linhasNomes[pc.linhaId]?.nome ?? "Tarefa",
      horas: Math.round(pc.horas * 10) / 10,
      rascunho: pc.rascunho,
    }));
    const dia: DiaDeConflito = {
      dia: s.dia,
      carga: s.carga,
      capacidade: s.capacidade,
      parcelas,
      rascunhos: [...new Set(parcelas.filter((p) => p.rascunho).map((p) => p.codigoProjeto))],
      motivos: s.motivosReducao,
    };
    conflitosPorPessoa.set(s.userId, [...(conflitosPorPessoa.get(s.userId) ?? []), dia]);
  }

  const filtrando = !!(f.disciplina || f.projetoId);
  const faixas: FaixaDaPessoa[] = [];
  for (const p of entrada.pessoas) {
    if (f.userId && p.userId !== f.userId) continue;
    const barras = porPessoa.get(p.userId) ?? [];
    if (filtrando && barras.length === 0) continue;
    const niveis = empilhar(barras);
    faixas.push({
      userId: p.userId,
      nome: p.nome,
      disciplinas: [...new Set([...p.disciplinas, ...barras.map((b) => b.disciplina).filter((d): d is string => !!d)])].sort((a, b) =>
        a.localeCompare(b),
      ),
      horasPorDia: p.horasPorDia,
      barras,
      niveis,
      conflitos: (conflitosPorPessoa.get(p.userId) ?? []).sort((a, b) => a.dia.localeCompare(b.dia)),
    });
  }
  faixas.sort((a, b) => a.nome.localeCompare(b.nome));
  const niveisSemNinguem = empilhar(semNinguem);

  // Parceiros: os ativos sempre (como as pessoas com recurso ativo), o arquivado só com tarefa na janela. O filtro de pessoa
  // tira todos; o de disciplina ou cronograma deixa só quem tem barra.
  const porParceiro = new Map<string, { nome: string; barras: BarraDoPlanejador[] }>();
  for (const l of deParceiro.filter(passa)) {
    const pc = l.parceiro!;
    const atual = porParceiro.get(pc.id) ?? { nome: pc.nome, barras: [] };
    atual.barras.push(barra(l, null, 0, `${l.id}:parceiro:${pc.id}`));
    porParceiro.set(pc.id, atual);
  }
  const cadastro = new Map((entrada.parceiros ?? []).map((p) => [p.id, p]));
  const parceiros: FaixaDoParceiro[] = [];
  if (!f.userId) {
    for (const id of new Set([...cadastro.keys(), ...porParceiro.keys()])) {
      const barras = porParceiro.get(id)?.barras ?? [];
      if (filtrando && barras.length === 0) continue;
      const c = cadastro.get(id);
      parceiros.push({ parceiroId: id, nome: c?.nome ?? porParceiro.get(id)!.nome, disciplina: c?.disciplina ?? null, barras, niveis: empilhar(barras) });
    }
  }
  parceiros.sort((a, b) => a.nome.localeCompare(b.nome));

  return {
    faixas,
    parceiros,
    semNinguem: { barras: semNinguem, niveis: niveisSemNinguem },
    projetos: [...projetosVistos.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    disciplinas,
    totalConflitos: faixas.reduce((s, fx) => s + fx.conflitos.length, 0),
  };
}

// ─────────────────────────────────────────────────────────────
// Janela e escala
// ─────────────────────────────────────────────────────────────

export function somarDias(dia: Dia, n: number): Dia {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

export function segundaDe(dia: Dia): Dia {
  const dow = new Date(`${dia}T00:00:00Z`).getUTCDay();
  return somarDias(dia, -((dow + 6) % 7));
}

/** Quantos dias cabem: 3 semanas em dias, 12 em semanas (o que o mockup mostra de cara). */
export const DIAS_DA_ESCALA: Record<EscalaPlanejador, number> = { dias: 21, semanas: 84 };

/** A janela: começa na segunda da semana de `de` (ou de hoje) e tem o tamanho da escala. */
export function janelaDoPlanejador(escala: EscalaPlanejador, inicio: Dia): { de: Dia; ate: Dia } {
  const de = segundaDe(inicio);
  return { de, ate: somarDias(de, DIAS_DA_ESCALA[escala] - 1) };
}

/** Recuar/avançar: uma semana em dias, quatro em semanas. */
export function deslocarJanela(escala: EscalaPlanejador, de: Dia, direcao: -1 | 1): Dia {
  return somarDias(de, direcao * (escala === "dias" ? 7 : 28));
}

/** Posição da barra na janela, em dias desde `de` (cortada nas bordas). `null` = fora. */
export function posicaoNaJanela(inicio: Dia, fim: Dia, janela: { de: Dia; ate: Dia }): { inicio: number; dias: number } | null {
  if (fim < janela.de || inicio > janela.ate) return null;
  const a = inicio < janela.de ? janela.de : inicio;
  const b = fim > janela.ate ? janela.ate : fim;
  const dia0 = Date.parse(`${janela.de}T00:00:00Z`);
  const ini = Math.round((Date.parse(`${a}T00:00:00Z`) - dia0) / 86_400_000);
  const fimN = Math.round((Date.parse(`${b}T00:00:00Z`) - dia0) / 86_400_000);
  return { inicio: ini, dias: fimN - ini + 1 };
}

/** "Conflito em 26/11" ou "3 dias de conflito, desde 26/11"; com " · com Z (rascunho)" quando há rascunho no meio. */
export function resumoDoConflitoDaPessoa(conflitos: readonly DiaDeConflito[], dataCurta: (d: Dia) => string): string | null {
  if (conflitos.length === 0) return null;
  const primeiro = dataCurta(conflitos[0].dia);
  const base = conflitos.length === 1 ? `Conflito em ${primeiro}` : `${conflitos.length} dias de conflito, desde ${primeiro}`;
  const rascunhos = [...new Set(conflitos.flatMap((c) => c.rascunhos))];
  return rascunhos.length > 0 ? `${base} · com ${rascunhos.join(", ")} (rascunho)` : base;
}
