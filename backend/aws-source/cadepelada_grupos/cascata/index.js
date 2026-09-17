'use strict';
/**
 * Exclusao em cascata dos dados de um jogador.
 *
 * Por que existe: a exclusao por TTL do DynamoDB NAO executa codigo da
 * aplicacao. Sem este consumidor de stream, toda conta que expira deixa para
 * tras os grupos que criou, vinculos, mensagens, midia e objetos no S3 - os
 * orfaos que apareciam na lista publica de grupos.
 *
 * Reage a REMOVE em CadePelada-Jogadores, seja por TTL (userIdentity.principalId
 * = dynamodb.amazonaws.com, depois de 90 dias sem login) ou por exclusao
 * explicita de conta.
 *
 * Duas diferencas em relacao a versao anterior:
 *
 * 1. Sem Scan. A versao antiga varria grupos_pelada, jogador_grupo e
 *    player_social_edges com FilterExpression porque nao havia indice. Aqui todo
 *    caminho e Query - a politica IAM nova nem concede Scan, entao um retorno a
 *    esse padrao falha alto em vez de ficar caro em silencio.
 *
 * 2. Apaga mensagens de chat. A versao antiga nao cobria nenhum dos cinco chats;
 *    quem expirava deixava as mensagens para sempre. O GSI autor-index existe
 *    para isso.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient, QueryCommand, BatchWriteCommand, DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { S3Client, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { TABELAS, arestaSeguidores } = require('../lib/chaves');
const { apagarConta } = require('../lib/firebaseAdmin');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});

const BUCKET = process.env.IMAGE_BUCKET || 'cadepelada';
const PREFIXO_PERFIL = process.env.IMAGE_BASE_PATH || 'images/profile/';

/** Percorre uma Query paginada sem carregar tudo na memoria. */
async function* paginar(params) {
  let ExclusiveStartKey;
  do {
    const r = await ddb.send(new QueryCommand({ ...params, ExclusiveStartKey }));
    for (const item of r.Items ?? []) yield item;
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

/**
 * BatchWrite aceita 25 por vez e pode devolver itens nao processados quando a
 * tabela estrangula. Reenviar os UnprocessedItems e obrigatorio: ignorar deixa
 * exatamente os orfaos que esta funcao existe para evitar.
 */
async function apagarEmLote(tabela, chaves) {
  let total = 0;
  for (let i = 0; i < chaves.length; i += 25) {
    let pendentes = {
      [tabela]: chaves.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })),
    };
    for (let tentativa = 0; tentativa < 5 && pendentes[tabela]?.length; tentativa++) {
      const enviados = pendentes[tabela].length;
      const r = await ddb.send(new BatchWriteCommand({ RequestItems: pendentes }));
      pendentes = r.UnprocessedItems ?? {};
      total += enviados - (pendentes[tabela]?.length ?? 0);
      if (pendentes[tabela]?.length) {
        await new Promise((ok) => setTimeout(ok, 100 * 2 ** tentativa));
      }
    }
    if (pendentes[tabela]?.length) {
      console.error('cascata_lote_incompleto', tabela, pendentes[tabela].length);
    }
  }
  return total;
}

/** Itens de uma Query reduzidos as chaves primarias, para apagar em lote. */
async function coletarChaves(params, montarChave) {
  const chaves = [];
  for await (const item of paginar(params)) chaves.push(montarChave(item));
  return chaves;
}

/* --------------------------- o que o jogador possui ----------------------- */

async function apagarGruposCriados(uid) {
  const chaves = await coletarChaves({
    TableName: TABELAS.GRUPOS,
    IndexName: 'criador-index',
    KeyConditionExpression: 'uid_criador = :u',
    ExpressionAttributeValues: { ':u': uid },
    ProjectionExpression: 'id',
  }, (g) => ({ id: g.id }));
  return apagarEmLote(TABELAS.GRUPOS, chaves);
}

async function apagarClubesProprios(uid) {
  const chaves = await coletarChaves({
    TableName: TABELAS.CLUBES,
    IndexName: 'dono-index',
    KeyConditionExpression: 'uid_dono = :u',
    ExpressionAttributeValues: { ':u': uid },
    ProjectionExpression: 'id',
  }, (c) => ({ id: c.id }));
  return apagarEmLote(TABELAS.CLUBES, chaves);
}

async function apagarCompeticoesCriadas(uid) {
  const chaves = await coletarChaves({
    TableName: TABELAS.COMPETICOES,
    IndexName: 'criador-index',
    KeyConditionExpression: 'uid_criador = :u',
    ExpressionAttributeValues: { ':u': uid },
    ProjectionExpression: 'id',
  }, (c) => ({ id: c.id }));
  return apagarEmLote(TABELAS.COMPETICOES, chaves);
}

