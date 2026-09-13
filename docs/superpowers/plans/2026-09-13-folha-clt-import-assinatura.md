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
  /// PDF original do contador, guardado para auditoria/reprocesso. Caminho relativo a
  /// STORAGE_BASE_PATH, mesmo padrão de NotaFiscalPJ.arquivoPath — NÃO é o modelo `Upload`
  /// (achado ao desenhar o schema: Upload exige `disciplinaId`, é escopado a projeto/disciplina;
  /// uma folha de pagamento não tem disciplina nenhuma).
  origemPdfPath String?
  origemPdfNome String?
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
     em `FolhaPagamento.origemPdfPath`/`origemPdfNome`.
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
| P0 | Schema (3 campos) + migration | Sonnet 5 — mecânico, specado — **entregue** |
| P1 | `parsearTextoFolha` puro + testes com os 4 PDFs reais como fixture de texto | Sonnet 5 — **entregue** |
| P2 | Fluxo de pendência (rubrica/matrícula desconhecida) + commit transacional + checksum | Opus 5 — trava financeira, mesmo cuidado do F0a da Produção — **entregue** |
| P3 | Assinatura (`assinarHolerite`, PDF, `minha-ficha`) | Sonnet 5 — espelha G5, já resolvido lá — **entregue** |
| P4 | Gate de acesso obrigatório (`precisaAssinarHolerite` + `/assinar-holerite`) | Opus 5 — mexe no layout que todo usuário passa; erro aqui tranca o sistema inteiro — **entregue** |
| P5 | Tela de import (upload/pendência/vínculo) + lembrete de assinatura | Sonnet 5 — **entregue** |
| P6 | Manual (`docs/manual/rh-ponto/folha-clt.md`) | Sonnet 5 / Haiku 4.5 (redação) — **entregue** |

---

## 7. Riscos e pendências abertas

- **As 6 fases (P0-P6) estão code-complete e commitadas em `feat/folha-clt-import`, mas
  NENHUMA linha foi exercitada em navegador.** Toda verificação até aqui foi tsc/lint/testes
  unitários/prova por mutação/script contra o banco de dev — nenhuma via sessão HTTP real. Antes
  de considerar a feature pronta pro RH usar, falta smoke em navegador cobrindo, nesta ordem de
  prioridade:
  1. **`extrairTextoPdf` contra um PDF de verdade do contador, subindo pela tela.** É o item mais
     caro da lista — os outros são bugs pontuais; este é "a feature inteira não funciona" se o
     pdfjs fragmentar uma linha (ver risco abaixo, mitigação escrita mas não implementada).
  2. As 4 telas do diálogo de import (escolher arquivo → pendência → resolver → reenviar) — a P5
     já achou 2 bugs só de ler o código com cuidado, sinal de que pode haver um terceiro que só
     aparece rodando de verdade.
  3. O gate da P4 com sessão real: o redirect pra `/assinar-holerite` dispara, a fila mostra os
     valores certos, drena até o dashboard.
  4. O gate de titularidade da P3 com DUAS sessões reais (funcionário A não assina holerite de B).
  5. O `useConfirm` do `reabrir()` mostrando a contagem certa de assinaturas que seriam revogadas.
  6. Se qualquer passo tocar notificação (`lembrarAssinaturaHolerite` chama `notificar`), rodar sob
     `npm run dev:server` — `npm run dev` não sobe pg-boss/Socket.io.
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
- **Risco de fragmentação de linha do `pdfjs-dist` — CONFIRMADO e corrigido no primeiro import
  real (2026-09-13, fora do plano de fases, achado só ao testar no navegador):** a suposição "1
  item = 1 linha" de `extrairTextoPdf` (que nunca tinha visto um PDF de verdade) quebrou de duas
  formas diferentes no primeiro arquivo real testado (07-26):
  1. Rota `/api/rh/folha/importar` roda no bundle do servidor Next — o "fake worker" do pdfjs
     (Node não tem Web Worker de verdade) tentava importar `pdf.worker.mjs` por caminho relativo,
     que sob o bundle resolve pra dentro de `vendor-chunks` onde o arquivo não existe. Corrigido
     apontando `GlobalWorkerOptions.workerSrc` pro arquivo real em `node_modules` (caminho
     absoluto calculado em runtime).
  2. A linha do período saiu fragmentada em 6 itens separados — confirmado com um dump real dos
     itens do pdfjs (script descartável, não é mais parte do repo). `juntarLinhasPorSequenciaEY`
     junta itens CONSECUTIVOS na ordem de chegada que compartilham a mesma posição Y — nunca
     ordena por X (o campo "a" do período aparece geometricamente ANTES de "31/07/2026" mas
     precisa ler depois) e exige Y quase exato, não "por perto" (duas linhas legítimas do mesmo
     PDF ficam a só 0,84 unidade uma da outra). Efeito colateral achado pela mesma correção: a
     linha de rubrica às vezes traz o código de 3 dígitos por ÚLTIMO em vez de primeiro — mesmo
     dado, ordem de desenho diferente — `casarRubrica` tenta as duas formas.
  **As 4 fixtures hand-transcribed (05-08/2026) ficaram desatualizadas por este achado**: nenhuma
  delas nunca passou pelo `extrairTextoPdf` de verdade, todas foram digitadas já na ordem
  "código primeiro" — continuam úteis (cobrem a rubrica 081, o layout de 2 páginas, o resumo de
  maio numa página só), mas não provam nada sobre a extração real. Só julho/2026 tem uma fixture
  que passou pelo pipeline de ponta a ponta (reconstruída do dump real, parse+checksum+
  classificação todos `ok:true`) — as outras 3 meses continuam sem nunca terem visto um PDF de
  verdade; 06-26 é o mais arriscado de verificar depois, porque a descrição da rubrica 081
  ("diferença salarial 05/2026") tem barra e dígitos que podem fragmentar diferente. **Não
  remover `RE_RUBRICA_CODIGO_ULTIMO`/o fallback em `casarRubrica` achando que é código morto** —
  é a forma que o PDF real usa, as fixtures antigas é que nunca a exercitaram.
