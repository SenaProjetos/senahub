/**
 * Quais contas a pagar o fechamento da folha gera (R4; decisões 21 e 22 do spec 2026-09-15). PURO, em
 * centavos. Categoria por CHAVE: a subcategoria; se o plano do usuário não a tiver, o gravador cai na mãe.
 */
export type ParteDaFolha = "liquido_clt" | "bolsa" | "inss_retido" | "irrf_retido" | "fgts" | "beneficio" | "taxa_agente";
export type LancamentoPlanejado = {
  parte: ParteDaFolha;
  /** Nome do benefício; "" nas outras partes. */
  rotulo: string;
  chaveCategoria: string;
  valorCent: number;
  /**
   * "salario" = vencimento do salário; "dia20" = guias (dia 20 do mês SEGUINTE, dia útil anterior);
   * "dia20_mesmo_mes" = INSS e IRRF do 13º, que vencem no dia 20 do PRÓPRIO mês (dezembro; decisão do dono
   * 2026-10-11). O FGTS do 13º segue a regra do mês seguinte.
   */
  vence: "salario" | "dia20" | "dia20_mesmo_mes";
  descricao: string;
};

/** Item de benefício do custo do mês (`beneficio_0`, ou `clt:beneficio_0` quando o mês teve dois vínculos). */
export const ehItemDeBeneficio = (chave: string) => /(^|:)beneficio_\d+$/.test(chave);

/** Item da taxa do agente de integração (`taxa_agente`, ou `estagio:taxa_agente` com dois vínculos no mês). */
export const ehItemDaTaxaDoAgente = (chave: string) => /(^|:)taxa_agente$/.test(chave);

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function chaveDoBeneficio(nome: string): string {
  const n = semAcento(nome);
  if (n.includes("transporte")) return "despesa_folha_vale_transporte";
  if (n.includes("refeicao") || n.includes("alimentacao")) return "despesa_folha_vale_refeicao";
  return "despesa_folha_clt";
}

export function planoDaFolha(p: {
  tipo: "mensal" | "decimo_terceiro";
  rotuloFolha: string;
  liquidoCltCent: number;
  liquidoEstagioCent: number;
  inssRetidoCent: number | null;
  irrfRetidoCent: number | null;
  fgtsCent: number | null;
  beneficios: { nome: string; valorCent: number }[];
  /**
   * Taxa do agente de integração (IEL) dos estagiários contratados por ele, a mesma que entra no custo
   * da hora (decisão do dono 2026-10-11). Só na folha mensal.
   */
  taxaAgenteCent?: number;
}): { lancamentos: LancamentoPlanejado[]; avisos: string[] } {
  const decimo = p.tipo === "decimo_terceiro";
  const salario = decimo ? "despesa_folha_decimo_terceiro" : "despesa_folha_salarios";
  const lancamentos: LancamentoPlanejado[] = [];
  const avisos: string[] = [];
  const add = (l: Omit<LancamentoPlanejado, "descricao">, descricao: string) => {
    if (l.valorCent > 0) lancamentos.push({ ...l, descricao: `${descricao} — folha ${p.rotuloFolha}` });
  };
  add({ parte: "liquido_clt", rotulo: "", chaveCategoria: salario, valorCent: p.liquidoCltCent, vence: "salario" }, "Folha CLT (líquido)");
  if (!decimo) add({ parte: "bolsa", rotulo: "", chaveCategoria: "despesa_estagio_bolsa", valorCent: p.liquidoEstagioCent, vence: "salario" }, "Bolsa de estágio");
  if (p.inssRetidoCent == null && p.irrfRetidoCent == null && p.fgtsCent == null) {
    avisos.push("INSS, IRRF e FGTS não informados — nada lançado para as guias.");
  } else {
    const guiaRetida = decimo ? "dia20_mesmo_mes" : "dia20";
    add({ parte: "inss_retido", rotulo: "", chaveCategoria: salario, valorCent: p.inssRetidoCent ?? 0, vence: guiaRetida }, "INSS descontado dos funcionários");
    add({ parte: "irrf_retido", rotulo: "", chaveCategoria: salario, valorCent: p.irrfRetidoCent ?? 0, vence: guiaRetida }, "IRRF descontado dos funcionários");
    add({ parte: "fgts", rotulo: "", chaveCategoria: "despesa_folha_fgts", valorCent: p.fgtsCent ?? 0, vence: "dia20" }, "FGTS");
  }
  if (!decimo) {
    for (const b of p.beneficios) add({ parte: "beneficio", rotulo: b.nome, chaveCategoria: chaveDoBeneficio(b.nome), valorCent: b.valorCent, vence: "salario" }, b.nome);
    add({ parte: "taxa_agente", rotulo: "", chaveCategoria: "despesa_estagio_taxa_agente", valorCent: p.taxaAgenteCent ?? 0, vence: "salario" }, "Taxa do agente de integração (IEL)");
  }
  return { lancamentos, avisos };
}
