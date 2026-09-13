# Plano — Import automático da Folha CLT (PDF do contador) + assinatura do holerite

- **Data:** 2026-09-13
- **Origem:** dono pergunta se dá pra importar a folha automaticamente, já que o contador sempre
  manda no mesmo formato. Enviou 4 meses reais (05, 06, 07, 08/2026) — layout idêntico nos 4,
  confirma viabilidade (ver §1). Pediu também assinatura do funcionário no holerite, espelhando o
  recibo de produção (`docs/superpowers/plans/2026-09-10-folha-projetistas-refatoracao.md`, G5).
- **Estado:** desenho aprovado pelo dono, nada implementado ainda.
- **Escopo:** módulo `rh/folha` (Prisma: `RubricaFolha`, `User`, `Holerite`, `FolhaPagamento`) +
  gate de acesso no `(dashboard)/layout.tsx` + self-service em `minha-ficha`.
- **Branch:** `feat/folha-clt-import`, a partir de `dev` (worktree `SENAHub-remake-clt`) —
  `feat/folha-projetistas` já foi mergeado em `dev` local antes de abrir esta branch (não
  empurrado pro remoto ainda — decisão de quando dar push fica com o dono).

---

## 0. Decisões do dono (2026-09-13)

1. **Reprocessamento após resolver pendência de rubrica/matrícula: aceito.** RH resolve o que
   falta e reenvia o mesmo PDF — sem sessão de import persistente entre passos.
2. **`RubricaFolha.codigoExterno` único globalmente: aceito.** Assume 1 empresa/1 contador nesse
   formato. Se um dia trocar de contador ou abrir 2ª razão social com layout diferente, revisitar.
3. **Assinatura do holerite é OBRIGATÓRIA, mas não trava o pagamento** (a folha fecha e o
   Lançamento nasce igual, com ou sem assinatura pendente) — **e exige a assinatura no PRÓXIMO
   acesso ao sistema**, antes de deixar o funcionário usar qualquer outra tela. Mecanismo: mesmo
   gate que já existe pro Termo de Uso (`precisaAceitarTermo` em `(dashboard)/layout.tsx`, redireciona
   pra `/termo` fora do grupo autenticado) — aqui, `precisaAssinarHolerite` redireciona pra
   `/assinar-holerite` até não sobrar holerite fechado sem assinatura daquele usuário.
4. **Imprimir/exportar em PDF, tanto holerite (CLT) quanto recibo (PJ) — pedido 2026-09-13.**
   Lado PJ **já está pronto** (entregue no G5 da Produção, já mergeado em `dev`):
   `/api/financeiro/recibos/[id]/pdf` + botão "PDF" em `meus-recibos.tsx` (self-service do
   projetista) e em `recibos-section.tsx` (visão de quem gerencia). Nada novo a fazer ali. Lado
   CLT é o que este plano cria — detalhado em §4.

---

## 1. Por que é viável (evidência dos 4 PDFs enviados)

- Texto nativo, não é scan — extraível com `pdfjs-dist` (já é dependência do projeto, usado em
  outro lugar do stack), sem OCR.
- Bloco fixo por funcionário nos 4 meses: código (matrícula), nome, admissão, função, rubricas
  (código + descrição + valor), líquido. Mesma posição, mesma pontuação.
- Matrícula (`000001`-`000005`) é **estável por pessoa** nos 4 meses — a ordem no PDF é alfabética
  por nome (não por código), então o parser não pode confiar em ordem, só no código embutido em
  cada linha.
- Só 4 códigos de rubrica apareceram: `001` (Salário Base), `903` (INSS Folha), `604` (Vale
  Transporte), `081` (diferença salarial — **descrição muda todo mês** — "05/2026", "06/2026" —
  por isso o match tem que ser pelo código, nunca pelo nome da rubrica).
- Checksum bate nos 4 meses: soma dos líquidos parseados por funcionário == "Total Líquido" da
  página de resumo. Vira trava de commit (§3).
- Risco que os 4 meses não provam: rubrica ainda não vista (13º, férias em dinheiro, hora extra,
  adicional noturno). Mitigado pelo fluxo de cadastro obrigatório de código desconhecido (§3) — o
  sistema nunca adivinha, sempre pede confirmação humana na primeira ocorrência de um código novo.

---

## 2. Schema (3 campos novos, nenhuma tabela nova)