- **Requisito de UI pra P5 (não deixar pra quem escrever a tela decidir):** `vincularMatriculaExterna`
  MOVE a matrícula quando ela já estava em outra pessoa, e devolve `desvinculadaDe` com o nome de
  quem perdeu o vínculo. A tela **tem** que mostrar isso em destaque na confirmação — mover
  matrícula é desatar uma pessoa da identidade de folha dela, e o operador precisa ver que isso
  aconteceu (o `AuditLog` já registra; o que falta é o humano enxergar na hora).
- **Pergunta aberta pra quando o RH testar (achado do advisor na P3, ainda sem decisão):** o PDF do
  holerite hoje é só a tabela de rubricas + linha de assinatura — sem CNPJ/razão social/período por
  extenso. Pra uso interno tá bom; se o funcionário for levar pra um banco ou virar peça de reclamação
  trabalhista, pode precisar de identificação do empregador (o PDF do próprio contador tem esse
  cabeçalho por esse motivo). Não implementado a cegas — perguntar antes de mexer em
  `renderHoleriteHtml`.
- **Checklist de smoke em navegador (achado do advisor na P3):** nenhum teste automatizado (mock ou
  banco real) passa por uma sessão HTTP de verdade — o gate de titularidade de `assinarHolerite`
  (`session.user.id === holerite.userId`) só foi provado contra `session.user` fabricado em teste.
  Antes de liberar pro uso real, confirmar manualmente que o funcionário A não consegue assinar o
  holerite do funcionário B.
