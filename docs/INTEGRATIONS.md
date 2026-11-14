# Integrações e Fontes Oficiais — Radar Rio Pardo

O módulo de coleta (`src/lib/collectors/`) é independente dos demais módulos e opera por adaptadores isolados, com timeouts explícitos, trava contra execuções concorrentes e registro completo em `CollectionRun`.

---

## 1. Inventário de Fontes Cadastradas

| Chave do Adaptador | Fonte | URL | Método / Status |
| --- | --- | --- | --- |
| `imprensa-oficial-sjrp` | Diário Oficial Eletrônico de São José do Rio Pardo | `https://www.imprensaoficialmunicipal.com.br/sjriopardo` | Leitura das listas estruturadas oficiais de Leis, Decretos e Portarias em `/listaatos.php?c=São José do Rio Pardo&s=...`; valida município/edição/URL e, quando disponível, consulta `/leituratexto` para capturar a ementa. Cria edição e ato em `DRAFT_IMPORTED`, sem publicação automática. Não cobre integralmente os PDFs. |
| `pncp-api-sjrp` | Portal Nacional de Contratações Públicas (PNCP) | `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao` | **API REST pública oficial** filtrando pelo código IBGE `3549706` (São José do Rio Pardo) e parâmetro obrigatório `codigoModalidadeContratacao`, com paginação dinâmica completa, retries moderados (HTTP 429/5xx/timeout), checkpoint persistente, validação rigorosa de município/órgão via CNPJ e fila manual (`PENDING_CLASSIFICATION`) para órgãos não reconhecidos. |
| `camara-sjrp-check` | Portal da Câmara Municipal | `https://camarasjriopardo.sp.gov.br/` | Monitor de disponibilidade HTTP. Coleta detalhada pendente de validação estrutural de dados abertos; utilizar cadastro/importação assistida no `/admin/camara`. |
| `transparencia-prefeitura-check` | Portal da Transparência da Prefeitura | `https://saojosedoriopardo.sp.gov.br/portal-da-transparencia-home/` | Monitor de disponibilidade HTTP + importação assistida de planilhas/JSON oficiais. |
| `camara-atende-net-check` | Portal da Câmara / Atende.net | `https://camarasaojosedoriopardo.atende.net/` | Monitor de disponibilidade HTTP. Sem contorno a barreiras/autenticação. |

---

## 1.1 Regras de Paginação, Classificação e Status Real (PNCP)

- **Paginação dinâmica com checkpoint:** o coletor `pncp-api-sjrp` percorre todas as páginas usando `totalPaginas` e `paginasRestantes` retornados pela API oficial (com proteção contra páginas repetidas e limite configurável por execução `maxRequestsPerRun` / `maxDurationMs`). Caso seja interrompido por limite operacional ou erro transitório (HTTP 429/5xx/timeout com retries e backoff), grava `checkpointJson` (`incomplete: true`, `pendingModalities`, `nextPageByModality`) e retoma exatamente da página pendente na próxima execução.
- **Classificação estrita de órgãos:** prioriza o CNPJ oficial do órgão (com validação matemática de dígitos verificadores) e correspondência inequívoca por razão social normalizada. Órgãos não reconhecidos **jamais** são atribuídos por suposição à Prefeitura: ficam salvos em `ImportedDocument` com `extractionStatus = "PENDING_CLASSIFICATION"` para confirmação manual em `/admin/contas-publicas`, preservando o link original do PNCP e o motivo da retenção.
- **Status real de execução:** diferencia `NO_RECORDS` (HTTP 204 / zero itens), `IMPORTED`, `DUPLICATES_ONLY`, `PENDING_CLASSIFICATION`, `ALL_REJECTED` (registrado como `PARTIAL`, nunca `SUCCESS`), `PARTIAL_COMPLETION` e `FAILED`.

---

## 1.2 Diário Oficial — Coleta estruturada e limites editoriais

A página principal de edições é parcialmente dinâmica, mas o sistema oficial mantém as
listas públicas de Leis, Decretos e Portarias. O coletor usa essas listas, não um regex
genérico que aceite qualquer link da página inicial.

- **Validação:** título, data (DD/MM/AAAA), número da edição, município, link oficial
  com host permitido e, quando possível, ementa obtida na página pública de leitura.
- **Limites operacionais:** até 12 itens recentes por tipo de ato, 6 detalhes por
  execução e 40 segundos de processamento; execuções parciais são identificadas.
