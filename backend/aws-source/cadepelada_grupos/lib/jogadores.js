'use strict';
/**
 * Acesso a CadePelada-Jogadores.
 *
 * A chave e o UID do Firebase. Antes era um id gerado (randomUUID sem hifens) e
 * a tabela auth_identity traduzia "google#<sub>" nesse id; com o UID como chave
 * a traducao deixa de existir, e com ela o caminho em que um mesmo usuario
 * acabava com dois jogadores - o codigo antigo tinha um fallback por e-mail
 * justamente para remendar isso.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { TABELAS } = require('./chaves');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * Janela de inatividade antes da conta expirar, em segundos.
 *
 * O TTL do DynamoDB apaga o item quando `expires_at` passa, e a remocao dispara
 * o stream que roda a cascata. Cada login empurra a data para frente, entao a
 * conta so expira depois de 90 dias sem ninguem entrar.
 *
 * Era 30 dias no codigo anterior.
 */
const DIAS_ATE_EXPIRAR = Number(process.env.DIAS_ATE_EXPIRAR || 90);
const JANELA_SEGUNDOS = DIAS_ATE_EXPIRAR * 24 * 60 * 60;

const agoraEpoch = () => Math.floor(Date.now() / 1000);
const proximaExpiracao = () => agoraEpoch() + JANELA_SEGUNDOS;

const normalizarEmail = (v) => String(v ?? '').trim().toLowerCase();

/** Sem acento, sem caixa: e a forma que vai para o GSI busca-index. */
const nomeBusca = (nome) =>
  String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/**
 * Particao do busca-index: primeira letra do nome JA normalizado.
 *
 * Tem que ser do normalizado, nao do original. Tirando do original, "Acaro"
 * cairia no bucket "a" e "Acaro" com acento no bucket "a" acentuado - dois
 * baldes diferentes para nomes que o usuario digita igual, e a busca por "a"
 * nunca encontraria o segundo.
 */
function bucketBusca(nome) {
  const n = nomeBusca(nome);
  return n ? n[0] : '#';
}

async function obterPorUid(uid) {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABELAS.JOGADORES,
    Key: { uid: String(uid) },
  }));
  return Item ?? null;
}

/**
 * Cria o jogador na primeira entrada, ou so renova a expiracao e atualiza o que
 * vem do provedor. Devolve { jogador, novoCadastro }.
 */
async function garantirJogador({ uid, email, nome, foto }) {
  if (!uid) throw new Error('uid obrigatorio');

  const existente = await obterPorUid(uid);
  const agoraIso = new Date().toISOString();

  if (existente) {
    // O e-mail so entra no SET quando existe. Gravar '' explodiria com
    // ValidationException, porque email e chave do email-index e o DynamoDB
    // recusa string vazia em chave de indice - e isso aconteceria em TODO login
    // de usuario sem e-mail, nao num caso raro.
    const emailNovo = normalizarEmail(email) || existente.email || '';
    const sets = ['expires_at = :exp', 'ultimo_login_em = :ago'];
    const valores = { ':exp': proximaExpiracao(), ':ago': agoraIso };
    if (emailNovo) {
      sets.push('email = :email');
      valores[':email'] = emailNovo;
    }

    const { Attributes } = await ddb.send(new UpdateCommand({
      TableName: TABELAS.JOGADORES,
      Key: { uid: String(uid) },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeValues: valores,
      ReturnValues: 'ALL_NEW',
    }));
    return { jogador: Attributes, novoCadastro: false };
  }

  const nomeLimpo = String(nome ?? '').trim();
  const emailLimpo = normalizarEmail(email);
  const jogador = {
    uid: String(uid),
    // Omitido quando vazio: o DynamoDB recusa string vazia como chave do
    // email-index. Um usuario do Firebase pode nao ter e-mail, e gravar ''
    // faria o cadastro inteiro falhar com ValidationException.
    ...(emailLimpo ? { email: emailLimpo } : {}),
    nome: nomeLimpo,
    imagem: String(foto ?? ''),
    nome_busca: nomeBusca(nomeLimpo),
    search_bucket: bucketBusca(nomeLimpo),
    criado_em: agoraIso,
    ultimo_login_em: agoraIso,
    expires_at: proximaExpiracao(),
  };

  // Se dois requests do mesmo usuario chegarem juntos - o app chama /auth/sessao
  // no login e o splash pode repetir - sem esta condicao o segundo sobrescreve o
  // primeiro e zera o que ja tinha sido preenchido.
  try {
    await ddb.send(new PutCommand({
      TableName: TABELAS.JOGADORES,
      Item: jogador,
      ConditionExpression: 'attribute_not_exists(#u)',
      ExpressionAttributeNames: { '#u': 'uid' },
    }));
    return { jogador, novoCadastro: true };
  } catch (erro) {
    if (erro?.name !== 'ConditionalCheckFailedException') throw erro;
    return { jogador: await obterPorUid(uid), novoCadastro: false };
  }
}

module.exports = {
  ddb,
  DIAS_ATE_EXPIRAR,
  proximaExpiracao,
  obterPorUid,
  garantirJogador,
  nomeBusca,
  bucketBusca,
  normalizarEmail,
};
