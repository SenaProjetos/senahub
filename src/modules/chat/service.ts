import "server-only";
import { prisma } from "@/lib/prisma";
import { whereAudiencia } from "@/lib/audiencias";

/** Par (canal, usuário) de um vínculo de membro recém-criado — para join ao vivo no socket. */
export type NovoMembroCanal = { canalId: string; userId: string };

/**
 * RECONCILIA os membros do canal com `desejados`: insere quem falta e **remove** quem não
 * está mais no conjunto. Retorna as duas diferenças para o chamador refletir no socket.
 *
 * Era append-only (`syncMembros`) nos canais de projeto/disciplina: tirar um projetista da
 * disciplina limpava `DisciplinaResponsavel` e `ProjetoMembro`, mas o `CanalMembro` ficava —
 * e é ele que autoriza a leitura (`ehMembro`). A pessoa seguia lendo o chat da disciplina.
 */
async function reconciliarMembros(
  canalId: string,
  desejadosIds: string[],
): Promise<{ adicionados: NovoMembroCanal[]; removidos: NovoMembroCanal[] }> {
  const desejados = new Set(desejadosIds);
  const atuais = await prisma.canalMembro.findMany({
    where: { canalId },
    select: { userId: true },
  });
  const setAtual = new Set(atuais.map((m) => m.userId));
  const aAdicionar = [...desejados].filter((id) => !setAtual.has(id));
  const aRemover = [...setAtual].filter((id) => !desejados.has(id));
  if (aAdicionar.length > 0) {
    await prisma.canalMembro.createMany({
      data: aAdicionar.map((userId) => ({ canalId, userId })),
      skipDuplicates: true,
    });
  }
  if (aRemover.length > 0) {
    await prisma.canalMembro.deleteMany({
      where: { canalId, userId: { in: aRemover } },
    });
  }
  return {
    adicionados: aAdicionar.map((userId) => ({ canalId, userId })),
    removidos: aRemover.map((userId) => ({ canalId, userId })),
  };
}

/**
 * Resultado de uma sincronização de membros que precisa refletir ao vivo:
 * quem entrou (para `entrar-canal-novo`) e quem saiu (para `sair-canal`).
 */
export type SincroniaCanal = {
  canalId: string;
  adicionados: NovoMembroCanal[];
  removidos: NovoMembroCanal[];
};

/**
 * Garante o canal de sistema "Sócios" (tipo `socios`, singleton) e RECONCILIA
 * seus membros com os sócios ativos: adiciona novos sócios e remove quem deixou
 * de ser sócio. Retorna as diferenças para o chamador emitir os eventos de
 * socket (entrar/sair) ao vivo. Diferente do `#geral`, aqui a saída importa.
 */
export async function ensureCanalSocios(): Promise<SincroniaCanal> {
  let canal = await prisma.canal.findFirst({ where: { tipo: "socios" } });
  if (!canal) {
    canal = await prisma.canal.create({ data: { tipo: "socios", nome: "Sócios" } });
  }
  const socios = await prisma.socio.findMany({
    where: { ativo: true },
    select: { userId: true },
  });
  const desejados = new Set(socios.map((s) => s.userId));
  return { canalId: canal.id, ...(await reconciliarMembros(canal.id, [...desejados])) };
}

/**
 * Garante o canal #geral e RECONCILIA os membros com quem tem `chat:geral` — adiciona e
 * **remove** (F3, 2026-09-02).
 *
 * A remoção é a parte que importa. Antes isto usava `syncMembros`, que é append-only, com uma
 * audiência por papel que nunca mudava em runtime. Agora que a entrada no #geral é um checkbox
 * por perfil, append-only faria revogar não ter efeito nenhum: a pessoa continuaria no canal
 * lendo tudo, e o checkbox mentiria. Mesma forma de `ensureCanalSocios`, pelo mesmo motivo.
 */
export async function ensureCanalGeral(): Promise<SincroniaCanal> {
  let canal = await prisma.canal.findFirst({ where: { tipo: "geral" } });
  if (!canal) {
    canal = await prisma.canal.create({ data: { tipo: "geral", nome: "#geral" } });
  }
  const elegiveis = await prisma.user.findMany({
    where: whereAudiencia("chat_participante"),
    select: { id: true },
  });
  const desejados = new Set(elegiveis.map((u) => u.id));
  return { canalId: canal.id, ...(await reconciliarMembros(canal.id, [...desejados])) };
}