```prisma
model RubricaFolha {
  ...
  /// Código do relatório do contador ("001", "903", "604", "081"...). Único globalmente —
  /// assume 1 contador/1 layout (decisão do dono, 2026-09-13). Rubrica só é elegível pro
  /// import automático depois de ter este campo preenchido.
  codigoExterno String? @unique
}

model User {
  ...
  /// Matrícula do funcionário no sistema do contador ("000001".."000005"). Mapeada uma vez por
  /// pessoa (não muda mês a mês) — vínculo manual na primeira vez que a matrícula aparece.
  matriculaFolhaExterna String? @unique
}

model Holerite {
  ...
  assinadoEm  DateTime?
  assinanteId String?
  assinante   User? @relation("HoleriteAssinante", fields: [assinanteId], references: [id])
}

model FolhaPagamento {
  ...
  /// PDF original do contador, guardado para auditoria/reprocesso — Upload existente, não um
  /// modelo novo.
  origemPdfUploadId String? @unique
  origemPdfUpload   Upload? @relation(fields: [origemPdfUploadId], references: [id])
}
```

Nenhuma tabela de staging: `FolhaPagamento` já tem o ciclo `aberta` (rascunho editável) →
`fechada` (trava + gera Lançamento). O import só populates uma folha **aberta** — a tela de
revisão que já existe (`/rh/folha/[id]`) é o preview, sem precisar duplicar UI.

---

## 3. Fluxo de import

```
RH abre/cria a FolhaPagamento do mês (aberta)
  → sobe o PDF (multipart, via rota própria — mesmo motivo de qualquer upload no projeto:
     REST fora do middleware, ver CLAUDE.md "Gotchas")
  → server extrai texto (pdfjs-dist) e faz o parse por bloco (regex sobre linhas de texto,
     NUNCA por posição de pixel — um PDF gerado por outro relatório do mesmo sistema pode
     reindentar sem mudar o texto)
  → valida ANTES de gravar qualquer coisa:
      a) todo código de rubrica do PDF tem RubricaFolha.codigoExterno correspondente?
      b) toda matrícula do PDF tem User.matriculaFolhaExterna correspondente?
      c) soma dos líquidos parseados == "Total Líquido" da página de resumo do PDF?
  → (a) ou (b) falhar: NADA é gravado. Tela mostra as pendências:
       "Rubrica 081 'diferença salarial 06/2026' (R$ 146,65) não cadastrada"
         → RH escolhe: vincular a uma RubricaFolha existente OU criar nova (nome + tipo
           provento/desconto) — igual ao `canonizar.ts` já faz pra catálogo de RH.
       "Matrícula 000003 'GICELLY OLIVEIRA DA SILVA' não vinculada"
         → RH escolhe o User correspondente (select — mesma pessoa já cadastrada em RH).
     Resolvido, RH reenvia o MESMO arquivo — reprocessa do zero (decisão §0.1: sem sessão de
     import persistente entre tentativas).
  → (c) falhar: import inteiro rejeitado, mostra a diferença em R$. Nunca grava parcial —
     mesma disciplina transacional do resto do financeiro.
  → tudo validado → upsert de Holerite/HoleriteItem por matrícula (mesmo formato que
     `salvarHolerite` já grava hoje), folha continua ABERTA. PDF original salvo via
     `lib/storage.ts` (`resolverCaminho`, mesma guarda anti-traversal de todo upload) e linkado
     em `FolhaPagamento.origemPdfUploadId`.
RH revisa em `/rh/folha/[id]` (tela existente, sem mudança), ajusta se quiser, clica
"Fechar folha" (ação existente `fecharFolha`, sem mudança) → Lançamento de despesa criado,
folha fechada.
```

**Módulo do parser:** `src/modules/rh/folha/importar-pdf.ts` — função pura
`parsearFolhaPdf(texto: string)` (testável sem PDF real, só com o texto extraído) +
`extrairTextoPdf(buffer)` (thin wrapper sobre `pdfjs-dist`, sem lógica, não testado por unidade —
mesmo corte de responsabilidade que `dxf.ts`/`bcf/writer.ts` já usam no projeto: I/O fino por fora,
lógica pura testada por dentro).

---

## 4. Assinatura do holerite (espelha o recibo de produção, G5 do plano de Produção)

- Depois de `fecharFolha`, cada `Holerite` daquela folha vira **assinável** pelo titular. Não
  trava nada no fluxo de pagamento (mesma filosofia do recibo: documento do que já foi
  decidido/pago, não etapa de aprovação) — mas é **obrigatória a médio prazo** via o gate de
  acesso (abaixo), não por bloquear o fechamento da folha.
- Nova action `assinarHolerite`: gate = `session.user.id === holerite.userId` (titular), só
  aceita se `folha.status === "fechada"`. Grava `assinadoEm` + `assinanteId`.
