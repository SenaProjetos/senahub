# Proposta composta — o que conferir em tela e o que fazer à mão

Branch `feat/funil-comercial` (sem push). Fases G0–G6 do
[plano](2026-09-19-proposta-composta.md), decisão em [ADR-0006](../../adr/0006-proposta-composta.md).

**O que já foi provado por máquina** (não precisa refazer em tela): `tsc`, `eslint`, ~3700 testes,
`smoke:crm-e2e`, `smoke:proposta-composta` (criar → UF → versão → impedimento → envio → aceite),
`verify:documento-proposta` (documento renderizado e medido no Chrome) e `scripts/verify-zoom-visualizador.ts`.
**O que nenhum deles vê:** aparência real, cliques, permissão de um perfil que não seja admin, e-mail,
PDF baixado pela rota autenticada. É isso que esta lista cobre.

---

## A. Preparar (uma vez)

- [ ] Subir com `npm run dev:server` (a página pública e o PDF precisam do Next no ar e de `CHROME_PATH`).
- [ ] **Configurações → Empresa:** preencher telefone, e-mail, banco, agência, conta, PIX e o
      **responsável técnico** (nome, cargo, CREA/CAU). **Sem isso nenhuma proposta composta publica** — o
      documento é bloqueado e a prévia diz "Configurações → Empresa ainda não foi preenchida".
- [ ] `npm run db:seed` no seu banco (já rodado no dev principal: 20 cláusulas, 4 modelos e o layout
      "Proposta composta (padrão)"). Confirme em **Comercial → Modelos de proposta**.
- [ ] Se usa o worktree `-vscode`: `npx prisma migrate deploy` lá (migração `20260919233000_proposta_composta`).

## B. Biblioteca (`Comercial → Modelos de proposta`)

