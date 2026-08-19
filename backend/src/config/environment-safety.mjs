import logger from './logger.mjs';

/**
 * Phase 17 — Deployment Safety & Multi-Stage Environment Separation Utility
 */

export function getEnvironment() {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  if (env === 'production' || env === 'prod') return 'production';
  if (env === 'staging' || env === 'stage') return 'staging';
  return 'development';
}

export function isProduction() {
  return getEnvironment() === 'production';
}

export function isStaging() {
  return getEnvironment() === 'staging';
}

export function isDevelopment() {
  return getEnvironment() === 'development';
}

/**
 * Inspect SQL queries for destructive operations (DROP TABLE, TRUNCATE, DROP COLUMN, DELETE FROM).
 * Blocks execution in Production unless ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS === 'true'.
 */
export function assertDestructiveAllowed(operationName = 'SQL Execution', sqlQuery = '') {
  const envStage = getEnvironment();
  const sqlUpper = String(sqlQuery).toUpperCase();

  const DESTRUCTIVE_KEYWORDS = [
    'DROP TABLE',
    'TRUNCATE',
    'DROP COLUMN',
    'DROP DATABASE',
    'DROP SCHEMA',
    'DELETE FROM'
  ];

  const isDestructive = DESTRUCTIVE_KEYWORDS.some(keyword => sqlUpper.includes(keyword));

  if (isDestructive && envStage === 'production') {
    const override = process.env.ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS === 'true';
    if (!override) {
      const errMsg = `DESTRUCTIVE_PRODUCTION_OPERATION_BLOCKED: Destructive database operation '${operationName}' contains keywords [${DESTRUCTIVE_KEYWORDS.filter(k => sqlUpper.includes(k)).join(', ')}] and is strictly blocked in PRODUCTION environment. Test changes in Staging first.`;
      logger.error(`[Deployment Safety] ${errMsg}`);
      const err = new Error(errMsg);
      err.code = 'DESTRUCTIVE_PRODUCTION_OPERATION_BLOCKED';
      throw err;
    } else {
      logger.warn(`[Deployment Safety WARNING] Emergency override ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS=true used for operation '${operationName}' in PRODUCTION.`);
    }
  }

  return { safe: true, environment: envStage, isDestructive };
}

/**
 * Validates active deployment pipeline configuration and outputs stage status.
 */
export function validateDeploymentPipeline() {
  const envStage = getEnvironment();
  const isProductionMode = isProduction();

  logger.info(`[Deployment Safety] Pipeline Active Stage: ${envStage.toUpperCase()}`);

  return {
    stage: envStage,
    isProduction: isProductionMode,
    destructiveOperationsAllowed: !isProductionMode || process.env.ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS === 'true'
  };
}

export default {
  getEnvironment,
  isProduction,
  isStaging,
  isDevelopment,
  assertDestructiveAllowed,
  validateDeploymentPipeline
};
