'use strict';
/**
 * POST /auth/sessao
 *
 * Substitui POST /auth/google e POST /auth/android-id.
 *
 * Nao recebe corpo: o Firebase ID Token vem no Authorization e o authorizer ja
 * o validou, deixando o UID em requestContext.authorizer.lambda.actorId. Antes o
 * app mandava o idToken do Google no corpo e o backend validava de novo - duas
 * fontes de identidade no mesmo request, e foi ai que nasceu o bug do R8 que
 * derrubou as versoes 102 e 103 (o campo idToken era renomeado e o backend
 * respondia "idToken is required").
 *
 * Tambem nao emite token: o app usa o do Firebase direto. O signAppJwt, o
 * segredo no SSM e a tabela auth_identity sairam com isso.
 */

const { garantirJogador } = require('../lib/jogadores');

const json = (statusCode, corpo) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(corpo),
});

/** Claims que o authorizer anexou ao request. */
function identidade(event) {
  const ctx = event?.requestContext?.authorizer?.lambda
    ?? event?.requestContext?.authorizer
    ?? {};
  const uid = String(ctx.uid || ctx.actorId || '').trim();
  if (!uid) return null;
  return {
    uid,
    email: ctx.email || '',
    nome: ctx.nome || '',
    foto: ctx.foto || '',
  };
}

exports.handler = async (event) => {
  const quem = identidade(event);
  if (!quem) return json(401, { message: 'nao autenticado' });

  try {
    const { jogador, novoCadastro } = await garantirJogador({
      uid: quem.uid,
      email: quem.email,
      // nome e foto so existem no ID token; quando ausentes o jogador nasce sem
      // eles e a propria tela de perfil preenche.
      nome: quem.nome,
      foto: quem.foto,
    });

    // Duas grafias de proposito: o app Android le `novoCadastro` (Autenticacao.kt)
    // e o site le `novo_cadastro` (api.ts), que e a convencao do resto da API.
    // Remover a camelCase quebraria todo aplicativo ja instalado.
    return json(200, { jogador, novoCadastro, novo_cadastro: novoCadastro });
  } catch (erro) {
    console.error('sessao_falhou', quem.uid, erro);
    return json(500, { message: 'falha ao sincronizar sessao' });
  }
};
