# Correção dos apontamentos visuais — documentos e pranchas

**Estado:** implementado no código — validação visual/manual pendente
**Data:** 2026-08-26
**Origem:** D:\DOWNLOADS\erros.pdf (três páginas, lido nesta data)

## Execução

- D1 aplicada: o nome técnico só é composto após confirmação humana de fase, tipo, numeração e revisão; o sistema não inventa valores.
- D2 aplicada: o visualizador oferece anterior/próxima entre PDFs vigentes da mesma disciplina.
- P4: worker sincronizado no commit c42c93f.
- P3 e P7: tratamento de falha de listas e contraste no commit 337d8fe.
- P2: limite de lote e reenvio no commit 4f595f8.
- P1, P5 e P6: correção assistida, navegação e origem da configuração no commit b35fea2.
- Validação automática final: npm run lint e npm test passaram em 2026-08-26, com 241 arquivos e 2.507 testes.

## Contexto

A tela V2 reutiliza o uploader multipart. O envio é arquivo a arquivo em src/components/projetos/arquivos/enviar-documentos-dialog.tsx e cada finalização passa pelo limite de 30 requisições por usuário/IP em dez minutos, definido em src/app/api/uploads/route.ts.

O visualizador carrega pdfjs-dist 6.2.108, mas declara o worker estático /pdf.worker.min.mjs. O arquivo público ainda contém a versão 6.1.200. A atualização de dependências b8215b3 alterou a biblioteca sem sincronizar o worker.

O requisito de fase já é resolvido e validado no servidor em resolverNomenclatura() e na rota multipart. A configuração específica de projeto, quando existe, sobrepõe a global.

## Problemas e correções

### P1 — correção assistida de nomenclatura no upload

**Relato:** arquivos fora do padrão devem poder ser corrigidos sem digitar o nome inteiro; o padrão deve estar visível no envio.

**Hipótese principal:** o diálogo apenas detecta nome fora do padrão e libera edição livre. Ele não recebe código do projeto, sigla da disciplina nem catálogos de tipo para compor um nome válido.

**Correção:**

1. Criar helper puro para compor o nome e preservar a extensão.
2. Entregar ao uploader código do projeto, sigla da disciplina e catálogos necessários.
3. Exibir o formato efetivo no diálogo e oferecer “Corrigir pelo padrão”.
4. Pré-preencher somente projeto, disciplina e fase reconhecida; manter edição livre e “enviar assim”.

**D1 — decisão necessária:** tipo, número e revisão não são dedutíveis com segurança de nome inválido.

- Opção A (recomendada): o botão gera o nome somente após confirmação de tipo, número e revisão; pode sugerir, mas não inventa valores.
- Opção B: preenche automaticamente número sequencial, tipo padrão e R00.

A opção B é descartada porque pode classificar prancha errada ou criar revisão indevida.

### P2 — limite de requisições e reenvio de falhas

**Relato:** após muitos arquivos aparece “Muitas solicitações”; precisa reenviar somente os que falharam, um ou todos.

**Causa confirmada:** os dois uploaders fazem uma finalização HTTP por arquivo. A rota limita 30 finalizações por janela de dez minutos; o 31º arquivo recebe HTTP 429 mesmo sem paralelismo abusivo.

**Correção:**

1. Extrair estado e execução de linha de upload para helper compartilhado.
2. Interpretar HTTP 429 e Retry-After, preservando o objeto File em memória.
3. Acrescentar “Reenviar erro” por linha e “Reenviar todos os erros”; respeitar a espera indicada pelo servidor e a revisão agrupada.
4. Ajustar o limite para suportar lote normal sem remover auditoria, chave por usuário/IP nem limites de tamanho.

**Decisão técnica recomendada:** 120 finalizações por 10 minutos por usuário/IP, com reenvio guiado pelo servidor. Remover o limitador foi descartado por risco de abuso e carga de disco.

### P3 — criação de lista fica em “Salvando”

**Relato:** o modal de criar lista não conclui.

**Hipótese principal:** PainelListas.salvar() não trata rejeições da Server Action. Quando não retorna objeto esperado, o diálogo não informa erro recuperável nem restaura claramente a interação.

