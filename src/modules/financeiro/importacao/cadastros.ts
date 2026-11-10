/**
 * Validação de cadastros da importação financeira (PURA: sem Prisma, sem `server-only`).
 *
 * Regra única do que a prévia mostra e do que o commit grava: as duas chamam `resolverLinha` sobre o
 * mesmo `IndiceCadastros` (a prévia sobre uma leitura, o commit de novo dentro da transação), então a
 * tela nunca aceita o que o commit recusa.
 *
 * Modo estrito (`criarCadastros: false`, padrão da tela): categoria, conta, forma e centro desconhecidos
 * são erro na linha; contato novo só com CPF/CNPJ válido. Com `criarCadastros: true` o importador cria
 * o que não acha (migração do Meu Dinheiro). Nos dois modos: categoria do tipo errado, projeto e sócio
 * desconhecidos são erro — nunca se cria uma categoria duplicada no outro tipo.
 */
import { validarCpfCnpj, soDigitos } from "@/lib/documento";
import { chaveMatch } from "@/lib/import/valores";
import { CATEGORIA_TRANSFERENCIA, type LinhaNorm, type SaldoInicial } from "@/modules/financeiro/importacao/processar";

type TipoCat = "receita" | "despesa";

export type CategoriaIdx = { id: string; tipo: TipoCat; codigo: string; nomeChave: string; paiNomeChave: string | null };

export type IndiceCadastros = {
  categorias: CategoriaIdx[];
  /** chaveMatch(nome) → id */
  contas: Map<string, string>;
  formas: Map<string, string>;
  centros: Map<string, string>;
  /** código em maiúsculas, sem espaços nas pontas → id */
  projetos: Map<string, string>;
  socios: { id: string; nomeChave: string; emailChave: string }[];
  /** porDoc: só dígitos → id; porNome: chaveMatch(nome) → id */
  fornecedores: { porDoc: Map<string, string>; porNome: Map<string, string> };
  clientes: { porDoc: Map<string, string>; porNome: Map<string, string> };
};

export type ResolucaoLinha = {
  erros: string[];
  /** null = criar (só com `criarCadastros`) ou linha de transferência (categoria do sistema). */
  categoriaId: string | null;
  projetoId: string | null;
  socioId: string | null;
  criaContato: boolean;
};

export type OpcoesCadastro = { criarCadastros: boolean };

const NOME_TIPO: Record<TipoCat, string> = { receita: "receita", despesa: "despesa" };

/** Chave do código do projeto: sem diferenciar caixa nem espaço nas pontas. */
export function chaveProjeto(codigo: string): string {
  return codigo.trim().toUpperCase();
}

function erroTipo(rotulo: string, tipoCategoria: TipoCat, tipoLinha: TipoCat): string {
  return `Categoria «${rotulo}» é de ${NOME_TIPO[tipoCategoria]}, a linha é ${NOME_TIPO[tipoLinha]}.`;
}

function resolverCategoria(
  l: LinhaNorm,
  idx: IndiceCadastros,
  o: OpcoesCadastro,
): { categoriaId: string | null; erro: string | null } {
  const texto = l.categoriaNome.trim();
  const sub = l.subcategoriaNome.trim();

  // 1) Código do plano de contas tem prioridade sobre o nome.
  const porCodigo = idx.categorias.find((c) => c.codigo === texto);
  if (porCodigo) {
    if (porCodigo.tipo !== l.tipo) return { categoriaId: null, erro: erroTipo(texto, porCodigo.tipo, l.tipo) };
    if (!sub) return { categoriaId: porCodigo.id, erro: null };
    // Subcategoria sob um código: só a filha que já existe (não se cria filha sob código).
    const filha = idx.categorias.find(
      (c) => c.tipo === l.tipo && c.paiNomeChave === porCodigo.nomeChave && c.nomeChave === chaveMatch(sub),
    );
    return filha
      ? { categoriaId: filha.id, erro: null }
      : { categoriaId: null, erro: `Categoria «${texto} > ${sub}» não existe no plano de contas.` };
  }

  // 2) Por nome: com subcategoria, a filha daquele pai; sem, a de topo.
  const kNome = chaveMatch(texto);
  const kSub = chaveMatch(sub);
  const rotulo = sub ? `${texto} > ${sub}` : texto;
  const casa = (c: CategoriaIdx) =>
    sub ? c.paiNomeChave === kNome && c.nomeChave === kSub : c.paiNomeChave === null && c.nomeChave === kNome;
  const doTipo = idx.categorias.find((c) => c.tipo === l.tipo && casa(c));
  if (doTipo) return { categoriaId: doTipo.id, erro: null };
  const doOutroTipo = idx.categorias.find((c) => c.tipo !== l.tipo && casa(c));
  if (doOutroTipo) return { categoriaId: null, erro: erroTipo(rotulo, doOutroTipo.tipo, l.tipo) };
  if (o.criarCadastros) return { categoriaId: null, erro: null };
  return { categoriaId: null, erro: `Categoria «${rotulo}» não existe no plano de contas.` };
}

