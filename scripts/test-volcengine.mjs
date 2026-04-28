/**
 * Standalone Volcengine ASR connectivity test.
 * Run: node scripts/test-volcengine.mjs
 *
 * Tests:
 *   1. WebSocket connection (auth headers)
 *   2. Init request acknowledged
 *   3. 0.5 s of silence → transcript result
 *
 * Reads credentials from .env via dotenv if present.
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createGunzip, gzipSync, gunzipSync } from 'zlib';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// ── Load .env manually (no dotenv dependency needed) ────────────────────────

function loadDotenv() {
  const envPath = resolve(projectRoot, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotenv();

const APP_ID       = process.env.VOLCENGINE_APP_ID;
const ACCESS_TOKEN = process.env.VOLCENGINE_ACCESS_TOKEN;
const RESOURCE_ID  = process.env.VOLCENGINE_RESOURCE_ID ?? 'volc.bigasr.sauc.duration';
const ENDPOINT     = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel';

if (!APP_ID || !ACCESS_TOKEN) {
  console.error('❌  Missing credentials.  Set VOLCENGINE_APP_ID and VOLCENGINE_ACCESS_TOKEN in .env');
  process.exit(1);
}

console.log('Volcengine ASR connectivity test');
console.log('  APP_ID     :', APP_ID);
console.log('  RESOURCE_ID:', RESOURCE_ID);
console.log('  ENDPOINT   :', ENDPOINT);
console.log('');

// ── Binary protocol helpers (mirrors volcengine-client.ts) ──────────────────

const P = {
  VERSION: 0x01,
  HEADER_SIZE: 0x01,
  MSG_FULL_CLIENT_REQUEST: 0x01,
  MSG_AUDIO_ONLY_REQUEST:  0x02,
  MSG_FULL_SERVER_RESPONSE: 0x09,
  MSG_SERVER_ACK:  0x0b,
  MSG_SERVER_ERROR: 0x0f,
  FLAG_POS_SEQUENCE: 0x01,
  FLAG_NEG_SEQUENCE: 0x03,
  SERIAL_JSON: 0x01,
  COMPRESS_GZIP: 0x01,
  COMPRESS_NONE: 0x00,
};

function buildHeader(type, flags, serial, compress) {
  const h = Buffer.alloc(4);
  h[0] = (P.VERSION << 4) | P.HEADER_SIZE;
  h[1] = (type << 4)    | flags;
  h[2] = (serial << 4)  | compress;
  h[3] = 0x00;
  return h;
}
function i32(n) { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; }
function ri32(buf, off = 0) { return buf.readInt32BE(off); }

function buildInitRequest(data, seq) {
  const payload = gzipSync(Buffer.from(JSON.stringify(data)));
  return Buffer.concat([
    buildHeader(P.MSG_FULL_CLIENT_REQUEST, P.FLAG_POS_SEQUENCE, P.SERIAL_JSON, P.COMPRESS_GZIP),
    i32(seq),
    i32(payload.length),
    payload,
  ]);
}

function buildAudioRequest(audio, seq, isLast) {
  const flag = isLast ? P.FLAG_NEG_SEQUENCE : P.FLAG_POS_SEQUENCE;
  const compressed = gzipSync(audio);
  return Buffer.concat([
    buildHeader(P.MSG_AUDIO_ONLY_REQUEST, flag, P.SERIAL_JSON, P.COMPRESS_GZIP),
    i32(isLast ? -seq : seq),
    i32(compressed.length),
    compressed,
  ]);
}

function parseResponse(buf) {
  if (buf.length < 4) return null;
  const type  = (buf[1] >> 4) & 0x0f;
  const flags = buf[1] & 0x0f;
  const compr = buf[2] & 0x0f;

  if (type === P.MSG_SERVER_ERROR) {
    const code    = ri32(buf, 4);
    const msgSize = ri32(buf, 8);
    let msg = buf.slice(12, 12 + msgSize);
    if (compr === P.COMPRESS_GZIP) msg = gunzipSync(msg);
    return { type: 'error', code, message: msg.toString() };
  }
  if (type === P.MSG_SERVER_ACK) {
    return { type: 'ack', seq: ri32(buf, 4) };
  }
  if (type === P.MSG_FULL_SERVER_RESPONSE) {
    const seq     = ri32(buf, 4);
    const pSize   = ri32(buf, 8);
    let payload   = buf.slice(12, 12 + pSize);
    if (compr === P.COMPRESS_GZIP) payload = gunzipSync(payload);
    try {
      const json   = JSON.parse(payload.toString());
      const isFinal = seq < 0 || flags === P.FLAG_NEG_SEQUENCE;
      const text   = json.result?.text ?? (json.result?.utterances ?? []).map(u => u.text).join('');
      return { type: 'result', seq, isFinal, text, raw: json };
    } catch {
      return { type: 'parse_error', payload: payload.toString() };
    }
  }
  return { type: 'unknown', msgType: type };
}

// ── 0.5 s of PCM-16 silence (16 kHz mono) ──────────────────────────────────

const SILENCE_SAMPLES = 16000 * 0.5;  // 8 000 samples
const silence = Buffer.alloc(SILENCE_SAMPLES * 2, 0);  // Int16, 2 bytes each

// ── Main test ────────────────────────────────────────────────────────────────

async function runTest() {
  const { default: WebSocket } = await import('ws').catch(() => {
    console.error('❌  "ws" package not found.  cd into project and run: npm install');
    process.exit(1);
  });

  return new Promise((resolve, reject) => {
    const connectId = randomUUID();
    let seq = 1;
    const steps = [];
    let resolved = false;

    function done(ok, msg) {
      if (resolved) return;
      resolved = true;
      if (ok) {
        console.log('\n✅  All steps passed.\n');
        steps.forEach(s => console.log('   ', s));
        resolve();
      } else {
        console.log('\n❌  Test failed:', msg);
        steps.forEach(s => console.log('   ', s));
        reject(new Error(msg));
      }
    }

    const ws = new WebSocket(ENDPOINT, {
      headers: {
        'X-Api-App-Key':    APP_ID,
        'X-Api-Access-Key': ACCESS_TOKEN,
        'X-Api-Resource-Id': RESOURCE_ID,
        'X-Api-Connect-Id': connectId,
      },
    });

    const timeout = setTimeout(() => done(false, 'Timeout after 15 s'), 15_000);

    ws.on('open', () => {
      steps.push('✔ WebSocket connected');

      const initPayload = {
        user: { uid: 'test-script' },
        audio: { format: 'pcm', sample_rate: 16000, channel: 1, bits: 16, codec: 'raw' },
        request: {
          model_name: 'bigmodel',
          enable_punc: true,
          enable_itn: true,
          show_utterances: true,
          result_type: 'full',
        },
      };
      ws.send(buildInitRequest(initPayload, seq));
      seq = 2;
    });

    ws.on('message', (data) => {
      const resp = parseResponse(data);
      if (!resp) return;

      if (resp.type === 'error') {
        steps.push(`✖ Server error ${resp.code}: ${resp.message}`);
        ws.close();
        clearTimeout(timeout);
        done(false, `Server error: ${resp.message}`);
        return;
      }

      if (resp.type === 'ack') {
        steps.push(`✔ Init request ACK'd (seq ${resp.seq})`);

        // Send 0.5 s of silence then finish
        ws.send(buildAudioRequest(silence, seq, false));
        seq++;
        ws.send(buildAudioRequest(Buffer.alloc(0), seq, true));
        return;
      }

      if (resp.type === 'result') {
        steps.push(`✔ Result received — isFinal:${resp.isFinal} text:"${resp.text}"`);
        if (resp.isFinal) {
          ws.close();
          clearTimeout(timeout);
          done(true);
        }
        return;
      }

      steps.push(`ℹ Unknown response type: ${resp.type}`);
    });

    ws.on('unexpected-response', (_req, res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        clearTimeout(timeout);
        done(false, `HTTP ${res.statusCode}: ${body}`);
      });
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      done(false, `WebSocket error: ${err.message}`);
    });

    ws.on('close', (code, reason) => {
      if (!resolved) {
        clearTimeout(timeout);
        done(false, `Closed unexpectedly: ${code} ${reason}`);
      }
    });
  });
}

runTest().catch(e => {
  console.error(e.message);
  process.exit(1);
});
