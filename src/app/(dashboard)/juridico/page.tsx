import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listarClientes } from "@/modules/clientes/queries";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { verificarCadeia } from "@/modules/juridico/assinatura/cadeia";
import { JuridicoView } from "@/components/juridico/juridico-view";

export const metadata: Metadata = { title: "Jurídico" };

export default async function JuridicoPage() {
  const user = await requirePermission("juridico", "ver");
  const podeGerir = await can(user, "juridico", "gerir");
  // Contrato de equipe (vinculoId setado) é dado sensível de RH — quem não é HR_ADMIN_ROLES
  // nem enxerga a linha (spec 2026-08-26-gerenciador-contratos.md, Fase A §3).
  const podeVerEquipe = HR_ADMIN_ROLES.includes(user.role);

  const [docs, projetos, clientes, pastas, modelos, modelosContrato, vinculos, cargos] = await Promise.all([
    prisma.documentoJuridico.findMany({
      where: podeVerEquipe ? {} : { vinculoId: null },
      orderBy: { createdAt: "desc" },
      include: {
        projeto: { select: { codigo: true } },
        cliente: { select: { nome: true } },
        vinculo: { select: { id: true, userId: true, contratacao: true, dataFim: true, user: { select: { name: true } } } },
        aditivoEquipe: { include: { cargo: { select: { nome: true } } } },
        versoes: {
          orderBy: { numero: "desc" },
          include: {
            autor: { select: { name: true } },
            aceites: { orderBy: { assinadoEm: "desc" }, select: { id: true, userId: true, userNome: true, hashArquivo: true, assinadoEm: true } },
            // Fase E — a trilha de evidência. A integridade é conferida na LEITURA (ver
            // `assinatura/queries.ts`): adulteração acontece no banco, depois do fato.
            eventosAssinatura: { orderBy: { sequencia: "asc" } },
          },
        },
      },
    }),
    prisma.projeto.findMany({
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    }),
    listarClientes({ incluirInativos: false }),
    prisma.pastaJuridica.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, _count: { select: { documentos: true } } },
    }),
    // Legado (Fase B, deprecado — pipeline em texto puro). Fica só até a Fase E6 remover
    // `ModeloContrato`; a `ModelosTab` continua mostrando o que já existir.
    prisma.modeloContrato.findMany({ orderBy: { nome: "asc" } }),
    // Fase E2 — modelos do ESTÚDIO usáveis para gerar contrato: só tipo=contrato e ativos.
    // `ativo:false` existia no schema sem nenhum uso até aqui — passa a filtrar de verdade.
    prisma.documentoModelo.findMany({
      where: { tipo: "contrato", ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    // Lista de vínculos é ela mesma dado de RH (nome+cargo+contratação) — só carrega se o
    // usuário já passou no gate; ninguém além de HR precisa dela pra nada nesta tela.
    podeVerEquipe
      ? prisma.vinculo.findMany({
          where: { ativo: true },
          orderBy: { dataInicio: "desc" },
          select: { id: true, contratacao: true, cargo: true, user: { select: { name: true } } },
        })
      : Promise.resolve([]),
    // Catálogo de cargos para o aditivo de promoção/transferência. `resolverClassificacao` recusa
    // cargo arquivado, então só os ativos entram na lista.
    podeVerEquipe
      ? prisma.cargo.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } })
      : Promise.resolve([]),
  ]);

  // H5 (spec Fase A): checklist de devolução — ativos de Patrimônio/TI de quem já tem `dataFim`
  // marcado no vínculo. Só busca pros usuários que aparecem em algum contrato de equipe aqui;
  // dataset é pequeno (um vínculo por contrato), não vale a pena condicionar a mais que isso.
  const userIdsEquipe = [...new Set(docs.map((d) => d.vinculo?.userId).filter((id): id is string => !!id))];
  const [ativos, maquinas] = userIdsEquipe.length
    ? await Promise.all([
        prisma.ativo.findMany({
          where: { responsavelId: { in: userIdsEquipe } },
          select: { id: true, nome: true, categoria: true, responsavelId: true },
        }),
        prisma.maquinaTI.findMany({
          where: { responsavelId: { in: userIdsEquipe } },
          select: { id: true, nome: true, responsavelId: true },
        }),
      ])
    : [[], []];
  const ativosPorUsuario: Record<string, { id: string; nome: string; tipo: string }[]> = {};
  for (const a of ativos) {
    (ativosPorUsuario[a.responsavelId!] ??= []).push({ id: a.id, nome: a.nome, tipo: a.categoria ?? "Ativo" });
  }
  for (const m of maquinas) {
    (ativosPorUsuario[m.responsavelId!] ??= []).push({ id: m.id, nome: m.nome, tipo: "Máquina (TI)" });
  }

  return (
    <JuridicoView
      podeGerir={podeGerir}
      podeVerEquipe={podeVerEquipe}
      pastas={pastas.map((p) => ({ id: p.id, nome: p.nome, total: p._count.documentos }))}
      docs={docs.map((d) => ({
        id: d.id,
        titulo: d.titulo,
        tipo: d.tipo,
        pastaId: d.pastaId,
        projeto: d.projeto?.codigo ?? null,
        cliente: d.cliente?.nome ?? null,
        vinculo: d.vinculo
          ? {
              id: d.vinculo.id,
              userId: d.vinculo.userId,
              nome: d.vinculo.user.name,
              contratacao: d.vinculo.contratacao,
              dataFim: d.vinculo.dataFim ? d.vinculo.dataFim.toISOString() : null,
            }
          : null,
        contratoOrigemId: d.contratoOrigemId,
        aditivo: d.aditivoEquipe
          ? {
              vigenciaEm: d.aditivoEquipe.vigenciaEm.toISOString(),
              remuneracao: d.aditivoEquipe.remuneracao ? d.aditivoEquipe.remuneracao.toNumber() : null,
              cargoNome: d.aditivoEquipe.cargo?.nome ?? null,
              novoVencimento: d.aditivoEquipe.novoVencimento ? d.aditivoEquipe.novoVencimento.toISOString() : null,
              motivo: d.aditivoEquipe.motivo,
            }
          : null,
        dataVencimento: d.dataVencimento ? d.dataVencimento.toISOString() : null,
        valor: d.valor ? d.valor.toNumber() : null,
        statusContrato: d.statusContrato,
        parcelas: d.parcelas,
        primeiroVencimento: d.primeiroVencimento ? d.primeiroVencimento.toISOString() : null,
        clausulasAdicionais: d.clausulasAdicionais,
        versoes: d.versoes.map((v) => ({
          id: v.id,
          numero: v.numero,
          arquivoNome: v.arquivoNome,
          autor: v.autor.name,
          data: v.createdAt.toISOString(),
          aceites: v.aceites.map((a) => ({
            id: a.id,
            userId: a.userId,
            userNome: a.userNome,
            hashArquivo: a.hashArquivo,
            assinadoEm: a.assinadoEm.toISOString(),
          })),
          trilha: v.eventosAssinatura.map((e) => ({
            sequencia: e.sequencia,
            tipo: e.tipo,
            ocorridoEm: e.ocorridoEm.toISOString(),
            atorNome: e.atorNome,
            ip: e.ip,
            hash: e.hash,
          })),
          cadeiaIntegra: verificarCadeia(v.eventosAssinatura).integra,
        })),
      }))}
      modelos={modelos.map((m) => ({ id: m.id, nome: m.nome, categoria: m.categoria, conteudo: m.conteudo }))}
      modelosContrato={modelosContrato}
      projetos={projetos.map((p) => ({ id: p.id, label: `${p.codigo} · ${p.nome}` }))}
      clientes={clientes.map((c) => ({ id: c.id, label: c.nome }))}
      vinculos={vinculos.map((v) => ({ id: v.id, label: `${v.user.name} · ${v.cargo ?? v.contratacao}`, contratacao: v.contratacao }))}
      cargos={cargos}
      ativosPorUsuario={ativosPorUsuario}
    />
  );
}
