# RADAR RIO PARDO

> **"Informação pública sem complicação."**

Portal independente de informação pública, transparência municipal, jornalismo de dados e acompanhamento da administração pública de **São José do Rio Pardo — SP**.

Desenvolvido tecnicamente pela **Roque Consultoria Digital**, com identidade editorial própria, independente e sem vínculo institucional com a Prefeitura ou Câmara Municipal.

---

## Principais Funcionalidades (Fase 1 e Base Modular Fases 2–5)

- **Portal Público Responsivo (Claro/Escuro, WCAG 2.2 AA):**
  - Homepage com Destaque Principal, Aconteceu em Rio Pardo, Diário Oficial, Câmara em Números, Transparência e Gastos, Podcasts e Avisos de Utilidade Pública.
  - Páginas dedicadas: `/noticias`, `/diario-oficial`, `/camara`, `/contas-publicas`, `/podcasts`, `/busca`.
  - Páginas institucionais e de conformidade: `/sobre`, `/politica-editorial`, `/metodologia`, `/correcao`, `/privacidade`, `/termos`, `/contato`.
- **Painel Administrativo e Editorial (`/admin`):**
  - Autenticação segura com hash `bcryptjs`, sessão assinada `JWT` em cookie HTTP-only, proteção contra força bruta e logs de auditoria.
  - Controle de perfis (`ADMIN`, `EDITOR`, `COLLABORATOR`).
  - CRUD completo de notícias com vínculo obrigatório a fontes documentais e fluxo `DRAFT → IN_REVIEW → APPROVED → PUBLISHED`.
  - Módulo do Diário Oficial com cadastro, importação assistida em lote JSON, detecção/ocultação automática LGPD e fila de revisão humana.
  - Painel de Integrações e Coletores compatível com Cron Jobs da Hostinger (`imprensa-oficial-sjrp`, `pncp-api-sjrp` e monitores de disponibilidade).
  - Gerador de dossiê e prompt estruturado para produção semanal de podcasts no **NotebookLM** (*Radar da Semana* e *Radar em Debate*).
  - Preparação de postagens e prévia visual para divulgação no **Facebook**.
  - Fluxo completo de **Solicitação de Correção, Direito de Resposta e LGPD**.
  - Estrutura pronta para publicidade local identificada e transparência de patrocinadores.

---

## Requisitos Locais

- Node.js 20 LTS ou superior (testado em Node v24.13.0)
- npm 10+
- Banco local SQLite (configurado por padrão para início rápido) ou MySQL 8 / MariaDB (produção Hostinger)

---

## Instalação e Execução Local

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Copie o arquivo de variáveis de ambiente:
   ```bash
   cp .env.example .env
   ```
   *(No Windows PowerShell: `Copy-Item .env.example .env`)*

3. Gere o Prisma Client, aplique o schema no banco local e execute o seed institucional:
   ```bash
   npx prisma generate
   npx prisma db push
   npm run db:seed
   ```

4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   Acesse o portal em [http://localhost:3000](http://localhost:3000) e o painel administrativo em [http://localhost:3000/admin](http://localhost:3000/admin).

   > **Credenciais iniciais de desenvolvimento:** definidas em `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` no `.env.example` (altere imediatamente antes de publicar em produção).

---

## Scripts Disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor Next.js em modo desenvolvimento |
| `npm run build` | Gera o Prisma Client e executa o build de produção |
| `npm run start` | Inicia a aplicação compilada |
| `npm test` | Executa a suíte de testes automatizados (Vitest) |
| `npm run typecheck` | Valida a tipagem estrita TypeScript |
| `npm run db:seed` | Popula categorias, órgãos públicos, fontes oficiais e usuários iniciais |
| `npm run db:use-mysql` | Alterna `prisma/schema.prisma` para o provedor MySQL (Hostinger) |
| `npm run db:use-sqlite` | Alterna `prisma/schema.prisma` para o provedor SQLite (local) |
| `npm run collect:cron` | Executa os adaptadores de coleta (ideal para Cron Jobs CLI) |

---

## Documentação Completa

- [Arquitetura do Sistema](docs/ARCHITECTURE.md)
- [Banco de Dados e Modelagem](docs/DATABASE.md)
- [Integrações e Coletores Oficiais](docs/INTEGRATIONS.md)
- [Guia de Implantação na Hostinger Cloud Startup](docs/DEPLOY_HOSTINGER.md)
- [Política Editorial e Proteção Jurídica](docs/EDITORIAL_POLICY.md)
- [Roadmap e Status das Fases](docs/ROADMAP.md)
- [Manual de Operações, Backups e Restauração](docs/OPERATIONS.md)
