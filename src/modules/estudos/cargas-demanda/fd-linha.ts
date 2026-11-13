import { fdAquecimento as fdAquecimentoCelesc, fdArCondicionado as fdArCelesc } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/celesc";
import { fdAparelhos as fdAparelhosCemig, fdFornosFogoes } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/cemig";
import { fdAquecimento as fdAquecimentoCopel, fdArCondicionado as fdArCopel, fdMotores as fdMotoresCopel } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/copel";
import {
  fdAquecimentoEletrodomesticos,
  fdArCondicionadoEdificio,
  fdArCondicionadoResidencia,
  fdEquipamentoEspecifico,
  fdHidromassagem,
  type GrupoEquipamentoEquatorial,
} from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/equatorial";
import {
  fdAdministracaoEdificios,
  fdAquecedorCentral,
  fdAquecimento as fdAquecimentoNeo,
  fdArCondicionado as fdArNeo,
  fdBombasHidromassagem,
  fdFogao,
  fdRecargaIndividual,
  fdSecadoraFornoLavadoras,
} from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/neoenergia";

import type { Concessionaria, CriterioFdAquecimento, LinhaCargaEstudo, TipoCarga } from "./conteudo";

/**
 * FD sugerido de uma linha de carga — **puro**. A linha pode seguir uma REGRA (`regraFd`): com o `fd` em branco ela adota o
 * sugerido da regra (azul na tela); digitado, o `fd` vale. Os valores vêm sempre da biblioteca (`concessionarias/*`), nunca
 * daqui. A regra só vale na concessionária dela: trocar de concessionária tira a sugestão, não deixa um número velho.
 *
 * O catálogo `REGRAS_FD` liga as tabelas de FD POR NÚMERO DE APARELHOS (e por potência do aparelho) de cada concessionária.
 * Ficam de fora, por não caberem em "um FD por linha": as tabelas de iluminação e tomadas (FD por faixa da carga ou por uso,
 * em degraus) e os motores/equipamentos "o maior e os demais" (a tabela dá kVA por cv). Esses o projetista digita.
 *
 * Contagem de aparelhos: por padrão é a da linha (quantidade × N do escopo). A regra `contagem: "calculo"` soma as linhas do
 * mesmo cálculo que seguem a mesma regra (Neoenergia T7: aparelhos "somados entre si"; Copel T11: nº TOTAL de motores).
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

type LinhaDaRegra = Pick<LinhaCargaEstudo, "regraFd" | "tipoCarga" | "subtipo" | "quantidade" | "potenciaW">;

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
  /** FD pelo nº de aparelhos; `null` = sem sugestão (falta dado ou fora da tabela). */
  fd: (aparelhos: number, l: LinhaDaRegra, ctx: ContextoFd) => number | null;
};

const ATE_3_5 = (l: LinhaDaRegra) => (l.potenciaW == null || !(l.potenciaW > 0) ? null : l.potenciaW <= LIMITE_POTENCIA_APARELHO_W);

