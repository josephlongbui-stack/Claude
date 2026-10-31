import { boot } from './boot.js';
import { ConfigError } from './config.js';
import { houseBotFactories } from '../bots/index.js';

async function main(): Promise<void> {
  const booted = await boot({ bots: houseBotFactories() });
  const shutdown = async (signal: string) => {
    console.log(`[kq] ${signal}: shutting down`);
    await booted.stop();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  if (e instanceof ConfigError) {
    console.error(`[kq] refusing to start: ${e.message}`);
    process.exit(2);
  }
  console.error(e);
  process.exit(1);
});
