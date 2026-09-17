'use strict';
/**
 * Operacoes administrativas no Firebase, sem o pacote firebase-admin.
 *
 * O firebase-admin traz dezenas de megabytes de dependencia para uma Lambda que
 * precisa de uma unica chamada HTTP. Aqui a service account do SSM assina um JWT
 * localmente com node:crypto, troca por access token e chama a API direto - o
 * mesmo caminho que o PimBer usa, so que sem o `jose`, porque os Lambdas do
 * FutPlay sobem sem node_modules.
 *
 * Existe por causa da regra dos 90 dias: a cascata limpa DynamoDB e S3, mas sem
 * isto a conta continuava viva no Firebase. O usuario voltava, logava com o
 * MESMO uid e encontrava um app vazio, sem entender por que.
 */

const { createSign } = require('node:crypto');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const ssm = new SSMClient({});
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';
const ESCOPO = 'https://www.googleapis.com/auth/identitytoolkit';

const PARAM = process.env.FIREBASE_SERVICE_ACCOUNT_PARAM
  || '/cadepelada/prod/firebase_service_account';

let contaCache;
let contaPromise;

/** A service account pode vir inline (teste local) ou do SSM (producao). */
async function carregarConta() {
  if (contaCache !== undefined) return contaCache;

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    try {
      contaCache = JSON.parse(inline);
      return contaCache;
    } catch {
      contaCache = null;
      return null;
    }
  }

  if (!contaPromise) {
    contaPromise = ssm
      .send(new GetParameterCommand({ Name: PARAM, WithDecryption: true }))
      .then((r) => {
        const v = r.Parameter?.Value;
        contaCache = v ? JSON.parse(v) : null;
        return contaCache;
      })
      .catch((e) => {
        console.error('firebase_admin_ssm_falhou', e.message);
        contaCache = null;
        return null;
      })
      .finally(() => { contaPromise = undefined; });
  }
  return contaPromise;
}

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

let tokenCache = { valor: null, expiraEm: 0 };

async function accessToken() {
  if (tokenCache.valor && tokenCache.expiraEm > Date.now() + 60_000) return tokenCache.valor;

  const conta = await carregarConta();
  if (!conta?.client_email || !conta?.private_key) return null;

  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64url({ alg: 'RS256', typ: 'JWT' });
  const corpo = b64url({
    iss: conta.client_email,
    scope: ESCOPO,
    aud: TOKEN_URL,
    iat: agora,
    exp: agora + 3600,
  });

  const assinador = createSign('RSA-SHA256');
  assinador.update(`${cabecalho}.${corpo}`);
  assinador.end();
  const assinatura = assinador.sign(conta.private_key).toString('base64url');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecalho}.${corpo}.${assinatura}`,
    }),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    console.error('firebase_admin_token_falhou', res.status, j.error_description ?? j.error);
    return null;
  }

  tokenCache = { valor: j.access_token, expiraEm: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tokenCache.valor;
}

function projectId() {
  return process.env.FIREBASE_PROJECT_ID || contaCache?.project_id || null;
}

/**
 * Remove a conta do Firebase Authentication.
 *
 * @returns {Promise<'apagada'|'inexistente'|'indisponivel'|'falhou'>}
 *   Nunca lanca: a cascata precisa terminar de limpar DynamoDB e S3 mesmo que
 *   esta parte falhe. O resultado vai para o log para ser reprocessado depois.
 */
async function apagarConta(uid) {
  if (!uid) return 'falhou';

  const token = await accessToken();
  if (!token) return 'indisponivel';

  const pid = projectId();
  if (!pid) return 'indisponivel';

  try {
    const res = await fetch(`${IDENTITY}/projects/${encodeURIComponent(pid)}/accounts:delete`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ localId: uid }),
    });

    if (res.ok) return 'apagada';

    const texto = await res.text();
    // USER_NOT_FOUND significa que a conta ja nao existe - o objetivo foi
    // atingido, so que por outro caminho. Tratar como erro faria a cascata
    // parecer quebrada em toda reexecucao do stream.
    if (res.status === 400 && texto.includes('USER_NOT_FOUND')) return 'inexistente';

    console.error('firebase_admin_delete_falhou', uid, res.status, texto.slice(0, 200));
    return 'falhou';
  } catch (e) {
    console.error('firebase_admin_delete_erro', uid, e.message);
    return 'falhou';
  }
}

module.exports = { apagarConta, accessToken, projectId };
