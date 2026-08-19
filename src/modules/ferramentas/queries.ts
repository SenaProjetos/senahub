import "server-only";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { parseListParams } from "@/lib/list-params";
import { montarMemoria } from "./service";

type RawParams = Record<string, string | string[] | undefined>;

/** Últimos 10 cálculos de um usuário para uma ferramenta específica. */
export async function recentesDoUsuario(ferramenta: string, userId: string) {
  return prisma.calculoFerramenta.findMany({
    where: { autorId: userId, ferramenta },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      titulo: true,
      ferramenta: true,
      projetoId: true,
      disciplinaId: true,
      createdAt: true,
    },
  });
}

/** Abre um cálculo completo. Escopo: autor ou quem tem ferramentas:gerir. */
export async function abrirCalculo(id: string) {
  const user = await requirePermission("ferramentas", "usar");

  const registro = await prisma.calculoFerramenta.findUnique({
    where: { id },
    include: {
      projeto: {
        select: { id: true, nome: true, codigo: true, endereco: true, cliente: { select: { nome: true } } },
      },
      art: { select: { id: true, tipo: true, numero: true } },
      disciplina: { select: { id: true, disciplinaTextoLegado: true } },
      autor: { select: { name: true } },
    },
  });

  if (!registro) return null;

  const podeGerir = await can(user, "ferramentas", "gerir");
  if (registro.autorId !== user.id && !podeGerir) return null;

  return registro;
}

/**
 * Resolve um cálculo salvo (com escopo) e monta a MemoriaDoc pronta para os renderers de export.
 * Lança se não autenticado/sem permissão (via abrirCalculo); retorna null se não existe/fora do escopo.
 */
export async function memoriaDoCalculo(id: string) {
  const calc = await abrirCalculo(id);
  if (!calc) return null;
  const projeto = calc.projeto ? `${calc.projeto.codigo} — ${calc.projeto.nome}` : undefined;
  // Cabeçalho técnico. Obra/cliente/local vêm do projeto; responsável e ART são o que foi
  // escolhido ao salvar o cálculo (snapshot — não acompanha mudanças no cadastro depois).
  // O bloco de assinaturas só sai quando há responsável definido.
  const identificacao =
    calc.projeto || calc.responsavelNome || calc.art
      ? {
          obra: calc.projeto ? `${calc.projeto.codigo} — ${calc.projeto.nome}` : undefined,
          cliente: calc.projeto?.cliente.nome,
          local: calc.projeto?.endereco ?? undefined,
          responsavel: calc.responsavelNome ?? undefined,
          registro: calc.responsavelRegistro ?? undefined,
          art: calc.art ? `${calc.art.tipo} ${calc.art.numero}` : undefined,
          assinaturas: Boolean(calc.responsavelNome),
        }
      : undefined;
  const doc = montarMemoria(calc.ferramenta, calc.entradasJson as Record<string, unknown>, {
    titulo: calc.titulo,
    autor: calc.autor?.name,
    projeto,
    identificacao,
    geradoEm: calc.createdAt.toISOString(),
  });
  return { calc, doc };
}

/** Lista paginada de cálculos. Escopo: só os próprios, a menos que tenha ferramentas:gerir. */
export async function listarCalculos(params: RawParams, ferramenta?: string) {
  const user = await requirePermission("ferramentas", "usar");
  const podeGerir = await can(user, "ferramentas", "gerir");

  const { skip, take, q } = parseListParams(params, {
    sortFields: ["createdAt", "titulo"],
    defaultSort: "createdAt",
    defaultDir: "desc",
  });

  const where = {
    ...(podeGerir ? {} : { autorId: user.id }),
    ...(ferramenta ? { ferramenta } : {}),
    ...(q ? { titulo: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [itens, total] = await Promise.all([
    prisma.calculoFerramenta.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        titulo: true,
        ferramenta: true,
        norma: true,
        projetoId: true,
        disciplinaId: true,
        autorId: true,
        createdAt: true,
        autor: { select: { name: true } },
      },
    }),
    prisma.calculoFerramenta.count({ where }),
  ]);

  return { itens, total };
}