/** Diferenças de membresia de um lote de canais — entradas e saídas, para o socket. */
export type SincroniaCanais = { adicionados: NovoMembroCanal[]; removidos: NovoMembroCanal[] };

/**
 * Garante o canal do projeto + um canal por disciplina e RECONCILIA os membros:
 * - projeto = membros do projeto + responsáveis de qualquer disciplina + perfis globais;
 * - disciplina = responsáveis daquela disciplina + perfis globais.
 * Quem sai do conjunto perde o canal (quem continua em outra disciplina segue no do projeto).
 * O chamador reflete as diferenças ao vivo com `refletirSincroniaCanais` (lib/socket).
 */
export async function ensureCanaisProjeto(projetoId: string): Promise<SincroniaCanais> {
  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    include: {
      membros: { select: { userId: true } },
      disciplinas: { include: { responsaveis: { select: { userId: true } } } },
    },
  });
  if (!projeto) return { adicionados: [], removidos: [] };

  const globais = (
    await prisma.user.findMany({ where: whereAudiencia("chat_global"), select: { id: true } })
  ).map((u) => u.id);

  const sincronia: SincroniaCanais = { adicionados: [], removidos: [] };
  const acumular = (r: SincroniaCanais) => {
    sincronia.adicionados.push(...r.adicionados);
    sincronia.removidos.push(...r.removidos);
  };

  // Canal do projeto
  let canalProjeto = await prisma.canal.findFirst({ where: { tipo: "projeto", projetoId } });
  if (!canalProjeto) {
    canalProjeto = await prisma.canal.create({
      data: { tipo: "projeto", projetoId, nome: projeto.nome },
    });
  }
  const todosResp = projeto.disciplinas.flatMap((d) => d.responsaveis.map((r) => r.userId));
  acumular(
    await reconciliarMembros(canalProjeto.id, [
      ...projeto.membros.map((m) => m.userId),
      ...todosResp,
      ...globais,
    ]),
  );

  // Canal por disciplina
  for (const d of projeto.disciplinas) {
    let canalDisc = await prisma.canal.findFirst({ where: { tipo: "disciplina", disciplinaId: d.id } });
    if (!canalDisc) {
      canalDisc = await prisma.canal.create({
        data: { tipo: "disciplina", disciplinaId: d.id, projetoId, nome: d.disciplinaTextoLegado },
      });
    }
    acumular(await reconciliarMembros(canalDisc.id, [...d.responsaveis.map((r) => r.userId), ...globais]));
  }

  return sincronia;
}

/** Acha ou cria um canal DM entre dois usuários. */
export async function getOrCreateDM(userA: string, userB: string) {
  const existentes = await prisma.canal.findMany({
    where: { tipo: "dm", membros: { some: { userId: userA } } },
    include: { membros: { select: { userId: true } } },
  });
  const achado = existentes.find(
    (c) => c.membros.length === 2 && c.membros.some((m) => m.userId === userB),
  );
  if (achado) return achado;

  return prisma.canal.create({
    data: {
      tipo: "dm",
      membros: { create: [{ userId: userA }, { userId: userB }] },
    },
    include: { membros: { select: { userId: true } } },
  });
}

/**
 * Sincroniza todos os canais relevantes ao usuário (lazy, idempotente).
 *
 * Devolve as saídas (#geral, Sócios e canais de projeto/disciplina) para o chamador refletir
 * no socket: quem perdeu o acesso precisa ver o canal sumir sem recarregar a página, senão
 * continua com a lista aberta na tela até o próximo F5. As entradas seguem pelo bootstrap.
 */
export async function sincronizarCanaisDoUsuario(): Promise<{ removidos: NovoMembroCanal[] }> {
  const geral = await ensureCanalGeral();
  const socios = await ensureCanalSocios();
  const removidos = [...geral.removidos, ...socios.removidos];
  const projetos = await prisma.projeto.findMany({ select: { id: true } });
  for (const p of projetos) removidos.push(...(await ensureCanaisProjeto(p.id)).removidos);
  return { removidos };
}
