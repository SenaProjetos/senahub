"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { enviarEmail, smtpConfigurado } from "@/lib/mail";
import { resolverModelo, fontesUsadasNoSchema } from "@/modules/documentos/fontes";
import { chaveParamFonte, fonteDef } from "@/modules/documentos/fontes-meta";
import { podeVerFonte } from "@/modules/documentos/fontes-perm";
import { CHAVE_FONTES } from "@/modules/documentos/fontes-config";
import { FONTES_TIPOGRAFICAS } from "@/modules/documentos/fontes-tipograficas";
import {
  criarModeloSchema,
  salvarModeloSchema,
  idModeloSchema,
  restaurarVersaoSchema,
  docVazio,
  docSchemaZ,
} from "@/modules/documentos/schema";
import type { Prisma } from "@/generated/prisma/client";
import { ROLES } from "@/lib/roles";

const base = { modulo: "documentos", recurso: "documentos", permissao: "gerir" } as const;
const PATH = "/documentos";

export const criarModelo = defineAction(
  { ...base, acao: "criar-modelo", entidade: "DocumentoModelo", schema: criarModeloSchema },
  async (i, { user }) => {
    const m = await prisma.documentoModelo.create({
      data: {
        nome: i.nome,
        tipo: i.tipo,
        fonte: i.fonte || null,
        schemaJson: docVazio() as unknown as Prisma.InputJsonValue,
        // Grava o autor. Mantemos a visibilidade default "global" para não
        // esconder o que já é visível; o dono pode restringir depois.
        donoId: user.id,
      },
    });
    revalidatePath(PATH);
    return { id: m.id };
  },
);

const visibilidadeSchema = z
  .object({
    id: z.string().min(1),
    visibilidade: z.enum(["pessoal", "perfis", "global"]),
    perfis: z.array(z.enum(ROLES)).default([]),
  })
  .refine((v) => v.visibilidade !== "perfis" || v.perfis.length > 0, {
    message: "Selecione ao menos um perfil.",
    path: ["perfis"],
  });

/**
 * Define a visibilidade de um modelo (pessoal | perfis | global).
 * Só o dono ou um admin pode alterar. Quando "perfis", grava a lista de perfis;
 * caso contrário, zera os perfis.
 */
export const definirVisibilidadeModelo = defineAction(
  {
    ...base,
    acao: "definir-visibilidade-modelo",
    entidade: "DocumentoModelo",
    schema: visibilidadeSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const m = await prisma.documentoModelo.findUnique({
      where: { id: i.id },
      select: { id: true, donoId: true },
    });
    if (!m) throw new ActionError("Modelo não encontrado.");
    const ehDono = m.donoId != null && m.donoId === user.id;
    if (!ehDono && user.role !== "admin") {
      throw new ActionError("Apenas o dono ou um administrador pode alterar a visibilidade.");
    }

    await prisma.documentoModelo.update({
      where: { id: i.id },
      data: {
        visibilidade: i.visibilidade,
        perfis: i.visibilidade === "perfis" ? i.perfis : [],
      },
    });
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${i.id}`);
    return { id: i.id, visibilidade: i.visibilidade };
  },
);

/** Salva o modelo e grava uma nova versão no histórico. */
export const salvarModelo = defineAction(
  {
    ...base,
    acao: "salvar-modelo",
    entidade: "DocumentoModelo",
    schema: salvarModeloSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const m = await prisma.documentoModelo.findUnique({
      where: { id: i.id },
      include: { versoes: { orderBy: { numero: "desc" }, take: 1 } },
    });
    if (!m) throw new ActionError("Modelo não encontrado.");

    const proxima = (m.versoes[0]?.numero ?? 0) + 1;
    await prisma.$transaction([
      prisma.documentoModelo.update({
        where: { id: i.id },
        data: {
          nome: i.nome,
          tipo: i.tipo,
          fonte: i.fonte || null,
          schemaJson: i.schemaJson as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.documentoModeloVersao.create({
        data: {
          modeloId: i.id,
          numero: proxima,
          schemaJson: i.schemaJson as unknown as Prisma.InputJsonValue,
          autorId: user.id,
        },
      }),
    ]);
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${i.id}`);
    return { id: i.id, versao: proxima };
  },
);

