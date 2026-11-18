import {
  fdAquecimento as fdAquecimentoCelesc,
  fdArCondicionado as fdArCelesc,
  fdIluminacaoTomadasUso as fdIlumCelesc,
  usosIluminacaoTomadas as usosIlumCelesc,
} from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/celesc";
import {
  fdAparelhos as fdAparelhosCemig,
  fdFornosFogoes,
  fdIluminacaoTomadasNaoResidencial as fdIlumCemig,
  usosNaoResidenciais as usosIlumCemig,
} from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/cemig";
import {
  fdAquecimento as fdAquecimentoCopel,
  fdArCondicionado as fdArCopel,
  fdIluminacaoUso as fdIlumCopel,
  fdMotores as fdMotoresCopel,
  usosIluminacao as usosIlumCopel,
} from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/copel";
import {
  fdAquecimentoEletrodomesticos,
  fdArCondicionadoEdificio,
  fdArCondicionadoResidencia,
  fdEquipamentoEspecifico,
  fdHidromassagem,
  fdIluminacaoTomadasNaoResidencial as fdIlumEqt,
  fdIluminacaoTomadasPredioResidencial as fdIlumEqtPredio,
  usosNaoResidenciais as usosIlumEqt,
  type GrupoEquipamentoEquatorial,
} from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/equatorial";
import type { FdProgressivo } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/fd-sugerido";
import {
  fdAdministracaoEdificios,
  fdAquecedorCentral,
  fdAquecimento as fdAquecimentoNeo,
  fdArCondicionado as fdArNeo,
  fdBombasHidromassagem,
  fdFogao,
  fdIluminacaoTomadasUso as fdIlumNeo,
  fdRecargaIndividual,
  fdSecadoraFornoLavadoras,
  usosIluminacaoTomadas as usosIlumNeo,
} from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/neoenergia";
import { aplicarProgressivo, type ParteProgressiva } from "@/modules/ferramentas/calc/cargas-demanda/fd";

import type { Concessionaria, CriterioFdAquecimento, LinhaCargaEstudo, TipoCarga } from "./conteudo";

/**
 * FD sugerido de uma linha de carga — **puro**. A linha pode seguir uma REGRA (`regraFd`): com o `fd` em branco ela adota o
 * sugerido da regra (azul na tela); digitado, o `fd` vale. Os valores vêm sempre da biblioteca (`concessionarias/*`), nunca
 * daqui. A regra só vale na concessionária dela: trocar de concessionária tira a sugestão, não deixa um número velho.
 *
 * O catálogo `REGRAS_FD` liga as tabelas de FD POR NÚMERO DE APARELHOS (e por potência do aparelho) de cada concessionária, e
 * as de iluminação e tomadas POR USO EM DEGRAUS de carga (Neoenergia T22, Cemig T11, Celesc T05, Copel T12, Equatorial T4 e
 * T5 "Prédios Residenciais"). Ficam de fora (o projetista digita): o FD por FAIXA da carga (Neoenergia T6, Cemig T10,
 * Equatorial T5 unidade residencial) e os motores/equipamentos "o maior e os demais" com potência em cv — os dois esperam o
 * engenheiro.
 *
 * Contagem de aparelhos: por padrão é a da linha (quantidade × N do escopo). A regra `contagem: "calculo"` soma as linhas do
 * mesmo cálculo que seguem a mesma regra (Neoenergia T7: aparelhos "somados entre si"; Copel T11: nº TOTAL de motores).
 *
 * Degraus: a carga que percorre os degraus é a SOMA das linhas do cálculo com a mesma regra e o mesmo uso, × N do escopo (o
 * cálculo é o centro de demanda que a norma descreve; a leitura vai ao engenheiro junto com a do FD por faixa). Cada linha do
 * grupo recebe o FD equivalente (demanda dos degraus ÷ carga), de modo que a soma das demandas das linhas é a dos degraus.
 * A unidade da carga é a da tabela: kW, ou kVA na Cemig T11.
 */

export const REGRA_NEO_ADM_ILUMINACAO = "neo-adm-iluminacao";
export const REGRA_NEO_ADM_TOMADAS = "neo-adm-tomadas";
export const REGRA_EQT_AQUECIMENTO = "eqt-aquecimento";

