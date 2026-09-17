'use strict';
/**
 * cadepelada_grupos - grupos de pelada e seus membros.
 *
 * Substitui lambida_grupos (1.951 linhas). O chat sai daqui para
 * cadepelada_mensagens: ele existia duplicado dentro de quatro Lambdas, cada uma
 * com sua versao de "enviar mensagem".
 *
 * Quem pode o que vem sempre da tabela Membros, nunca de um campo no proprio
 * grupo: `admin` como string separada por virgula, que era o modelo antigo, nao
 * da para consultar ao contrario - saber "de quais grupos sou admin" exigiria
 * varrer todos os grupos.
 */

const {
  GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchGetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');

const { TABELAS, contextoGrupo, lerContexto } = require('../lib/chaves');
const { ddb, proximaExpiracao } = require('../lib/jogadores');
const { grupoParaResposta, camposEditaveisGrupo, jogadorParaResposta } = require('../lib/mapeadores');
const { buscarPorCidade } = require('../lib/cidades');

const json = (statusCode, corpo) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: corpo === undefined ? '' : JSON.stringify(corpo),
});

const NAO_ENCONTRADO = json(404, { message: 'grupo nao encontrado' });
const SEM_PERMISSAO = json(403, { message: 'sem permissao' });

function identidade(event) {
  const ctx = event?.requestContext?.authorizer?.lambda
    ?? event?.requestContext?.authorizer ?? {};
  return String(ctx.uid || ctx.actorId || '').trim() || null;
}

const agora = () => new Date().toISOString();

/* -------------------------------- membros --------------------------------- */

async function obterGrupo(id) {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABELAS.GRUPOS, Key: { id },
  }));
  return Item ?? null;
}

async function papelNoGrupo(grupoId, uid) {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABELAS.MEMBROS,
    Key: { contexto_id: contextoGrupo(grupoId), uid },
  }));
  return Item?.papel ?? null;
}

const ehAdmin = (papel) => papel === 'dono' || papel === 'admin';

/**
 * Todos os membros, em todas as paginas.
 *
 * O app pede a lista inteira de uma vez e nao manda cursor nenhum. Parar na
 * primeira pagina truncaria silenciosamente um grupo grande - o jogador 51
 * simplesmente nao apareceria na convocacao, sem erro em lugar nenhum.
 */
async function listarMembros(grupoId) {
  const itens = [];
  let cursor;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABELAS.MEMBROS,
      KeyConditionExpression: 'contexto_id = :c',
      ExpressionAttributeValues: { ':c': contextoGrupo(grupoId) },
      ExclusiveStartKey: cursor,
    }));
    itens.push(...(r.Items ?? []));
    cursor = r.LastEvaluatedKey;
  } while (cursor);
  return { itens };
}

/** Hidrata uids com os perfis, num BatchGet em vez de um Get por membro. */
async function carregarPerfis(uids) {
  const unicos = [...new Set(uids)].filter(Boolean);
  if (!unicos.length) return new Map();
  const mapa = new Map();
  for (let i = 0; i < unicos.length; i += 100) {
    const r = await ddb.send(new BatchGetCommand({
      RequestItems: { [TABELAS.JOGADORES]: { Keys: unicos.slice(i, i + 100).map((uid) => ({ uid })) } },
    }));
    for (const it of r.Responses?.[TABELAS.JOGADORES] ?? []) mapa.set(it.uid, it);
  }
  return mapa;
}

async function contarMembros(grupoId) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.MEMBROS,
    KeyConditionExpression: 'contexto_id = :c',
    ExpressionAttributeValues: { ':c': contextoGrupo(grupoId) },
    Select: 'COUNT',
  }));
  return r.Count ?? 0;
}

/* --------------------------------- rotas ---------------------------------- */

async function verGrupo(ator, id) {
  const grupo = await obterGrupo(id);
  if (!grupo) return NAO_ENCONTRADO;

  const [{ itens }, papel] = await Promise.all([
    listarMembros(id),
    papelNoGrupo(id, ator),
  ]);
  const ativos = itens.filter((m) => m.papel !== 'pendente');

  return json(200, grupoParaResposta(grupo, {
    inscritos: ativos.length,
    participantes: ativos.map((m) => m.uid).join(','),
    admins: ativos.filter((m) => ehAdmin(m.papel)).map((m) => m.uid).join(','),
    pedidoPendente: papel === 'pendente',
  }));
}

