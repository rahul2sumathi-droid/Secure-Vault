import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

async function start() {
	const server = await createServer({ root: __dirname });
	await server.listen();
	console.log('Vite dev server started');
}

start().catch((err) => {
	console.error('Failed to start Vite:', err);
	process.exit(1);
});