/** Aparelho "até 3,5 kW" é inclusive (as tabelas separam até/acima de 3,5 kW). */
export const LIMITE_POTENCIA_APARELHO_W = 3500;

export const GRUPOS_EQUIPAMENTO_EQUATORIAL: readonly { valor: GrupoEquipamentoEquatorial; rotulo: string }[] = [
  { valor: "chuveiro", rotulo: "Chuveiro elétrico" },
  { valor: "torneira_aquecedor_ferro", rotulo: "Torneira, aquecedor ou ferro" },
  { valor: "fogao", rotulo: "Fogão elétrico" },
  { valor: "secadora_lava_louca_forno_microondas", rotulo: "Secadora, lava-louças ou forno de micro-ondas" },
];

/** FD sugerido e a tabela de onde veio ("Quadro 35, DIS-NOR-053 Rev. 06…"). */
export type FdComFonte = { fd: number | null; referencia: string };

type LinhaDaRegra = Pick<LinhaCargaEstudo, "regraFd" | "tipoCarga" | "subtipo" | "quantidade" | "potenciaW"> & Partial<Pick<LinhaCargaEstudo, "fp">>;

/** Regra por degraus de carga: a tabela do uso (ou a única, sem uso) e a unidade da carga que percorre os degraus. */
type RegraDeDegraus = {
  unidade: "kW" | "kVA";
  /** Usos da tabela, na ordem da norma; ausente = a tabela tem uma linha só (Equatorial, prédio residencial). */
  usos?: () => readonly string[];
  tabela: (uso: string | null) => FdProgressivo | null;
};

export type ContextoFd = {
  concessionaria: Concessionaria | null;
  /** × N do escopo do cálculo. */
  escopoN: number;
  fdAquecimento: CriterioFdAquecimento | null;
  /** Linhas do cálculo: só as regras com `contagem: "calculo"` precisam delas. Sem elas, cada linha conta sozinha. */
  linhas?: readonly LinhaDaRegra[];
};

type RegraFd = {
  id: string;
  concessionaria: Concessionaria;
  /** Tipos de carga em que a tela oferece a regra. `null` = só por botão (nunca na lista). */
  tipos: readonly TipoCarga[] | null;
  rotulo: string;
  /** A regra vale sem a pessoa escolher (única opção do tipo na concessionária). */
  automatica?: boolean;
  /** Sem contagem de aparelhos (a regra é um valor fixo). */
  semContagem?: boolean;
  contagem?: "linha" | "calculo";
  /** FD pelo nº de aparelhos, com a referência da tabela (só o relatório a mostra); `fd` nulo = sem sugestão (falta dado ou fora da tabela). */
  fd?: (aparelhos: number, l: LinhaDaRegra, ctx: ContextoFd) => FdComFonte;
  /** FD por degraus de carga (no lugar de `fd`). */
  degraus?: RegraDeDegraus;
};

/** Usos que têm degraus (a linha "só em texto" da Neoenergia T22, administração de edifícios, tem regra própria por botão). */
const comDegraus = (usos: () => readonly string[], tabela: (uso: string) => FdProgressivo | null) => () => usos().filter((u) => tabela(u)?.degraus != null);
const ILUM_TUG: readonly TipoCarga[] = ["iluminacao", "tomadas_uso_geral"];

const SEM_FD: FdComFonte = { fd: null, referencia: "" };

const ATE_3_5 = (l: LinhaDaRegra) => (l.potenciaW == null || !(l.potenciaW > 0) ? null : l.potenciaW <= LIMITE_POTENCIA_APARELHO_W);