/** Grupos do jogador: Query no uid-index, nunca varredura da tabela de grupos. */
async function meusGrupos(ator) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.MEMBROS,
    IndexName: 'uid-index',
    KeyConditionExpression: '#u = :u',
    ExpressionAttributeNames: { '#u': 'uid' },
    ExpressionAttributeValues: { ':u': ator },
  }));

  const ids = (r.Items ?? [])
    .filter((m) => m.papel !== 'pendente')
    .map((m) => lerContexto(m.contexto_id))
    .filter((c) => c?.tipo === 'grupo')
    .map((c) => c.id);

  if (!ids.length) return json(200, []);

  const lote = await ddb.send(new BatchGetCommand({
    RequestItems: { [TABELAS.GRUPOS]: { Keys: ids.map((id) => ({ id })) } },
  }));
  const grupos = lote.Responses?.[TABELAS.GRUPOS] ?? [];

  // A lista devolvia inscritos "0" e participantes "" para todo grupo, porque
  // chamava o mapeador sem extras - o mesmo JSON de GET /grupo/{id}, so que com
  // o miolo vazio. Quem conta membro pela lista (AtividadeListaGrupos, Peladas.vue)
  // mostrava zero. Uma Query por grupo, em paralelo, fecha a diferenca.
  const porGrupo = new Map(await Promise.all(grupos.map(async (g) => {
    const { itens } = await listarMembros(g.id);
    const ativos = itens.filter((m) => m.papel !== 'pendente');
    return [g.id, {
      inscritos: ativos.length,
      participantes: ativos.map((m) => m.uid).join(','),
      admins: ativos.filter((m) => ehAdmin(m.papel)).map((m) => m.uid).join(','),
    }];
  })));

  return json(200, grupos.map((g) => grupoParaResposta(g, porGrupo.get(g.id))));
}

/** Busca publica por cidade, para a tela de explorar. */
async function porCidade(cidade, limite) {
  // Tolerante a grafia: o app manda a cidade em minusculas e o banco guarda
  // na forma de exibicao. Ver lib/cidades.js.
  const itens = await buscarPorCidade(cidade, async (grafia) => {
    const r = await ddb.send(new QueryCommand({
      TableName: TABELAS.GRUPOS,
      IndexName: 'cidade-index',
      KeyConditionExpression: 'cidade = :c',
      ExpressionAttributeValues: { ':c': grafia },
      Limit: limite,
    }));
    return r.Items ?? [];
  });
  return json(200, itens.slice(0, limite).map((g) => grupoParaResposta(g)));
}

async function criarGrupo(ator, corpo) {
  const nome = String(corpo?.nome ?? '').trim();
  if (!nome) return json(400, { message: 'nome obrigatorio' });

  const id = String(corpo?.id ?? '').trim() || randomUUID().replace(/-/g, '');
  const grupo = {
    id,
    nome,
    uid_criador: ator,
    criado_em: agora(),
    expires_at: proximaExpiracao(),
    ...camposEditaveisGrupo(corpo),
  };

  // Sem a condicao, recriar com o mesmo id sobrescreveria um grupo existente -
  // inclusive de outro dono.
  try {
    await ddb.send(new PutCommand({
      TableName: TABELAS.GRUPOS,
      Item: grupo,
      ConditionExpression: 'attribute_not_exists(id)',
    }));
  } catch (e) {
    if (e?.name === 'ConditionalCheckFailedException') {
      return json(409, { message: 'ja existe grupo com esse id' });
    }
    throw e;
  }

  await ddb.send(new PutCommand({
    TableName: TABELAS.MEMBROS,
    Item: {
      contexto_id: contextoGrupo(id), uid: ator,
      papel: 'dono', entrou_em: agora(), expires_at: proximaExpiracao(),
    },
  }));

  return json(201, grupoParaResposta(grupo, { inscritos: 1, participantes: ator }));
}