- **P6 entregue**: `docs/manual/rh-ponto/folha-clt.md` (pasta real é `rh-ponto`, não `rh/` como o
  §6 original dizia) ganhou seções de import (fluxo, pendência, vínculo que move, números que não
  fecham) e de assinatura (lado do colaborador — fila obrigatória no próximo acesso, PDF, holerite
  antigo continua opcional — e lado do RH — lembrete, reabrir apaga assinatura). `search-index.json`
  atualizado com as tags/palavras-chave novas (importar, pdf, contador, assinatura, assinar,
  rubrica, matrícula, lembrete) — conferido com um script contra `lerPaginaManual`/`buscarManual`
  de verdade (não só lendo o markdown): página carrega, corpo tem as seções novas, busca por
  palavra única acha "Folha CLT" pra cada termo novo (busca multi-palavra é substring literal da
  frase inteira — comportamento pré-existente do buscador, não regressão desta página). Sem
  entrada em `docs/manual/novidades.md`: nenhuma feature-irmã deste mesmo tipo (nem a refatoração
  de Produção, já mergeada em `dev`) ganhou entrada lá ainda — aquele changelog em linguagem de
  usuário parece ser escrito perto do deploy em produção, não na implementação. Achado do
  `advisor()` corrigido antes do commit: o texto mandava o colaborador assinar holerite antigo em
  "Minha conta" sem dizer onde fica — `/minha-ficha` não tem página nenhuma no manual (gap
  pré-existente, fora do escopo desta fase criar), então a instrução precisa dizer "menu lateral"
  pra quem procurar não ficar sem saída.
- **Gap achado antes da P5, não coberto por nenhuma fase do §6 original:** P1/P2 só tinham
  backend (`parsearTextoFolha`, `importar-service.ts`, rota `/api/rh/folha/importar`) — não
  existia NENHUMA tela de upload/pendência, então ninguém conseguia usar o import pelo navegador.
  Perguntado ao dono, que confirmou incluir a tela na P5 (opção recomendada) em vez de adiar pra
  uma fase futura indefinida.
- **P5 entregue**: `ImportarFolhaDialog` (`components/rh/folha/importar-folha-dialog.tsx`), botão
  "Importar PDF" na folha aberta. Fluxo bate com §3: escolhe o PDF → POST multipart → sem
  pendência, some a tela e atualiza; com pendência, mostra cada rubrica/matrícula faltando com
  vínculo a existente ou criação de nova, e reenvia o MESMO `File` em memória (decisão §0.1 — sem
  escolher o arquivo de novo). Aviso de `desvinculadaDe` fica em destaque num banner que persiste
  na tela (não só toast) enquanto o diálogo estiver aberto, atendendo a pendência de UI que já
  estava anotada aqui. `lembrarAssinaturaHolerite` (mirror de `lembrarAssinaturaRecibo`) com botão
  de sino em `folha-detalhe-view.tsx`, ao lado do badge assinado/pendente — mesmo cuidado de opt-out
  já aplicado (toast avisa quando o funcionário desativou avisos de pagamento). Achados do
  `advisor()` corrigidos antes do commit: (1) vincular uma rubrica pendente a uma EXISTENTE cujo
  tipo diverge do sugerido pela aritmética do PDF não avisava nada — RH via "tudo resolvido",
  reenviava, e `conferirClassificacao` recusava o arquivo inteiro sem apontar de volta pro vínculo
  errado; agora a tela mostra o conflito na hora da escolha; (2) `res.json()` sem try/catch —
  resposta não-JSON (corpo grande demais, redirect de auth, 502 do túnel) explodia dentro do
  `useTransition` sem toast nenhum, deixando o botão parecendo travado. 5 testes novos
  (`actions-lembrete.test.ts`), suíte em 285 arquivos/3090 testes, prova por mutação no filtro de
  opt-out (removido `filtrarPorCategoria`, 1 teste falhou como esperado, restaurado limpo). Sem
  script de banco de dev nesta fase — `lembrarAssinaturaHolerite` não tem invariante transacional,
  e o resto da lógica (vincular, importar) já foi verificado contra o banco na P2. **A tela do
  diálogo em si não tem teste automatizado** — este projeto não roda jsdom (`vitest.config.ts` é
  ambiente node puro), então o fluxo de 4 estados (escolher → pendência → resolver → reenviar)
  só foi conferido por leitura cuidadosa (achou os 2 bugs acima) — falta smoke em navegador.
