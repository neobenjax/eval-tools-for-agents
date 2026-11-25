/**
 * Fixture command that never becomes ready (M2b-AC-21). Writes its pid and waits.
 */
import fs from 'node:fs';

fs.writeFileSync(process.env.M2B_PIDFILE, JSON.stringify({ parent: process.pid }));
setInterval(() => {}, 1000);