- [ ] **Leia as 20 cláusulas.** São o que o cliente vai ler. Todas partem da variante mais frequente do corpus
      das 163 propostas, mas **nenhuma é cópia literal**: editei para tirar referências soltas ("conforme item
      Descrição dos Serviços"), quebras de palavra do PDF e o telefone/e-mail que vazava do rodapé. As que mais
      se afastam do original, e por isso pedem seu olho primeiro: `escopo-eletrico` e `escopo-pci`
      (genéricas, sem citar concessionária/norma estadual), `escopo-estrutural`, `descricao-abertura`
      (não existe no corpus), `pagamento-prazo-aprovacao-orgao` (duas observações unificadas),
      `valor-pacote-completo` (duas variantes fundidas) e `documentos-aprovacao-pci`.
- [ ] Os **planos de pagamento sugeridos** (40/30/30 multidisciplinar, 50/50 estrutural e PCI, 100% laudo) e as
      **validades** (30 dias; laudo 20) são os mais frequentes do corpus, mas foi escolha minha. Confirme.
- [ ] Buscar por texto, filtrar por seção, criar e editar uma cláusula.
- [ ] Editar uma cláusula digitando `[Cidde]` (com erro) → deve recusar e dizer qual campo não existe.
- [ ] Desativar uma cláusula que é padrão de um modelo → o aviso cita quantos modelos; depois, na aba
      **Modelos**, aquele modelo mostra a **faixa vermelha** "a seção nasce em branco".
      **Reative** a cláusula em seguida.
- [ ] **Perfil que NÃO é admin nem "administrativo":** o botão "Modelos de proposta" não aparece e a URL
      `/comercial/modelos` recusa.

## C. Criar uma proposta

Numa negociação em aberto:

- [ ] Botão **Nova proposta** no cabeçalho da ficha abre o diálogo de montagem (e o mesmo na aba Propostas).
- [ ] Criar com **UF = AL**, disciplinas Estrutural + Incêndio (PPCI): no editor, o escopo de PCI é o
      **genérico** (sem "COSCIP").
- [ ] Criar outra com **UF = PE**: o escopo de PCI cita o **COSCIP de Pernambuco**.
- [ ] Modelo **Laudo técnico**: sem seção de escopo, competências de laudo, validade 20 dias.
- [ ] Criar e tentar **cliente/negociação já contratada**: não deve receber proposta nova.

**A partir de uma prospecção (lead)** — os três cenários, todos devem terminar no diálogo de montagem aberto:
- [ ] Lead comum (em contato): "Nova proposta" cria a empresa/negociação e abre o diálogo.
- [ ] Lead **descartado**: pede confirmação para reativar; sem confirmar, nada muda.
- [ ] Lead que **já tem negociação**: cai na negociação existente, não cria outra.
- [ ] Depois de fechar o diálogo (ou recarregar a página) ele **não reabre sozinho**.
- [ ] Em **Comercial → Propostas → Nova proposta**: "Montar proposta" leva à negociação e abre o diálogo;
      "Proposta simples" cria pelo editor antigo.

## D. Editor da composta (`/comercial/propostas/[id]/compor`)

- [ ] O **percentual** de cada parcela mostra o valor e o **valor por extenso**; a soma fica **vermelha**
      enquanto não é 100% e verde ("fecha") quando é.
- [ ] Salvar com a soma em 110% **funciona** (rascunho) e gera nova versão.
- [ ] Desconto acima do limite exige justificativa; salvar sem ela é recusado.
- [ ] Reordenar (↑ ↓), apagar, acrescentar seção; editar o texto de uma seção e conferir que a
      **biblioteca não mudou**.
- [ ] Trocar a UF da obra **depois de criada não troca o texto já copiado** (só vale na criação) — decidir se
      isso é o que você quer.
- [ ] Proposta **aceita**: o Salvar fica desabilitado e há a explicação.

## E. Pré-visualização e o documento

(`Pré-visualizar` no editor.)

- [ ] **Lista de impedimentos** aparece quando há pendência: teste com plano em 110%, com a obra sem endereço e
      com a empresa sem cadastro (apague um campo em Configurações → Empresa e restaure).
- [ ] **A aparência.** É o que eu mais precisei supor: cabeçalho com o timbre, seções uma abaixo da outra,
      tabela de valores, plano de pagamento, dados bancários e assinatura **por último**. Procure:
      sobreposição entre a faixa das seções e o rodapé; texto cortado; espaço em branco estranho entre páginas.
- [ ] O plano de pagamento sai como **texto** (uma linha por parcela), não como tabela — limitação do motor
      (uma banda de detalhe por modelo). Aceitável para você?
- [ ] O layout é ajustável: **Doc Studio → "Proposta composta (padrão)"**. Abra, mexa em algo, salve, volte à
      prévia e confirme que a mudança aparece. Rodar `db:seed` de novo **não** deve desfazer sua mudança.
- [ ] **Zoom do visualizador:** Ctrl + roda dentro do desenho dá zoom só nele (a página não muda de tamanho);
      botão do meio arrasta; "Largura", "Página inteira" e "100%".

## F. Link público e PDF (precisa do servidor no ar)

- [ ] Copiar o **Link** e abrir numa janela anônima: mostra o documento, com **Baixar PDF** no topo.
      Com pendência (ex.: plano em 110%) o link deve responder **página não encontrada**.
- [ ] **Baixar PDF:** ao menos 2 páginas, com **"Página X / Y"** no rodapé e **o rodapé NÃO por cima do texto**
      (é o defeito que o `@page` causa e que só o PDF real mostra).
- [ ] O botão "Baixar PDF" e a caixa de envio de documentos **não aparecem dentro do PDF**.
- [ ] Abrir o link conta uma **abertura** no editor ("N abertura(s)").
- [ ] Enviar um documento pela caixa do cliente e ver que ele chega na proposta.

## G. Enviar, negociar, aceitar

- [ ] **E-mail:** só funciona com SMTP configurado (`SMTP_HOST` no `.env`); sem ele o botão avisa. Com SMTP: chega
      o e-mail com o link e o **valor com desconto** (não a soma bruta). Proposta com pendência é **recusada
      antes** de enviar.
- [ ] Depois de enviada: aparece **Em negociação**; **Recusar** pede o motivo; **Aceitar → projeto** cria o
      projeto com as disciplinas e o valor.
- [ ] Depois do aceite: **Ver projeto** e a proposta não edita mais.
- [ ] Lista **Comercial → Propostas**: etiqueta **Composta**/**Externa** ao lado do título.

## H. O que mexi e pode ter quebrado (regressão)

- [ ] **Proposta antiga (legado):** "Proposta simples" → salvar, e-mail, **link público abre igual ao de sempre**
      (o ramo antigo da página não foi tocado, mas é a coisa que mais dói se estiver errada), PDF.
- [ ] **Proposta externa:** registrar versão com PDF, aceitar na ficha; o link público dela **não abre**.
- [ ] **Estúdio de Documentos:** os 3 modelos que abriam **em branco** ("Carimbo A0" e os dois relatórios de
      exemplo) agora abrem com o desenho. Nos demais, nada mudou (foi provado byte a byte).
- [ ] No editor do Estúdio, a faixa tem a caixa **"Crescer com o conteúdo"** (só use em modelo novo).

## I. Produção — o que fazer à mão no deploy

Ordem sugerida. O que está marcado ⚠️ tem consequência séria se pulado.

1. [ ] Decidir o merge/PR de `feat/funil-comercial` (leva também a migração `20260918200000_proposta_externa`,
       que ainda não foi para produção).
2. [ ] `prisma migrate deploy` e depois `npm run db:seed`.
3. [ ] ⚠️ **Conferir o backfill** (em produção são 34 externas; no dev nunca havia nenhuma, então este é o
       primeiro uso real):
       ```sql
       SELECT count(*) FROM "proposta" WHERE ("externa" = true) <> ("formato" = 'externa');   -- tem de ser 0
       SELECT count(*) FROM "permissao_perfil" WHERE recurso='comercial' AND acao='modelos';  -- > 0
       ```
       Se o primeiro não for 0, as páginas públicas de propostas externas voltam a abrir.
4. [ ] ⚠️ **Configurações → Empresa em produção:** o dev tem dado fictício; produção precisa dos dados reais
       (inclusive banco/PIX e responsável). Sem isso, nenhuma composta publica.
5. [ ] **Quem pode manter modelos:** a migração deu `comercial:modelos` a quem tem `configuracoes:gerir`. Confira
       em Configurações → Permissões se é o grupo certo e ajuste.
6. [ ] Depois de um tempo em produção, **a migração de contração** (`DROP COLUMN "externa"`) num deploy
       **posterior** — só depois de conferir o item 3 e de o código novo estar estável. Enquanto isso a escrita
       é dupla.
7. [ ] `/manual-sync` (é sua): eu atualizei `comercial.md`, `novidades.md` e o guia in-app, mas **não** criei
       página nova nem mexi em `search-index.json`. Se quiser uma página própria para "Modelos de proposta",
       é por lá.
8. [ ] ADR-0006 está com `status: proposed`. Passe para `accepted` quando concordar.

## J. Decisões e limites que ficam com você

- **A UI não impede digitar telefone, e-mail ou CNPJ *literais* numa cláusula** — só recusa token inexistente.
  O teste barra isso na **semente**, não no que a gestão digita depois. O texto de ajuda da tela avisa, mas
  não bloqueia. Quer um bloqueio (recusar padrão de e-mail/CNPJ no texto)?
- **Buraco no módulo de contratos** (não corrigi, é sua decisão): o bloqueio de campo vazio casa o catálogo sem
  diferenciar maiúscula, mas o motor resolve por chave exata — `[cpf]` **passa na validação e sai em branco**.
  Corrigir pode passar a bloquear contratos que hoje geram com lacuna; antes vale varrer os modelos salvos.
- **Ctrl + roda no editor do Estúdio** não foi feito (só no visualizador).
- **Trocar a UF depois de criar** não recompõe as cláusulas (D acima).
- **Teste instável fora do escopo:** `importar-pdf.test.ts` (pdf.js do RH) falha sob carga em ~1 de 4 rodadas,
  sem relação com este trabalho.
- **Envio por outro canal:** só o botão E-mail marca a proposta como "enviada" (igual ao editor antigo). Quem
  manda o link por WhatsApp não tem como marcar — vale um botão "Marcar como enviada"?