- **Listagens volumosas:** em vez de baixar o histórico inteiro, lê o HTML
  incrementalmente (até 1,5 MB de corpo decodificado) e cancela a transferência
  após identificar 12 registros válidos (ou 3 no diagnóstico). Caso chegue ao
  limite sem completar a amostra, identifica a execução como parcial. Não ignora
  erros HTTP nem tenta superar CAPTCHA.
- **Persistência:** os metadados entram em GazetteEdition e ImportedDocument;
  cada ato é criado em GazetteAct com status `DRAFT_IMPORTED`.
- **Revisão:** o editor confere o texto original, reescreve o resumo no painel e
  salva como `IN_REVIEW`; o endpoint de publicação bloqueia diretamente
  `DRAFT_IMPORTED`. A IA não publica conteúdo.
- **Integridade de datas e órgãos:** a data da listagem é a **publicação** e
  não é automaticamente copiada para a data do ato; `GazetteAct.actDate`
  permanece vazia quando a data não é confirmada no cabeçalho do texto
  oficial. O coletor não atribui automaticamente os atos à Prefeitura,
  pois podem incluir atos do Legislativo. Número de ato é confrontado com
  o cabeçalho do texto antes de aceitar o trecho como verificado.
- **Inspeção sem gravação:** o endpoint temporário do preview
  `/api/diagnostics/diario-source?kind=Decretos&inspect=1`
  mostra até 3 atos com título sanitizado, edição, data de publicação e
  links oficiais; confere o cabeçalho de **um único texto** disponível,
  sem conexão com o banco. Excluir esta rota antes de integrar à `main`.
- **Prova de acesso ao PDF (somente leitura):** a prévia aceita
  `/api/diagnostics/diario-source?kind=Decretos&inspect=1&pdf=1`.
  O diagnóstico verifica **um** PDF de edição, dando prioridade ao ato que
  não possui link HTML individual. Confere município, número/data na URL,
  HTTPS, domínio, resposta HTTP e cabeçalho `%PDF-`; baixa só os
  primeiros bytes e cancela a transferência. A resposta inclui
  `pdfCheck.status=PDF_HEADER_VERIFIED` quando a assinatura é encontrada.
  **Isso não significa que o conteúdo do PDF foi extraído ou autenticado.**
  Sem dependência dedicada para texto PDF, a análise de páginas, OCR,
  valores, atos múltiplos e resumos do arquivo segue pendente. Não publicar
  notícia a partir de uma verificação somente de cabeçalho.
- **LGPD:** campos de título, resumo e trecho passam pelo sanitizador existente;
  a coleta não tenta copiar PDFs inteiros nem inventar valores e consequências.
- **Limite de cobertura:** não considera a extração dos PDFs integrais pronta.
  Licitações, contratos, concursos, demais seções e atos não indexados nessas
  três listas continuarão fora da coleta automática nesta etapa.
- **Acesso externo:** o teste somente leitura em GitHub Actions retornou HTTP 403
  no endpoint `/listaatos.php` em 14/11/2026. Não há tentativa de contornar
  restrições do fornecedor. A conectividade específica precisa ser verificada
  na Hostinger antes de autorizar o deploy/uso deste coletor.
- **Teste diagnóstico opcional:** `npx tsx scripts/verify-dioe-live.ts` executa
  uma única consulta GET sem usar banco de dados. Falha explicitamente se
  a fonte bloquear a requisição.
- **Comprovação operacional:** os testes automatizados são baseados em fixtures;
  antes da integração em produção, conferir uma coleta real na Hostinger e comparar
  alguns documentos com os registros oficiais.

Referência de consulta estruturada:
https://www.imprensaoficialmunicipal.com.br/listaatos.php?c=São+José+do+Rio+Pardo&s=Decretos

## 2. Importação Manual Assistida

Enquanto determinados portais municipais não ofertarem APIs públicas estáveis, o painel `/admin/diario-oficial` conta com importador em lote JSON com:
- Validação rigorosa de schema (`Zod`).
- Deduplicação automática via SHA-256.
- Varredura automática de CPF, RG, telefones particulares e dados bancários (LGPD).
- Encaminhamento obrigatório para fila de revisão humana (`IN_REVIEW`).

---

## 3. Integração com NotebookLM e Facebook

- **NotebookLM:** Sem API pública gratuita documentada. O painel `/admin/podcasts` gera um arquivo `.md` estruturado apenas com notícias e atos publicados, contendo prompt seguro para geração do áudio manualmente no NotebookLM.
- **Facebook:** Na Fase 1/2, o painel `/admin/redes-sociais` prepara legenda, card e URL para publicação manual. Automação futura via Graph API oficial dependerá de revisão e aprovação do aplicativo pela Meta.
