# Integrações e Fontes Oficiais — Radar Rio Pardo

O módulo de coleta (`src/lib/collectors/`) é independente dos demais módulos e opera por adaptadores isolados, com timeouts explícitos, trava contra execuções concorrentes e registro completo em `CollectionRun`.

---

## 1. Inventário de Fontes Cadastradas

| Chave do Adaptador | Fonte | URL | Método / Status |
| --- | --- | --- | --- |
| `imprensa-oficial-sjrp` | Diário Oficial Eletrônico de São José do Rio Pardo | `https://www.imprensaoficialmunicipal.com.br/sjriopardo` | Leitura das listas estruturadas oficiais de Leis, Decretos e Portarias em `/listaatos.php?c=São José do Rio Pardo&s=...`; valida município/edição/URL e extrai o texto via `/leituratexto` ou via segmentação limitada do PDF oficial (`pdf-parse`, máx. 2 PDFs distintos por execução + cache em memória por edição) quando há marcadores completos. Aplica mascaramento LGPD, sinaliza anexos/tabelas e cria edição/ato em `DRAFT_IMPORTED` para revisão humana obrigatória. Não cobre licitações ou PDFs sem marcadores. |
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
  com host permitido e extração verificada via `/leituratexto` ou segmento PDF (`extractOfficialPdfActForReview`).
- **Limites operacionais:** até 12 itens recentes por tipo de ato, 6 detalhes HTML por
  execução, até 2 PDFs de edições distintos por execução (com cache de páginas em
  memória na mesma execução para atos da mesma edição, até 12 MB, 30 páginas totais
  e 8 páginas escaneadas por PDF) e 40 segundos de processamento; execuções parciais são identificadas.
- **Listagens volumosas:** em vez de baixar o histórico inteiro, lê o HTML
  incrementalmente (até 1,5 MB de corpo decodificado) e cancela a transferência
  após identificar 12 registros válidos (ou 3 no diagnóstico). Caso chegue ao
  limite sem completar a amostra, identifica a execução como parcial. Não ignora
  erros HTTP nem tenta superar CAPTCHA.
- **Extração PDF integrada à fila editorial (`ImportedDocument` + `GazetteAct`):**
  - Quando não há texto HTML (`/leituratexto`) e o PDF oficial da edição possui camada
    textual, marcadores completos (`Página 1 de N` ... `Página N de N` em linhas separadas),
    cabeçalho compatível na primeira página e ausência de outro ato misturado (`OTHER_ACT_DETECTED`),
    o segmento limpo é sanitizado pela LGPD (`detectAndMaskPersonalData`) e salvo como candidato
    à revisão (`rawText` em `ImportedDocument` e `rawExcerpt` em `GazetteAct`), preservando
    `pageNumber`, `actNumber` e `actDate` confirmados no cabeçalho oficial.
  - O `extractionStatus` em `ImportedDocument` distingue claramente: `EXTRACTED_HTML_FOR_REVIEW`,
    `EXTRACTED_PDF_FOR_REVIEW`, `EXTRACTED_PDF_ANNEX_CHECK` (quando há menção a anexos ou
    indício de tabelas/valores financeiros no texto linear) e diagnósticos de falha/retenção
    (`METADATA_ONLY_NO_TEXT_LAYER`, `METADATA_ONLY_INCOMPLETE_MARKERS`, `METADATA_ONLY_MIXED_TEXT`,
    `METADATA_ONLY_PDF_TOO_LARGE`, `METADATA_ONLY_HTTP_ERROR`, `METADATA_ONLY_ACT_NOT_FOUND`,
    `METADATA_ONLY_PARSE_ERROR`, `METADATA_ONLY`).
  - **Atualização segura de rascunhos sem duplicação e preservação de trabalho humano:**
    rascunhos previamente gravados como `METADATA_ONLY*` que ainda estejam em `DRAFT_IMPORTED`
    e **sem edição humana** (`reviewedById === null && reviewedAt === null`) são atualizados em
    transação quando o texto verificado se torna disponível. Rascunhos em `DRAFT_IMPORTED` que
    já passaram por salvamento manual (`SAVE_DRAFT`) têm seus campos editoriais (`titleSimple`,
    `objectiveSummary`, `actNumber`, `actDate`, `pageNumber`, `agencyId`, `deadlinesText`)
    integralmente preservados; quando possível, a coleta enriquece apenas o texto de origem em
    `ImportedDocument` (`rawText`, `extractionStatus`), `rawExcerpt` (se ainda vazio) e o alerta LGPD.
    Atos que já avançaram para `IN_REVIEW`, `APPROVED` ou `PUBLISHED` nunca são sobrescritos.
  - **Controle de concorrência entre coleta, edição, revisão e publicação:** todas as escritas do
    coletor (`imprensa-oficial-collector.ts`) e dos fluxos editoriais (`/api/admin/gazette`:
    `REWRITE_IMPORTED_ACT`, `REVIEW_ACT` e `PUBLISH_ACT`) usam atualização condicional atômica
    dentro de `prisma.$transaction` verificando status, autoria de revisão e `updatedAt` (e
    `expectedUpdatedAt` enviado pelo painel quando aplicável). Conflitos editoriais devolvem HTTP
    `409` orientando recarregar a página sem gravar `EditorialRevision` órfã e sem permitir regressão
    de status (ex.: `PUBLISHED` → `IN_REVIEW`/`DRAFT_IMPORTED`); conflitos durante a coleta fazem
    rollback completo e registram no log da execução que a atualização concorrente foi ignorada.
