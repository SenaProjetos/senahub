import "server-only";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES, type Role } from "@/lib/roles";
import type { Escalar, Linha } from "@/modules/documentos/tokens";
import { camposDaProposta, camposDoVinculo, formatarResumoAssinaturas, montarEnderecoCliente } from "./campos";

/**
 * O bastante para decidir o gate — id+role, não o `SubjectAutorizacao` inteiro do Estúdio.
 * `resolverFonte` (chamador via `fontes.ts`) passa um `SubjectAutorizacao` normalmente, que
 * satisfaz este tipo por estrutura; `gerar.ts` (chamador via a action do jurídico) passa um
 * `SessionUser` reduzido, sem precisar montar os campos extras que não usa aqui.
 */
export type ViewerMinimo = { id: string; role: string };

/**
 * Fonte de dados "contrato" do Estúdio de Documentos (spec
 * `docs/superpowers/specs/2026-08-27-contratos-no-estudio.md`, Fase E1).
 *
 * Mora no módulo `juridico`, não em `documentos/fontes.ts`, porque o escalar já existe aqui
 * (`campos.ts`) e é testado. Ter duas construções do "salário do contrato" seria duas verdades.
 *
 * ## O gate é POR REGISTRO — e é a razão de este arquivo existir
 *
 * `FonteDef.permissao` autoriza por FONTE, com um `recurso:acao` fixo. Não serve aqui: o mesmo
 * `contratoId` pode apontar para um contrato de CLIENTE (só `juridico:ver`) ou para um contrato de
 * EQUIPE, que carrega salário, CPF e RG e exige `HR_ADMIN_ROLES` desde a Fase A do gerenciador de
 * contratos. Declarar só o gate estático deixaria qualquer um com `juridico:ver` gerar um documento
 * com o salário de um colega.
 */

export type DadosFonte = { escalar: Escalar; linhas: Linha[] };

/** Fonte não autorizada resolve VAZIO, nunca lança — mesma convenção de `resolverModelo`. */
const VAZIO: DadosFonte = { escalar: {}, linhas: [] };

/**
 * A decisão de autorização, isolada e PURA — é o que precisa de teste.
 *
 * Contrato de EQUIPE (`vinculoId` preenchido) expõe salário, CPF e RG: exige `HR_ADMIN_ROLES`.
 * Contrato de CLIENTE não tem dado pessoal de colaborador e passa com o gate da fonte
 * (`juridico:ver`), já aplicado por `podeVerFonte` antes de chegar aqui.
 *
 * Separada do acesso ao banco de propósito: esta é a linha que, se estiver errada, vaza folha de
 * pagamento — e uma linha dessas não pode depender de um teste que precise subir Postgres.
 */
export function podeVerContrato(
  contrato: { vinculoId: string | null },
  viewer: { role: string },
): boolean {
  if (!contrato.vinculoId) return true;
  return HR_ADMIN_ROLES.includes(viewer.role as Role);
}

/**
 * Resolve o contrato para o motor de tokens.
 *
 * **Falha fechado**: contrato inexistente, sem dados ou não autorizado devolve `{}` — igual ao que
 * `resolverModelo` faz com fonte bloqueada, e igual ao que as outras fontes fazem com id inválido.
 * Documento em branco é problema de usabilidade; documento com o salário de outra pessoa é
 * vazamento. `contratoTemDados()` existe para quem precisa distinguir os dois casos.
 */
