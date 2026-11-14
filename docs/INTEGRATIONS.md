# Integrações e Fontes Oficiais — Radar Rio Pardo

O módulo de coleta (`src/lib/collectors/`) é independente dos demais módulos e opera por adaptadores isolados, com timeouts explícitos, trava contra execuções concorrentes e registro completo em `CollectionRun`.

---

## 1. Inventário de Fontes Cadastradas

| Chave do Adaptador | Fonte | URL | Método / Status |
| --- | --- | --- | --- |
| `imprensa-oficial-sjrp` | Diário Oficial Eletrônico de São José do Rio Pardo | `https://www.imprensaoficialmunicipal.com.br/sjriopardo` | Requisição HTTP GET ética com detecção de CAPTCHA e indexação de links públicos para revisão humana. Não há API JSON oficial documentada conhecida até o momento. |
| `pncp-api-sjrp` | Portal Nacional de Contratações Públicas (PNCP) | `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao` | **API REST pública oficial** filtrando pelo código IBGE `3549706` (São José do Rio Pardo) e parâmetro obrigatório `codigoModalidadeContratacao`, com paginação e validação rigorosa de município/órgão via Zod. |
| `camara-sjrp-check` | Portal da Câmara Municipal | `https://camarasjriopardo.sp.gov.br/` | Monitor de disponibilidade HTTP. Coleta detalhada pendente de validação estrutural de dados abertos; utilizar cadastro/importação assistida no `/admin/camara`. |
| `transparencia-prefeitura-check` | Portal da Transparência da Prefeitura | `https://saojosedoriopardo.sp.gov.br/portal-da-transparencia-home/` | Monitor de disponibilidade HTTP + importação assistida de planilhas/JSON oficiais. |
| `camara-atende-net-check` | Portal da Câmara / Atende.net | `https://camarasaojosedoriopardo.atende.net/` | Monitor de disponibilidade HTTP. Sem contorno a barreiras/autenticação. |

---

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