async function atualizarGrupo(ator, id, corpo) {
  if (!ehAdmin(await papelNoGrupo(id, ator))) return SEM_PERMISSAO;

  const campos = camposEditaveisGrupo(corpo);
  if (!Object.keys(campos).length) return json(400, { message: 'nada para atualizar' });

  const nomes = { '#chave': 'id' }; const valores = {}; const sets = [];
  for (const [k, v] of Object.entries(campos)) {
    nomes[`#${k}`] = k; valores[`:${k}`] = v; sets.push(`#${k} = :${k}`);
  }

  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: TABELAS.GRUPOS,
    Key: { id },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: nomes,
    ExpressionAttributeValues: valores,
    ConditionExpression: 'attribute_exists(#chave)',
    ReturnValues: 'ALL_NEW',
  }));
  return json(200, grupoParaResposta(Attributes));
}

/**
 * So o dono apaga. Os vinculos saem junto: sem isso, cada membro continuaria
 * "pertencendo" a um grupo inexistente, e a lista de grupos dele mostraria uma
 * entrada morta.
 */
async function apagarGrupo(ator, id) {
  if (await papelNoGrupo(id, ator) !== 'dono') return SEM_PERMISSAO;

  const { itens } = await listarMembros(id);
  for (const m of itens) {
    await ddb.send(new DeleteCommand({
      TableName: TABELAS.MEMBROS,
      Key: { contexto_id: m.contexto_id, uid: m.uid },
    }));
  }
  await ddb.send(new DeleteCommand({ TableName: TABELAS.GRUPOS, Key: { id } }));
  return json(204);
}

/** Entrar, sair, aceitar ou remover - tudo mexe na mesma tabela. */
async function participacao(ator, id, corpo) {
  const acao = String(corpo?.acao ?? '').toLowerCase();
  const alvo = String(corpo?.uid ?? corpo?.jogador_id ?? ator).trim();

  if (!await obterGrupo(id)) return NAO_ENCONTRADO;
  const papelAtor = await papelNoGrupo(id, ator);

  if (acao === 'entrar') {
    // Entrar e sempre para si mesmo: aceitar outra pessoa e "aceitar", e passa
    // pela checagem de admin logo abaixo.
    await ddb.send(new PutCommand({
      TableName: TABELAS.MEMBROS,
      Item: {
        contexto_id: contextoGrupo(id), uid: ator,
        papel: 'membro', entrou_em: agora(), expires_at: proximaExpiracao(),
      },
    }));
    return json(204);
  }

  if (acao === 'sair') {
    if (papelAtor === 'dono') {
      return json(409, { message: 'dono nao sai do grupo; transfira ou apague' });
    }
    await ddb.send(new DeleteCommand({
      TableName: TABELAS.MEMBROS,
      Key: { contexto_id: contextoGrupo(id), uid: ator },
    }));
    return json(204);
  }

  if (acao === 'aceitar' || acao === 'remover' || acao === 'promover') {
    if (!ehAdmin(papelAtor)) return SEM_PERMISSAO;
    if (acao === 'remover') {
      if (await papelNoGrupo(id, alvo) === 'dono') {
        return json(409, { message: 'nao da para remover o dono' });
      }
      await ddb.send(new DeleteCommand({
        TableName: TABELAS.MEMBROS,
        Key: { contexto_id: contextoGrupo(id), uid: alvo },
      }));
      return json(204);
    }
    await ddb.send(new UpdateCommand({
      TableName: TABELAS.MEMBROS,
      Key: { contexto_id: contextoGrupo(id), uid: alvo },
      UpdateExpression: 'SET papel = :p, expires_at = :e',
      ExpressionAttributeValues: {
        ':p': acao === 'promover' ? 'admin' : 'membro',
        ':e': proximaExpiracao(),
      },
    }));
    return json(204);
  }

  return json(400, { message: 'acao invalida' });
}