export const duplicarModelo = defineAction(
  { ...base, acao: "duplicar-modelo", entidade: "DocumentoModelo", schema: idModeloSchema },
  async (i) => {
    const m = await prisma.documentoModelo.findUnique({ where: { id: i.id } });
    if (!m) throw new ActionError("Modelo não encontrado.");
    const novo = await prisma.documentoModelo.create({
      data: {
        nome: `${m.nome} — cópia`,
        tipo: m.tipo,
        fonte: m.fonte,
        schemaJson: m.schemaJson as Prisma.InputJsonValue,
      },
    });
    revalidatePath(PATH);
    return { id: novo.id };
  },
);

export const arquivarModelo = defineAction(
  { ...base, acao: "arquivar-modelo", entidade: "DocumentoModelo", schema: idModeloSchema },
  async (i) => {
    await prisma.documentoModelo.update({ where: { id: i.id }, data: { ativo: false } });
    revalidatePath(PATH);
    return { id: i.id };
  },
);

/** Restaura o schema de uma versão do histórico (gera nova versão). */
export const restaurarVersao = defineAction(
  {
    ...base,
    acao: "restaurar-versao",
    entidade: "DocumentoModelo",
    schema: restaurarVersaoSchema,
    entidadeId: (d) => (d as { modeloId: string }).modeloId,
  },
  async (i, { user }) => {
    const v = await prisma.documentoModeloVersao.findUnique({ where: { id: i.versaoId } });
    if (!v || v.modeloId !== i.modeloId) throw new ActionError("Versão não encontrada.");
    const parsed = docSchemaZ.safeParse(v.schemaJson);
    if (!parsed.success) throw new ActionError("Versão com schema inválido.");

    const ultima = await prisma.documentoModeloVersao.findFirst({
      where: { modeloId: i.modeloId },
      orderBy: { numero: "desc" },
    });
    await prisma.$transaction([
      prisma.documentoModelo.update({
        where: { id: i.modeloId },
        data: { schemaJson: v.schemaJson as Prisma.InputJsonValue },
      }),
      prisma.documentoModeloVersao.create({
        data: {
          modeloId: i.modeloId,
          numero: (ultima?.numero ?? 0) + 1,
          schemaJson: v.schemaJson as Prisma.InputJsonValue,
          autorId: user.id,
        },
      }),
    ]);
    revalidatePath(`${PATH}/${i.modeloId}`);
    return { modeloId: i.modeloId };
  },
);

const CHAVE_PADROES = "documentos.padroes";
const padraoSchema = z.object({
  fonte: z.string().min(1),
  modeloId: z.string().optional().or(z.literal("")),
});

/** Define (ou remove, se modeloId vazio) o modelo padrão de uma fonte. */
export const salvarPadraoDocumento = defineAction(
  { ...base, acao: "salvar-padrao-doc", entidade: "ConfigSistema", schema: padraoSchema },
  async (i) => {
    const atual = await prisma.configSistema.findUnique({ where: { chave: CHAVE_PADROES } });
    const mapa = { ...((atual?.valor as Record<string, string> | null) ?? {}) };
    if (i.modeloId) mapa[i.fonte] = i.modeloId;
    else delete mapa[i.fonte];
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_PADROES },
      create: { chave: CHAVE_PADROES, valor: mapa },
      update: { valor: mapa },
    });
    revalidatePath("/configuracoes/documentos");
    return { fonte: i.fonte };
  },
);

const fontesSchema = z.object({ ids: z.array(z.string()) });