- **Risco não resolvido, o mais caro da lista pro dono saber antes do primeiro uso real:**
  `extrairTextoPdf` nunca foi testado contra um PDF de verdade do contador — só contra texto
  transcrito à mão (P1) e um PDF sintético gerado por `pdf-lib` (que não fragmenta linha por
  construção). O `pdfjs-dist` real pode fragmentar uma linha em vários itens de texto por
  fonte/corrida — se isso acontecer, o parser erra silenciosamente pra "nenhum funcionário
  encontrado" na primeira tentativa real. Ver mitigação já anotada abaixo (agrupar por posição Y).
- **Data de corte da obrigatoriedade — o dono pode querer mexer antes do deploy:**
  `ASSINATURA_HOLERITE_OBRIGATORIA_DESDE` (em `modules/rh/folha/queries.ts`) vale
  `2026-09-13T15:00:00Z`, a data em que a migration criou a coluna `assinadoEm`. Antes disso
  assinar era impossível, então nenhuma folha antiga tranca o acesso — sem isso, todo CLT cairia
  numa fila com o histórico inteiro no primeiro login depois do deploy. **Só governa o bloqueio:**
  holerite antigo continua assinável por vontade própria pela ficha (`assinarHolerite` não filtra
  por data). Se o deploy demorar e o RH fechar folha nesse meio-tempo, essas folhas entram na
  obrigatoriedade — se o dono preferir começar do zero, é só empurrar a constante pra frente.
- **P4 entregue**: gate de acesso obrigatório. `precisaAssinarHolerite(user)` (consulta de layout:
  `findFirst` + `select: {id:true}`, sem carregar item nenhum — medido em 0,55ms sem holerite e
  0,80ms com) roda no `(dashboard)/layout.tsx` logo depois do gate do Termo de Uso e redireciona
  pra `/assinar-holerite`. A tela vive no grupo `(auth)` (fora do layout do dashboard, sem loop) e
  repete a MESMA cadeia de guardas do `/termo` — sessão → troca de senha → termo → pendências —
  senão dava pra chegar nela pela URL e assinar antes de aceitar o termo. A fila mostra a tabela de
  proventos/descontos/líquido do holerite (JSX, não o `renderHoleriteHtml`, que é HTML pro
  puppeteer) + link do PDF, e usa caixa de confirmação no lugar de diálogo porque `(auth)` não tem
  `<ConfirmProvider>` — `useConfirm` lançaria. Folha reaberta some da fila (volta a `aberta`): quem
  teve assinatura revogada só é cobrado quando o RH fechar de novo. 8 testes novos
  (`queries-assinatura.test.ts`), suíte em 284 arquivos/3085 testes; prova por mutação removendo o
  filtro `fechadaEm` (exatamente os 2 testes do corte falharam, restaurado limpo); 14 cenários
  contra o banco de dev (sem holerite, folha aberta, fechada antes do corte, fechada depois,
  assinado, reaberta, custo) com resíduo conferido zerado por query independente. Achado do
  `advisor()` corrigido antes do commit: a fila era um `useState` tirado no render, e erro de
  assinatura não avançava o item — com a folha reaberta entre o render e o clique, a pessoa
  repetiria o mesmo erro pra sempre numa tela cuja razão de existir é ser atravessada. Agora falha
  também avança a fila, porque quem decide se ainda há pendência é o gate do layout, não a lista.
