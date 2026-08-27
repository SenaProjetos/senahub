"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { HR_ADMIN_ROLES, type Role } from "@/lib/roles";
import { devePassarPorAprovacao } from "@/lib/aprovacao";
import { brl } from "@/lib/utils";
import { limiteAprovacaoContrato } from "@/modules/juridico/config";
import { comRetentativaDeConflito, registrarEventoAssinatura } from "@/modules/juridico/assinatura/service";
import { gerarVersaoDeModelo as gerarVersaoDeModeloContrato } from "@/modules/juridico/contrato/gerar";
import { decidirPrazoDoProjeto, devePassarParaAssinado, ehDocumentoContratual } from "@/modules/juridico/contrato/estado";
import { gerarRecebiveisDoContrato } from "@/modules/juridico/contrato/recebiveis";
import { registrarAlteracaoContratual, type MotivoContratual } from "@/modules/rh/contratual/service";

const base = { modulo: "juridico", recurso: "juridico", permissao: "gerir" } as const;
const rev = () => revalidatePath("/juridico");
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

/**
 * Contrato de EQUIPE (`vinculoId` setado) carrega dado sensível de RH — salário, CPF. Quem só
 * tem `juridico:gerir` não deve ler/escrever isso de graça; exige `HR_ADMIN_ROLES` também.
 * Contrato de CLIENTE (sem `vinculoId`) segue só o gate normal do módulo.
 *
 * Nota pra Fase E (assinatura interna, spec `2026-08-26-gerenciador-contratos.md`): quando o
 * FUNCIONÁRIO precisar ver/assinar o PRÓPRIO contrato, este gate vai precisar de uma 2ª condição
 * ("é HR" OU "é o dono do vínculo") — hoje só cobre a superfície de GESTÃO (RH administrando
 * contrato de terceiro), não o self-service da pessoa lendo o que é dela. Ainda não implementado.
 */
function ehHrAdmin(role: Role): boolean {
  return HR_ADMIN_ROLES.includes(role);
}

/**
 * H4 — sair de "rascunho" (por edição de status OU por assinar a 1ª versão, que é a mesma coisa
 * do ponto de vista de negócio) com valor acima da alçada exige sócio. Único ponto de checagem —
 * `atualizarContratoEquipe` e `registrarAceite` chamam este helper em vez de duplicar a regra.
 */
async function exigirSocioSeAcimaDaAlcada(valor: number | null | undefined, ctx: { role: Role; ehSocio: boolean }) {
  if (valor == null) return;
  const limite = await limiteAprovacaoContrato();
  if (devePassarPorAprovacao("despesa", valor, limite) && !ctx.ehSocio && ctx.role !== "admin") {
    throw new ActionError(`Contrato de ${brl(valor)} acima do limite (${brl(limite)}) exige aprovação de um sócio.`);
  }
}

