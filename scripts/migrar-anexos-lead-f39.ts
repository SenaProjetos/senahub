/**
 * F3.9 — `AnexoLead` → `Documento` genérico ancorado no cliente.
 *
 * ── Por que zero migration de schema (o backlog marcava "M") ─────────────────────────────────
 * `Documento` já tem tudo que precisa: `clienteId` (obrigatório), `origem` já com o valor
 * `"comercial"` (usado desde sempre para anexo de PROPOSTA — `documentos-cliente/actions.ts:78`,
 * `origem: i.propostaId ? "comercial" : "recebido_cliente"`), e `propostaId`/`projetoId`
 * OPCIONAIS — um documento sem os dois já é um caso legítimo hoje ("gerais do cliente"). Migrar
 * `AnexoLead` é só uma leitura e uma escrita a mais nessa mesma forma, sem tocar `schema.prisma`.
 * Emenda registrada no `06-progresso.md`, mesmo padrão da F1.7 quando o dado real contradisse a
 * premissa do backlog.
 *
 * ── Arquivos NÃO se movem ────────────────────────────────────────────────────────────────────
 * `AnexoLead.caminho` e `DocumentoVersao.caminho` são o MESMO tipo de valor: caminho relativo sob
 * `STORAGE_BASE_PATH` (`salvarArquivo`/`resolverCaminho`, `lib/storage.ts`). A migração copia a
 * LINHA do banco, não o arquivo em disco — é por isso que o aceite é seguro apesar do ⚠️⚠️ do
 * backlog ("arquivos fora do dump do banco"): nada no disco muda, só nasce uma segunda referência
 * ao mesmo arquivo. Os dois caminhos de download (`/api/comercial/anexos/[id]/download` para o
 * antigo, `/api/documentos/[id]/download` para o novo) continuam servindo o mesmo byte.
 *
 * ── Por que todos os 4 resolvem (não é sorte, é o que a F2.18 garantiu) ──────────────────────
 * `Documento.clienteId` é NOT NULL. `AnexoLead.lead.clienteId` é NULLABLE (F2.3) — mas a F2.18
 * (produção, 2026-08-21) preencheu `clienteId` nos 8 leads reais, cada um vinculado a uma empresa
 * existente ou à `CP CONSTRUÇÃO` recém-cadastrada. Os 4 anexos de produção pertencem a leads
 * desse grupo de 8, então os 4 têm `clienteId` resolvível. Ainda assim o script CONFERE e recusa
 * rodar por inteiro se algum não resolver — nunca inventa vínculo.
 *
 * ── `AnexoLead` continua no banco, aditivo ───────────────────────────────────────────────────
 * Só LÊ a tabela antiga, nunca apaga nem altera. `adicionarAnexoLead`/`removerAnexoLead`
 * continuam funcionando como hoje — trocar o caminho de UPLOAD de leads sem `clienteId` (que
 * ainda podem existir, mesmo com o sinal de reativação da F3.8) é fora de escopo desta tarefa.
 *
 * IDEMPOTENTE: cada `Documento` migrado guarda o id do `AnexoLead` de origem no `descricao`
 * (`"Migrado de anexo_lead:<id>"`) — não há coluna nova para isso, e reprocessar filtra por essa
 * marca antes de criar de novo.
 *
 *   tsx --tsconfig tsconfig.server.json scripts/migrar-anexos-lead-f39.ts            # dry-run
 *   tsx --tsconfig tsconfig.server.json scripts/migrar-anexos-lead-f39.ts --gravar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const GRAVAR = process.argv.includes("--gravar");
const MARCA = (anexoId: string) => `Migrado de anexo_lead:${anexoId}`;

async function main() {
  const anexos = await prisma.anexoLead.findMany({
    orderBy: { createdAt: "asc" },
    include: { lead: { select: { id: true, nome: true, clienteId: true } } },
  });

  console.log(`\n${anexos.length} anexo(s) em anexo_lead.\n`);
  if (anexos.length === 0) {
    console.log("Nada para migrar.");
    return;
  }

  const semCliente = anexos.filter((a) => !a.lead.clienteId);
  if (semCliente.length > 0) {
    console.log("✖ ABORTANDO — anexo(s) cujo lead não tem clienteId (Documento exige clienteId):");
    for (const a of semCliente) {
      console.log(`   anexo ${a.id} (${a.nomeArquivo}) — lead "${a.lead.nome}" (${a.lead.id}) sem empresa`);
    }
    console.log(
      "\nVincule a empresa desses leads antes (sinal de reativação, F3.8, ou edição manual) e rode de novo.",
    );
    process.exitCode = 1;
    return;
  }

  const jaMigrados = new Set(
    (
      await prisma.documento.findMany({
        where: { descricao: { startsWith: "Migrado de anexo_lead:" } },
        select: { descricao: true },
      })
    ).map((d) => d.descricao),
  );

  let criados = 0;
  let pulados = 0;

  for (const a of anexos) {
    const marca = MARCA(a.id);
    if (jaMigrados.has(marca)) {
      pulados++;
      continue;
    }

    console.log(
      `${GRAVAR ? "[GRAVANDO]" : "[dry-run] "} anexo ${a.id} "${a.nomeArquivo}" (${a.tamanho} B) ` +
        `— lead "${a.lead.nome}" → cliente ${a.lead.clienteId}`,
    );

    if (GRAVAR) {
      await prisma.documento.create({
        data: {
          clienteId: a.lead.clienteId!,
          origem: "comercial",
          canal: "interno",
          nome: a.nome,
          descricao: marca,
          autorId: a.autorId,
          // Preserva a data original — o arquivo não "nasceu" hoje, só ganhou uma 2ª referência.
          createdAt: a.createdAt,
          versoes: {
            create: {
              numero: 1,
              caminho: a.caminho,
              nomeArquivo: a.nomeArquivo,
              mime: a.mime,
              tamanho: a.tamanho,
              hashSha256: a.hashSha256,
              autorId: a.autorId,
              createdAt: a.createdAt,
            },
          },
        },
      });
    }
    criados++;
  }

  console.log(
    `\n${GRAVAR ? "Gravado" : "Simulado"}: ${criados} documento(s) novo(s), ${pulados} já migrado(s) (idempotência).`,
  );
  if (!GRAVAR) console.log("Dry-run — rode com --gravar para persistir.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
