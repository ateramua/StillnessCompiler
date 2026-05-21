#!/usr/bin/env node
/**
 * Minimal QuantumIDE collaboration WebSocket relay.
 * Usage: node scripts/quantumide-collab-relay.mjs [port]
 * Connect clients to ws://127.0.0.1:<port>
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const port = Number(process.argv[2] || 3928);
const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
	socket.on('message', (data) => {
		for (const client of wss.clients) {
			if (client !== socket && client.readyState === 1) {
				client.send(data);
			}
		}
	});
});

server.listen(port, '127.0.0.1', () => {
	console.log(`QuantumIDE collab relay listening on ws://127.0.0.1:${port}`);
});