export async function resolverFonteContrato(
  contratoId: string,
  viewer: ViewerMinimo,
): Promise<DadosFonte> {
  if (!contratoId) return VAZIO;

  const doc = await prisma.documentoJuridico.findUnique({
    where: { id: contratoId },
    include: {
      vinculo: { include: { user: true, pj: true } },
      proposta: { include: { cliente: true, projeto: { select: { codigo: true } } } },
      // Contrato de cliente criado à mão tem `clienteId` SEM `propostaId` — sem isto ele resolveria
      // sem nenhum dado do cliente (achado no teste contra o banco).
      cliente: true,
      projeto: { select: { codigo: true } },
      lancamentos: { orderBy: { vencimento: "asc" } },
      // Fase E7b/M3: quem assinou a versão anterior — só a MAIS RECENTE com alguma assinatura
      // interna/externa importa aqui, então já vem ordenada e enxuta (não a trilha inteira).
      versoes: {
        orderBy: { numero: "desc" },
        select: {
          aceites: { select: { userNome: true, assinadoEm: true, hashArquivo: true } },
          aceitesExternos: { select: { nome: true, assinadoEm: true, hashArquivo: true } },
        },
      },
    },
  });
  if (!doc) return VAZIO;

  // ── O gate por registro ──────────────────────────────────────────────────────────────────
  if (!podeVerContrato(doc, viewer)) return VAZIO;

  const versaoAssinada = doc.versoes.find((v) => v.aceites.length > 0 || v.aceitesExternos.length > 0);
  const ultimaAssinaturaResumo = versaoAssinada
    ? formatarResumoAssinaturas([
        ...versaoAssinada.aceites.map((a) => ({ nome: a.userNome, assinadoEm: a.assinadoEm, hashArquivo: a.hashArquivo })),
        ...versaoAssinada.aceitesExternos.map((a) => ({ nome: a.nome, assinadoEm: a.assinadoEm, hashArquivo: a.hashArquivo })),
      ])
    : null;

  const dadosContrato = {
    titulo: doc.titulo,
    valor: doc.valor ? doc.valor.toNumber() : null,
    dataVencimento: doc.dataVencimento,
    clausulasAdicionais: doc.clausulasAdicionais,
    ultimaAssinaturaResumo,
  };

  // Parcelas viram as LINHAS da fonte: alimentam um elemento `tabela` com o cronograma de
  // pagamento dentro do próprio contrato, que é onde ele pertence.
  const linhas: Linha[] = doc.lancamentos.map((l, i) => ({
    Parcela: i + 1,
    Descricao: l.descricao,
    Valor: l.valor.toNumber(),
    Vencimento: l.vencimento,
  }));

  if (doc.vinculo) {
    const v = doc.vinculo;
    return {
      escalar: camposDoVinculo(
        {
          contratacao: v.contratacao,
          setor: v.setor,
          cargo: v.cargo,
          cargaSemanal: v.cargaSemanal ? v.cargaSemanal.toNumber() : null,
          remuneracao: v.remuneracao ? v.remuneracao.toNumber() : null,
          dataInicio: v.dataInicio,
          dataFim: v.dataFim,
          user: {
            ...v.user,
            // Cache contratual vigente — ver o comentário em `camposDoVinculo` sobre por que o
            // salário NÃO vem do `Vinculo`.
            salarioBase: v.user.salarioBase ? v.user.salarioBase.toNumber() : null,
            cargo: v.user.cargo,
          },
          pj: v.pj ? { razaoSocial: v.pj.razaoSocial, cnpj: v.pj.cnpj, nomeFantasia: v.pj.nomeFantasia } : null,
        },
        dadosContrato,
      ),
      linhas,
    };
  }

  if (doc.proposta) {
    const p = doc.proposta;
    return {
      escalar: camposDaProposta(
        {
          numero: p.numero,
          titulo: p.titulo,
          valor: dadosContrato.valor,
          areaM2: p.areaM2 ? p.areaM2.toNumber() : null,
          cliente: {
            nome: p.cliente.nome,
            documento: p.cliente.documento,
            email: p.cliente.email,
            telefone: p.cliente.telefone,
            endereco: montarEnderecoCliente(p.cliente),
          },
          projetoCodigo: p.projeto?.codigo ?? null,
        },
        dadosContrato,
      ),
      linhas,
    };
  }

  // Contrato de CLIENTE sem proposta: criado à mão pela aba de documentos, com cliente escolhido
  // na lista. Os campos de proposta ficam nulos (não existe proposta), mas os do cliente resolvem
  // — sem este ramo o contrato saía com o nome do cliente em branco.
  if (doc.cliente) {
    const c = doc.cliente;
    return {
      escalar: camposDaProposta(
        {
          numero: "",
          titulo: doc.titulo,
          valor: dadosContrato.valor,
          areaM2: null,
          cliente: {
            nome: c.nome,
            documento: c.documento,
            email: c.email,
            telefone: c.telefone,
            endereco: montarEnderecoCliente(c),
          },
          projetoCodigo: doc.projeto?.codigo ?? null,
        },
        dadosContrato,
      ),
      linhas,
    };
  }

  // Sem âncora nenhuma: só os campos do próprio documento. Não é erro — é um contrato que ainda
  // não foi ligado a vínculo, proposta nem cliente.
  return {
    escalar: {
      ContratoTitulo: dadosContrato.titulo,
      ContratoValor: dadosContrato.valor,
      ContratoVencimento: dadosContrato.dataVencimento,
      ClausulasAdicionais: dadosContrato.clausulasAdicionais,
      UltimaAssinaturaResumo: dadosContrato.ultimaAssinaturaResumo,
    },
    linhas,
  };
}

/**
 * A resolução trouxe dados? Distingue "vazio porque bloqueado/inexistente" de um contrato real.
 *
 * Quem GERA contrato deve recusar quando isto for falso: um PDF com todas as cláusulas em branco é
 * entregável, e alguém pode assiná-lo.
 */
export function contratoTemDados(dados: DadosFonte): boolean {
  return Object.keys(dados.escalar).length > 0;
}