- **Revisão no painel `/admin/diario-oficial`:** os metadados entram em `GazetteEdition` e
  `ImportedDocument`, e cada ato é criado em `GazetteAct` com status `DRAFT_IMPORTED` (nunca
  publicado automaticamente). O editor visualiza o texto extraído sanitizado em área própria,
  confere alertas de LGPD e anexos/tabelas, abre os links oficiais do ato e do PDF da edição,
  confirma número/data/página/órgão e redige o resumo cidadão (`SAVE_DRAFT` ou `SEND_TO_REVIEW`
  para `IN_REVIEW`, registrando `EditorialRevision` e `AuditLog`). O endpoint de publicação
  bloqueia diretamente `DRAFT_IMPORTED`. A IA não publica conteúdo.
- **Integridade de datas e órgãos:** a data da listagem é a **publicação** e
  não é automaticamente copiada para a data do ato; `GazetteAct.actDate`
  permanece vazia quando a data não é confirmada no cabeçalho do texto
  oficial. O coletor não atribui automaticamente os atos à Prefeitura,
  pois podem incluir atos do Legislativo. Número de ato é confrontado com
  o cabeçalho do texto antes de aceitar o trecho como verificado.
- **Inspeção e leitura conservadora do PDF oficial (bibliotecas internas do coletor):**
  - `probeOfficialEditionPdf` (`dioe-pdf-probe.ts`): confere município, número/data na URL,
    HTTPS, domínio, resposta HTTP e cabeçalho `%PDF-`, baixando apenas os primeiros bytes.
    **Isso não significa que o conteúdo do PDF foi extraído ou autenticado.**
  - `scanOfficialPdfForAct` (`dioe-pdf-text.ts`): utiliza `pdf-parse@2.4.5` apenas no Node.js,
    lê no máximo 12 MB do PDF, limita o documento a 30 páginas e examina até 8 páginas iniciais.
    Procura marcadores consecutivos (`Página 1 de N`, `Página 2 de N` etc. em linhas separadas),
    exige cabeçalho compatível do ato na primeira página e rejeita trechos que contenham outro
    ato misturado (`OTHER_ACT_DETECTED`). `SEGMENT_PREPARED_FOR_REVIEW` não é certificação de
    integridade jurídica ou editorial: serve apenas para apoiar a conferência humana na fila
    autenticada `/admin/diario-oficial`, inclusive de tabelas, anexos e rodapés. Esta etapa não
    cobre páginas mistas, PDFs escaneados sem camada textual (OCR) ou ordenação sem linhas separadas.
- **LGPD:** campos de título, resumo e trecho passam pelo sanitizador existente;
  a coleta não tenta copiar PDFs inteiros nem inventar valores e consequências.
- **Limite de cobertura:** não considera a extração dos PDFs integrais pronta.
  Licitações, contratos, concursos, demais seções e atos não indexados nessas
  três listas continuarão fora da coleta automática nesta etapa.
- **Acesso externo:** o teste somente leitura em GitHub Actions retornou HTTP 403
  no endpoint `/listaatos.php` em 14/11/2026. Não há tentativa de contornar
  restrições do fornecedor. A conectividade específica precisa ser verificada
  no ambiente da Hostinger antes de autorizar a operação contínua em produção.
- **Validação controlada sem endpoint público:** a rota temporária de diagnóstico
  `/api/diagnostics/diario-source` foi removida. Para conferir conectividade, cabeçalho HTML e
  sonda/segmentação de PDF diretamente no ambiente autorizado sem tocar no banco de dados e sem
  imprimir o texto integral, utilize o script CLI `npx tsx scripts/verify-dioe-live.ts` (ou
  `npx tsx scripts/verify-dioe-live.ts --pdf`) e confirme o resultado das execuções reais no
  painel autenticado `/admin/diario-oficial`.
- **Comprovação operacional:** os testes automatizados são baseados em fixtures;
  antes da integração em produção, conferir uma coleta real no ambiente da Hostinger e comparar
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