const REGRAS_LISTA: readonly RegraFd[] = [
  // Neoenergia — administração de edifícios (Q36): duas linhas, por botão.
  { id: REGRA_NEO_ADM_ILUMINACAO, concessionaria: "neoenergia", tipos: null, rotulo: "Administração de edifícios — iluminação", semContagem: true, fd: () => { const a = fdAdministracaoEdificios(); return { fd: a.iluminacao, referencia: a.referencia }; } },
  { id: REGRA_NEO_ADM_TOMADAS, concessionaria: "neoenergia", tipos: null, rotulo: "Administração de edifícios — tomadas", semContagem: true, fd: () => { const a = fdAdministracaoEdificios(); return { fd: a.tomadas, referencia: a.referencia }; } },

  // Equatorial — aquecimento: T7 (potência) × T6 (equipamento), à escolha do cálculo (Q33).
  {
    id: REGRA_EQT_AQUECIMENTO,
    concessionaria: "equatorial",
    tipos: ["aquecimento"],
    rotulo: "Aparelhos de aquecimento",
    automatica: true,
    fd: (n, l, ctx) => {
      if ((ctx.fdAquecimento ?? "potencia") === "equipamento") {
        const grupo = GRUPOS_EQUIPAMENTO_EQUATORIAL.find((g) => g.valor === l.subtipo)?.valor ?? null;
        return grupo ? fdEquipamentoEspecifico(grupo, n) : SEM_FD;
      }
      const ate = ATE_3_5(l);
      return ate == null ? SEM_FD : fdAquecimentoEletrodomesticos(ate ? "ate_3_5_kW" : "maior_que_3_5_kW", n);
    },
  },
  { id: "eqt-ar-edificio-comerciais", concessionaria: "equatorial", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado de edifício comercial", fd: (n) => fdArCondicionadoEdificio("comerciais", n) },
  { id: "eqt-ar-edificio-residenciais", concessionaria: "equatorial", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado de edifício residencial", fd: (n) => fdArCondicionadoEdificio("residenciais", n) },
  { id: "eqt-ar-residencia", concessionaria: "equatorial", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado de residência individual", fd: (n) => fdArCondicionadoResidencia(n) },
  { id: "eqt-hidromassagem", concessionaria: "equatorial", tipos: ["outro"], rotulo: "Motor-bomba de hidromassagem", fd: (n) => fdHidromassagem(n) },

  // Neoenergia
  { id: "neo-aquecimento", concessionaria: "neoenergia", tipos: ["aquecimento"], rotulo: "Chuveiros, torneiras, aquecedores de passagem e ferros", contagem: "calculo", fd: (n) => fdAquecimentoNeo(n) },
  { id: "neo-aquecedor-central", concessionaria: "neoenergia", tipos: ["aquecimento"], rotulo: "Aquecedor central ou de acumulação (boiler)", fd: (n) => fdAquecedorCentral(n) },
  { id: "neo-secadora-forno-lavadoras", concessionaria: "neoenergia", tipos: ["aquecimento", "tomadas_uso_especifico"], rotulo: "Secadora, forno, lavadora, lava-louças e micro-ondas", fd: (n) => fdSecadoraFornoLavadoras(n) },
  { id: "neo-fogao", concessionaria: "neoenergia", tipos: ["aquecimento", "tomadas_uso_especifico"], rotulo: "Fogão elétrico", fd: (n) => fdFogao(n) },
  { id: "neo-ar-comercial", concessionaria: "neoenergia", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado comercial", fd: (n) => fdArNeo("comercial", n) },
  { id: "neo-ar-residencial", concessionaria: "neoenergia", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado residencial", fd: (n) => fdArNeo("residencial", n) },
  { id: "neo-ar-central", concessionaria: "neoenergia", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado — unidade central", semContagem: true, fd: () => fdArNeo("central", 1) },
  { id: "neo-recarga", concessionaria: "neoenergia", tipos: ["recarga"], rotulo: "Estação de recarga individual", automatica: true, fd: (n) => fdRecargaIndividual(n) },
  { id: "neo-bombas-hidromassagem", concessionaria: "neoenergia", tipos: ["outro"], rotulo: "Bombas e hidromassagem", fd: (n) => fdBombasHidromassagem(n) },

  // Celesc
  { id: "celesc-aquecimento", concessionaria: "celesc", tipos: ["aquecimento"], rotulo: "Aparelhos de aquecimento (cada tipo)", automatica: true, fd: (n) => fdAquecimentoCelesc(n) },
  { id: "celesc-ar", concessionaria: "celesc", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado", fd: (n) => fdArCelesc(false, n) },
  { id: "celesc-ar-central", concessionaria: "celesc", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado — unidade central, órgão público ou única empresa", semContagem: true, fd: () => fdArCelesc(true, 1) },

  // Copel
  { id: "copel-aquecimento", concessionaria: "copel", tipos: ["aquecimento"], rotulo: "Chuveiros, torneiras, aquecedores e ferros (cada tipo)", automatica: true, fd: (n) => fdAquecimentoCopel(n) },
  { id: "copel-ar-comercial", concessionaria: "copel", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado tipo janela comercial", fd: (n) => fdArCopel("comercial", n) },
  { id: "copel-ar-residencial", concessionaria: "copel", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado de unidade residencial", semContagem: true, fd: () => fdArCopel("residencial", 1) },
  { id: "copel-ar-central", concessionaria: "copel", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado — unidade central", semContagem: true, fd: () => fdArCopel("central", 1) },
  { id: "copel-motores", concessionaria: "copel", tipos: ["motores"], rotulo: "Motores (pelo total de motores)", automatica: true, contagem: "calculo", fd: (n) => fdMotoresCopel(n) },

  // Cemig
  {
    id: "cemig-fogoes-fornos",
    concessionaria: "cemig",
    tipos: ["aquecimento", "tomadas_uso_especifico"],
    rotulo: "Fornos e fogões elétricos",
    fd: (n, l) => {
      const ate = ATE_3_5(l);
      return ate == null ? SEM_FD : fdFornosFogoes(ate ? "ate_3_5kw" : "superior_3_5kw", n);
    },
  },
  { id: "cemig-aparelhos", concessionaria: "cemig", tipos: ["aquecimento", "ar_condicionado", "tomadas_uso_especifico"], rotulo: "Aparelhos eletrodomésticos, de aquecimento, de refrigeração e ar-condicionado", fd: (n) => fdAparelhosCemig(n) },

  // Iluminação e tomadas por uso, em degraus de carga (somando as linhas do cálculo com a mesma regra e o mesmo uso).
  { id: "neo-ilum-tug-uso", concessionaria: "neoenergia", tipos: ILUM_TUG, rotulo: "Iluminação e tomadas por uso (degraus de carga)", degraus: { unidade: "kW", usos: comDegraus(usosIlumNeo, fdIlumNeo), tabela: (u) => (u ? fdIlumNeo(u) : null) } },
  { id: "celesc-ilum-tug-uso", concessionaria: "celesc", tipos: ILUM_TUG, rotulo: "Iluminação e tomadas por uso (degraus de carga)", degraus: { unidade: "kW", usos: comDegraus(usosIlumCelesc, fdIlumCelesc), tabela: (u) => (u ? fdIlumCelesc(u) : null) } },
  { id: "cemig-ilum-tug-uso", concessionaria: "cemig", tipos: ILUM_TUG, rotulo: "Iluminação e tomadas por uso não residencial (degraus de carga)", degraus: { unidade: "kVA", usos: comDegraus(usosIlumCemig, fdIlumCemig), tabela: (u) => (u ? fdIlumCemig(u) : null) } },
  { id: "copel-ilum-uso", concessionaria: "copel", tipos: ["iluminacao"], rotulo: "Iluminação por uso (degraus de carga)", degraus: { unidade: "kW", usos: comDegraus(usosIlumCopel, fdIlumCopel), tabela: (u) => (u ? fdIlumCopel(u) : null) } },
  { id: "eqt-ilum-tug-uso", concessionaria: "equatorial", tipos: ILUM_TUG, rotulo: "Iluminação e tomadas por uso não residencial (degraus de carga)", degraus: { unidade: "kW", usos: comDegraus(usosIlumEqt, fdIlumEqt), tabela: (u) => (u ? fdIlumEqt(u) : null) } },
  { id: "eqt-ilum-tug-predio", concessionaria: "equatorial", tipos: ILUM_TUG, rotulo: "Iluminação e tomadas de prédio residencial (degraus de carga)", degraus: { unidade: "kW", tabela: () => fdIlumEqtPredio() } },
];

const POR_ID = new Map(REGRAS_LISTA.map((r) => [r.id, r]));

/** Regras que a tela oferece para o tipo de carga da linha (`null` = sem tipo: nenhuma). Só as que NÃO são automáticas. */
export function regrasOferecidas(concessionaria: Concessionaria | null, tipoCarga: TipoCarga | null): readonly { id: string; rotulo: string }[] {
  if (concessionaria == null || tipoCarga == null) return [];
  return REGRAS_LISTA.filter((r) => r.concessionaria === concessionaria && r.tipos?.includes(tipoCarga) && !r.automatica).map((r) => ({ id: r.id, rotulo: r.rotulo }));
}

/** A regra gravada ainda cabe no tipo de carga? (As de botão, sem tipos, sempre cabem.) Usado ao trocar o tipo da linha. */
export function regraCabeNoTipo(regraFd: string | null, tipoCarga: TipoCarga | null): boolean {
  if (regraFd == null) return true;
  const r = POR_ID.get(regraFd);
  return r != null && (r.tipos == null || (tipoCarga != null && r.tipos.includes(tipoCarga)));
}

/**
 * A regra que a linha segue: a gravada (`regraFd`) ou, quando a concessionária tem UMA regra automática para o tipo de carga
 * (Equatorial: aquecimento; Celesc/Copel: aquecimento; Neoenergia: recarga; Copel: motores), essa.
 */
export function regraDaLinha(concessionaria: Concessionaria | null, l: Pick<LinhaCargaEstudo, "regraFd" | "tipoCarga">): string | null {
  if (l.regraFd) return l.regraFd;
  if (concessionaria == null || l.tipoCarga == null) return null;
  return REGRAS_LISTA.find((r) => r.automatica && r.concessionaria === concessionaria && r.tipos?.includes(l.tipoCarga as TipoCarga))?.id ?? null;
}

/** A regra existe, vale para a concessionária do estudo e para o tipo de carga da linha? */
export function regraVale(regra: string | null, concessionaria: Concessionaria | null, tipoCarga?: TipoCarga | null): boolean {
  const r = regra == null ? undefined : POR_ID.get(regra);
  if (!r || concessionaria == null || r.concessionaria !== concessionaria) return false;
  return tipoCarga === undefined || r.tipos == null || (tipoCarga != null && r.tipos.includes(tipoCarga));
}

/** Nº de aparelhos que a regra conta: o da linha (× N) ou, em `contagem: "calculo"`, o das linhas do cálculo com a mesma regra. */
function aparelhosDaLinha(r: RegraFd, ctx: ContextoFd, l: LinhaDaRegra): number | null {
  const daLinha = (x: Pick<LinhaDaRegra, "quantidade">) => (x.quantidade != null && x.quantidade > 0 ? x.quantidade : 0);
  if (l.quantidade == null || !(l.quantidade > 0)) return null;
  if (r.contagem !== "calculo" || !ctx.linhas) return Math.round(l.quantidade * ctx.escopoN);
  const soma = ctx.linhas.filter((x) => regraDaLinha(ctx.concessionaria, x) === r.id).reduce((s, x) => s + daLinha(x), 0);
  return Math.round(soma * ctx.escopoN);
}

/** FD e fonte que a regra da linha sugere; `null` = sem regra, regra de outra concessionária ou de outro tipo, ou falta dado. */
export function fdSugeridoComFonte(ctx: ContextoFd, l: LinhaDaRegra): (FdComFonte & { regra: string }) | null {
  const id = regraDaLinha(ctx.concessionaria, l);
  if (!regraVale(id, ctx.concessionaria, l.tipoCarga)) return null;
  const r = POR_ID.get(id as string) as RegraFd;
  if (r.degraus) {
    const d = degrausDaLinha(ctx, l);
    return d == null || d.fdEquivalente == null ? null : { fd: d.fdEquivalente, referencia: d.referencia, regra: r.id };
  }
  if (!r.fd) return null;
  const n = r.semContagem ? 0 : aparelhosDaLinha(r, ctx, l);
  if (n == null) return null;
  const v = r.fd(n, l, ctx);
  return v.fd == null ? null : { ...v, regra: r.id };
}

export type DegrausDaLinha = {
  regra: string;
  /** Uso da tabela (`null` na tabela de uma linha só). */
  uso: string | null;
  unidade: "kW" | "kVA";
  /** Carga do grupo (linhas do cálculo com a mesma regra e o mesmo uso), × N. */
  carga: number;
  partes: readonly ParteProgressiva[];
  demanda: number;
  /** demanda ÷ carga; `null` com a carga zero. */
  fdEquivalente: number | null;
  literal: string | null;
  referencia: string;
  /** Ids das linhas que formam o grupo. */
  linhas: readonly string[];
};

/** Linha com os dados para a carga do grupo; `null` = falta quantidade, potência ou (em kVA) o FP. */
function cargaDaLinhaNaUnidade(x: LinhaDaRegra, unidade: "kW" | "kVA", escopoN: number): number | null {
  if (x.quantidade == null || !(x.quantidade >= 0) || x.potenciaW == null || !(x.potenciaW > 0)) return null;
  const kW = (x.quantidade * x.potenciaW * escopoN) / 1000;
  if (unidade === "kW") return kW;
  return x.fp != null && x.fp > 0 && x.fp <= 1 ? kW / x.fp : null;
}

/**
 * Degraus da linha: a carga do grupo percorre os degraus da tabela do uso. `null` = a regra da linha não é de degraus, falta o
 * uso, o uso está fora da tabela ou alguma linha do grupo ainda não tem os dados da carga (sem sugestão, nunca um número pela metade).
 */
export function degrausDaLinha(ctx: ContextoFd, l: LinhaDaRegra & { id?: string }): DegrausDaLinha | null {
  const id = regraDaLinha(ctx.concessionaria, l);
  if (!regraVale(id, ctx.concessionaria, l.tipoCarga)) return null;
  const r = POR_ID.get(id as string) as RegraFd;
  if (!r.degraus) return null;
  const uso = r.degraus.usos ? l.subtipo : null;
  if (r.degraus.usos && (uso == null || !r.degraus.usos().includes(uso))) return null;
  const t = r.degraus.tabela(uso);
  if (!t?.degraus) return null;
  const grupo = (ctx.linhas ?? [l]).filter((x) => regraDaLinha(ctx.concessionaria, x) === r.id && (r.degraus!.usos ? x.subtipo === uso : true));
  const cargas = grupo.map((x) => cargaDaLinhaNaUnidade(x, r.degraus!.unidade, ctx.escopoN));
  if (cargas.some((c) => c == null)) return null;
  const carga = cargas.reduce<number>((s, c) => s + (c as number), 0);
  const p = aplicarProgressivo(carga, t.degraus);
  return {
    regra: r.id,
    uso,
    unidade: r.degraus.unidade,
    carga,
    partes: p.partes,
    demanda: p.demanda,
    fdEquivalente: carga > 0 ? p.demanda / carga : null,
    literal: t.literal ?? null,
    referencia: t.referencia,
    linhas: grupo.map((x) => (x as { id?: string }).id ?? ""),
  };
}

/** A escolha que a regra da linha pede (uso da tabela de degraus; tipo de equipamento da Equatorial T6). `null` = nenhuma. */
export function escolhaDaRegra(ctx: ContextoFd, l: LinhaDaRegra): { rotulo: string; opcoes: readonly { valor: string; rotulo: string }[] } | null {
  const id = regraDaLinha(ctx.concessionaria, l);
  if (!regraVale(id, ctx.concessionaria, l.tipoCarga)) return null;
  const r = POR_ID.get(id as string) as RegraFd;
  if (r.degraus?.usos) return { rotulo: "Uso da edificação", opcoes: r.degraus.usos().map((u) => ({ valor: u, rotulo: u })) };
  if (r.id === REGRA_EQT_AQUECIMENTO && ctx.fdAquecimento === "equipamento") return { rotulo: "Tipo de equipamento", opcoes: GRUPOS_EQUIPAMENTO_EQUATORIAL };
  return null;
}

/** FD que a regra da linha sugere (só o número). */
export function fdSugeridoDaLinha(ctx: ContextoFd, l: LinhaDaRegra): number | null {
  return fdSugeridoComFonte(ctx, l)?.fd ?? null;
}

/** Rótulo da regra, para o relatório. */
export function rotuloDaRegra(id: string): string | null {
  return POR_ID.get(id)?.rotulo ?? null;
}

/** O FD que vale na linha: o digitado, ou (em branco) o sugerido da regra. */
export function fdEfetivoDaLinha(ctx: ContextoFd, l: Pick<LinhaCargaEstudo, "fd"> & LinhaDaRegra): { fd: number | null; ehSugerido: boolean } {
  if (l.fd != null) return { fd: l.fd, ehSugerido: false };
  const sugerido = fdSugeridoDaLinha(ctx, l);
  return { fd: sugerido, ehSugerido: sugerido != null };
}
