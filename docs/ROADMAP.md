# Roadmap de Desenvolvimento — Radar Rio Pardo

## FASE 1 — Fundação e MVP (CONCLUÍDA)

- [x] Estrutura Next.js (App Router), TypeScript e Tailwind CSS com paleta oficial e modo claro/escuro.
- [x] Modelagem normalizada Prisma compatível com SQLite local e MySQL Hostinger (`schema.mysql.prisma` + SQL DDL).
- [x] Sistema de autenticação segura (`bcryptjs` + JWT HTTP-only), bloqueio anti-força bruta, RBAC (`ADMIN`, `EDITOR`, `COLLABORATOR`) e `AuditLog`.
- [x] Portal público completo: Homepage, Notícias, Diário Oficial, Câmara Municipal, Contas Públicas, Podcasts, Busca Global e páginas institucionais/LGPD.
- [x] Painel administrativo `/admin` funcional com CRUD de notícias, vínculo obrigatório de fontes documentais, revisão editorial e histórico de versões.
- [x] Cadastro de fontes oficiais, camada de coletores (`imprensa-oficial-sjrp`, `pncp-api-sjrp`, monitores) e importação assistida em lote JSON.
- [x] Health check (`/api/health`), `robots.ts`, `sitemap.ts`, `.env.example`, testes automatizados e documentação completa.

---

## FASE 2 — Automação e Conteúdo (BASE IMPLEMENTADA / EXPANSÃO CONTÍNUA)

- [x] Coletor ético inicial da Imprensa Oficial Municipal e coletor real da API do PNCP (IBGE 3550803).
- [x] Fluxo público e administrativo de solicitações de correção e LGPD (`/correcao` e `/admin/correcoes`).
- [x] Preparação de postagens e prévia visual para Facebook (`/admin/redes-sociais`).
- [x] Exportador de dossiê Markdown e prompt seguro para NotebookLM (`/admin/podcasts`).
- [ ] **Pendência externa:** Integrar extração automatizada de PDF (ex.: `pdf-parse`) após confirmar a estrutura exata dos PDFs publicados pela Imprensa Oficial de SJRP em produção.
- [ ] **Pendência externa:** Configurar chave opcional de provedor de IA caso a redação deseje rascunhos automatizados dentro do teto mensal.
- [ ] **Pendência externa:** Submeter aplicativo na Meta Graph API caso deseje publicação automatizada no Facebook no futuro.

---

## FASE 3 — Câmara Municipal (ESTRUTURA PRONTA / CARGA PROGRESSIVA)

- [x] Modelos de Legislaturas, Vereadores, Proposições, Sessões, Presenças e Votações Individuais com diferenciação regimental.
- [x] Interface pública `/camara` e administrativa `/admin/camara` com gráfico acessível e metodologia explícita.
- [ ] **Pendência externa:** Mapear e validar eventuais exportações CSV/XML/API do portal `camarasjriopardo.sp.gov.br` para automatizar a sincronização periódica.

---

## FASE 4 — Transparência Financeira (ESTRUTURA PRONTA / CARGA PROGRESSIVA)

- [x] Modelos para Órgãos, Fornecedores, Licitações e Contratos diferenciando valor estimado, contratado, empenhado, liquidado e pago.
- [x] Coletor real conectado à API de consulta do PNCP.
- [ ] **Pendência externa:** Validar exportações periódicas do Portal da Transparência da Prefeitura e do Atende.net da Câmara para ampliar o histórico de empenhos e pagamentos.

---

## FASE 5 — Monetização e Expansão (BASE PREPARADA)

- [x] Cadastro administrativo de anunciantes e espaços identificados (`/admin/publicidade`) e transparência pública em `/sobre`.
- [ ] **Pendência jurídica/comercial:** Revisão das minutas de Privacidade, Termos de Uso e Política de Conflito de Interesses por profissional jurídico antes da comercialização.