function resolverSocio(ref: string, idx: IndiceCadastros): { socioId: string | null; erro: string | null } {
  const k = chaveMatch(ref);
  const exatos = idx.socios.filter((s) => s.nomeChave === k || s.emailChave === k);
  if (exatos.length === 1) return { socioId: exatos[0].id, erro: null };
  // O banco trunca o nome do favorecido ("LUCIO HENRIQUE SENA DA SI"): aceita o começo do nome.
  const candidatos = exatos.length > 1 ? exatos : idx.socios.filter((s) => s.nomeChave.startsWith(k));
  if (candidatos.length === 0) return { socioId: null, erro: `Sócio «${ref}» não encontrado.` };
  if (candidatos.length > 1) return { socioId: null, erro: `Sócio «${ref}» é ambíguo.` };
  return { socioId: candidatos[0].id, erro: null };
}

export function resolverLinha(l: LinhaNorm, idx: IndiceCadastros, o: OpcoesCadastro): ResolucaoLinha {
  const erros: string[] = [];
  let categoriaId: string | null = null;

  // Transferência usa a categoria do sistema (natureza transferencia), não a da planilha.
  if (l.categoriaNome !== CATEGORIA_TRANSFERENCIA && l.categoriaNome) {
    const c = resolverCategoria(l, idx, o);
    categoriaId = c.categoriaId;
    if (c.erro) erros.push(c.erro);
  }

  if (!o.criarCadastros) {
    if (l.contaNome && !idx.contas.has(chaveMatch(l.contaNome))) erros.push(`Conta «${l.contaNome}» não existe.`);
    if (l.formaNome && !idx.formas.has(chaveMatch(l.formaNome))) erros.push(`Forma de pagamento «${l.formaNome}» não existe.`);
    if (l.centroNome && !idx.centros.has(chaveMatch(l.centroNome))) erros.push(`Centro de custo «${l.centroNome}» não existe.`);
  }

  let projetoId: string | null = null;
  if (l.projetoCodigo.trim()) {
    projetoId = idx.projetos.get(chaveProjeto(l.projetoCodigo)) ?? null;
    if (!projetoId) erros.push(`Projeto «${l.projetoCodigo.trim()}» não existe.`);
  }

  let socioId: string | null = null;
  if (l.socioRef.trim()) {
    const s = resolverSocio(l.socioRef.trim(), idx);
    socioId = s.socioId;
    if (s.erro) erros.push(s.erro);
  }

  let criaContato = false;
  if (l.contatoNome || l.contatoDoc) {
    const lista = l.tipo === "despesa" ? idx.fornecedores : idx.clientes;
    const doc = soDigitos(l.contatoDoc);
    const docValido = doc !== "" && validarCpfCnpj(doc);
    const existe =
      (docValido && lista.porDoc.has(doc)) || (l.contatoNome !== "" && lista.porNome.has(chaveMatch(l.contatoNome)));
    if (!existe) {
      if (docValido || o.criarCadastros) criaContato = true;
      else erros.push(`Contato «${l.contatoNome || l.contatoDoc}» não existe e a linha não tem CPF/CNPJ válido.`);
    }
  }

  return { erros, categoriaId, projetoId, socioId, criaContato };
}

export function errosDoSaldoInicial(s: SaldoInicial, idx: IndiceCadastros, o: OpcoesCadastro): string[] {
  if (o.criarCadastros) return [];
  return idx.contas.has(chaveMatch(s.contaNome)) ? [] : [`Conta «${s.contaNome}» não existe.`];
}