- **P3 entregue**: `service.ts` (`renderHoleriteHtml`, puro, comentário no topo explica por que não
  tem hash de texto como o recibo — a integridade vem de só assinar com `folha.status === "fechada"`
  + `reabrirFolha` limpando assinatura ao reabrir, não de um snapshot). Nova action `assinarHolerite`
  (gate por titularidade, sem `recurso` — mesmo modelo de acesso de `minha-ficha`, não o do recibo).
  `reabrirFolha` agora roda em transação e zera `assinadoEm`/`assinanteId` de quem já tinha assinado,
  devolvendo `assinaturasRevogadas`. Rota `GET /api/rh/holerite/[id]/pdf` (mesmo padrão puppeteer-core
  do recibo). UI: `HoleriteAssinaturaCell` em `pessoa-360-view.tsx` (self-service) e botão de
  PDF + badge assinado/pendente em `folha-detalhe-view.tsx` (RH). 7 testes novos
  (`actions-assinatura.test.ts`), suíte completa em 283 arquivos/3077 testes. Prova por mutação:
  removida a limpeza de assinatura de `reabrirFolha`, rodados os 7 testes — exatamente 1 falhou como
  esperado, arquivo restaurado, `git diff` limpo depois. Verificado contra o banco de dev com script
  temporário (6 cenários: folha aberta não deixa assinar, fechar de verdade, assinar de verdade,
  corrida de 2 cliques recusada, PDF mostra "assinado eletronicamente", reabrir limpa a assinatura no
  banco) — resíduo conferido zerado por query independente depois, script apagado. Achado do
  `advisor()` corrigido antes do commit: `reabrirFolha` revogava assinatura em silêncio — a tela não
  avisava nem antes (RH decidindo se reabre) nem depois (quantas foram derrubadas). Agora `reabrir()`
  mostra um `useConfirm` com a contagem de assinados quando há algum, e o toast final informa quantas
  assinaturas foram revogadas.
- **P2 entregue** (commit a seguir): `importar-service.ts` (análise + aplicação), rota multipart
  `/api/rh/folha/importar`, e as actions `vincularRubricaExterna`/`vincularMatriculaExterna`.
  Verificado contra o banco de dev com script temporário (apagado ao final, resíduo conferido
  por query independente depois): pendências com tipo já deduzido, recusa de competência errada,
  gravação real com tipo/valor certos, reimport substituindo em vez de duplicar (4 itens, não 8),
  e recusa de rubrica com o sinal trocado. Achados do `advisor()` nesta fase: (1) **premissa dele
  refutada com evidência** — alegou que trocar `RubricaFolha.tipo` reescreveria holerite antigo;
  não reescreve, porque `HoleriteItem.tipo` é coluna própria copiada na escrita e `fecharFolha`
  soma por `item.tipo` (conferido no schema e no código); (2) **defeito real achado no lugar**: o
  `codigoExterno` era gravado antes da conferência e a guarda de unicidade deixava o código preso
  na rubrica errada, sem conserto pela tela — agora o vínculo MOVE (solta o antigo, prende o
  novo, na mesma transação), e o mesmo foi aplicado à matrícula; (3) o tipo da rubrica é relido
  DENTRO da transação e a gravação aborta se mudou no meio do caminho (guarda na leitura, guarda
  repetida na escrita, mesma disciplina da G14 da Produção); (4) no reimport o PDF anterior é
  apagado do disco depois do commit, em vez de virar arquivo órfão.
- **P1 entregue**: `src/modules/rh/folha/importar-pdf.ts` +
  `importar-pdf.test.ts` (11 testes, 4 meses reais como fixture). `advisor()` achou e foram
  corrigidos antes do commit: (1) linha de totais do funcionário nunca era cruzada contra as
  rubricas dela — `checarChecksum` comparava `liquido` lido do PDF contra o próprio `liquido`
  lido do PDF, checagem vazia contra rubrica mal capturada ou má classificação futura de
  provento/desconto em P2 — corrigido com `reconciliarFuncionario` (força bruta 2^N nas
  rubricas do funcionário, N pequeno); (2) competência lida só da data de início do período, sem
  checar que início/fim caem no mesmo mês (rescisão/folha complementar quebraria a unique
  `[ano,mes]` em silêncio); (3) resumo sem guarda contra a janela posicional deslizar (um 9º
  total futuro empurraria a leitura toda uma casa) — corrigido com
  `totalGeral - totalDescontos === totalLiquido` verificado na própria extração. Prova por
  mutação: removida a chamada de `reconciliarFuncionario` de `checarChecksum`, rodada a suíte —
  exatamente 1 dos 11 testes falhou como esperado — arquivo restaurado, `git diff` limpo depois.
