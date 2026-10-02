/**
 * Categorias do plano de contas que o SISTEMA usa para lançar sozinho (N6 do núcleo do Financeiro).
 *
 * O `codigo` ("2.03") é editável em Cadastros e o import do Meu Dinheiro cria "3", "3.01"…: achar a
 * categoria por ele quebrava a folha, o faturamento e a taxa de ART quando alguém renumerava o plano.
 * A identidade estável é a `chave` (migração `20260930120000` deu uma a cada categoria da semente).
 * Os produtores continuam passando o código que já usavam; aqui ele vira chave, com o código como
 * reserva para banco sem a chave (categoria renomeada antes da migração).
 */

export const CHAVE_POR_CODIGO: Readonly<Record<string, string>> = {
  "1.01": "receita_projetos_particulares",
  "1.02": "receita_licitacoes",
  "1.03": "receita_outras",
  "2.01": "despesa_projetistas_pj",
  "2.02": "despesa_freelancers",
  "2.03": "despesa_folha_clt",
  "2.04": "despesa_estagiarios",
  "2.05": "despesa_fornecedores",
  "2.06": "despesa_administrativas",
  "2.07": "despesa_impostos",
  "2.08": "despesa_pro_labore",
  "2.09": "despesa_art_rrt",
};

type Achar = {
  categoriaFinanceira: {
    findFirst(args: { where: { chave: string } | { codigo: string }; select: { id: true } }): Promise<{ id: string } | null>;
  };
};

/** Id da categoria do sistema (chave primeiro, código de reserva); `null` se o plano não a tem. */
export async function acharCategoriaDoSistema(db: Achar, codigo: string): Promise<string | null> {
  const chave = CHAVE_POR_CODIGO[codigo];
  if (chave) {
    const porChave = await db.categoriaFinanceira.findFirst({ where: { chave }, select: { id: true } });
    if (porChave) return porChave.id;
  }
  return (await db.categoriaFinanceira.findFirst({ where: { codigo }, select: { id: true } }))?.id ?? null;
}

/** Frase única quando a categoria do sistema sumiu do plano. */
export function mensagemCategoriaAusente(codigo: string): string {
  return `A categoria ${codigo} (${CHAVE_POR_CODIGO[codigo] ?? "do sistema"}) não está no plano de contas: restaure-a em Cadastros ou rode npm run db:seed.`;
}
