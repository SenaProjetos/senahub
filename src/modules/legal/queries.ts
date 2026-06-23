import "server-only";
import { prisma } from "@/lib/prisma";
import { TERMOS, tipoTermoPorRole, type TipoTermo } from "./termos";

/**
 * Verifica se o usuário ainda precisa aceitar a versão vigente do Termo aplicável
 * ao seu perfil. Retorna `null` se já aceitou (acesso liberado), ou `{ tipo, versao }`
 * pendente. Uma única leitura por chave única — barata para rodar no layout.
 */
export async function precisaAceitarTermo(user: {
  id: string;
  role: string;
}): Promise<{ tipo: TipoTermo; versao: string } | null> {
  const tipo = tipoTermoPorRole(user.role);
  const versao = TERMOS[tipo].versao;
  const ja = await prisma.aceiteTermo.findUnique({
    where: { userId_tipo_versao: { userId: user.id, tipo, versao } },
    select: { id: true },
  });
  return ja ? null : { tipo, versao };
}
