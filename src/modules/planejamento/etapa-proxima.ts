/**
 * Aviso da etapa que vem (reunião de 08/10/2026, decisão 4). Regras puras, sem I/O.
 *
 * "Etapa" é a fase de uma disciplina (`DisciplinaEtapa`: Estrutural · Básico). O início dela é o
 * menor início previsto (do motor) entre as linhas da EAP com essa disciplina e essa fase. O aviso
 * sai quando faltam `ANTECEDENCIA_DIAS_UTEIS` dias úteis ou menos para começar — uma vez por etapa e
 * data de início (a chave está no banco). Não é aviso de prazo vencendo: esse o time recusou.
 *
 * Datas em `YYYY-MM-DD`.
 */
import { somarDiasUteis, type Calendario } from "@/lib/calendario-trabalho";

export const ANTECEDENCIA_DIAS_UTEIS = 2;

export type LinhaDeEtapa = {
  disciplinaEtapaId: string;
  inicio: string;
  /** A linha já começou de verdade (data real ou % > 0)? */
  iniciada: boolean;
  /** Pessoas atribuídas à linha (perfil sem pessoa e Externo ficam de fora). */
  pessoas: readonly string[];
};

export type EtapaAAvisar = {
  disciplinaEtapaId: string;
  inicio: string;
  pessoas: string[];
};

/**
 * Etapas que começam daqui a no máximo `ANTECEDENCIA_DIAS_UTEIS` dias úteis e ainda não começaram.
 *
 * Janela, e não "exatamente D-2": se o job não rodou num dia (servidor parado, feriado mal
 * cadastrado), o aviso ainda sai no dia seguinte; a chave no banco impede o segundo. Etapa com
 * qualquer linha já iniciada não avisa — a pessoa já está nela. Sem ninguém atribuído também não
 * (o coordenador é somado por quem chama).
 */
export function etapasParaAvisar(linhas: readonly LinhaDeEtapa[], hoje: string, cal: Calendario): EtapaAAvisar[] {
  const porEtapa = new Map<string, { inicio: string; iniciada: boolean; pessoas: Set<string> }>();
  for (const l of linhas) {
    const e = porEtapa.get(l.disciplinaEtapaId) ?? { inicio: l.inicio, iniciada: false, pessoas: new Set<string>() };
    if (l.inicio < e.inicio) e.inicio = l.inicio;
    e.iniciada ||= l.iniciada;
    for (const p of l.pessoas) e.pessoas.add(p);
    porEtapa.set(l.disciplinaEtapaId, e);
  }

  const out: EtapaAAvisar[] = [];
  for (const [disciplinaEtapaId, e] of porEtapa) {
    if (e.iniciada || hoje >= e.inicio) continue;
    if (hoje < somarDiasUteis(e.inicio, -ANTECEDENCIA_DIAS_UTEIS, cal)) continue;
    out.push({ disciplinaEtapaId, inicio: e.inicio, pessoas: [...e.pessoas].sort() });
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.disciplinaEtapaId.localeCompare(b.disciplinaEtapaId));
}

/** Texto do aviso — mesmo para quem executa e para a coordenação. */
export function textoAvisoEtapa(e: { disciplina: string; etapa: string; projetoCodigo: string; inicio: string }): {
  titulo: string;
  corpo: string;
} {
  const data = e.inicio.split("-").reverse().join("/");
  return {
    titulo: `Próxima etapa: ${e.disciplina} · ${e.etapa}`,
    corpo: `${e.projetoCodigo} — começa em ${data}. As atividades dela já aparecem no seu ponto e em Meu trabalho a partir do início.`,
  };
}
