# Assistente financeiro no WhatsApp — design

Data: 2026-10-26 · Origem: conversa de brainstorming com o dono · Status: rascunho para aprovação

## 1. Intenção

O dono envia e recebe a maior parte dos comprovantes e das mensagens do financeiro pelo WhatsApp. Hoje isso é digitado à mão no
SenaHub, e comprovante solto na conversa se perde. O assistente vira o **ponto de entrada**: o dono manda a foto/PDF e uma frase,
o assistente entende, mostra o que entendeu, e só depois de um "ok" grava no financeiro. Uma vez por semana ele manda um resumo do
caixa; ao fim do mês, o mensal. O desenho nasce para receber mais funções no futuro sem refazer a base.

Sucesso = o dono para de digitar despesa à mão, nenhum comprovante enviado fica sem rastro, e o financeiro nunca ganha lançamento
duplicado ou errado por causa do assistente.

## 2. Escopo desta versão (V1)

Só **despesas**:

1. **Comprovante de pagamento** (Pix, TED, recibo) → despesa **paga** (ou baixa de uma conta a pagar aberta, ver §5).
2. **Boleto, NF, cobrança** → **conta a pagar** em aberto (`previsto`), com vencimento, valor e favorecido lidos do documento.
3. **Baixa de conta aberta com diferença de valor**: juros/multa quando o comprovante é maior, parcial ou desconto quando é menor.
4. **Conta de origem** lida do comprovante e casada com as contas cadastradas.
5. **Projeto**: pergunta na hora; "depois" grava o lançamento sem projeto e coloca o item na **lista de pendências**.
6. **Relatório semanal** (segunda, 07:30) e **mensal** (primeiro dia útil após o fechamento do mês).
7. **Lista de pendências**: tela no SenaHub + comando "pendentes" no WhatsApp.

### Fora do escopo (etapas futuras, registradas)

- Baixa de **recebimento** a partir do comprovante do cliente (a peça de "procurar o aberto" da §5 foi desenhada para servir às duas pontas).
- **Pedido de reembolso** dos sócios (hoje não existe no sistema: só a fatura do cartão pessoal do sócio, M3). Função nova.
- **Uso pelos sócios**: só o desenho fica preparado (§4). Na V1 só o número do dono está autorizado.
- Perguntas livres ("quanto gastei com X?"), editar/apagar lançamento pelo WhatsApp.

### Anti-objetivos (falha mesmo que "funcione")

- Gravar qualquer coisa sem confirmação do dono.
- Criar uma despesa nova quando já existia a conta a pagar correspondente (duplicidade).
- Dar baixa na conta errada; em caso de empate o assistente nunca escolhe sozinho.
- Aceitar ou processar mensagem de número não autorizado.
- Perder um comprovante sem deixar rastro.

## 3. Arquitetura

```
WhatsApp (Cloud API da Meta, chip do servidor)
   │ webhook (POST, assinatura HMAC X-Hub-Signature-256)
   ▼
/api/whatsapp/webhook         ← rota pública autenticada por assinatura, FORA do middleware (como as demais /api)
   │ grava MensagemWhatsapp + baixa a mídia (STORAGE_BASE_PATH) e responde 200 rápido
   ▼
fila pg-boss  "assistente-processar-mensagem"   (só roda sob dev:server / produção)
   ▼
modules/assistente/
   ├─ interpretador   (LLM atrás de interface → JSON estruturado, validado por Zod)
   ├─ casamento       (procura contas a pagar abertas; puro, testado)
   ├─ conversa        (máquina de estados da conversa: propõe → confirma → grava)
   └─ comandos/       (um módulo por função: despesa, pendentes; futuros: recebimento, reembolso…)
   ▼
serviços EXISTENTES do financeiro (nunca SQL direto)
```

Pontos de partida no código que o assistente **reusa, sem reescrever**:

- `criarLancamentoNoTx` (`financeiro/lancamentos/service.ts`): campos obrigatórios configuráveis, alçada, categoria do mesmo tipo.
- `baixarNoTx` (`financeiro/lancamentos/baixa-service.ts`): principal/juros/multa/desconto, trava de mês fechado, máquina de estados N1,
  comprovante obrigatório, `pagamentoPagoNoFinanceiro` do projetista. Pedido: `{ id, contaId, formaId, data, principal, juros, multa, desconto }`.
