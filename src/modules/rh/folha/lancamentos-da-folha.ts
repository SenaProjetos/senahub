/**
 * Quais contas a pagar o fechamento da folha gera (R4; decisões 21 e 22 do spec 2026-09-15). PURO, em
 * centavos. Categoria por CHAVE: a subcategoria; se o plano do usuário não a tiver, o gravador cai na mãe.
 */
export type ParteDaFolha = "liquido_clt" | "bolsa" | "inss_retido" | "irrf_retido" | "fgts" | "beneficio";
export type LancamentoPlanejado = {
  parte: ParteDaFolha;
  /** Nome do benefício; "" nas outras partes. */
  rotulo: string;
  chaveCategoria: string;
  valorCent: number;
  /** "salario" = vencimento do salário; "dia20" = guias (dia 20 do mês seguinte, dia útil anterior). */
  vence: "salario" | "dia20";
  descricao: string;
};

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
    add({ parte: "inss_retido", rotulo: "", chaveCategoria: salario, valorCent: p.inssRetidoCent ?? 0, vence: "dia20" }, "INSS descontado dos funcionários");
    add({ parte: "irrf_retido", rotulo: "", chaveCategoria: salario, valorCent: p.irrfRetidoCent ?? 0, vence: "dia20" }, "IRRF descontado dos funcionários");
    add({ parte: "fgts", rotulo: "", chaveCategoria: "despesa_folha_fgts", valorCent: p.fgtsCent ?? 0, vence: "dia20" }, "FGTS");
  }
  if (!decimo) {
    for (const b of p.beneficios) add({ parte: "beneficio", rotulo: b.nome, chaveCategoria: chaveDoBeneficio(b.nome), valorCent: b.valorCent, vence: "salario" }, b.nome);
  }
  return { lancamentos, avisos };
}
