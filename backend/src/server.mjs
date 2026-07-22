import app from './app.mjs';
import env from './config/env.mjs';
import logger from './config/logger.mjs';
import { testSupabaseConnection } from './config/supabase.mjs';

const startServer = async () => {
  // Database pre-flight connectivity check
  const connected = await testSupabaseConnection();
  if (!connected) {
    logger.warn('⚠️  Supabase connection test failed. Check SUPABASE_URL and SUPABASE_SECRET_KEY.');
    logger.warn('   The server will still boot up, but database requests may fail.');
  } else {
    logger.info('🗄️  Supabase Database connection successful!');
  }

  const PORT = env.port;
  app.listen(PORT, () => {
    logger.info('\n🚀 FareTransit Modular Backend Started!');
    logger.info('===================================================');
    logger.info(`📍 Server listening at: http://localhost:${PORT}`);
    logger.info(`🌍 Environment: ${env.nodeEnv}`);
    logger.info('===================================================\n');
  });
};

startServer().catch(err => {
  logger.error('Failed to launch server:', err);
  process.exit(1);
});