- `exigirPeriodoAberto`, `acharCategoriaDoSistema`, `chaveNfeValida`/`normalizarChaveNfe`, `Lancamento.numeroDocumento`/`chaveNfe`.
- Casamento da conciliação (`financeiro/conciliacao/casamento.ts`) como modelo de regra; **não** é chamado direto (o alvo é outro), mas a
  tolerância e o "nunca em empate" seguem o mesmo princípio.
- Saldo/projeção: `saldoBase()` e `torreDeControle()`/`projetar()` — o relatório lê as MESMAS funções da Visão geral (um número só).
- Relatórios mensais: `whereDRE`, indicadores gerenciais (`indicadores-gerenciais.ts`), `relatorioPorDimensao`.
- Armazenamento: `lib/storage.ts` (`resolverCaminho`); anexo do comprovante no lançamento pelo mesmo caminho do anexo manual.

Regra do repositório: o webhook é rota REST permitida (endpoint público com token/assinatura). Tudo o mais é Server Action/serviço.
O processamento depende do pg-boss, então só funciona sob `dev:server` ou produção.

## 4. Pessoas e permissões

Tabela `NumeroAssistente` (nome provisório): `telefone` (E.164, único), `userId`, `ativo`, lista de comandos permitidos. V1 tem uma
linha: o dono. Cada pessoa age **com a permissão do próprio usuário** no SenaHub (nunca a do dono). Liberar sócio = cadastrar linha, sem
mudar código. Mensagem de número fora da tabela: descartada **sem gravar conteúdo nem mídia**, só um contador/log técnico.

## 5. Regra central: procurar o aberto antes de criar

Nenhuma despesa nasce sem antes verificar as contas a pagar abertas (`Lancamento.status = previsto`, `tipo = despesa`, não excluído,
não `previsao`, não perna de transferência, não acessório).

Sinais, do mais forte ao mais fraco: código/linha digitável do boleto ou chave de NF igual → favorecido igual (fornecedor/contato) →
valor próximo → vencimento próximo.

- **Um candidato** → propõe a baixa; confirma → `baixarNoTx`.
- **Vários** → lista numerada; o dono escolhe pelo número. Nunca escolhe sozinho.
- **Nenhum** → "não encontrei conta a pagar aberta; crio como despesa já paga?" Sem resposta, não cria.
- **Valor do comprovante maior** que o do título → propõe a divisão principal + juros/multa. **Menor** → pergunta se é parcial (o restante
  continua a pagar) ou desconto obtido. **Limite**: diferença acima de um teto (palpite: 10%) sem outro sinal forte (código/favorecido)
  é tratada como "nenhum".
- A peça é uma função pura `candidatosAbertos(entrada, abertos)` com a direção (`pagar|receber`) como parâmetro, para o recebimento
  futuro reusar.

## 6. Conversa e confirmação

Máquina de estados por conversa (`ConversaAssistente`): `interpretando → aguardando_confirmacao | aguardando_resposta → concluida | pendente | expirada`.

- Resumo de confirmação sempre traz: tipo (pago/a pagar/baixa), valor, data, favorecido, categoria, projeto, conta, e o que será
  criado/baixado. Respostas aceitas: "ok", número de opção, ou correção em texto ("o projeto é Arapiraca").
- **Projeto faltando**: pergunta com lista numerada dos projetos ativos que mais batem. "Depois" → grava **sem projeto** e abre a pendência.
  Se a configuração financeira tornar projeto obrigatório (hoje `obrigatorios.projeto = false`), o assistente não grava sem projeto e
  mantém o item como rascunho na conversa. *(escolha do spec, não do dono)*
- **Conta de origem**: lida do comprovante (banco/agência/conta ou final) e casada com `ContaBancaria`; usa sem perguntar quando casa
  com uma só. Pergunta (lista das contas, a `padrao` primeiro) apenas se não casar, casar com várias ou não houver origem legível.
- **Sem resposta em 24h** a conversa expira; nada é gravado. Se já havia lançamento criado (caso "depois"), ele permanece e a pendência
  continua. A mensagem e o arquivo ficam guardados (nada se perde).
- **Idempotência**: o `wamid` da mensagem é único; reentrega do webhook não processa de novo. Arquivo com mesmo hash dentro da mesma
  conversa/dia gera aviso "esse comprovante parece já enviado" em vez de segundo lançamento.

## 7. Pendências

