'use strict';
/**
 * Verificacao de Firebase ID Token sem dependencia externa.
 *
 * O PimBer faz o mesmo usando `jose`, mas os Lambdas do FutPlay sao publicados
 * sem node_modules - so tem o que o runtime da AWS oferece. Entao a verificacao
 * e feita com node:crypto direto a partir do JWKS publico do Google.
 *
 * Um Firebase ID Token e um JWT RS256 com:
 *   iss = https://securetoken.google.com/<projectId>
 *   aud = <projectId>
 *   sub = UID do usuario   <- e isso que vira a chave de CadePelada-Jogadores
 *
 * Substitui o par (app JWT HS256 + tabela auth_identity) que existia antes: o
 * UID do Firebase ja e estavel e unico por usuario, entao nao ha mais nada para
 * traduzir nem segredo proprio para assinar.
 */

const { createPublicKey, createVerify } = require('node:crypto');

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/** Tolerancia de relogio, em segundos. */
const CLOCK_SKEW = 60;

let cache = { keys: null, expiraEm: 0 };

function projectId() {
  const id = process.env.FIREBASE_PROJECT_ID;
  if (!id) throw new Error('FIREBASE_PROJECT_ID nao definido');
  return id;
}

/**
 * Busca o JWKS do Google respeitando o Cache-Control da resposta. As chaves
 * giram a cada poucas horas; refazer o fetch a cada chamada custaria uma ida a
 * rede em todo request autenticado.
 */
async function obterChaves() {
  const agora = Date.now();
  if (cache.keys && cache.expiraEm > agora) return cache.keys;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
  const corpo = await res.json();

  const cc = res.headers.get('cache-control') || '';
  const m = /max-age=(\d+)/.exec(cc);
  const ttl = m ? Number(m[1]) * 1000 : 60 * 60 * 1000;

  const keys = new Map();
  for (const jwk of corpo.keys || []) {
    keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
  }
  cache = { keys, expiraEm: agora + ttl };
  return keys;
}

function decodeSegment(seg) {
  return JSON.parse(Buffer.from(String(seg), 'base64url').toString('utf8'));
}

/**
 * @returns {Promise<{uid:string,email:string|null,nome:string|null,foto:string|null,emailVerificado:boolean}|null>}
 *          null quando o token e invalido - quem chama decide o que responder.
 */
async function verificarIdToken(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) return null;

  let cabecalho;
  let payload;
  try {
    cabecalho = decodeSegment(partes[0]);
    payload = decodeSegment(partes[1]);
  } catch {
    return null;
  }

  if (cabecalho.alg !== 'RS256' || !cabecalho.kid) return null;

  const pid = projectId();
  if (payload.iss !== `https://securetoken.google.com/${pid}`) return null;
  if (payload.aud !== pid) return null;

  const agora = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= agora - CLOCK_SKEW) return null;
  if (typeof payload.iat !== 'number' || payload.iat > agora + CLOCK_SKEW) return null;
  if (typeof payload.sub !== 'string' || !payload.sub.trim()) return null;

  let chaves;
  try {
    chaves = await obterChaves();
  } catch (e) {
    // Falha de rede no JWKS nao pode virar "token invalido": isso deslogaria
    // todo mundo silenciosamente. Propaga para virar 5xx e o app repetir.
    throw e;
  }

  const chave = chaves.get(cabecalho.kid);
  if (!chave) return null;

  const verificador = createVerify('RSA-SHA256');
  verificador.update(`${partes[0]}.${partes[1]}`);
  verificador.end();
  if (!verificador.verify(chave, Buffer.from(partes[2], 'base64url'))) return null;

  return {
    uid: payload.sub,
    email: payload.email ?? null,
    nome: payload.name ?? null,
    foto: payload.picture ?? null,
    emailVerificado: Boolean(payload.email_verified),
  };
}

/** Extrai o token do header Authorization de um evento do API Gateway. */
function tokenDoEvento(event) {
  const h = event?.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const [esquema, token] = String(auth).split(' ');
  return esquema?.toLowerCase() === 'bearer' ? (token || '').trim() : '';
}

module.exports = { verificarIdToken, tokenDoEvento };