const REGRAS_LISTA: readonly RegraFd[] = [
  // Neoenergia — administração de edifícios (Q36): duas linhas, por botão.
  { id: REGRA_NEO_ADM_ILUMINACAO, concessionaria: "neoenergia", tipos: null, rotulo: "Administração de edifícios — iluminação", semContagem: true, fd: () => fdAdministracaoEdificios().iluminacao },
  { id: REGRA_NEO_ADM_TOMADAS, concessionaria: "neoenergia", tipos: null, rotulo: "Administração de edifícios — tomadas", semContagem: true, fd: () => fdAdministracaoEdificios().tomadas },

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
        return grupo ? fdEquipamentoEspecifico(grupo, n).fd : null;
      }
      const ate = ATE_3_5(l);
      return ate == null ? null : fdAquecimentoEletrodomesticos(ate ? "ate_3_5_kW" : "maior_que_3_5_kW", n).fd;
    },
  },
  { id: "eqt-ar-edificio-comerciais", concessionaria: "equatorial", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado de edifício comercial", fd: (n) => fdArCondicionadoEdificio("comerciais", n).fd },
  { id: "eqt-ar-edificio-residenciais", concessionaria: "equatorial", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado de edifício residencial", fd: (n) => fdArCondicionadoEdificio("residenciais", n).fd },
  { id: "eqt-ar-residencia", concessionaria: "equatorial", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado de residência individual", fd: (n) => fdArCondicionadoResidencia(n).fd },
  { id: "eqt-hidromassagem", concessionaria: "equatorial", tipos: ["outro"], rotulo: "Motor-bomba de hidromassagem", fd: (n) => fdHidromassagem(n).fd },

  // Neoenergia
  { id: "neo-aquecimento", concessionaria: "neoenergia", tipos: ["aquecimento"], rotulo: "Chuveiros, torneiras, aquecedores de passagem e ferros", contagem: "calculo", fd: (n) => fdAquecimentoNeo(n).fd },
  { id: "neo-aquecedor-central", concessionaria: "neoenergia", tipos: ["aquecimento"], rotulo: "Aquecedor central ou de acumulação (boiler)", fd: (n) => fdAquecedorCentral(n).fd },
  { id: "neo-secadora-forno-lavadoras", concessionaria: "neoenergia", tipos: ["aquecimento", "tomadas_uso_especifico"], rotulo: "Secadora, forno, lavadora, lava-louças e micro-ondas", fd: (n) => fdSecadoraFornoLavadoras(n).fd },
  { id: "neo-fogao", concessionaria: "neoenergia", tipos: ["aquecimento", "tomadas_uso_especifico"], rotulo: "Fogão elétrico", fd: (n) => fdFogao(n).fd },
  { id: "neo-ar-comercial", concessionaria: "neoenergia", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado comercial", fd: (n) => fdArNeo("comercial", n).fd },
  { id: "neo-ar-residencial", concessionaria: "neoenergia", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado residencial", fd: (n) => fdArNeo("residencial", n).fd },
  { id: "neo-ar-central", concessionaria: "neoenergia", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado — unidade central", semContagem: true, fd: () => fdArNeo("central", 1).fd },
  { id: "neo-recarga", concessionaria: "neoenergia", tipos: ["recarga"], rotulo: "Estação de recarga individual", automatica: true, fd: (n) => fdRecargaIndividual(n).fd },
  { id: "neo-bombas-hidromassagem", concessionaria: "neoenergia", tipos: ["outro"], rotulo: "Bombas e hidromassagem", fd: (n) => fdBombasHidromassagem(n).fd },

  // Celesc
  { id: "celesc-aquecimento", concessionaria: "celesc", tipos: ["aquecimento"], rotulo: "Aparelhos de aquecimento (cada tipo)", automatica: true, fd: (n) => fdAquecimentoCelesc(n).fd },
  { id: "celesc-ar", concessionaria: "celesc", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado", fd: (n) => fdArCelesc(false, n).fd },
  { id: "celesc-ar-central", concessionaria: "celesc", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado — unidade central, órgão público ou única empresa", semContagem: true, fd: () => fdArCelesc(true, 1).fd },

  // Copel
  { id: "copel-aquecimento", concessionaria: "copel", tipos: ["aquecimento"], rotulo: "Chuveiros, torneiras, aquecedores e ferros (cada tipo)", automatica: true, fd: (n) => fdAquecimentoCopel(n).fd },
  { id: "copel-ar-comercial", concessionaria: "copel", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado tipo janela comercial", fd: (n) => fdArCopel("comercial", n).fd },
  { id: "copel-ar-residencial", concessionaria: "copel", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado de unidade residencial", semContagem: true, fd: () => fdArCopel("residencial", 1).fd },
  { id: "copel-ar-central", concessionaria: "copel", tipos: ["ar_condicionado"], rotulo: "Ar-condicionado — unidade central", semContagem: true, fd: () => fdArCopel("central", 1).fd },
  { id: "copel-motores", concessionaria: "copel", tipos: ["motores"], rotulo: "Motores (pelo total de motores)", automatica: true, contagem: "calculo", fd: (n) => fdMotoresCopel(n).fd },

  // Cemig
  {
    id: "cemig-fogoes-fornos",
    concessionaria: "cemig",
    tipos: ["aquecimento", "tomadas_uso_especifico"],
    rotulo: "Fornos e fogões elétricos",
    fd: (n, l) => {
      const ate = ATE_3_5(l);
      return ate == null ? null : fdFornosFogoes(ate ? "ate_3_5kw" : "superior_3_5kw", n).fd;
    },
  },
  { id: "cemig-aparelhos", concessionaria: "cemig", tipos: ["aquecimento", "ar_condicionado", "tomadas_uso_especifico"], rotulo: "Aparelhos eletrodomésticos, de aquecimento, de refrigeração e ar-condicionado", fd: (n) => fdAparelhosCemig(n).fd },
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

/** FD que a regra da linha sugere; `null` = sem regra, regra de outra concessionária ou de outro tipo, ou falta dado. */
export function fdSugeridoDaLinha(ctx: ContextoFd, l: LinhaDaRegra): number | null {
  const id = regraDaLinha(ctx.concessionaria, l);
  if (!regraVale(id, ctx.concessionaria, l.tipoCarga)) return null;
  const r = POR_ID.get(id as string) as RegraFd;
  if (r.semContagem) return r.fd(0, l, ctx);
  const n = aparelhosDaLinha(r, ctx, l);
  return n == null ? null : r.fd(n, l, ctx);
}

/** O FD que vale na linha: o digitado, ou (em branco) o sugerido da regra. */
export function fdEfetivoDaLinha(ctx: ContextoFd, l: Pick<LinhaCargaEstudo, "fd"> & LinhaDaRegra): { fd: number | null; ehSugerido: boolean } {
  if (l.fd != null) return { fd: l.fd, ehSugerido: false };
  const sugerido = fdSugeridoDaLinha(ctx, l);
  return { fd: sugerido, ehSugerido: sugerido != null };
}