`PendenciaAssistente`: tipo (`projeto_faltando` na V1; futuros: categoria, conta…), `lancamentoId`, `mensagemId`, status aberta/resolvida,
resolvida por/em. Tela no SenaHub (lista, resolve escolhendo o projeto) e comando "pendentes" no WhatsApp (devolve a lista numerada e
aceita "3 Arapiraca"). Resolver atualiza o lançamento pelo serviço existente, respeitando a trava de mês fechado (recusa com a mensagem
de hoje). Lembrete diário das abertas (pg-boss, desligável por preferência; categoria nova de notificação a registrar).

## 8. Interpretador (LLM)

Interface única `Interpretador.interpretar(entrada) → Resultado` (Zod). Provedores por configuração: **Gemini (plano grátis) para teste**,
**Anthropic Haiku** depois, só trocando provedor/chave. O modelo apenas **devolve dados estruturados**: tipo do documento, valor, datas,
favorecido, documento (linha digitável/chave NF/número), conta de origem, projeto/categoria **mencionados no texto**, confiança. Ele não
conhece o banco e nunca escreve nele; nomes de projeto/categoria/favorecido são resolvidos pelo SenaHub contra os cadastros existentes
(nunca inventa categoria). Texto vindo do comprovante é dado, nunca instrução. Plano grátis do Gemini pode usar o conteúdo para treino.
**Decisão do dono (2026-10-26): no teste ele usará comprovantes reais e aceita esse risco.** O provedor é escolhido por configuração, e a
tela/log deixa claro qual está ativo; a troca para Haiku não exige mudança de código.

## 9. Relatórios

Job pg-boss semanal (segunda 07:30, fuso São Paulo) e mensal (1º dia útil após o fechamento do mês — `FechamentoMensal`). Números vêm dos
leitores do financeiro (determinísticos); o LLM, se usado, só redige a leitura em texto, e o relatório funciona sem ele.

- **Semanal**: saldo atual e projetado (mesma projeção da Visão geral); a pagar e a receber nos próximos 7 dias (com as maiores); pago e
  recebido na semana; extras (decisão do spec): contas vencidas, dia mais apertado do saldo projetado, pendências do assistente, 3 maiores
  despesas da semana.
- **Mensal**: DRE do mês × mês anterior; resultado por projeto; inadimplência; ponto de equilíbrio; itens sem categoria.
- **Entrega**: resumo curto no WhatsApp (template aprovado pela Meta, porque é mensagem iniciada pelo assistente fora da janela de
  24h) + link para a versão completa numa página do SenaHub. Registro em `RelatorioAssistente` (tipo, período, conteúdo, enviadoEm).

## 10. Dados

Novos modelos (nomes provisórios, a fechar no plano): `NumeroAssistente`, `MensagemWhatsapp` (wamid único, direção, tipo, texto, caminho
da mídia, hash, userId, conversaId), `ConversaAssistente` (estado + rascunho JSON validado), `PendenciaAssistente`, `RelatorioAssistente`.
`Lancamento` **não ganha coluna**: o lançamento criado ou baixado pelo assistente leva a tag `assistente-whatsapp` (`tags String[]`
já existe) e fica ligado à mensagem por `MensagemWhatsapp.lancamentoId`. O `AuditLog` da `defineAction` não cobre serviço chamado por
job: o assistente grava a auditoria explicitamente, com o usuário do número como autor. Migração aditiva: só as tabelas novas e uma
categoria de sistema (§16, item 3).

## 11. Configuração e custo

Variáveis novas (Meta: token, app secret, verify token, phone number id; provedor de LLM e chave). Chip dedicado no servidor, **não** o
número que o dono usa com clientes. Resposta dentro de 24h da mensagem do dono é gratuita; mensagem iniciada pelo bot (relatórios)
usa template, na ordem de centavos por mensagem. Preços e a eventual cobrança de mensagens de serviço (relatos de fornecedores indicam
mudança a partir de out/2026, não confirmada) devem ser conferidos na tabela oficial da Meta antes de ligar em produção.

## 12. Segurança

Assinatura HMAC do webhook verificada com comparação em tempo constante; whitelist de número; limite de taxa por número; tamanho/tipo
de mídia validados e gravados só por `resolverCaminho`; nenhum conteúdo de número não autorizado é persistido; segredos só no `.env`.
O limite de upload do Cloudflare Tunnel (100 MB) não é problema para comprovantes, mas a mídia é baixada pelo servidor (não passa pelo
túnel de entrada).

## 13. Testes e verificação

