import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ROLES, type Role } from "@/lib/roles";
import { notificarMuitos } from "@/lib/notificar";
import { emitParaUsuario } from "@/lib/socket";
import { enviarEmail, smtpConfigurado, type EmailAnexo } from "@/lib/mail";
import { renderTemplate } from "@/lib/email-templates";
import { lerArquivo, existeArquivo } from "@/lib/storage";
import type { CriarAvisoInput } from "./schemas";

type AlvoInput = Pick<
  CriarAvisoInput,
  | "alvoTipo"
  | "alvoRoles"
  | "alvoSetores"
  | "alvoContratacoes"
  | "alvoPerfis"
  | "userIds"
  | "incluirClientes"
>;

/** Mantém só valores que são roles válidas (defensivo contra input inválido). */
export function rolesValidas(roles: string[]): Role[] {
  const set = new Set<string>(ROLES);
  return roles.filter((r): r is Role => set.has(r));
}

/**
 * `where` que não casa com NINGUÉM. É o default de todo caminho desconhecido — ver o porquê
 * no comentário de `whereDoAlvo`.
 */
const NINGUEM: Prisma.UserWhereInput = { id: { in: [] } };

/**
 * Monta o `where` de usuários-alvo a partir da seleção. PURA (sem I/O) para
 * ser testável — a resolução real dos ids fica em `resolverDestinatarios`.
 *
 * **Switch exaustivo e fail-closed, de propósito.** A versão anterior terminava com um
 * `return` solto que era o ramo `todos`, então qualquer `alvoTipo` não reconhecido resolvia
 * para a base inteira. Era inalcançável enquanto o enum tinha 3 valores; deixou de ser no
 * instante em que ganhou `setor`/`contratacao`/`perfil`, porque basta um aviso agendado
 * gravado com um valor novo e um rollback do código para o disparo pegar a empresa toda.
 * Em fan-out de notificação, "todo mundo" é o pior default possível — daí `NINGUEM`.
 */
export function whereDoAlvo(input: AlvoInput): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { ativo: true };
  switch (input.alvoTipo) {
    case "todos":
      // Segue em `role` de propósito: trocar por `tipo: "interno"` só é seguro numa base sem
      // `tipo` nulo (§11 do plano — NULL = ainda não migrado), e isso é verificação de
      // produção, não suposição. Fica para a Onda F, junto com a saída de `User.role`.
      return input.incluirClientes ? base : { ...base, role: { not: "cliente" } };
    case "usuarios":
      return { ...base, id: { in: input.userIds } };
    case "categoria":
      return { ...base, role: { in: rolesValidas(input.alvoRoles) } };
    case "setor":
      return { ...base, setor: { in: input.alvoSetores } };
    case "contratacao":
      return { ...base, contratacao: { in: input.alvoContratacoes } };
    case "perfil":
      return { ...base, perfil: { chave: { in: input.alvoPerfis } } };
    default: {
      // Exaustividade checada pelo compilador: valor novo no enum quebra o build aqui em vez
      // de cair num ramo silencioso. Em runtime (dado gravado por versão mais nova do código),
      // não notifica ninguém — perda visível, nunca vazamento.
      const _exaustivo: never = input.alvoTipo;
      void _exaustivo;
      return NINGUEM;
    }
  }
}

/** Ids dos destinatários resolvidos do alvo, sempre excluindo o autor. */
export async function resolverDestinatarios(
  input: AlvoInput,
  autorId: string,
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: whereDoAlvo(input),
    select: { id: true },
  });
  return users.map((u) => u.id).filter((id) => id !== autorId);
}

/**
 * Entrega de fato um aviso já persistido: resolve o alvo AGORA, cria as linhas de
 * destinatário, dispara sino/push, empurra o modal aos que estão online e envia o
 * e-mail opcional. Compartilhado por `criarAviso` (envio imediato) e pelo job
 * `dispararAvisosAgendados` — por isso mora aqui e não em actions.ts.
 *
 * Idempotente do lado dos destinatários (`skipDuplicates`); quem controla o
 * "só uma vez" é a marcação de `enviadoEm` feita pelo chamador ANTES de chamar.
 */
export async function dispatcharAviso(
  avisoId: string,
): Promise<{ total: number; comEmail: number }> {
  const aviso = await prisma.aviso.findUnique({ where: { id: avisoId } });
  if (!aviso) return { total: 0, comEmail: 0 };

  const destinatarios = await resolverDestinatarios(
    {
      alvoTipo: aviso.alvoTipo,
      alvoRoles: aviso.alvoRoles,
      alvoSetores: aviso.alvoSetores,
      alvoContratacoes: aviso.alvoContratacoes,
      alvoPerfis: aviso.alvoPerfis,
      userIds: aviso.alvoUserIds,
      incluirClientes: aviso.incluirClientes,
    },
    aviso.criadoPorId,
  );
  if (destinatarios.length === 0) return { total: 0, comEmail: 0 };

  await prisma.avisoDestinatario.createMany({
    data: destinatarios.map((userId) => ({ avisoId, userId })),
    skipDuplicates: true,
  });

  // Sino + Web Push interno (reusa a fan-out existente).
  await notificarMuitos(destinatarios, {
    titulo: aviso.titulo,
    corpo: aviso.corpo || undefined,
    href: "/",
    tag: `aviso-${aviso.id}`,
  });

  // Modal ao vivo para quem está online (offline pega no próximo login).
  for (const userId of destinatarios) {
    emitParaUsuario(userId, "aviso-novo", { avisoId: aviso.id });
  }

  // E-mail opcional aos destinatários com endereço.
  let comEmail = 0;
  if (aviso.emailSolicitado && smtpConfigurado()) {
    const users = await prisma.user.findMany({
      where: { id: { in: destinatarios }, email: { not: "" } },
      select: { email: true },
    });
    const tpl = await renderTemplate("aviso-geral", {
      titulo: aviso.titulo,
      corpo: aviso.corpo || "",
    });

    // Imagem inline (CID): anexo referenciado no HTML — funciona em qualquer cliente,
    // sem depender de URL pública. Lida uma vez e reusada em todos os destinatários.
    let html = tpl.html;
    let anexos: EmailAnexo[] | undefined;
    if (aviso.imagemPath && (await existeArquivo(aviso.imagemPath))) {
      const buf = await lerArquivo(aviso.imagemPath);
      anexos = [{ filename: "aviso.jpg", content: buf, contentType: "image/jpeg", cid: "aviso-imagem" }];
      html += `<p style="margin-top:16px"><img src="cid:aviso-imagem" alt="" style="max-width:100%;height:auto;border-radius:8px" /></p>`;
    }

    for (const u of users) {
      const ok = await enviarEmail({ to: u.email, subject: tpl.assunto, html, attachments: anexos });
      if (ok) comEmail++;
    }
    if (comEmail > 0) {
      await prisma.aviso.update({ where: { id: aviso.id }, data: { enviouEmail: true } });
    }
  }

  return { total: destinatarios.length, comEmail };
}
