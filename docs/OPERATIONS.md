# Manual de Operações, Backups e Contingência — Radar Rio Pardo

## 1. Backups do Banco de Dados

### Produção (MySQL na Hostinger)
Recomenda-se manter backup diário automático ativado no hPanel da Hostinger e exportar cópia semanal antes de atualizações estruturais:

```bash
mysqldump -u USUARIO_MYSQL -p NOME_DO_BANCO > backup_radar_riopardo_$(date +%Y%m%d).sql
```

### Restauração (MySQL)
```bash
mysql -u USUARIO_MYSQL -p NOME_DO_BANCO < backup_radar_riopardo_YYYYMMDD.sql
```

### Desenvolvimento Local (SQLite)
Basta copiar o arquivo `prisma/dev.db` para local seguro antes de alterações de schema.

---

## 2. Monitoramento e Logs

- **Saúde da aplicação:** `GET /api/health` verifica conectividade com o banco sem expor credenciais.
- **Auditoria administrativa:** Os últimos eventos de login, criação, edição, aprovação, publicação e execução de coletores ficam visíveis no Dashboard (`/admin`) e na tabela `AuditLog`.
- **Logs de coleta:** Cada execução dos adaptadores grava um registro em `CollectionRun` acessível em `/admin/integracoes`.

---

## 3. Procedimentos em Caso de Falha de Coleta

1. Acesse `/admin/integracoes` e expanda o log técnico da execução com erro (`CollectionRun.logText`).
2. Se o portal oficial estiver temporariamente fora do ar ou tiver ativado CAPTCHA/bloqueio, **não tente contornar a proteção**. Utilize o formulário de importação assistida em `/admin/diario-oficial` ou `/admin/contas-publicas` com os arquivos oficiais baixados manualmente.
3. Caso o status de um adaptador permaneça travado em `RUNNING` após queda abrupta de processo, reinicie o serviço Node.js no hPanel e atualize o status do adaptador para `IDLE` no banco antes da próxima tentativa.

---

## 4. Atualização Segura em Produção

```bash
git pull origin main
npm ci
npm run db:use-mysql
npx prisma generate
npm run build
# Reinicie a aplicação Node.js pelo hPanel da Hostinger
```

---

## 5. Gestão, Troca e Recuperação de Senhas

- **Alteração autenticada:** qualquer usuário autenticado pode alterar sua própria senha em `/admin/conta` (revoga automaticamente demais sessões abertas).
- **Recuperação via token temporário:** em `/admin/recuperar-senha`, é possível solicitar e consumir um token válido por 30 minutos (armazenado como hash SHA-256 em `PasswordResetToken`).
- **Contingência administrativa via SSH/CLI:** caso o servidor não possua envio transacional de e-mail ou haja bloqueio de conta após tentativas inválidas, execute na pasta da aplicação:

```bash
# Emitir token de 30 minutos para uso em /admin/recuperar-senha:
npm run auth:reset-password -- --email=admin@radarriopardo.com.br --generate-token

# Ou gerar nova senha aleatória forte diretamente (revoga sessões e desbloqueia conta):
npm run auth:reset-password -- --email=admin@radarriopardo.com.br
```

---

## 6. Conferência Territorial (São José do Rio Pardo)

- Confirme sempre que `MUNICIPALITY_IBGE_CODE="3549706"` no `.env`. O coletor PNCP rejeita registros retornados para qualquer outro código IBGE ou município divergente.
