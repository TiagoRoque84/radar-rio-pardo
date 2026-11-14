# Política Editorial e Conformidade Jurídica — Radar Rio Pardo

## 1. Natureza do Portal

O **Radar Rio Pardo** é um projeto independente de jornalismo de dados, transparência pública e acompanhamento cívico de São José do Rio Pardo (SP), desenvolvido pela **Roque Consultoria Digital**. Não possui vínculo institucional com a Prefeitura ou com a Câmara Municipal.

---

## 2. Regras Obrigatórias de Publicação

1. **Veracidade e Verificabilidade:** Todo conteúdo publicado deve apontar ao menos uma fonte oficial (`DocumentReference`), com URL pública, identificação do documento e data de consulta.
2. **Revisão Humana Obrigatória:** Nenhum coletor automatizado e nenhum recurso opcional de IA tem permissão para publicar matérias ou resumos do Diário Oficial automaticamente.
3. **Separação Fato vs. Opinião:** Resumos do Diário Oficial, dados da Câmara e contratações públicas apresentam exclusivamente os fatos documentais verificados.
4. **Integridade Financeira:** Nunca somar valores estimados, contratados, empenhados, liquidados e pagos como se fossem a mesma grandeza, nem rotular automaticamente licitações como fraude ou superfaturamento.
5. **Imparcialidade Legislativa:** Não publicar rankings depreciativos de vereadores; diferenciar indicações e requerimentos de projetos de lei; distinguir ausência de informação de falta em sessão.

---

## 3. Proteção de Dados Pessoais (LGPD)

O módulo `src/lib/privacy/lgpd-sanitizer.ts` inspeciona textos antes de salvá-los e alerta ou mascara:
- CPF (mantendo apenas dígitos centrais quando necessário ou mascarando integralmente).
- RG.
- Telefones particulares.
- Dados bancários (agência, conta corrente, chaves PIX).
- E-mails pessoais não institucionais.

---

## 4. Direito de Resposta e Correções

Qualquer cidadão, agente público ou empresa pode abrir solicitação rastreável em `/correcao` (API `/api/corrections`), gerenciada pela equipe em `/admin/correcoes`, com possibilidade de publicação de nota transparente de correção diretamente na matéria vinculada.