const docSchema = z.object({
  titulo: z.string().min(1, "Informe o título."),
  tipo: z.enum(["contrato", "aditivo", "proposta", "procuracao", "outro"]),
  projetoId: opt(z.string()),
  clienteId: opt(z.string()),
  pastaId: opt(z.string()),
  observacao: opt(z.string()),
  vinculoId: opt(z.string()),
  dataVencimento: opt(z.string()),
  valor: z.number().nonnegative().optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

export const criarDocJuridico = defineAction(
  { ...base, acao: "criar-doc", entidade: "DocumentoJuridico", schema: docSchema },
  async (i, ctx) => {
    if (i.vinculoId && !ehHrAdmin(ctx.user.role)) {
      throw new ActionError("Só RH pode criar contrato de equipe.");
    }
    const d = await prisma.documentoJuridico.create({
      data: {
        titulo: i.titulo,
        tipo: i.tipo,
        projetoId: i.projetoId || null,
        clienteId: i.clienteId || null,
        pastaId: i.pastaId || null,
        observacao: i.observacao || null,
        vinculoId: i.vinculoId || null,
        dataVencimento: i.dataVencimento ? new Date(i.dataVencimento) : null,
        valor: i.valor ?? null,
        // Contrato E aditivo nascem rascunho (predicado único em `contrato/estado.ts`): os dois
        // são assinados, vencem e obrigam. Procuração/proposta/outro ficam sem status.
        statusContrato: ehDocumentoContratual(i.tipo) ? "rascunho" : null,
      },
    });
    rev();
    return { id: d.id };
  },
);

const contratoEquipeUpdateSchema = z.object({
  id: z.string().min(1),
  dataVencimento: opt(z.string()),
  // Nullable (não só optional): o form sempre manda um valor — número ou `null` pra limpar.
  // `optional()` sozinho deixaria "campo vazio" indistinguível de "não mexer", e a atualização
  // silenciosamente preservaria o valor antigo (Prisma ignora `undefined` no `data`).
  valor: z.number().nonnegative().nullable().optional(),
  statusContrato: z.enum(["rascunho", "aguardando_assinatura", "assinado", "vencido", "rescindido"]).optional(),
});

/** Edita vencimento/valor/status de um contrato de equipe já criado. Mesmo gate da criação. */
export const atualizarContratoEquipe = defineAction(
  { ...base, acao: "atualizar-contrato-equipe", entidade: "DocumentoJuridico", schema: contratoEquipeUpdateSchema },
  async (i, ctx) => {
    if (!ehHrAdmin(ctx.user.role)) throw new ActionError("Só RH pode editar contrato de equipe.");
    const alvo = await prisma.documentoJuridico.findUnique({
      where: { id: i.id },
      select: { vinculoId: true, valor: true, statusContrato: true },
    });
    if (!alvo) throw new ActionError("Documento não encontrado.");
    if (!alvo.vinculoId) throw new ActionError("Este documento não é um contrato de equipe.");

    // H4 — alçada: sair de "rascunho" com valor alto exige sócio. `i.valor`/`i.statusContrato`
    // podem chegar junto nesta mesma chamada (editar valor e status de uma vez) — usa o valor
    // EFETIVO pós-update, não o que já estava salvo.
    const statusNovo = i.statusContrato ?? alvo.statusContrato;
    const valorNovo = i.valor !== undefined ? i.valor : alvo.valor?.toNumber();
    const saindoDeRascunho = alvo.statusContrato === "rascunho" && statusNovo !== "rascunho";
    if (saindoDeRascunho) await exigirSocioSeAcimaDaAlcada(valorNovo, ctx.user);

    await prisma.documentoJuridico.update({
      where: { id: i.id },
      data: {
        dataVencimento: i.dataVencimento ? new Date(i.dataVencimento) : i.dataVencimento === "" ? null : undefined,
        // Marca do alerta (compare-and-swap, Fase A) significa "já avisei sobre ESTE vencimento".
        // Renovação = mesma ação, novo `dataVencimento` → reseta a marca, senão um contrato
        // renovado (o caso de uso central: teto de estágio, PJ) nunca mais avisaria depois do
        // primeiro ciclo. Reseta sempre que o campo é tocado, mesmo pra mesma data — mais barato
        // que comparar com o valor antigo, e o pior caso é só reavisar 1x à toa.
        alertaVencimentoEm: i.dataVencimento !== undefined ? null : undefined,
        valor: i.valor,
        statusContrato: i.statusContrato,
      },
    });
    rev();
    return { id: i.id };
  },
);

export const criarPastaJuridica = defineAction(
  { ...base, acao: "criar-pasta", entidade: "PastaJuridica", schema: z.object({ nome: z.string().min(1, "Informe o nome."), parentId: opt(z.string()) }) },
  async (i) => {
    const max = await prisma.pastaJuridica.aggregate({ where: { parentId: i.parentId || null }, _max: { ordem: true } });
    const p = await prisma.pastaJuridica.create({
      data: { nome: i.nome, parentId: i.parentId || null, ordem: (max._max.ordem ?? -1) + 1 },
    });
    rev();
    return { id: p.id };
  },
);

export const renomearPastaJuridica = defineAction(
  { ...base, acao: "renomear-pasta", entidade: "PastaJuridica", schema: z.object({ id: z.string().min(1), nome: z.string().min(1, "Informe o nome.") }) },
  async (i) => {
    await prisma.pastaJuridica.update({ where: { id: i.id }, data: { nome: i.nome } });
    rev();
    return { id: i.id };
  },
);

export const excluirPastaJuridica = defineAction(
  { ...base, acao: "excluir-pasta", entidade: "PastaJuridica", schema: idSchema },
  async (i) => {
    // onDelete: SetNull desvincula os documentos; filhas viram raiz.
    await prisma.pastaJuridica.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

export const moverDocPasta = defineAction(
  { ...base, acao: "mover-doc-pasta", entidade: "DocumentoJuridico", schema: z.object({ id: z.string().min(1), pastaId: opt(z.string()) }) },
  async (i, ctx) => {
    const alvo = await prisma.documentoJuridico.findUnique({ where: { id: i.id }, select: { vinculoId: true } });
    if (alvo?.vinculoId && !ehHrAdmin(ctx.user.role)) throw new ActionError("Só RH pode mover contrato de equipe.");
    await prisma.documentoJuridico.update({ where: { id: i.id }, data: { pastaId: i.pastaId || null } });
    rev();
    return { id: i.id };
  },
);

export const excluirDocJuridico = defineAction(
  { ...base, acao: "excluir-doc", entidade: "DocumentoJuridico", schema: idSchema },
  async (i, ctx) => {
    const alvo = await prisma.documentoJuridico.findUnique({ where: { id: i.id }, select: { vinculoId: true } });
    if (alvo?.vinculoId && !ehHrAdmin(ctx.user.role)) throw new ActionError("Só RH pode excluir contrato de equipe.");
    await prisma.documentoJuridico.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

// ── E2 Modelos de contrato ────────────────────────────────────
export const criarModeloContrato = defineAction(
  { ...base, acao: "criar-modelo", entidade: "ModeloContrato", schema: z.object({ nome: z.string().min(1, "Informe o nome."), categoria: opt(z.string()), conteudo: z.string().default("") }) },
  async (i) => {
    const m = await prisma.modeloContrato.create({ data: { nome: i.nome, categoria: i.categoria || null, conteudo: i.conteudo || "" } });
    rev();
    return { id: m.id };
  },
);
export const editarModeloContrato = defineAction(
  { ...base, acao: "editar-modelo", entidade: "ModeloContrato", schema: z.object({ id: z.string().min(1), nome: z.string().min(1), categoria: opt(z.string()), conteudo: z.string() }) },
  async (i) => {
    await prisma.modeloContrato.update({ where: { id: i.id }, data: { nome: i.nome, categoria: i.categoria || null, conteudo: i.conteudo } });
    rev();
    return { id: i.id };
  },
);
export const excluirModeloContrato = defineAction(
  { ...base, acao: "excluir-modelo", entidade: "ModeloContrato", schema: idSchema },
  async (i) => {
    await prisma.modeloContrato.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/**
 * Fase B2 — cria um ADITIVO de um contrato de equipe, com o delta que ele altera.
 *
 * O aditivo é um `DocumentoJuridico` próprio (assinado à parte, com versões e trilha próprias) que
 * COEXISTE com o contrato original — não é uma nova versão dele. Assinar o aditivo é o que aplica
 * a alteração no cadastro, via `registrarAlteracaoContratual` (ver `registrarAceite`).
 */
export const criarAditivoEquipe = defineAction(
  {
    ...base,
    acao: "criar-aditivo-equipe",
    entidade: "DocumentoJuridico",
    schema: z.object({
      contratoOrigemId: z.string().min(1),
      titulo: z.string().min(1, "Informe o título."),
      vigenciaEm: z.string().min(1, "Informe a data de vigência."),
      cargoId: opt(z.string()),
      remuneracao: z.number().nonnegative().nullable().optional(),
      cargaSemanal: z.number().nonnegative().nullable().optional(),
      novoVencimento: opt(z.string()),
      motivo: opt(z.string()),
      observacao: opt(z.string()),
    }),
  },
  async (i, ctx) => {
    if (!ehHrAdmin(ctx.user.role)) throw new ActionError("Só RH pode criar aditivo de contrato de equipe.");

    const origem = await prisma.documentoJuridico.findUnique({
      where: { id: i.contratoOrigemId },
      select: { id: true, tipo: true, vinculoId: true, pastaId: true },
    });
    if (!origem) throw new ActionError("Contrato de origem não encontrado.");
    if (!origem.vinculoId) throw new ActionError("Só contrato de equipe aceita aditivo por aqui.");
    // Aditivo de aditivo vira corrente sem fim e embaralha `vencimentoEfetivo`, que espera todos
    // os aditivos pendurados no mesmo contrato. Aditivo aponta sempre para o contrato raiz.
    if (origem.tipo !== "contrato") throw new ActionError("Aditivo só pode ser feito sobre um contrato.");

    const doc = await prisma.documentoJuridico.create({
      data: {
        titulo: i.titulo,
        tipo: "aditivo",
        vinculoId: origem.vinculoId,
        pastaId: origem.pastaId,
        contratoOrigemId: origem.id,
        statusContrato: "rascunho",
        // O vencimento do PRÓPRIO aditivo é o novo prazo que ele institui, quando institui algum.
        dataVencimento: i.novoVencimento ? new Date(i.novoVencimento) : null,
        aditivoEquipe: {
          create: {
            vigenciaEm: new Date(i.vigenciaEm),
            cargoId: i.cargoId || null,
            remuneracao: i.remuneracao ?? null,
            cargaSemanal: i.cargaSemanal ?? null,
            novoVencimento: i.novoVencimento ? new Date(i.novoVencimento) : null,
            motivo: i.motivo || null,
            observacao: i.observacao || null,
          },
        },
      },
    });
    rev();
    return { id: doc.id };
  },
);

/**
 * Fase B — gera uma versão do contrato preenchendo um `ModeloContrato` com os dados do próprio
 * documento (vínculo ou proposta). Bloqueia quando sobra token obrigatório sem valor: cláusula em
 * branco num contrato assinável é pior que erro, porque é entregável.
 */
export const gerarVersaoDeModelo = defineAction(
  {
    ...base,
    acao: "gerar-versao-modelo",
    entidade: "DocJuridicoVersao",
    schema: z.object({ documentoId: z.string().min(1), modeloId: z.string().min(1) }),
  },
  async (i, ctx) => {
    // Gate de RH ANTES de buscar o dado, não só antes de gravar: o escalar de um contrato de
    // equipe monta CPF, RG e salário: quem não é RH não pode nem chegar a materializá-lo.
    const alvo = await prisma.documentoJuridico.findUnique({
      where: { id: i.documentoId },
      select: { vinculoId: true },
    });
    if (!alvo) throw new ActionError("Documento não encontrado.");
    if (alvo.vinculoId && !ehHrAdmin(ctx.user.role)) {
      throw new ActionError("Só RH pode gerar contrato de equipe.");
    }

    const r = await gerarVersaoDeModeloContrato(
      { documentoId: i.documentoId, modeloId: i.modeloId, autorId: ctx.user.id },
    );
    rev();
    return r;
  },
);

/**
 * Fase G — condição de pagamento do contrato de cliente. As parcelas só são GERADAS na
 * assinatura (ver `registrarAceite`); aqui só se define o plano.
 */
export const definirCondicaoPagamento = defineAction(
  {
    ...base,
    acao: "definir-condicao-pagamento",
    entidade: "DocumentoJuridico",
    schema: z.object({
      id: z.string().min(1),
      parcelas: z.number().int().positive().max(120).nullable(),
      primeiroVencimento: opt(z.string()),
    }),
  },
  async (i) => {
    const doc = await prisma.documentoJuridico.findUnique({
      where: { id: i.id },
      select: { vinculoId: true, statusContrato: true, _count: { select: { lancamentos: true } } },
    });
    if (!doc) throw new ActionError("Documento não encontrado.");
    if (doc.vinculoId) {
      throw new ActionError("Contrato de equipe é pago pela folha, não por cronograma de recebíveis.");
    }
    // Depois de faturado, mudar o plano não altera as parcelas já criadas — deixaria a tela
    // dizendo uma coisa e o financeiro outra. Quem precisar refazer, edita os lançamentos.
    if (doc._count.lancamentos > 0) {
      throw new ActionError("Este contrato já gerou parcelas. Ajuste os lançamentos no financeiro.");
    }

    await prisma.documentoJuridico.update({
      where: { id: i.id },
      data: {
        parcelas: i.parcelas,
        primeiroVencimento: i.primeiroVencimento ? new Date(i.primeiroVencimento) : null,
      },
    });
    rev();
    return { id: i.id };
  },
);

/**
 * Fase F — cria o link de assinatura para um NÃO-USUÁRIO (cliente, testemunha, PJ ainda sem
 * acesso). Um link por signatário: o nome fica gravado antes do envio, e é o que permite dizer
 * "foi enviado para Fulano" quando a assinatura for questionada.
 */
export const criarLinkAssinatura = defineAction(
  {
    ...base,
    acao: "criar-link-assinatura",
    entidade: "LinkPublicoAssinatura",
    schema: z.object({
      versaoId: z.string().min(1),
      nome: z.string().min(3, "Informe o nome do signatário."),
      email: opt(z.string()),
      diasValidade: z.number().int().positive().max(365).optional(),
    }),
  },
  async (i, ctx) => {
    const versao = await prisma.docJuridicoVersao.findUnique({
      where: { id: i.versaoId },
      select: { id: true, documento: { select: { vinculoId: true } } },
    });
    if (!versao) throw new ActionError("Versão não encontrada.");
    if (versao.documento.vinculoId && !ehHrAdmin(ctx.user.role)) {
      throw new ActionError("Só RH pode enviar contrato de equipe para assinatura externa.");
    }

    const dias = i.diasValidade ?? 30;
    const link = await prisma.linkPublicoAssinatura.create({
      data: {
        // 32 bytes de aleatoriedade — o token É a credencial deste fluxo.
        token: randomBytes(24).toString("base64url"),
        versaoId: i.versaoId,
        nome: i.nome,
        email: i.email || null,
        expiraEm: new Date(Date.now() + dias * 86_400_000),
        criadoPorId: ctx.user.id,
      },
    });
    rev();
    return { id: link.id, url: `${process.env.APP_URL ?? ""}/p/assinar/${link.token}` };
  },
);

/** Revoga um link de assinatura. `ativo:false` desliga na hora (regra de `lib/link-publico.ts`). */
export const revogarLinkAssinatura = defineAction(
  { ...base, acao: "revogar-link-assinatura", entidade: "LinkPublicoAssinatura", schema: idSchema },
  async (i) => {
    await prisma.linkPublicoAssinatura.update({ where: { id: i.id }, data: { ativo: false } });
    rev();
    return { id: i.id };
  },
);

// ── Assinatura on-prem: registro de aceite de versão ──────────
// "Assinatura" interna (sem provedor externo): registra quem aceitou a versão,
// com timestamp e o hash SHA-256 do arquivo NAQUELE momento (prova de integridade).
export const registrarAceite = defineAction(
  {
    // SEM `recurso` de propósito — a autorização é feita dentro, e é mais rica que uma permissão
    // fina. Assinar tem três titulares legítimos e só um deles é "quem administra o jurídico":
    //   (a) quem tem `juridico:gerir` — a superfície de gestão;
    //   (b) o DONO do vínculo, assinando o próprio contrato (Fase E, self-service);
    //   (c) o usuário do portal do cliente, assinando o contrato da empresa dele (Fase I).
    // Com `recurso: juridico/gerir` no config, (b) e (c) seriam barrados antes de o handler rodar
    // — um colaborador CLT não tem essa permissão, e é exatamente ele que a assinatura precisa
    // vincular. Mesmo padrão de `aceitarTermo` (`modules/legal`), que também é self-service.
    modulo: "juridico",
    acao: "registrar-aceite",
    entidade: "AceiteDocumento",
    schema: z.object({ versaoId: z.string().min(1) }),
  },
  async (i, ctx) => {
    const versao = await prisma.docJuridicoVersao.findUnique({
      where: { id: i.versaoId },
      include: {
        documento: {
          select: {
            id: true,
            vinculoId: true,
            tipo: true,
            statusContrato: true,
            valor: true,
            vinculo: { select: { userId: true } },
            aditivoEquipe: true,
            // Fases G e H3 — o que a assinatura de um contrato de CLIENTE dispara.
            clienteId: true,
            parcelas: true,
            primeiroVencimento: true,
            dataVencimento: true,
            projetoId: true,
            titulo: true,
            projeto: { select: { prazoFinal: true, disciplinas: { select: { prazo: true } } } },
          },
        },
      },
    });
    if (!versao) throw new ActionError("Versão não encontrada.");

    // ── Autorização (ver a nota no config desta action) ───────────────────────────────────────
    const doc = versao.documento;
    const podeGerirJuridico = await can(ctx.user, "juridico", "gerir");
    const ehDonoDoVinculo = !!doc.vinculoId && doc.vinculo?.userId === ctx.user.id;
    // Portal (Fase I): o representante do cliente assina o contrato da PRÓPRIA empresa.
    // `clienteId` não está na sessão — só consulta quando as outras vias já falharam, para não
    // pagar uma query a mais no caminho comum (RH/jurídico assinando).
    const ehClienteDoContrato =
      !podeGerirJuridico && !ehDonoDoVinculo && !!doc.clienteId
        ? (await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { clienteId: true } }))?.clienteId
          === doc.clienteId
        : false;

    if (!podeGerirJuridico && !ehDonoDoVinculo && !ehClienteDoContrato) {
      throw new ActionError("Sem permissão para assinar este documento.");
    }
    // Contrato de equipe carrega salário/CPF: quem administra precisa ser RH, não qualquer um com
    // `juridico:gerir`. O dono do vínculo segue podendo assinar o dele.
    if (doc.vinculoId && !ehDonoDoVinculo && !ehHrAdmin(ctx.user.role)) {
      throw new ActionError("Só RH pode assinar contrato de equipe de outra pessoa.");
    }

    // Idempotência: um aceite por (usuário, versão). Se já assinou, retorna o existente.
    const existente = await prisma.aceiteDocumento.findFirst({
      where: { versaoId: i.versaoId, userId: ctx.user.id },
    });
    if (existente) return { id: existente.id, jaAssinado: true };

    // H4 — checa ANTES de criar o aceite: bloquear depois deixaria uma assinatura órfã gravada
    // (o `defineAction` não envolve o handler numa transação — cada `create`/`update` é isolado).
    if (devePassarParaAssinado(versao.documento.tipo, versao.documento.statusContrato)) {
      await exigirSocioSeAcimaDaAlcada(versao.documento.valor?.toNumber(), ctx.user);
    }

    // Lê o arquivo da versão pelo mesmo helper de storage usado no download.
    let conteudo: Buffer;
    try {
      conteudo = await lerArquivo(versao.arquivoPath);
    } catch {
      throw new ActionError("Arquivo da versão indisponível para assinatura.");
    }
    const hashArquivo = createHash("sha256").update(conteudo).digest("hex");
    const userAgent = (await headers()).get("user-agent");

    // Aceite + evento da trilha na MESMA transação (Fase D): aceite sem evento é assinatura sem
    // prova, evento sem aceite é prova que aponta pra nada. A retentativa cobre a corrida na
    // unique `(versaoId, sequencia)` — refaz a transação inteira, e o perdedor entra na posição
    // seguinte em vez de bifurcar a cadeia.
    const aceite = await comRetentativaDeConflito(() =>
      prisma.$transaction(async (tx) => {
        const criado = await tx.aceiteDocumento.create({
          data: {
            versaoId: i.versaoId,
            userId: ctx.user.id,
            userNome: ctx.user.name,
            hashArquivo,
            assinadoEm: new Date(),
            ip: ctx.ip,
            userAgent,
          },
        });

        await registrarEventoAssinatura(tx, {
          versaoId: i.versaoId,
          tipo: "assinado",
          ator: ctx.user.id,
          atorNome: ctx.user.name,
          ip: ctx.ip,
          userAgent,
          hashArquivo,
        });

        // Fecha o loop do badge "contrato pendente" (Fase I) e da alçada (H4): o próprio aceite JÁ
        // É o sinal de "assinado" — nenhuma tela extra pra mudar status à mão. Predicado único:
        // vale pra aditivo também, e não reabre "rescindido"/"vencido".
        if (devePassarParaAssinado(versao.documento.tipo, versao.documento.statusContrato)) {
          await tx.documentoJuridico.update({
            where: { id: versao.documento.id },
            data: { statusContrato: "assinado", assinadoEm: new Date() },
          });

          // Aditivo de equipe assinado APLICA a alteração contratual (Fase B2).
          //
          // O efeito é preso à TRANSIÇÃO de status, não ao aceite: dois signatários no mesmo
          // aditivo geram dois aceites, e aplicar por aceite reajustaria o salário duas vezes.
          // Aqui o segundo signatário já encontra `statusContrato = "assinado"` e não entra.
          const adt = versao.documento.aditivoEquipe;
          const userIdAlvo = versao.documento.vinculo?.userId;
          if (adt && userIdAlvo) {
            await registrarAlteracaoContratual(
              tx,
              userIdAlvo,
              {
                // ⚠️ `?? undefined` é obrigatório: no service, `null` significa LIMPAR o campo,
                // enquanto no aditivo `null` significa "não mexe nesse eixo". Passar o null direto
                // apagaria o cargo de quem recebeu um aditivo só de reajuste.
                cargoId: adt.cargoId ?? undefined,
                remuneracao: adt.remuneracao ?? undefined,
                // Data de VIGÊNCIA do aditivo, não a de hoje: um aditivo assinado em fevereiro
                // pode valer a partir de março, e o default do service é `hoje`.
                vigenciaEm: adt.vigenciaEm,
                motivo: (adt.motivo ?? undefined) as MotivoContratual | undefined,
                observacao: adt.observacao,
              },
              ctx.user.id,
            );
          }

          // ── Fase H3: o prazo do contrato vira o prazo do projeto ────────────────────────
          // Só quando o projeto ainda não tem prazo e nenhuma disciplina já está agendada além
          // dele — ver `decidirPrazoDoProjeto` para o porquê de cada guarda.
          const doc = versao.documento;
          if (doc.projetoId && doc.projeto) {
            const decisao = decidirPrazoDoProjeto(
              doc.dataVencimento,
              doc.projeto.prazoFinal,
              doc.projeto.disciplinas.map((d) => d.prazo),
            );
            if (decisao.define) {
              await tx.projeto.update({
                where: { id: doc.projetoId },
                data: { prazoFinal: doc.dataVencimento },
              });
            }
          }

          // ── Fase G: contrato de cliente assinado gera o cronograma de recebíveis ────────
          // Exige `parcelas` e `primeiroVencimento` definidos — sem condição de pagamento não há
          // o que gerar, e inventar uma (à vista? 30 dias?) seria escrever regra financeira que
          // ninguém pediu. Contrato de EQUIPE nunca entra: é pago pela folha, não por
          // `Lancamento`.
          if (!doc.vinculoId && doc.clienteId && doc.parcelas && doc.primeiroVencimento && doc.valor) {
            await gerarRecebiveisDoContrato(tx, {
              contratoId: doc.id,
              titulo: doc.titulo,
              clienteId: doc.clienteId,
              projetoId: doc.projetoId,
              valor: doc.valor.toNumber(),
              parcelas: doc.parcelas,
              primeiroVencimento: doc.primeiroVencimento,
              autorId: ctx.user.id,
            });
          }
        }

        return criado;
      }),
    );

    rev();
    return { id: aceite.id, jaAssinado: false };
  },
);

