'use strict';
/**
 * Authorizer do API Gateway (formato simples, isAuthorized).
 *
 * Antes: validava um JWT HS256 emitido pelo proprio backend, com o segredo no
 * SSM. Isso exigia o par /auth/google -> signAppJwt e a tabela auth_identity
 * para traduzir a identidade do Google no id interno do jogador.
 *
 * Agora: valida o Firebase ID Token direto. O UID do Firebase ja e a chave de
 * CadePelada-Jogadores, entao nao ha o que traduzir, nao ha segredo proprio para
 * guardar e girar, e o app nao precisa mais de dois tokens (um do Google e um
 * nosso) - o SDK do Firebase renova sozinho.
 *
 * actorId continua sendo o nome do campo no contexto, para nao quebrar os
 * Lambdas de uma vez so; o valor e que passou a ser o UID.
 */

const { verificarIdToken, tokenDoEvento } = require('../lib/firebaseAuth');

const NEGADO = { isAuthorized: false };

exports.handler = async (event) => {
  try {
    const token = tokenDoEvento(event);
    if (!token) return NEGADO;

    const usuario = await verificarIdToken(token);
    if (!usuario) return NEGADO;

    return {
      isAuthorized: true,
      // O contexto do authorizer so aceita valores string. nome e foto vao
      // junto para /auth/sessao poder criar o jogador sem uma segunda ida ao
      // Firebase - sao os unicos dados de perfil que o ID token carrega.
      context: {
        actorId: usuario.uid,
        uid: usuario.uid,
        email: usuario.email || '',
        nome: usuario.nome || '',
        foto: usuario.foto || '',
        emailVerificado: String(usuario.emailVerificado),
      },
    };
  } catch (erro) {
    // Falha ao buscar o JWKS cai aqui. Negar seria deslogar todo mundo por uma
    // intermitencia de rede, mas o authorizer simples nao tem como devolver 5xx
    // - entao pelo menos registra distinguindo de token invalido.
    console.error('authorizer_erro_infra', erro);
    return NEGADO;
  }
};
