-- ============================================================================
-- RADAR RIO PARDO — MIGRATION INICIAL MYSQL (HOSTINGER CLOUD STARTUP)
-- Charset utf8mb4 para acentuação em Português do Brasil.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `User` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(40) NOT NULL DEFAULT 'COLLABORATOR',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `failedLoginAttempts` INTEGER NOT NULL DEFAULT 0,
  `lockedUntil` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `User_email_key`(`email`),
  INDEX `User_role_idx`(`role`),
  INDEX `User_active_idx`(`active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Session` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(128) NOT NULL,
  `ipAddress` VARCHAR(64) NULL,
  `userAgent` VARCHAR(500) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
  INDEX `Session_userId_idx`(`userId`),
  INDEX `Session_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `action` VARCHAR(120) NOT NULL,
  `entityType` VARCHAR(80) NOT NULL,
  `entityId` VARCHAR(80) NULL,
  `detailsJson` TEXT NULL,
  `ipAddress` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
  INDEX `AuditLog_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SystemSetting` (
  `id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(120) NOT NULL,
  `valueJson` TEXT NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SystemSetting_key_key`(`key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PublicAgency` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(220) NOT NULL,
  `acronym` VARCHAR(40) NULL,
  `sphere` VARCHAR(40) NOT NULL DEFAULT 'MUNICIPAL',
  `city` VARCHAR(120) NOT NULL DEFAULT 'São José do Rio Pardo',
  `state` VARCHAR(10) NOT NULL DEFAULT 'SP',
  `officialUrl` VARCHAR(500) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `PublicAgency_city_state_idx`(`city`, `state`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OfficialSource` (
  `id` VARCHAR(191) NOT NULL,
  `agencyId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(220) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `sourceType` VARCHAR(60) NOT NULL,
  `termsNotes` TEXT NULL,
  `validationMethod` TEXT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'CONFIGURED',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `OfficialSource_slug_key`(`slug`),
  INDEX `OfficialSource_sourceType_idx`(`sourceType`),
  INDEX `OfficialSource_active_idx`(`active`),
  PRIMARY KEY (`id`),
  CONSTRAINT `OfficialSource_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `PublicAgency`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `IntegrationAdapter` (
  `id` VARCHAR(191) NOT NULL,
  `sourceId` VARCHAR(191) NOT NULL,
  `adapterKey` VARCHAR(120) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `frequencyCron` VARCHAR(60) NOT NULL DEFAULT '0 */6 * * *',
  `status` VARCHAR(40) NOT NULL DEFAULT 'IDLE',
  `lastRunAt` DATETIME(3) NULL,
  `lastSuccessAt` DATETIME(3) NULL,
  `recordsCount` INTEGER NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `configJson` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `IntegrationAdapter_adapterKey_key`(`adapterKey`),
  PRIMARY KEY (`id`),
  CONSTRAINT `IntegrationAdapter_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `OfficialSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CollectionRun` (
  `id` VARCHAR(191) NOT NULL,
  `adapterId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'RUNNING',
  `triggerType` VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `itemsFound` INTEGER NOT NULL DEFAULT 0,
  `itemsProcessed` INTEGER NOT NULL DEFAULT 0,
  `itemsDuplicated` INTEGER NOT NULL DEFAULT 0,
  `errorCount` INTEGER NOT NULL DEFAULT 0,
  `logText` LONGTEXT NULL,
  `checkpointJson` TEXT NULL,
  INDEX `CollectionRun_adapterId_startedAt_idx`(`adapterId`, `startedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CollectionRun_adapterId_fkey` FOREIGN KEY (`adapterId`) REFERENCES `IntegrationAdapter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ImportedDocument` (
  `id` VARCHAR(191) NOT NULL,
  `sourceId` VARCHAR(191) NOT NULL,
  `runId` VARCHAR(191) NULL,
  `externalId` VARCHAR(180) NULL,
  `title` VARCHAR(350) NOT NULL,
  `originalUrl` VARCHAR(700) NOT NULL,
  `contentHash` VARCHAR(128) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL DEFAULT 'text/html',
  `rawText` LONGTEXT NULL,
  `extractionStatus` VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  `publishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ImportedDocument_contentHash_key`(`contentHash`),
  INDEX `ImportedDocument_sourceId_createdAt_idx`(`sourceId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ImportedDocument_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `OfficialSource`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ImportedDocument_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `CollectionRun`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GazetteEdition` (
  `id` VARCHAR(191) NOT NULL,
  `agencyId` VARCHAR(191) NULL,
  `editionNumber` VARCHAR(60) NOT NULL,
  `publicationDate` DATETIME(3) NOT NULL,
  `year` INTEGER NOT NULL,
  `month` INTEGER NOT NULL,
  `officialUrl` VARCHAR(700) NOT NULL,
  `fileHash` VARCHAR(128) NULL,
  `totalActs` INTEGER NOT NULL DEFAULT 0,
  `status` VARCHAR(40) NOT NULL DEFAULT 'PENDING_REVIEW',
  `summaryText` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GazetteEdition_fileHash_key`(`fileHash`),
  UNIQUE INDEX `GazetteEdition_editionNumber_year_key`(`editionNumber`, `year`),
  INDEX `GazetteEdition_publicationDate_idx`(`publicationDate`),
  INDEX `GazetteEdition_year_month_idx`(`year`, `month`),
  INDEX `GazetteEdition_status_idx`(`status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `GazetteEdition_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `PublicAgency`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GazetteActCategory` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  UNIQUE INDEX `GazetteActCategory_name_key`(`name`),
  UNIQUE INDEX `GazetteActCategory_slug_key`(`slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GazetteAct` (
  `id` VARCHAR(191) NOT NULL,
  `editionId` VARCHAR(191) NOT NULL,
  `categoryId` VARCHAR(191) NOT NULL,
  `agencyId` VARCHAR(191) NULL,
  `actNumber` VARCHAR(80) NULL,
  `actDate` DATETIME(3) NULL,
  `pageNumber` INTEGER NULL,
  `titleSimple` VARCHAR(350) NOT NULL,
  `objectiveSummary` TEXT NOT NULL,
  `rawExcerpt` LONGTEXT NULL,
  `financialValue` DECIMAL(15, 2) NULL,
  `financialType` VARCHAR(40) NULL,
  `deadlinesText` TEXT NULL,
  `practicalImpact` TEXT NULL,
  `officialUrl` VARCHAR(700) NOT NULL,
  `contentHash` VARCHAR(128) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'IN_REVIEW',
  `hasPersonalDataAlert` BOOLEAN NOT NULL DEFAULT false,
  `aiGenerated` BOOLEAN NOT NULL DEFAULT false,
  `aiModel` VARCHAR(100) NULL,
  `reviewedById` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GazetteAct_contentHash_key`(`contentHash`),
  INDEX `GazetteAct_editionId_idx`(`editionId`),
  INDEX `GazetteAct_categoryId_idx`(`categoryId`),
  INDEX `GazetteAct_status_idx`(`status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `GazetteAct_editionId_fkey` FOREIGN KEY (`editionId`) REFERENCES `GazetteEdition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `GazetteAct_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `GazetteActCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `GazetteAct_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `PublicAgency`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `GazetteAct_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NewsCategory` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  UNIQUE INDEX `NewsCategory_name_key`(`name`),
  UNIQUE INDEX `NewsCategory_slug_key`(`slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NewsArticle` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(300) NOT NULL,
  `slug` VARCHAR(190) NOT NULL,
  `subtitle` VARCHAR(400) NULL,
  `summary` TEXT NOT NULL,
  `content` LONGTEXT NOT NULL,
  `categoryId` VARCHAR(191) NOT NULL,
  `tagsJson` TEXT NOT NULL,
  `coverImageUrl` VARCHAR(700) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  `featured` BOOLEAN NOT NULL DEFAULT false,
  `isPublicUtilityAlert` BOOLEAN NOT NULL DEFAULT false,
  `aiUsed` BOOLEAN NOT NULL DEFAULT false,
  `aiDisclosure` TEXT NULL,
  `correctionNotice` TEXT NULL,
  `authorId` VARCHAR(191) NOT NULL,
  `reviewerId` VARCHAR(191) NULL,
  `publishedAt` DATETIME(3) NULL,
  `scheduledFor` DATETIME(3) NULL,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `NewsArticle_slug_key`(`slug`),
  INDEX `NewsArticle_status_publishedAt_idx`(`status`, `publishedAt`),
  INDEX `NewsArticle_categoryId_idx`(`categoryId`),
  INDEX `NewsArticle_featured_idx`(`featured`),
  PRIMARY KEY (`id`),
  CONSTRAINT `NewsArticle_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `NewsCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `NewsArticle_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `NewsArticle_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `DocumentReference` (
  `id` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NULL,
  `actId` VARCHAR(191) NULL,
  `sourceName` VARCHAR(250) NOT NULL,
  `officialUrl` VARCHAR(700) NOT NULL,
  `documentDate` DATETIME(3) NULL,
  `referenceCode` VARCHAR(120) NULL,
  `pageOrSection` VARCHAR(120) NULL,
  `consultedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `DocumentReference_articleId_idx`(`articleId`),
  INDEX `DocumentReference_actId_idx`(`actId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `DocumentReference_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `NewsArticle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `DocumentReference_actId_fkey` FOREIGN KEY (`actId`) REFERENCES `GazetteAct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `EditorialRevision` (
  `id` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(60) NOT NULL,
  `entityId` VARCHAR(80) NOT NULL,
  `versionNumber` INTEGER NOT NULL DEFAULT 1,
  `snapshotJson` LONGTEXT NOT NULL,
  `notes` TEXT NULL,
  `status` VARCHAR(40) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `EditorialRevision_entityType_entityId_idx`(`entityType`, `entityId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `EditorialRevision_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CorrectionRequest` (
  `id` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NULL,
  `actId` VARCHAR(191) NULL,
  `requesterName` VARCHAR(180) NOT NULL,
  `requesterEmail` VARCHAR(190) NOT NULL,
  `requestType` VARCHAR(50) NOT NULL,
  `description` TEXT NOT NULL,
  `targetUrl` VARCHAR(700) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  `adminNotes` TEXT NULL,
  `publicCorrectionNote` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  INDEX `CorrectionRequest_status_createdAt_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CorrectionRequest_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `NewsArticle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `CorrectionRequest_actId_fkey` FOREIGN KEY (`actId`) REFERENCES `GazetteAct`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Legislature` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `startYear` INTEGER NOT NULL,
  `endYear` INTEGER NOT NULL,
  `totalSeats` INTEGER NOT NULL DEFAULT 13,
  `isCurrent` BOOLEAN NOT NULL DEFAULT false,
  UNIQUE INDEX `Legislature_title_key`(`title`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Councilor` (
  `id` VARCHAR(191) NOT NULL,
  `legislatureId` VARCHAR(191) NOT NULL,
  `fullName` VARCHAR(200) NOT NULL,
  `parliamentaryName` VARCHAR(160) NOT NULL,
  `slug` VARCHAR(160) NOT NULL,
  `partyAcronym` VARCHAR(40) NULL,
  `roleInBoard` VARCHAR(120) NULL,
  `commissionsJson` TEXT NOT NULL,
  `photoUrl` VARCHAR(700) NULL,
  `photoLicenseNote` TEXT NULL,
  `officialProfileUrl` VARCHAR(700) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Councilor_slug_key`(`slug`),
  INDEX `Councilor_legislatureId_active_idx`(`legislatureId`, `active`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Councilor_legislatureId_fkey` FOREIGN KEY (`legislatureId`) REFERENCES `Legislature`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LegislativeProposition` (
  `id` VARCHAR(191) NOT NULL,
  `number` VARCHAR(60) NOT NULL,
  `year` INTEGER NOT NULL,
  `type` VARCHAR(60) NOT NULL,
  `summary` TEXT NOT NULL,
  `authorId` VARCHAR(191) NULL,
  `presentationDate` DATETIME(3) NULL,
  `status` VARCHAR(80) NOT NULL DEFAULT 'EM_TRAMITACAO',
  `tramitationText` TEXT NULL,
  `officialUrl` VARCHAR(700) NOT NULL,
  `lastUpdated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `LegislativeProposition_type_number_year_key`(`type`, `number`, `year`),
  INDEX `LegislativeProposition_year_type_idx`(`year`, `type`),
  PRIMARY KEY (`id`),
  CONSTRAINT `LegislativeProposition_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `Councilor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ChamberSession` (
  `id` VARCHAR(191) NOT NULL,
  `sessionNumber` VARCHAR(60) NOT NULL,
  `sessionDate` DATETIME(3) NOT NULL,
  `sessionType` VARCHAR(60) NOT NULL DEFAULT 'ORDINARIA',
  `officialUrl` VARCHAR(700) NULL,
  `status` VARCHAR(60) NOT NULL DEFAULT 'REGISTRADA',
  `notes` TEXT NULL,
  UNIQUE INDEX `ChamberSession_sessionNumber_sessionDate_key`(`sessionNumber`, `sessionDate`),
  INDEX `ChamberSession_sessionDate_idx`(`sessionDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SessionAttendance` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `councilorId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(40) NOT NULL,
  `justification` TEXT NULL,
  UNIQUE INDEX `SessionAttendance_sessionId_councilorId_key`(`sessionId`, `councilorId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SessionAttendance_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `ChamberSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SessionAttendance_councilorId_fkey` FOREIGN KEY (`councilorId`) REFERENCES `Councilor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LegislativeVote` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `propositionId` VARCHAR(191) NULL,
  `matterTitle` VARCHAR(350) NOT NULL,
  `resultSummary` VARCHAR(180) NOT NULL,
  `officialUrl` VARCHAR(700) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `LegislativeVote_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `ChamberSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `LegislativeVote_propositionId_fkey` FOREIGN KEY (`propositionId`) REFERENCES `LegislativeProposition`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CouncilorVote` (
  `id` VARCHAR(191) NOT NULL,
  `voteId` VARCHAR(191) NOT NULL,
  `councilorId` VARCHAR(191) NOT NULL,
  `voteChoice` VARCHAR(40) NOT NULL,
  UNIQUE INDEX `CouncilorVote_voteId_councilorId_key`(`voteId`, `councilorId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CouncilorVote_voteId_fkey` FOREIGN KEY (`voteId`) REFERENCES `LegislativeVote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CouncilorVote_councilorId_fkey` FOREIGN KEY (`councilorId`) REFERENCES `Councilor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Supplier` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(250) NOT NULL,
  `documentType` VARCHAR(20) NOT NULL DEFAULT 'CNPJ',
  `documentMasked` VARCHAR(32) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Supplier_documentMasked_key`(`documentMasked`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BiddingProcess` (
  `id` VARCHAR(191) NOT NULL,
  `agencyId` VARCHAR(191) NOT NULL,
  `processNumber` VARCHAR(80) NOT NULL,
  `modality` VARCHAR(120) NOT NULL,
  `objectDescription` TEXT NOT NULL,
  `status` VARCHAR(80) NOT NULL,
  `publicationDate` DATETIME(3) NULL,
  `openingDate` DATETIME(3) NULL,
  `estimatedValue` DECIMAL(15, 2) NULL,
  `officialUrl` VARCHAR(700) NOT NULL,
  `pncpId` VARCHAR(120) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `BiddingProcess_pncpId_key`(`pncpId`),
  UNIQUE INDEX `BiddingProcess_agencyId_processNumber_key`(`agencyId`, `processNumber`),
  INDEX `BiddingProcess_publicationDate_idx`(`publicationDate`),
  INDEX `BiddingProcess_status_idx`(`status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `BiddingProcess_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `PublicAgency`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PublicContract` (
  `id` VARCHAR(191) NOT NULL,
  `agencyId` VARCHAR(191) NOT NULL,
  `biddingId` VARCHAR(191) NULL,
  `supplierId` VARCHAR(191) NULL,
  `contractNumber` VARCHAR(80) NOT NULL,
  `objectDescription` TEXT NOT NULL,
  `signatureDate` DATETIME(3) NULL,
  `startDate` DATETIME(3) NULL,
  `endDate` DATETIME(3) NULL,
  `contractedValue` DECIMAL(15, 2) NULL,
  `committedValue` DECIMAL(15, 2) NULL,
  `liquidatedValue` DECIMAL(15, 2) NULL,
  `paidValue` DECIMAL(15, 2) NULL,
  `additivesTotal` DECIMAL(15, 2) NULL,
  `status` VARCHAR(80) NOT NULL,
  `officialUrl` VARCHAR(700) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PublicContract_agencyId_contractNumber_key`(`agencyId`, `contractNumber`),
  INDEX `PublicContract_signatureDate_idx`(`signatureDate`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PublicContract_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `PublicAgency`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PublicContract_biddingId_fkey` FOREIGN KEY (`biddingId`) REFERENCES `BiddingProcess`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PublicContract_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PodcastProgram` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `formatDescription` TEXT NOT NULL,
  `durationRange` VARCHAR(80) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  UNIQUE INDEX `PodcastProgram_title_key`(`title`),
  UNIQUE INDEX `PodcastProgram_slug_key`(`slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PodcastEpisode` (
  `id` VARCHAR(191) NOT NULL,
  `programId` VARCHAR(191) NOT NULL,
  `episodeNumber` INTEGER NOT NULL,
  `title` VARCHAR(250) NOT NULL,
  `slug` VARCHAR(190) NOT NULL,
  `description` TEXT NOT NULL,
  `audioUrl` VARCHAR(700) NULL,
  `durationSeconds` INTEGER NULL,
  `publishedAt` DATETIME(3) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  `syntheticVoiceNotice` TEXT NOT NULL,
  `scriptMarkdown` LONGTEXT NULL,
  `notebookLmPrompt` LONGTEXT NULL,
  `sourcesJson` TEXT NOT NULL,
  `allowDownload` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PodcastEpisode_slug_key`(`slug`),
  INDEX `PodcastEpisode_programId_status_idx`(`programId`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PodcastEpisode_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `PodcastProgram`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SocialPostDraft` (
  `id` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NOT NULL,
  `platform` VARCHAR(40) NOT NULL DEFAULT 'FACEBOOK',
  `shortText` TEXT NOT NULL,
  `headlineCardText` VARCHAR(300) NOT NULL,
  `shareUrl` VARCHAR(700) NOT NULL,
  `scheduledAt` DATETIME(3) NULL,
  `publishedUrl` VARCHAR(700) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `SocialPostDraft_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `NewsArticle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SponsorAdvertiser` (
  `id` VARCHAR(191) NOT NULL,
  `companyName` VARCHAR(220) NOT NULL,
  `cnpj` VARCHAR(20) NULL,
  `contactEmail` VARCHAR(190) NULL,
  `startDate` DATETIME(3) NOT NULL,
  `endDate` DATETIME(3) NOT NULL,
  `destinationUrl` VARCHAR(700) NOT NULL,
  `bannerImageUrl` VARCHAR(700) NULL,
  `placement` VARCHAR(40) NOT NULL DEFAULT 'HOMEPAGE',
  `active` BOOLEAN NOT NULL DEFAULT false,
  `impressionsCount` INTEGER NOT NULL DEFAULT 0,
  `publicTransparencyNote` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PasswordResetToken` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(128) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
  INDEX `PasswordResetToken_userId_idx`(`userId`),
  INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
