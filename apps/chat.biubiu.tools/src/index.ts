/**
 * chat.biubiu.tools — blind WebSocket relay for biubiu.tools E2E chat.
 *
 * Routes:
 *   GET /healthz            → liveness probe
 *   GET /v1/connect?room=ID → WebSocket upgrade, routed to the room's RoomDO
 *
 * The Worker holds no keys and reads no message content; see room.ts.
 */
import { RoomDO } from './room';

export { RoomDO };

interface Env {
	ROOM: DurableObjectNamespace;
}

/** Room ids are client-generated random tokens; validate shape, not content. */
const ROOM_RE = /^[A-Za-z0-9_-]{8,128}$/;

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);

		if (url.pathname === '/healthz') {
			return new Response('ok', { headers: { 'content-type': 'text/plain' } });
		}

		if (url.pathname === '/v1/connect') {
			const room = url.searchParams.get('room');
			if (!room || !ROOM_RE.test(room)) {
				return new Response('bad room id', { status: 400 });
			}
			if (req.headers.get('Upgrade') !== 'websocket') {
				return new Response('expected websocket', { status: 426 });
			}
			const id = env.ROOM.idFromName(room);
			return env.ROOM.get(id).fetch(req);
		}

		return new Response('not found', { status: 404 });
	}
};
