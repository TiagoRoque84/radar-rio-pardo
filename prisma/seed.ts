import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando seed institucional do Radar Rio Pardo...");

  const adminEmail =
    process.env.SEED_ADMIN_EMAIL || "admin@radarriopardo.com.br";
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD || "RadarAdmin@2026!";

  const adminHash = await bcrypt.hash(adminPassword, 12);
  const editorHash = await bcrypt.hash("EditorRadar@2026!", 12);
  const collabHash = await bcrypt.hash("ColaboradorRadar@2026!", 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Administrador Radar Rio Pardo",
      email: adminEmail,
      passwordHash: adminHash,
      role: "ADMIN",
      active: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "editor@radarriopardo.com.br" },
    update: {},
    create: {
      name: "Editoria Responsável",
      email: "editor@radarriopardo.com.br",
      passwordHash: editorHash,
      role: "EDITOR",
      active: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "colaborador@radarriopardo.com.br" },
    update: {},
    create: {
      name: "Colaborador de Redação",
      email: "colaborador@radarriopardo.com.br",
      passwordHash: collabHash,
      role: "COLLABORATOR",
      active: true,
    },
  });

  // Categorias iniciais de notícias (Seção 4.2)
  const newsCategories = [
    {
      name: "Administração pública",
      slug: "administracao-publica",
      description:
        "Atos, estrutura administrativa e decisões do Executivo municipal.",
    },
    {
      name: "Câmara Municipal",
      slug: "camara-municipal",
      description:
        "Projetos, requerimentos, sessões e atividades do Legislativo local.",
    },
    {
      name: "Diário Oficial",
      slug: "diario-oficial",
      description:
        "Destaques explicados das publicações oficiais do município.",
    },
    {
      name: "Educação",
      slug: "educacao",
      description: "Escolas municipais, creches, merenda e políticas educacionais.",
    },
    {
      name: "Saúde",
      slug: "saude",
      description: "UBS, pronto atendimento, campanhas de vacinação e saúde pública.",
    },
    {
      name: "Meio ambiente",
      slug: "meio-ambiente",
      description:
        "Saneamento, áreas verdes, resíduos sólidos e preservação ambiental.",
    },
    {
      name: "Obras e infraestrutura",
      slug: "obras-e-infraestrutura",
      description: "Pavimentação, reformas, mobilidade urbana e manutenção.",
    },
    {
      name: "Licitações e contratos",
      slug: "licitacoes-e-contratos",
      description: "Editais, contratações públicas e acompanhamento de execuções.",
    },
    {
      name: "Concursos e oportunidades",
      slug: "concursos-e-oportunidades",
      description: "Editais de concursos, processos seletivos e convocações.",
    },
    {
      name: "Economia municipal",
      slug: "economia-municipal",
      description: "Receitas, orçamento, emprego e indicadores locais.",
    },
    {
      name: "Serviços públicos",
      slug: "servicos-publicos",
      description: "Água, esgoto, coleta de lixo, iluminação e atendimento ao cidadão.",
    },
    {
      name: "Avisos à população",
      slug: "avisos-a-populacao",
      description: "Audiências públicas, prazos, interdições e utilidade pública.",
    },
  ];

  for (const cat of newsCategories) {
    await prisma.newsCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, description: cat.description },
      create: cat,
    });
  }

  // Categorias de atos do Diário Oficial (Seção 5)
  const actCategories = [
    { name: "Leis", slug: "leis", description: "Leis ordinárias e complementares." },
    { name: "Decretos", slug: "decretos", description: "Decretos municipais." },
    { name: "Portarias", slug: "portarias", description: "Portarias administrativas." },
    { name: "Licitações", slug: "licitacoes", description: "Editais, avisos e atas de licitação." },
    { name: "Contratos", slug: "contratos", description: "Extratos de contratos e termos aditivos." },
    { name: "Nomeações", slug: "nomeacoes", description: "Nomeações para cargos públicos e comissionados." },
    { name: "Exonerações", slug: "exoneracoes", description: "Desligamentos e exonerações." },
    {
      name: "Concursos e processos seletivos",
      slug: "concursos-e-processos-seletivos",
      description: "Editais de seleção de pessoal.",
    },
    { name: "Convocações", slug: "convocacoes", description: "Chamamentos e convocações de candidatos." },
    { name: "Audiências públicas", slug: "audiencias-publicas", description: "Chamadas para participação popular." },
    { name: "Publicações fiscais", slug: "publicacoes-fiscais", description: "Balanços, RREO, RGF e demonstrativos." },
    { name: "Comunicados administrativos", slug: "comunicados-administrativos", description: "Comunicados diversos." },
    { name: "Outros atos", slug: "outros-atos", description: "Demais atos oficiais." },
  ];

  for (const cat of actCategories) {
    await prisma.gazetteActCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, description: cat.description },
      create: cat,
    });
  }

  // Órgãos públicos reais de São José do Rio Pardo
  const agencies = [
    {
      id: "agency-prefeitura-sjrp",
      name: "Prefeitura Municipal de São José do Rio Pardo",
      acronym: "PMSJRP",
      sphere: "MUNICIPAL",
      officialUrl: "https://saojosedoriopardo.sp.gov.br/",
    },
    {
      id: "agency-camara-sjrp",
      name: "Câmara Municipal de São José do Rio Pardo",
      acronym: "CMSJRP",
      sphere: "MUNICIPAL",
      officialUrl: "https://camarasjriopardo.sp.gov.br/",
    },
    {
      id: "agency-saerp",
      name: "Serviço Autônomo de Água e Esgoto de São José do Rio Pardo",
      acronym: "SAERP",
      sphere: "AUTARQUIA",
      officialUrl: "https://saojosedoriopardo.sp.gov.br/",
    },
    {
      id: "agency-feuc",
      name: "Fundação Educacional e Cultural / Ensino Superior",
      acronym: "FEUC",
      sphere: "AUTARQUIA",
      officialUrl: "https://saojosedoriopardo.sp.gov.br/",
    },
    {
      id: "agency-dec",
      name: "Departamento de Esportes e Cultura",
      acronym: "DEC",
      sphere: "MUNICIPAL",
      officialUrl: "https://saojosedoriopardo.sp.gov.br/",
    },
  ];

  for (const agency of agencies) {
    await prisma.publicAgency.upsert({
      where: { id: agency.id },
      update: {
        name: agency.name,
        acronym: agency.acronym,
        officialUrl: agency.officialUrl,
      },
      create: agency,
    });
  }

  // Fontes oficiais e adaptadores de integração (Seções 5, 6, 7, 8)
  const sourcesAndAdapters = [
    {
      source: {
        id: "src-imprensa-oficial-sjrp",
        agencyId: "agency-prefeitura-sjrp",
        name: "Diário Oficial Eletrônico de São José do Rio Pardo",
        slug: "diario-oficial-sjrp",
        url: "https://www.imprensaoficialmunicipal.com.br/sjriopardo",
        sourceType: "DIARIO_OFICIAL",
        termsNotes:
          "Portal público da Imprensa Oficial Municipal. Coleta sujeita a verificação de estrutura HTML/PDF e respeito aos termos de acesso sem burla de barreiras.",
        validationMethod:
          "Verificação HTTP GET com User-Agent identificado, validação de código 200 e cálculo de hash SHA-256.",
        status: "CONFIGURED",
      },
      adapter: {
        adapterKey: "imprensa-oficial-sjrp",
        name: "Coletor do Diário Oficial (Imprensa Oficial Municipal)",
        frequencyCron: "0 */4 * * *",
        status: "IDLE",
      },
    },
    {
      source: {
        id: "src-pncp-sjrp",
        agencyId: "agency-prefeitura-sjrp",
        name: "Portal Nacional de Contratações Públicas (PNCP)",
        slug: "pncp-sjrp",
        url: "https://pncp.gov.br/api/consulta/swagger-ui/index.html",
        sourceType: "API_PUBLICA",
        termsNotes:
          "API pública oficial do Governo Federal (Lei 14.133/2021). Consulta por código IBGE 3550803 (São José do Rio Pardo).",
        validationMethod:
          "Consulta REST JSON paginada à API de consulta do PNCP com validação de schema Zod.",
        status: "CONFIGURED",
      },
      adapter: {
        adapterKey: "pncp-api-sjrp",
        name: "Coletor PNCP — Licitações e Contratos (IBGE 3550803)",
        frequencyCron: "0 */6 * * *",
        status: "IDLE",
      },
    },
    {
      source: {
        id: "src-camara-sjrp",
        agencyId: "agency-camara-sjrp",
        name: "Portal Oficial da Câmara Municipal de São José do Rio Pardo",
        slug: "camara-sjrp",
        url: "https://camarasjriopardo.sp.gov.br/",
        sourceType: "PORTAL_CAMARA",
        termsNotes:
          "Portal institucional do Legislativo. Aguardar validação da estrutura de dados abertos ou importação manual assistida.",
        validationMethod:
          "Checagem de disponibilidade HTTP e inspeção manual de documentos oficiais.",
        status: "CONFIGURED",
      },
      adapter: {
        adapterKey: "camara-sjrp-check",
        name: "Monitor de Disponibilidade — Câmara Municipal",
        frequencyCron: "0 8 * * *",
        status: "PENDING_CONFIG",
      },
    },
    {
      source: {
        id: "src-transparencia-prefeitura-sjrp",
        agencyId: "agency-prefeitura-sjrp",
        name: "Portal da Transparência da Prefeitura Municipal",
        slug: "transparencia-prefeitura-sjrp",
        url: "https://saojosedoriopardo.sp.gov.br/portal-da-transparencia-home/",
        sourceType: "TRANSPARENCIA",
        termsNotes:
          "Portal municipal de transparência. A importação de planilhas CSV/JSON oficiais pode ser feita pelo painel administrativo.",
        validationMethod:
          "Importação assistida com validação de colunas e conferência documental.",
        status: "CONFIGURED",
      },
      adapter: {
        adapterKey: "transparencia-prefeitura-check",
        name: "Monitor de Disponibilidade — Transparência Prefeitura",
        frequencyCron: "0 7 * * *",
        status: "PENDING_CONFIG",
      },
    },
    {
      source: {
        id: "src-camara-atende-net",
        agencyId: "agency-camara-sjrp",
        name: "Portal da Transparência da Câmara (Atende.net)",
        slug: "camara-atende-net",
        url: "https://camarasaojosedoriopardo.atende.net/",
        sourceType: "TRANSPARENCIA",
        termsNotes:
          "Sistema Atende.net da Câmara Municipal. Estrutura sujeita a regras de acesso do provedor e importação assistida.",
        validationMethod: "Importação manual assistida via CSV/JSON oficial.",
        status: "CONFIGURED",
      },
      adapter: {
        adapterKey: "camara-atende-net-check",
        name: "Monitor de Disponibilidade — Câmara Atende.net",
        frequencyCron: "0 9 * * *",
        status: "PENDING_CONFIG",
      },
    },
  ];

  for (const item of sourcesAndAdapters) {
    await prisma.officialSource.upsert({
      where: { slug: item.source.slug },
      update: {
        name: item.source.name,
        url: item.source.url,
      },
      create: item.source,
    });

    await prisma.integrationAdapter.upsert({
      where: { adapterKey: item.adapter.adapterKey },
      update: { name: item.adapter.name },
      create: {
        sourceId: item.source.id,
        ...item.adapter,
      },
    });
  }

  // Legislatura atual (metadado institucional sem invenção de parlamentares)
  await prisma.legislature.upsert({
    where: { title: "Legislatura 2025–2028" },
    update: {},
    create: {
      title: "Legislatura 2025–2028",
      startYear: 2025,
      endYear: 2028,
      totalSeats: 13,
      isCurrent: true,
    },
  });

  // Programas de Podcast (Seção 10)
  await prisma.podcastProgram.upsert({
    where: { slug: "radar-da-semana" },
    update: {},
    create: {
      title: "Radar da Semana",
      slug: "radar-da-semana",
      formatDescription:
        "Programa informativo semanal que resume os principais atos oficiais, licitações e decisões públicas em linguagem clara para a população.",
      durationRange: "5 a 10 minutos",
      active: true,
    },
  });

  await prisma.podcastProgram.upsert({
    where: { slug: "radar-em-debate" },
    update: {},
    create: {
      title: "Radar em Debate",
      slug: "radar-em-debate",
      formatDescription:
        "Programa semanal de análise documental que examina temas relevantes do município sob perspectivas distintas e baseadas em fontes oficiais.",
      durationRange: "10 a 20 minutos",
      active: true,
    },
  });

  // Configurações iniciais do sistema
  await prisma.systemSetting.upsert({
    where: { key: "editorial_independence_notice" },
    update: {},
    create: {
      key: "editorial_independence_notice",
      valueJson: JSON.stringify({
        notice:
          "O Radar Rio Pardo é um portal independente de jornalismo de dados e transparência municipal, sem vínculo institucional com a Prefeitura ou com a Câmara Municipal de São José do Rio Pardo.",
        developer: "Roque Consultoria Digital",
      }),
    },
  });

  console.log("Seed institucional concluído com sucesso!");
}

main()
  .catch((error) => {
    console.error("Erro ao executar seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
