# Arquitetura do Sistema — Radar Rio Pardo

## 1. Visão Geral

O **Radar Rio Pardo** foi projetado como uma **aplicação Next.js monolítica modular (App Router)** em TypeScript, servindo em um único processo Node.js:
- O **Portal Público** (`src/app/(public)/*`) renderizado no servidor (SSR dinâmico com consultas diretas ao banco via Prisma).
- O **Painel Administrativo** (`src/app/admin/*`) protegido por sessão HTTP-only JWT e RBAC.
- As **APIs Server-Side e Cron Endpoints** (`src/app/api/*`) validadas com Zod.

Esta arquitetura elimina a necessidade de Docker, Redis obrigatório, WebSockets ou processos permanentes em segundo plano, tornando o sistema 100% compatível com a hospedagem **Hostinger Cloud Startup**.

---

## 2. Estrutura de Pastas

```text
├── docs/                       # Documentação técnica, editorial e deploy Hostinger
├── prisma/
│   ├── schema.prisma           # Schema ativo (SQLite local ou MySQL em produção)
│   ├── schema.mysql.prisma     # Referência com tipos nativos MySQL (@db.Decimal, @db.LongText)
│   ├── migrations/
│   │   └── 0001_initial_mysql/ # DDL SQL pronta para MySQL da Hostinger
│   └── seed.ts                 # Carga institucional (categorias, órgãos, fontes, programas)
├── scripts/
│   ├── switch-db-provider.mjs  # Alterna provider entre sqlite e mysql
│   └── run-collectors.ts       # Executor CLI para Cron Jobs
├── src/
│   ├── app/
│   │   ├── (public)/           # Portal público (Home, Notícias, Diário, Câmara, Contas, Podcasts, Sobre)
│   │   ├── admin/              # Painel administrativo e editorial
│   │   ├── api/                # APIs públicas, autenticação, admin e cron
│   │   ├── robots.ts           # Bloqueia indexação de /admin e /api/admin
│   │   └── sitemap.ts          # Sitemap dinâmico XML
│   ├── components/             # Componentes reutilizáveis acessíveis (Cabeçalho, Rodapé, Gráficos, Formulários)
│   └── lib/
│       ├── ai/                 # Serviço opcional de IA e exportação estruturada NotebookLM
│       ├── auth/               # Hash bcrypt, JWT HTTP-only, RBAC e AuditLog
│       ├── collectors/         # Camada desacoplada de coleta e importação assistida
│       ├── privacy/            # Sanitizador e detector LGPD (CPF, RG, telefone, dados bancários)
│       ├── formatters.ts       # Moeda BRL exata, fuso America/Sao_Paulo e slugs
│       ├── prisma.ts           # Singleton do Prisma Client
│       └── validators.ts       # Schemas Zod centralizados
└── tests/                      # Testes unitários e de integração (Vitest)
```

---

## 3. Fluxo Editorial e Segurança

1. **Coleta / Importação** → Dados externos são gravados com hash SHA-256 anti-duplicação e passam pelo detector LGPD (`src/lib/privacy/lgpd-sanitizer.ts`).
2. **Revisão Humana Obrigatória** → Nenhum coletor ou serviço de IA publica conteúdo diretamente (`status` inicia em `DRAFT`, `PENDING_REVIEW` ou `IN_REVIEW`).
3. **Aprovação RBAC** → Apenas usuários com perfil `EDITOR` ou `ADMIN` podem alterar status para `APPROVED` ou `PUBLISHED`. Usuários `COLLABORATOR` recebem `403 Forbidden` ao tentar publicar diretamente.
4. **Auditoria** → Todas as ações críticas geram registro na tabela `AuditLog` e snapshots de versão em `EditorialRevision`.