**Correção:** tratar criar, renomear e excluir com try/catch/finally; fechar somente após sucesso; preservar nome e exibir erro seguro em caso de falha.

### P4 — visualizador de PDF não carrega

**Relato:** visualizador não abre PDF.

**Causa confirmada:** incompatibilidade de versões: biblioteca 6.2.108 e worker público 6.1.200.

**Correção:** sincronizar o worker com a dependência instalada e adicionar script de sincronização/verificação ao fluxo de instalação, mantendo o carregamento dinâmico.

### P5 — navegar entre pranchas dentro do visualizador

**Relato:** pessoa não deve retornar à lista do projeto para abrir próxima prancha.

**D2 — decisão necessária:** “próxima prancha” pode ser página do PDF atual ou próximo arquivo PDF da disciplina.

- Opção A (recomendada): lista compacta de arquivos PDF vigentes da mesma disciplina, com anterior/próximo, nome e revisão; páginas do PDF atual continuam por rolagem.
- Opção B: somente controles de página do PDF atual.

A opção A atende o relato de não voltar à lista de arquivos. A query aplicará a mesma muralha de acesso da rota atual.

### P6 — “Exige fases” aparentemente não exige

**Relato:** herança, sugestão, bloqueio e persistência não foram observados.

**Hipótese principal:** existe configuração específica do projeto com exigirFase=false, que prevalece sobre a global; ou o teste não confirmou o diálogo de revisão. A validação de servidor já existe, portanto inspeção não encerra o caso.

**Correção:**

1. Exibir origem do valor efetivo: global ou override do projeto.
2. Mostrar no uploader que fase é obrigatória e quantos arquivos ainda não a têm.
3. Conferir pacote e pasta, nos uploaders V2 e legado.
4. Preservar a validação de rota antes de escrita física.

### P7 — contraste da barra de seleção no tema claro

**Relato:** texto branco em botão claro é ilegível.

**Hipótese principal:** BarraSelecaoDocumentos mistura fundo primário e botões outline sem cor explícita em todos os temas.

**Correção:** aplicar tokens explícitos de superfície/foreground para botão, hover, foco e desabilitado, sem cores hexadecimais.

## Modelo de dados

Não há migration nem seed. Nomenclatura usa dados existentes; navegação consulta uploads autorizados.

## Fases

| Fase | Entrega verificável |
| --- | --- |
| F0 | Concluída: D1/D2 confirmadas; teste puro do composer criado. |
| F1 | Concluída: worker PDF e guarda de sincronização. |
| F2 | Concluída: limite, reenvio e modal de lista resiliente. |
| F3 | Concluída: nomenclatura assistida e origem do requisito de fase. |
| F4 | Concluída: navegação entre arquivos e contraste da barra. |
| F5 | Automação concluída; validação manual pendente. |

Não é necessária troca de modelo: o trabalho é local, delimitado e testável.

## Permissões

Não haverá nova permissão ou alteração de nav-config.ts. Reenvio reutiliza autorização atual de upload; correção ocorre antes do upload; navegação reaplica a muralha atual de visualização.

## Testes

| Item | Automatizado | Manual em desenvolvimento |
| --- | --- | --- |
| P1 | Composer: extensão, campos obrigatórios e sugestões. | V2/legado: corrigir, editar livremente e enviar fora do padrão. |
| P2 | Limitador e Retry-After; helper preserva só erros. | Lote acima de 30, reenvio um/todos e PDF+DWG agrupados. |
| P3 | Tratamento de rejeição, se isolável sem DOM. | Criar, renomear e falhar lista sem travar nem duplicar. |
| P4 | Worker público igual ao worker instalado. | Abrir visualizador, leitor simples e comparador. |
| P5 | Query de adjacência escopada e ordenada. | Anterior/próximo sem expor arquivo sem acesso. |
| P6 | Herança e guard da rota. | Global, override, pacote/pasta, V2/legado, bloqueio e persistência. |
| P7 | — | Claro/escuro, hover, foco e desabilitado. |

## Fora de escopo

- Renomear arquivos já gravados em massa.
- Inferir número, tipo ou revisão sem confirmação humana.
- Remover rate limit.
- Navegar para outra disciplina/projeto.
- Ativar NEXT_PUBLIC_DOCUMENTOS_V2 globalmente.
