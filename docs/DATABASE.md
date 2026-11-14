# Banco de Dados e Modelagem — Radar Rio Pardo

## 1. Estratégia de Compatibilidade (MySQL Hostinger + Desenvolvimento Local)

Para garantir execução imediata em desenvolvimento local mesmo quando não há um servidor MySQL local instalado na estação de trabalho, o projeto mantém:

- `prisma/schema.mysql.prisma`: schema completo otimizado para **MySQL 8 / MariaDB da Hostinger**, utilizando tipos exatos `@db.Decimal(15, 2)` para todos os valores financeiros, `@db.Text` e `@db.LongText` para textos extensos e `VARCHAR` indexados.
- `prisma/migrations/0001_initial_mysql/migration.sql`: script DDL SQL completo com `utf8mb4_unicode_ci`, chaves estrangeiras e índices pronto para importação direta no phpMyAdmin ou CLI MySQL da Hostinger.
- Scripts de alternância automática:
  - Antes de implantar na Hostinger: `npm run db:use-mysql`
  - Para desenvolver localmente com SQLite: `npm run db:use-sqlite`

---

## 2. Grupos de Entidades

1. **Sistema e Segurança:** `User`, `Session`, `AuditLog`, `SystemSetting`.
2. **Fontes e Automações:** `PublicAgency`, `OfficialSource`, `IntegrationAdapter`, `CollectionRun`, `ImportedDocument`.
3. **Diário Oficial:** `GazetteEdition`, `GazetteActCategory`, `GazetteAct`.
4. **Notícias e Correções:** `NewsCategory`, `NewsArticle`, `DocumentReference`, `EditorialRevision`, `CorrectionRequest`.
5. **Câmara Municipal:** `Legislature`, `Councilor`, `LegislativeProposition`, `ChamberSession`, `SessionAttendance`, `LegislativeVote`, `CouncilorVote`.
6. **Contas Públicas:** `Supplier`, `BiddingProcess`, `PublicContract`.
7. **Podcasts e Divulgação:** `PodcastProgram`, `PodcastEpisode`, `SocialPostDraft`.
8. **Monetização Futura:** `SponsorAdvertiser`.

---

## 3. Regras de Integridade de Dados

- **Valores monetários:** Nunca utilizam `Float` / `Double`. Sempre são armazenados em `DECIMAL(15,2)`.
- **Fuso horário:** Timestamps armazenados tecnicamente em UTC e formatados na camada de apresentação para `America/Sao_Paulo`.
- **Soft Delete:** Matérias editoriais utilizam `deletedAt` para preservar histórico e auditoria.
- **Deduplicação:** Uso de `contentHash` (SHA-256) e chaves únicas compostas (`[editionNumber, year]`, `[type, number, year]`, `[agencyId, processNumber]`, `[agencyId, contractNumber]`).