/** Pedido de entrada: entra como "pendente" ate um admin aceitar. */
async function solicitar(ator, id) {
  if (!await obterGrupo(id)) return NAO_ENCONTRADO;
  if (await papelNoGrupo(id, ator)) return json(409, { message: 'ja tem vinculo com o grupo' });

  await ddb.send(new PutCommand({
    TableName: TABELAS.MEMBROS,
    Item: {
      contexto_id: contextoGrupo(id), uid: ator,
      papel: 'pendente', pedido_em: agora(), expires_at: proximaExpiracao(),
    },
  }));
  return json(202, { message: 'pedido registrado' });
}

async function membros(ator, id) {
  if (!await obterGrupo(id)) return NAO_ENCONTRADO;
  const { itens } = await listarMembros(id);
  const perfis = await carregarPerfis(itens.map((m) => m.uid));
  return json(200, itens.filter((m) => m.papel !== 'pendente').map((m) => ({
    ...jogadorParaResposta(perfis.get(m.uid)) ?? { id: m.uid },
    papel: m.papel ?? 'membro',
    entrou_em: m.entrou_em ?? '',
  })));
}

async function pedidos(ator, id) {
  if (!ehAdmin(await papelNoGrupo(id, ator))) return SEM_PERMISSAO;
  const { itens } = await listarMembros(id);
  const pendentes = itens.filter((m) => m.papel === 'pendente');
  const perfis = await carregarPerfis(pendentes.map((m) => m.uid));
  return json(200, pendentes.map((m) => {
    const perfil = perfis.get(m.uid) ?? {};
    const quando = Date.parse(m.pedido_em ?? m.entrou_em ?? '');
    return {
      grupoId: id,
      jogadorId: m.uid,
      nome: String(perfil.nome ?? ''),
      username: String(perfil.username ?? ''),
      imagem: String(perfil.imagem ?? ''),
      idade: String(perfil.idade ?? ''),
      peso: String(perfil.peso ?? ''),
      posicao: String(perfil.posicao_jogador ?? perfil.posicao ?? ''),
      criadoEmMillis: Number.isFinite(quando) ? quando : 0,
    };
  }));
}

/* -------------------------------- roteador -------------------------------- */

exports.handler = async (event) => {
  const ator = identidade(event);
  if (!ator) return json(401, { message: 'nao autenticado' });

  const metodo = event.requestContext?.http?.method ?? '';
  const caminho = (event.rawPath ?? '').replace(/\/+$/, '');
  const q = event.queryStringParameters ?? {};
  const limite = Math.min(Math.max(Number(q.limit) || 50, 1), 100);

  let corpo = {};
  if (event.body) {
    try {
      corpo = JSON.parse(event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
    } catch { return json(400, { message: 'corpo invalido' }); }
  }

  const [raiz, id, sub] = caminho.split('/').filter(Boolean);
  if (raiz !== 'grupo') return NAO_ENCONTRADO;

  try {
    if (!id) {
      if (metodo === 'GET' && q.cidade) return await porCidade(q.cidade, limite);
      if (metodo === 'GET') return await meusGrupos(ator);
      if (metodo === 'POST') return await criarGrupo(ator, corpo);
      return json(405, { message: 'metodo nao suportado' });
    }

    if (!sub) {
      if (metodo === 'GET') return await verGrupo(ator, id);
      if (metodo === 'PUT' || metodo === 'PATCH') return await atualizarGrupo(ator, id, corpo);
      if (metodo === 'DELETE') return await apagarGrupo(ator, id);
      return json(405, { message: 'metodo nao suportado' });
    }

    if (sub === 'participacao' && metodo === 'POST') return await participacao(ator, id, corpo);
    if (sub === 'solicitacao' && metodo === 'POST') return await solicitar(ator, id);
    if (sub === 'membros' && metodo === 'GET') return await membros(ator, id);
    if (sub === 'pedidos' && metodo === 'GET') return await pedidos(ator, id);

    return NAO_ENCONTRADO;
  } catch (erro) {
    if (erro?.name === 'ConditionalCheckFailedException') return NAO_ENCONTRADO;
    console.error('grupos_falhou', metodo, caminho, erro);
    return json(500, { message: 'falha interna' });
  }
};
