/**
 * Live integration test for the real RoomDO relay.
 *
 * Run the worker first, then this test:
 *   bun run dev          # terminal 1 — wrangler dev on :8787
 *   bun run test:relay   # terminal 2
 *
 * Override the target with RELAY_URL=ws://host:port/v1/connect.
 * Uses Bun's global WebSocket; exits non-zero on any failure.
 */
const BASE = process.env.RELAY_URL ?? 'ws://localhost:8787/v1/connect';
const ROOM = 'itest_' + Math.random().toString(36).slice(2);
const URL = `${BASE}?room=${ROOM}`;

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
	if (ok) {
		pass++;
		console.log(`  ✓ ${name}`);
	} else {
		fail++;
		console.log(`  ✗ ${name} ${extra}`);
	}
};

function connect() {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(URL);
		const queue = [];
		const waiters = [];
		let closeCode = -1;
		const closeWaiters = [];
		ws.onmessage = (e) => {
			const f = JSON.parse(e.data);
			const w = waiters.shift();
			if (w) w(f);
			else queue.push(f);
		};
		ws.onclose = (e) => {
			closeCode = e.code;
			closeWaiters.splice(0).forEach((w) => w(e.code));
		};
		ws.onerror = () => {};
		ws.onopen = () =>
			resolve({
				send: (f) => ws.send(JSON.stringify(f)),
				next: (ms = 3000) =>
					new Promise((res, rej) => {
						if (queue.length) return res(queue.shift());
						const t = setTimeout(() => rej(new Error('frame timeout')), ms);
						waiters.push((f) => {
							clearTimeout(t);
							res(f);
						});
					}),
				closed: (ms = 3000) =>
					new Promise((res, rej) => {
						if (closeCode >= 0) return res(closeCode);
						const t = setTimeout(() => rej(new Error('close timeout')), ms);
						closeWaiters.push((c) => {
							clearTimeout(t);
							res(c);
						});
					}),
				ws
			});
		setTimeout(() => reject(new Error('connect timeout — is `bun run dev` running?')), 4000);
	});
}

try {
	const A = await connect();
	A.send({ t: 'hello' });
	const wA = await A.next();
	check('A welcome role=a, peerPresent=false', wA.t === 'welcome' && wA.role === 'a' && wA.peerPresent === false);

	const B = await connect();
	B.send({ t: 'hello' });
	const wB = await B.next();
	check('B welcome role=b, peerPresent=true', wB.t === 'welcome' && wB.role === 'b' && wB.peerPresent === true);
	const tokenB = wB.token;
	check('A receives peer-joined', (await A.next()).t === 'peer-joined');

	A.send({ t: 'signal', data: { pub: 'PUBA' } });
	const sigB = await B.next();
	check('signal A→B relayed verbatim', sigB.t === 'signal' && sigB.data?.pub === 'PUBA');

	B.send({ t: 'relay', seq: 0, data: 'CIPHERTEXT_B0' });
	const relA = await A.next();
	check('relay B→A relayed verbatim', relA.t === 'relay' && relA.data === 'CIPHERTEXT_B0');

	// 2-peer cap
	const C = await connect();
	C.send({ t: 'hello' });
	const fC = await C.next();
	check('3rd peer gets error:full', fC.t === 'error' && fC.code === 'full');
	check('3rd peer socket closed', (await C.closed()) >= 1000);

	// reconnect + buffer
	B.ws.close();
	check('A sees peer-left graceful=false', (await A.next()).graceful === false);
	A.send({ t: 'relay', seq: 1, data: 'BUFFERED' });
	const B2 = await connect();
	B2.send({ t: 'hello', resume: tokenB });
	check('B resumes', (await B2.next()).t === 'welcome');
	check('B2 receives buffered relay', (await B2.next()).data === 'BUFFERED');

	A.ws.close();
	B2.ws.close();
} catch (e) {
	fail++;
	console.log('  ✗ EXCEPTION:', e.message);
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
