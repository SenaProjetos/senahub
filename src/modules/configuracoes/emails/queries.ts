import "server-only";
import { prisma } from "@/lib/prisma";
import { TEMPLATES_CATALOGO } from "@/lib/email-templates-meta";

export type VarianteResolvida = {
  id: string;
  nome: string;
  assunto: string;
  corpoHtml: string;
  ativo: boolean;
  updatedAt: Date;
};

export type CategoriaTemplate = {
  slug: string;
  grupo: string;
  label: string;
  descricao: string;
  variaveis: { nome: string; descricao: string; exemplo: string }[];
  assuntoPadrao: string;
  corpoPadrao: string;
  variantes: VarianteResolvida[];
  ativos: number;
};

/** Catálogo por categoria + as variantes salvas de cada uma. */
export async function listarTemplates(): Promise<CategoriaTemplate[]> {
  const variantes = await prisma.emailTemplateVariante.findMany({
    orderBy: { criadoEm: "asc" },
  });
  const porSlug = new Map<string, VarianteResolvida[]>();
  for (const v of variantes) {
    const arr = porSlug.get(v.slug) ?? [];
    arr.push({ id: v.id, nome: v.nome, assunto: v.assunto, corpoHtml: v.corpoHtml, ativo: v.ativo, updatedAt: v.updatedAt });
    porSlug.set(v.slug, arr);
  }
  return TEMPLATES_CATALOGO.map((meta) => {
    const vs = porSlug.get(meta.slug) ?? [];
    return {
      slug: meta.slug,
      grupo: meta.grupo,
      label: meta.label,
      descricao: meta.descricao,
      variaveis: meta.variaveis,
      assuntoPadrao: meta.assuntoPadrao,
      corpoPadrao: meta.corpoPadrao,
      variantes: vs,
      ativos: vs.filter((v) => v.ativo).length,
    };
  });
}
