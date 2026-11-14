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
- MySQL 8 / MariaDB (produção Hostinger, padrão de `prisma/schema.prisma` no GitHub) ou SQLite (alternável localmente via `npm run db:use-sqlite`)

---

## Instalação e Execução Local

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Copie o arquivo de variáveis de ambiente e preencha os segredos obrigatórios (`AUTH_SECRET`, `CRON_SECRET`, `DATABASE_URL` e `MUNICIPALITY_IBGE_CODE="3549706"`):
   ```bash
   cp .env.example .env
   ```
   *(No Windows PowerShell: `Copy-Item .env.example .env`)*

3. Caso utilize **SQLite local** (sem servidor MySQL instalado), ajuste `DATABASE_URL="file:./dev.db"` no `.env` e execute:
   ```bash
   npm run db:use-sqlite
   npx prisma generate
   npx prisma db push
   npm run db:seed
   ```
   > **Segurança de credenciais:** Não existem senhas padrão fixas no código. Defina `SEED_ADMIN_PASSWORD` com senha forte (mínimo 12 caracteres, maiúscula, minúscula, número e símbolo) antes de rodar o seed em produção. Em ambiente local de desenvolvimento (`NODE_ENV !== "production"`), se `SEED_ADMIN_PASSWORD` estiver vazio ao criar o primeiro administrador, `db:seed` gerará uma senha aleatória única exibida uma só vez no terminal. Para alterar ou recuperar senhas, use `/admin/conta`, `/admin/recuperar-senha` ou `npm run auth:reset-password -- --email=<email>`.

4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   Acesse o portal em [http://localhost:3000](http://localhost:3000) e o painel administrativo em [http://localhost:3000/admin](http://localhost:3000/admin).

   > **Importante antes de commits:** se alternou localmente para SQLite, execute `npm run db:use-mysql` para garantir que `prisma/schema.prisma` permaneça em MySQL no repositório.

---

## Scripts Disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor Next.js em modo desenvolvimento |
| `npm run build` | Gera o Prisma Client e executa o build de produção |
| `npm run start` | Inicia a aplicação compilada |
| `npm test` | Executa a suíte de testes automatizados (Vitest) |
| `npm run typecheck` | Valida a tipagem estrita TypeScript |
| `npm run db:seed` | Popula categorias, órgãos públicos de São José do Rio Pardo (IBGE `3549706`), fontes oficiais e usuário admin inicial |
| `npm run db:use-mysql` | Garante `prisma/schema.prisma` no provedor MySQL (Hostinger — padrão do Git) |
| `npm run db:use-sqlite` | Alterna `prisma/schema.prisma` para SQLite (apenas desenvolvimento local) |
| `npm run collect:cron` | Executa os adaptadores de coleta (ideal para Cron Jobs CLI) |
| `npm run auth:reset-password` | Emite token temporário ou redefine a senha de um usuário administrativo via CLI |

---

## Documentação Completa

- [Arquitetura do Sistema](docs/ARCHITECTURE.md)
- [Banco de Dados e Modelagem](docs/DATABASE.md)
- [Integrações e Coletores Oficiais](docs/INTEGRATIONS.md)
- [Guia de Implantação na Hostinger Cloud Startup](docs/DEPLOY_HOSTINGER.md)
- [Política Editorial e Proteção Jurídica](docs/EDITORIAL_POLICY.md)
- [Roadmap e Status das Fases](docs/ROADMAP.md)
- [Manual de Operações, Backups e Restauração](docs/OPERATIONS.md)
