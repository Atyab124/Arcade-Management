import 'dotenv/config';
import { createApp } from './app.js';
import { getConfig } from './config.js';
import { logger } from './logger.js';

const app = createApp();
const port = getConfig().API_PORT;
app.listen(port, () => {
  logger.info({ port }, '🎮 iFun City API listening');
});
