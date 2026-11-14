# Guia de Implantação na Hostinger Cloud Startup — Radar Rio Pardo

Este guia descreve o passo a passo para publicar o **Radar Rio Pardo** no subdomínio `radar.roqueconsultoriadigital.com.br` na infraestrutura **Hostinger Cloud Startup**, preservando integralmente o site WordPress principal em `roqueconsultoriadigital.com.br`.

---

## 1. Pré-requisitos no hPanel da Hostinger

1. Acesse o **hPanel** da Hostinger.
2. **Não modifique** os arquivos ou o banco do domínio principal (`roqueconsultoriadigital.com.br`).
3. Crie ou configure o subdomínio `radar.roqueconsultoriadigital.com.br` (ou aplicação Node.js vinculada ao subdomínio).
4. Verifique se o **SSL/HTTPS automático** está ativo para o subdomínio.

---

## 2. Banco de Dados MySQL

1. No hPanel, vá em **Bancos de Dados → Gerenciamento** e crie um banco MySQL exclusivo (ex.: `uXXXXXXXX_radarrp`) com usuário dedicado e senha forte.
2. Acesse o **phpMyAdmin** desse novo banco e importe o arquivo:
   `prisma/migrations/0001_initial_mysql/migration.sql`
   *(Isso cria todas as tabelas com `utf8mb4_unicode_ci`, índices e chaves estrangeiras.)*

---

## 3. Variáveis de Ambiente (`.env`)

No diretório da aplicação na Hostinger (ou painel de variáveis do aplicativo Node.js), crie o arquivo `.env` baseado no `.env.example`:

```env
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="https://radar.roqueconsultoriadigital.com.br"
NEXT_PUBLIC_SITE_NAME="Radar Rio Pardo"
NEXT_PUBLIC_MUNICIPALITY="São José do Rio Pardo - SP"

DATABASE_URL="mysql://USUARIO_MYSQL:SENHA_FORTE@localhost:3306/NOME_DO_BANCO"

# Gere com: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
AUTH_SECRET="COLE_AQUI_SUA_CHAVE_ALEATORIA_FORTE"
CRON_SECRET="COLE_AQUI_SEU_TOKEN_SECRETO_PARA_CRON"

SEED_ADMIN_EMAIL="seu-email-admin@roqueconsultoriadigital.com.br"
SEED_ADMIN_PASSWORD="DEFINA_UMA_SENHA_FORTE_UNICA"

AI_PROVIDER="disabled"
AI_API_KEY=""
AI_MONTHLY_BUDGET_BRL="50.00"
```

---

## 4. Deploy via Repositório GitHub e Build

1. Conecte o repositório `https://github.com/TiagoRoque84/radar-rio-pardo.git` no painel de Deploy Git / SSH da Hostinger.
2. Selecione a versão **Node.js LTS** disponível no painel (recomendado Node 20 LTS ou 22 LTS).
3. Execute os comandos de preparação para MySQL e build:
   ```bash
   npm ci
   npm run db:use-mysql
   npx prisma generate
   npm run db:seed
   npm run build
   ```
4. Configure o comando de inicialização da aplicação:
   ```bash
   npm run start
   ```
5. Teste o health check após subir o serviço:
   `https://radar.roqueconsultoriadigital.com.br/api/health`
   Resposta esperada (`200 OK`): `{"status":"ok","service":"radar-rio-pardo","database":"connected",...}`

---

## 5. Configuração dos Cron Jobs da Hostinger

No hPanel em **Avançado → Cron Jobs**, adicione uma tarefa agendada (por exemplo, a cada 4 horas: `0 */4 * * *`) apontando para o endpoint protegido:

```bash
curl -s -X POST -H "Authorization: Bearer SEU_CRON_SECRET" https://radar.roqueconsultoriadigital.com.br/api/cron/collect > /dev/null
```

Ou via CLI caso execute diretamente na pasta da aplicação:
```bash
cd /caminho/para/radar-rio-pardo && npm run collect:cron
```
