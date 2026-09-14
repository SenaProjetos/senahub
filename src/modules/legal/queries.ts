import "server-only";
import { prisma } from "@/lib/prisma";
import { dadosEmpresa } from "@/modules/configuracoes/empresa/queries";
import { TERMOS, preencherTermo, tipoTermoPorRole, type Termo, type TipoTermo } from "./termos";

/**
 * Termo vigente do tipo, já com os dados de Configurações → Empresa. Fonte única do texto
 * EXIBIDO na tela de aceite e do texto HASHEADO em `aceitarTermo` — os dois precisam passar por
 * aqui, senão a prova registrada não corresponde ao que a pessoa leu.
 */
export async function termoVigente(tipo: TipoTermo): Promise<Termo> {
  const empresa = await dadosEmpresa();
  return preencherTermo(TERMOS[tipo], empresa);
}

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