/** Define quais famílias do catálogo ficam habilitadas no editor. Requer documentos:gerir. */
export const salvarFontesHabilitadas = defineAction(
  { ...base, acao: "salvar-fontes", entidade: "ConfigSistema", schema: fontesSchema },
  async (i) => {
    // Mantém só ids válidos do catálogo, na ordem do catálogo (canônico).
    const validos = FONTES_TIPOGRAFICAS.filter((f) => i.ids.includes(f.id)).map((f) => f.id);
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_FONTES },
      create: { chave: CHAVE_FONTES, valor: validos },
      update: { valor: validos },
    });
    revalidatePath("/configuracoes/documentos");
    return { ids: validos };
  },
);

const gerarSchema = z.object({
  modeloId: z.string().min(1),
  params: z.record(z.string(), z.string()),
});

/** Prefixo de série da numeração automática por tipo de documento. */
const SERIE_POR_TIPO: Record<string, string> = {
  relatorio: "REL",
  proposta: "PROP",
  contrato: "CONT",
  recibo: "REC",
  holerite: "HOL",
  outro: "DOC",
};

/** Persiste um documento gerado (snapshot imutável do schema + dados resolvidos). */
export const registrarDocumentoGerado = defineAction(
  { modulo: "documentos", recurso: "documentos", permissao: "ver", acao: "gerar-documento", entidade: "DocumentoGerado", schema: gerarSchema },
  async (i, { user }) => {
    const modelo = await prisma.documentoModelo.findUnique({ where: { id: i.modeloId } });
    if (!modelo) throw new ActionError("Modelo não encontrado.");

    // MULTI-COLEÇÃO: o conjunto de fontes = primária + fonteId distintos das bandas.
    const schemaParsed = docSchemaZ.safeParse(modelo.schemaJson);
    const schema = schemaParsed.success ? schemaParsed.data : null;
    const usadas = schema ? fontesUsadasNoSchema(modelo.fonte, schema) : modelo.fonte ? [modelo.fonte] : [];

    // CRÍTICO (segurança): impede gerar/persistir um documento se QUALQUER fonte
    // de sistema usada o usuário não pode ver (datasets não têm gate de módulo).
    for (const fid of usadas) {
      if (fid.startsWith("dataset:")) continue;
      if (!(await podeVerFonte(user.role, fid))) {
        throw new ActionError("Sem permissão para uma das fontes de dados deste modelo.");
      }
    }

    // Constrói paramsPorFonte a partir dos params recebidos (flat): a primária
    // usa chaves sem prefixo; as demais `f_<fonteId>_<paramId>`.
    const primaria = (modelo.fonte ?? "").trim();
    const paramsPorFonte: Record<string, Record<string, string>> = {};
    for (const fid of usadas) {
      const def = fonteDef(fid);
      if (!def) continue;
      const ehPrim = fid === primaria;
      const obj: Record<string, string> = {};
      for (const p of def.params) {
        const chave = chaveParamFonte(fid, p.id, ehPrim);
        if (i.params[chave]) obj[p.id] = i.params[chave];
      }
      paramsPorFonte[fid] = obj;
    }

    // Resolve tudo (com gate por fonte) e monta o snapshot. Mantém o formato
    // retrocompat (escalar/linhas = fonte primária) + `porFonte` (sub-relatórios).
    const resolvido = schema
      ? await resolverModelo(modelo.fonte, schema, paramsPorFonte, user.role)
      : { escalarPrimaria: {} as Record<string, unknown>, linhasPrimaria: [], porFonte: {} };
    const dados = {
      escalar: resolvido.escalarPrimaria as Record<string, unknown>,
      linhas: resolvido.linhasPrimaria,
      porFonte: resolvido.porFonte,
    };

    // Numeração automática por série (derivada do tipo do modelo).
    const serie = SERIE_POR_TIPO[modelo.tipo] ?? "DOC";
    const ultimo = await prisma.documentoGerado.findFirst({
      where: { serie },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
    const numero = (ultimo?.numero ?? 0) + 1;
    const numeroFmt = `${serie}-${String(new Date().getFullYear()).slice(2)}${String(numero).padStart(4, "0")}`;
    // Injeta o número no escalar p/ o token [NumeroDocumento] no snapshot/render.
    const dadosComNumero = {
      ...dados,
      escalar: { ...(dados.escalar as Record<string, unknown>), NumeroDocumento: numeroFmt },
    };

    const g = await prisma.documentoGerado.create({
      data: {
        modeloId: modelo.id,
        modeloNome: modelo.nome,
        fonte: modelo.fonte,
        params: i.params,
        serie,
        numero,
        schemaSnapshot: modelo.schemaJson as Prisma.InputJsonValue,
        dadosSnapshot: dadosComNumero as unknown as Prisma.InputJsonValue,
        geradoPorId: user.id,
        geradoPorNome: user.name,
      },
    });
    revalidatePath("/documentos/gerados");
    return { id: g.id, numero: numeroFmt };
  },
);

const enviarEmailSchema = z.object({
  modeloId: z.string().min(1),
  params: z.record(z.string(), z.string()),
  para: z.string().email("E-mail inválido."),
  assunto: z.string().optional(),
  mensagem: z.string().optional(),
});

/**
 * Gera o PDF do documento (mesma lógica da rota /api/documentos/[id]/pdf) e o
 * envia por e-mail como anexo. A geração reaproveita a rota de PDF via fetch
 * server-side à URL interna do app, repassando o cookie de sessão atual.
 */
export const enviarDocumentoPorEmail = defineAction(
  {
    modulo: "documentos",
    recurso: "documentos",
    permissao: "ver",
    acao: "enviar-documento-email",
    entidade: "DocumentoModelo",
    schema: enviarEmailSchema,
    entidadeId: (d) => (d as { modeloId: string }).modeloId,
    // Não persistir destinatário/mensagem em texto claro na auditoria além do necessário.
    redact: ["mensagem"],
  },
  async (i, { user }) => {
    if (!process.env.CHROME_PATH) {
      throw new ActionError("Geração de PDF indisponível: CHROME_PATH não configurado.");
    }
    if (!smtpConfigurado()) {
      throw new ActionError("Envio de e-mail indisponível: SMTP não configurado.");
    }

    const modelo = await prisma.documentoModelo.findUnique({
      where: { id: i.modeloId },
      select: { nome: true, fonte: true },
    });
    if (!modelo) throw new ActionError("Modelo não encontrado.");
    // Mesma checagem de segurança da geração: não vazar fonte que o usuário não pode ver.
    if (modelo.fonte && !(await podeVerFonte(user.role, modelo.fonte))) {
      throw new ActionError("Sem permissão para a fonte de dados deste modelo.");
    }

    // Repassa o cookie de sessão para a rota de PDF reconhecer o mesmo usuário.
    const cookie = (await headers()).get("cookie") ?? "";
    const port = process.env.PORT || "3000";
    const qs = new URLSearchParams(i.params).toString();
    const pdfUrl = `http://localhost:${port}/api/documentos/${i.modeloId}/pdf${qs ? `?${qs}` : ""}`;

    const resp = await fetch(pdfUrl, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
    if (resp.status === 503) {
      throw new ActionError("Geração de PDF indisponível: CHROME_PATH não configurado.");
    }
    if (!resp.ok) {
      throw new ActionError("Falha ao gerar o PDF do documento.");
    }
    const pdf = Buffer.from(await resp.arrayBuffer());

    const assunto = i.assunto?.trim() || `Documento: ${modelo.nome}`;
    const html = i.mensagem?.trim()
      ? `<p>${escapeHtml(i.mensagem.trim()).replace(/\n/g, "<br>")}</p>`
      : `<p>Segue em anexo o documento <strong>${escapeHtml(modelo.nome)}</strong>.</p>`;

    const enviado = await enviarEmail({
      to: i.para,
      subject: assunto,
      html,
      attachments: [
        { filename: `${modelo.nome}.pdf`, content: pdf, contentType: "application/pdf" },
      ],
    });
    if (!enviado) throw new ActionError("Não foi possível enviar o e-mail.");

    return { para: i.para };
  },
);

/** Escapa HTML para uso seguro no corpo do e-mail. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