/** Vinculos com grupos, clubes e competicoes - uma tabela so agora. */
async function apagarVinculos(uid) {
  const chaves = await coletarChaves({
    TableName: TABELAS.MEMBROS,
    IndexName: 'uid-index',
    KeyConditionExpression: '#u = :u',
    ExpressionAttributeNames: { '#u': 'uid' },
    ExpressionAttributeValues: { ':u': uid },
    ProjectionExpression: 'contexto_id, #u',
  }, (m) => ({ contexto_id: m.contexto_id, uid: m.uid }));
  return apagarEmLote(TABELAS.MEMBROS, chaves);
}

/**
 * Historico, midia e arestas sociais que o jogador criou (PK = uid), mais as
 * arestas que APONTAM para ele. Sem a segunda parte, quem seguia o jogador
 * apagado ficaria com um seguido inexistente na lista.
 */
async function apagarDadosDoJogador(uid) {
  // Uma passada so: a mesma Query devolve a chave para apagar e o object_key do
  // arquivo no S3. Varrer duas vezes dobraria a leitura sem ganho nenhum.
  // "item" e palavra reservada no DynamoDB, dai o alias #i.
  const proprias = [];
  const objetos = [];
  for await (const d of paginar({
    TableName: TABELAS.JOGADOR_DADOS,
    KeyConditionExpression: '#u = :u',
    ExpressionAttributeNames: { '#u': 'uid', '#i': 'item' },
    ExpressionAttributeValues: { ':u': uid },
    ProjectionExpression: '#u, #i, object_key',
  })) {
    proprias.push({ uid: d.uid, item: d.item });
    if (d.object_key) objetos.push({ Key: String(d.object_key) });
  }

  const apontando = await coletarChaves({
    TableName: TABELAS.JOGADOR_DADOS,
    IndexName: 'aresta-index',
    KeyConditionExpression: 'aresta = :a',
    ExpressionAttributeValues: { ':a': arestaSeguidores(uid) },
    ProjectionExpression: '#u, #i',
    ExpressionAttributeNames: { '#u': 'uid', '#i': 'item' },
  }, (d) => ({ uid: d.uid, item: d.item }));

  const linhas = await apagarEmLote(TABELAS.JOGADOR_DADOS, [...proprias, ...apontando]);
  return { linhas, objetos };
}

/** Mensagens escritas pelo jogador, nas cinco conversas que hoje sao uma tabela. */
async function apagarMensagens(uid) {
  const chaves = await coletarChaves({
    TableName: TABELAS.MENSAGENS,
    IndexName: 'autor-index',
    KeyConditionExpression: 'uid_autor = :u',
    ExpressionAttributeValues: { ':u': uid },
    ProjectionExpression: 'conversa_id, criado_em',
  }, (m) => ({ conversa_id: m.conversa_id, criado_em: m.criado_em }));
  return apagarEmLote(TABELAS.MENSAGENS, chaves);
}

async function apagarObjetosS3(objetos) {
  if (!objetos.length) return 0;
  let total = 0;
  for (let i = 0; i < objetos.length; i += 1000) {
    const lote = objetos.slice(i, i + 1000);
    try {
      const r = await s3.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: lote, Quiet: true },
      }));
      total += lote.length - (r.Errors?.length ?? 0);
      for (const e of r.Errors ?? []) console.error('s3_delete_falhou', e.Key, e.Message);
    } catch (e) {
      console.error('s3_lote_falhou', e.message);
    }
  }
  return total;
}

/* --------------------------------- handler -------------------------------- */

exports.handler = async (event) => {
  const resumo = [];

  for (const rec of event.Records ?? []) {
    if (rec.eventName !== 'REMOVE') continue;

    const uid = rec.dynamodb?.OldImage?.uid?.S;
    if (!uid) continue;

    const porTTL = rec.userIdentity?.principalId === 'dynamodb.amazonaws.com';

    try {
      const grupos = await apagarGruposCriados(uid);
      const clubes = await apagarClubesProprios(uid);
      const competicoes = await apagarCompeticoesCriadas(uid);
      const vinculos = await apagarVinculos(uid);
      const dados = await apagarDadosDoJogador(uid);
      const mensagens = await apagarMensagens(uid);

      const objetos = await apagarObjetosS3([
        ...dados.objetos,
        { Key: `${PREFIXO_PERFIL}${uid}.jpg` },
      ]);

      // Por ultimo, de proposito. Se a conta sumisse do Firebase antes, o
      // usuario conseguiria criar sessao no meio da limpeza e os dados novos
      // seriam apagados junto com os velhos.
      const contaFirebase = await apagarConta(uid);

      const linha = {
        uid,
        origem: porTTL ? 'ttl_90_dias' : 'exclusao_explicita',
        grupos, clubes, competicoes, vinculos,
        dados: dados.linhas, mensagens, objetos_s3: objetos,
        conta_firebase: contaFirebase,
      };
      console.log('cascata_concluida', JSON.stringify(linha));
      resumo.push(linha);
    } catch (erro) {
      // Nao relancar: um registro que falha nao pode travar o lote inteiro do
      // stream, senao o Lambda reprocessa tudo em loop ate o registro expirar.
      console.error('cascata_falhou', uid, erro);
      resumo.push({ uid, erro: erro.message });
    }
  }

  return { processados: resumo.length, resumo };
};
