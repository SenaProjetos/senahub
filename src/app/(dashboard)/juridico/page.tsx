import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { listarClientes } from "@/modules/clientes/queries";
import { JuridicoView } from "@/components/juridico/juridico-view";

export const metadata: Metadata = { title: "Jurídico" };

export default async function JuridicoPage() {
  const user = await requirePermission("juridico", "ver");
  const podeGerir = await can(user.role, "juridico", "gerir");

  const [docs, certidoes, tipos, projetos, clientes] = await Promise.all([
    prisma.documentoJuridico.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        projeto: { select: { codigo: true } },
        cliente: { select: { nome: true } },
        versoes: { orderBy: { numero: "desc" }, include: { autor: { select: { name: true } } } },
      },
    }),
    prisma.certidao.findMany({ orderBy: { validade: "asc" }, include: { tipo: true } }),
    prisma.certidaoTipo.findMany({ orderBy: { nome: "asc" } }),
    prisma.projeto.findMany({
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    }),
    listarClientes({ incluirInativos: false }),
  ]);

  return (
    <JuridicoView
      podeGerir={podeGerir}
      docs={docs.map((d) => ({
        id: d.id,
        titulo: d.titulo,
        tipo: d.tipo,
        projeto: d.projeto?.codigo ?? null,
        cliente: d.cliente?.nome ?? null,
        versoes: d.versoes.map((v) => ({
          id: v.id,
          numero: v.numero,
          arquivoNome: v.arquivoNome,
          autor: v.autor.name,
          data: v.createdAt.toISOString(),
        })),
      }))}
      certidoes={certidoes.map((c) => ({
        id: c.id,
        tipo: c.tipo.nome,
        descricao: c.descricao,
        validade: c.validade.toISOString().slice(0, 10),
      }))}
      tipos={tipos}
      projetos={projetos.map((p) => ({ id: p.id, label: `${p.codigo} · ${p.nome}` }))}
      clientes={clientes.map((c) => ({ id: c.id, label: c.nome }))}
    />
  );
}