Puros e testados: `candidatosAbertos` (um/vários/nenhum, tolerância, direção), divisão principal/juros/multa, máquina de estados da
conversa, casamento de conta de origem, resolução de projeto por nome. Smoke `smoke:assistente-whatsapp`: mensagem repetida (wamid),
número não autorizado, confirmação antes de gravar, não duplicar conta aberta, baixa com juros, mês fechado, projeto pendente + resolver,
expiração. Interpretador com um dublê determinístico nos testes (nunca chama o LLM). Teste de ponta a ponta no WhatsApp real só após o
dono criar a conta Meta e entregar o chip.

## 14. Decisões do dono (registro)

- Número separado (chip do servidor) como bot. · Gemini grátis para testar, depois API Haiku. · Só despesas na V1.
- Verificar SEMPRE o a pagar aberto antes de criar; vale igual para entradas no futuro. · Diferença de valor → juros/multa.
- Conta de origem lida do comprovante, pergunta só se fugir do padrão. · Projeto: pergunta; "depois" = lançamento sem projeto + pendência.
- Só o dono agora; sócios e reembolso depois. · Semanal segunda cedo; mensal no fim do mês; conteúdo da §9.

## 16. Decisões do spec (minhas, não do dono — o dono confere)

1. **Linha digitável do boleto**: normalizada (só dígitos) e gravada em `Lancamento.numeroDocumento`; casamento por igualdade exata
   desse valor, sem índice novo (a busca já filtra por `previsto` em aberto, conjunto pequeno).
2. **Favorecido**: casa por nome normalizado com `Fornecedor` existente. Sem casamento, o assistente **não cria fornecedor**: deixa
   `fornecedorId` vazio e põe o nome na descrição; a ficha do fornecedor continua sendo cadastro humano.
3. **Categoria**: não resolvida pelo texto → pergunta com as 3 mais prováveis. "Depois" → usa a categoria de sistema "Despesas a
   classificar" (criada por migração, achada por `chave`) e abre pendência `categoria_faltando` (segundo tipo, ao lado de `projeto_faltando`).
4. **Alçada**: despesa de valor alto pode nascer `aguardando_aprovacao`; o assistente informa isso na resposta. Baixa de conta nesse
   estado é recusada pela máquina N1; a frase da recusa vai ao dono como está.
5. **Comprovante**: o assistente sempre tem o arquivo, então satisfaz `comprovanteObrigatorioNaBaixa`. O anexo (`LancamentoAnexo`) é
   criado por serviço, antes da baixa, na mesma operação; se a baixa falhar, o arquivo e a linha do anexo criados são removidos.
6. **Permissões**: o serviço do assistente carrega o usuário de `NumeroAssistente.userId` e chama `can()` com as MESMAS permissões das
   Server Actions equivalentes (criar lançamento, baixar), mais `exigirPeriodoAberto`; sem sessão sintética.
7. **Vários documentos de uma vez**: cada arquivo é um item próprio da fila; o assistente trata e pergunta **um item por vez**, na
   ordem de chegada. Legenda do arquivo vale para aquele arquivo. Texto solto responde ao item mais antigo que está aguardando. Um
   arquivo novo **nunca** é lido como resposta: sempre abre item novo na fila.
8. **Janela de 24h e lembretes**: o lembrete diário de pendências é notificação do SenaHub (sino); vai por WhatsApp só se a janela de
   24h estiver aberta. O resumo semanal (template) também lista as pendências abertas. Comando "pendentes" é resposta a mensagem do dono,
   portanto dentro da janela.
9. **Meta**: sem o chip e a conta Meta prontos, a construção usa um **simulador** do payload do webhook e do envio. O template do
   relatório (resumo curto + link) é submetido à Meta pelo dono, com texto fornecido no plano.
10. **Tolerância de 10%**: constante no código na V1, com ponto único para virar configuração depois.
11. **Relatório**: página do SenaHub com as mesmas permissões das telas de onde os números vêm (sócios futuros só veem se tiverem
    essas permissões). Mensal no primeiro dia útil do mês (`calendario-trabalho` com feriados); se o mês ainda não estiver fechado, sai
    marcado "mês ainda não fechado" em vez de ser pulado.

## 15. Deixado para o construtor

Nomes finais de modelos e rotas; layout da tela de pendências e da página do relatório (seguindo `CabecalhoPagina` e ADR-0002);
texto exato das mensagens; limiar de tolerância do §5 (partir de 10% e ajustar); como o template do relatório é submetido à Meta;
formato dos arquivos aceitos além de imagem/PDF.