- **PDF/impressão do holerite (pedido explícito 2026-09-13, mesmo padrão já entregue pro recibo
  PJ):** rota `GET /api/rh/holerite/[id]/pdf`, mesmo `renderReciboHtml`/
  `/api/financeiro/recibos/[id]/pdf` (puppeteer-core, já no stack) — renderiza assinado ou
  pendente; abrir em nova aba deixa o navegador imprimir sem passo extra (mesma UX do recibo).
  Botão "PDF" some em DOIS lugares, espelhando exatamente `meus-recibos.tsx`/`recibos-section.tsx`:
  - **`minha-ficha`** (self-service, `holeritesDaPessoa`) — o funcionário baixa/imprime o próprio,
    assinado ou não.
  - **`/rh/folha/[id]`** — quem gerencia RH baixa/imprime o de qualquer colaborador da folha
    (2ª via, conferência, entrega física a quem pedir).
- **Gate de acesso obrigatório** (decisão §0.3) — mesma receita do Termo de Uso:
  ```ts
  // (dashboard)/layout.tsx, logo depois do gate de Termo de Uso já existente
  if (await precisaAssinarHolerite(user)) redirect("/assinar-holerite");
  ```
  `precisaAssinarHolerite(user)` = existe algum `Holerite` de `user.id` com `folha.status ===
  "fechada"` e `assinadoEm === null`. `/assinar-holerite` vive no grupo `(auth)` (fora do layout
  do dashboard, mesmo motivo do `/termo`: sem loop de redirect), lista os holerites pendentes
  daquele usuário, assina um a um; ao zerar a lista, segue pro dashboard normalmente.
  **Efeito colateral aceito, não é bug:** funcionário com 3 meses de holerite fechado sem assinar
  (ex.: voltou de licença) vê os 3 na fila, assina os 3 antes de continuar — não é só o mais
  recente.
- **Lembrete de assinatura pendente pro RH** (achado do advisor na feature irmã, aplicado de
  saída aqui em vez de como correção): a action de lembrete checa opt-out de notificação
  (`filtrarPorCategoria`) e devolve se avisou ou não — nunca afirma "enviado" quando o canal
  estava fechado.
- **Indicador de pendência** na tela `/rh/folha/[id]`: cada linha de holerite mostra
  assinado/pendente. Sem aba dedicada por enquanto (volume é 5-10 pessoas/mês — uma coluna
  resolve); revisitar se o RH achar pouco, mesmo critério do recibo de produção.

---

## 5. Permissões

- Import de PDF + cadastro de rubrica/vínculo de matrícula: `rh:folha` (gate já existente,
  `HR_ADMIN_ROLES`) — nenhuma permissão nova.
- Assinar: sem permissão nova — é titularidade (`session.user.id === userId`), igual ao recibo de
  produção.
- Gate de acesso (`precisaAssinarHolerite`): roda pra qualquer usuário logado com holerite
  pendente, sem checagem de permissão — é bloqueio, não ação.

---

## 6. Modelo de IA por fase (a definir na hora de implementar)

| Fase | O quê | Sugestão |
| --- | --- | --- |
| P0 | Schema (3 campos) + migration | Sonnet 5 — mecânico, specado |
| P1 | `parsearFolhaPdf` puro + testes com os 4 PDFs reais como fixture de texto | Sonnet 5 |
| P2 | Fluxo de pendência (rubrica/matrícula desconhecida) + commit transacional + checksum | Opus 5 — trava financeira, mesmo cuidado do F0a da Produção |
| P3 | Assinatura (`assinarHolerite`, PDF, `minha-ficha`) | Sonnet 5 — espelha G5, já resolvido lá |
| P4 | Gate de acesso obrigatório (`precisaAssinarHolerite` + `/assinar-holerite`) | Opus 5 — mexe no layout que todo usuário passa; erro aqui tranca o sistema inteiro |
| P5 | Indicador de pendência na tela de RH + lembrete | Sonnet 5 |
| P6 | Manual (`docs/manual/rh/...`) | Sonnet 5 / Haiku 4.5 (redação) |

---

## 7. Riscos e pendências abertas

- Rubrica nova não vista nos 4 meses de amostra (13º, férias em dinheiro, hora extra) — mitigado
  pelo cadastro obrigatório, não eliminado. Vai aparecer na prática assim que dezembro chegar.
- `codigoExterno` único globalmente (decisão §0.2) — se a empresa trocar de contador ou abrir 2ª
  razão social com layout diferente, revisitar o design (hoje não vale a complexidade de suportar
  múltiplos layouts).
- Sem sessão de import persistente (decisão §0.1) — reenviar o PDF depois de resolver pendência é
  um passo a mais pro RH, mas evita estado intermediário morto no banco.
- Nenhum PDF de dezembro/13º ainda visto — o parser pode precisar de ajuste quando esse mês
  chegar; não é motivo pra não implementar agora, é motivo pra não prometer suporte a 13º de
  cara.
