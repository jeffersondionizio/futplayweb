'use strict';
/**
 * cadepelada_clubes - clubes e seu quadro de atletas.
 *
 * Substitui lambda_clubes (1.284 linhas). Mesma forma da Lambda de grupos: o
 * papel de cada pessoa vive em CadePelada-Membros, com contexto_id no formato
 * clube#<id>, e nao num campo dentro do clube.
 *
 * Isso e o que torna possivel responder "de quais clubes eu faco parte" com uma
 * Query no uid-index. No modelo antigo, com a lista de membros guardada dentro
 * do clube, a mesma pergunta exigia varrer a tabela inteira.
 */

const {
  GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchGetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');

const { TABELAS, contextoClube, lerContexto } = require('../lib/chaves');
const { ddb, proximaExpiracao } = require('../lib/jogadores');
const {
  jogadorParaResposta, clubeMembroParaResposta, pedidoClubeParaResposta,
} = require('../lib/mapeadores');
const { buscarPorCidade } = require('../lib/cidades');

const json = (statusCode, corpo) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: corpo === undefined ? '' : JSON.stringify(corpo),
});

const NAO_ENCONTRADO = json(404, { message: 'clube nao encontrado' });
const SEM_PERMISSAO = json(403, { message: 'sem permissao' });

function identidade(event) {
  const ctx = event?.requestContext?.authorizer?.lambda
    ?? event?.requestContext?.authorizer ?? {};
  return String(ctx.uid || ctx.actorId || '').trim() || null;
}

const agora = () => new Date().toISOString();

/** Mesma fronteira dos outros: uid_dono no banco, owner_user_id no contrato. */
function clubeParaResposta(item, extras = {}) {
  if (!item) return null;
  const { uid_dono: dono, semeado, ...resto } = item;
  return {
    ...resto,
    owner_user_id: dono ?? '',
    total_membros: String(extras.membros ?? 0),
    meu_papel: extras.papel ?? '',
    // O app declara pedido_pendente em Clube.kt e o mapeador nunca mandava,
    // entao a solicitacao enviada nao aparecia como pendente em tela nenhuma.
    pedido_pendente: Boolean(extras.pedidoPendente),
  };
}

const EDITAVEIS = new Set([
  'nome', 'descricao', 'cidade', 'estado', 'pais', 'escudo_url',
  'privacidade', 'latitude', 'longitude', 'cores', 'fundacao',
]);

const camposEditaveis = (corpo) => Object.fromEntries(
  Object.entries(corpo ?? {}).filter(([k, v]) => EDITAVEIS.has(k) && v !== undefined),
);

/* -------------------------------- membros --------------------------------- */

const obterClube = async (id) =>
  (await ddb.send(new GetCommand({ TableName: TABELAS.CLUBES, Key: { id } }))).Item ?? null;

const papelNoClube = async (clubeId, uid) =>
  (await ddb.send(new GetCommand({
    TableName: TABELAS.MEMBROS,
    Key: { contexto_id: contextoClube(clubeId), uid },
  }))).Item?.papel ?? null;

const ehAdmin = (papel) => papel === 'dono' || papel === 'admin';

/**
 * Todos os membros, em todas as paginas.
 *
 * O app pede a lista inteira e nao manda cursor. Com FilterExpression isso e
 * ainda mais importante: o filtro roda DEPOIS do Limit, entao uma pagina pode
 * voltar vazia mesmo havendo pedidos pendentes mais adiante na particao.
 */
async function membrosDoClube(clubeId, papelFiltro) {
  const itens = [];
  let cursor;
  do {
    const params = {
      TableName: TABELAS.MEMBROS,
      KeyConditionExpression: 'contexto_id = :c',
      ExpressionAttributeValues: { ':c': contextoClube(clubeId) },
      ExclusiveStartKey: cursor,
    };
    if (papelFiltro) {
      params.FilterExpression = 'papel = :p';
      params.ExpressionAttributeValues[':p'] = papelFiltro;
    }
    const r = await ddb.send(new QueryCommand(params));
    itens.push(...(r.Items ?? []));
    cursor = r.LastEvaluatedKey;
  } while (cursor);
  return { itens };
}

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

/* --------------------------------- rotas ---------------------------------- */

async function verClube(ator, id) {
  const clube = await obterClube(id);
  if (!clube) return NAO_ENCONTRADO;
  const [{ itens }, papel] = await Promise.all([
    membrosDoClube(id),
    papelNoClube(id, ator),
  ]);
  const ativos = itens.filter((m) => m.papel !== 'pendente');
  return json(200, clubeParaResposta(clube, {
    membros: ativos.length,
    papel,
    pedidoPendente: papel === 'pendente',
  }));
}

/**
 * GET /clubes -> os clubes que interessam a este usuario.
 *
 * Sao duas origens. A primeira e obvia: os clubes de que ele e membro. A
 * segunda sao os clubes que aparecem nas competicoes dele - as telas de
 * amistoso precisam do nome e do escudo do adversario, e sem isso o desafio
 * apareceria contra um clube sem nome.
 *
 * Nao existe "todos os clubes": isso pediria um Scan, que a politica de IAM
 * nao concede de proposito. Descoberta e feita por cidade (?cidade=).
 */
async function meusClubes(ator, alvo) {
  const uid = alvo || ator;
  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.MEMBROS,
    IndexName: 'uid-index',
    KeyConditionExpression: '#u = :u',
    ExpressionAttributeNames: { '#u': 'uid' },
    ExpressionAttributeValues: { ':u': uid },
  }));

  const contextos = (r.Items ?? []).map((m) => lerContexto(m.contexto_id)).filter(Boolean);

  // O papel sai da mesma Query, sem ida extra ao banco: cada linha de Membros do
  // ator ja traz o papel dele naquele clube.
  const papelPorClube = new Map();
  for (const m of r.Items ?? []) {
    const c = lerContexto(m.contexto_id);
    if (c?.tipo === 'clube') papelPorClube.set(c.id, String(m.papel ?? ''));
  }
  const ids = new Set(contextos.filter((c) => c.tipo === 'clube').map((c) => c.id));

  const competicoes = contextos.filter((c) => c.tipo === 'competicao').map((c) => c.id);
  if (competicoes.length) {
    for (let i = 0; i < competicoes.length; i += 100) {
      const lote = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [TABELAS.COMPETICOES]: { Keys: competicoes.slice(i, i + 100).map((id) => ({ id })) },
        },
      }));
      for (const comp of lote.Responses?.[TABELAS.COMPETICOES] ?? []) {
        for (const campo of ['clube_id', 'clube_mandante_id', 'clube_visitante_id']) {
          if (comp[campo]) ids.add(String(comp[campo]));
        }
      }
    }
  }
  if (!ids.size) return json(200, []);

  const chaves = [...ids];
  const clubes = [];
  for (let i = 0; i < chaves.length; i += 100) {
    const lote = await ddb.send(new BatchGetCommand({
      RequestItems: { [TABELAS.CLUBES]: { Keys: chaves.slice(i, i + 100).map((id) => ({ id })) } },
    }));
    clubes.push(...(lote.Responses?.[TABELAS.CLUBES] ?? []));
  }
  // A lista devolvia meu_papel vazio e total_membros "0" para todo clube, porque
  // chamava o mapeador sem extras - mesmo JSON de GET /clubes/{id}, com o miolo
  // vazio. Quem decide botao de admin pela lista nunca via o proprio papel.
  const extras = new Map(await Promise.all(clubes.map(async (c) => {
    const { itens } = await membrosDoClube(c.id);
    const ativos = itens.filter((m) => m.papel !== 'pendente');
    const papel = papelPorClube.get(c.id) ?? '';
    return [c.id, { membros: ativos.length, papel, pedidoPendente: papel === 'pendente' }];
  })));

  return json(200, clubes.map((c) => clubeParaResposta(c, extras.get(c.id))));
}

async function porCidade(cidade, limite) {
  // Tolerante a grafia: o app manda a cidade em minusculas e o banco guarda
  // na forma de exibicao. Ver lib/cidades.js.
  const itens = await buscarPorCidade(cidade, async (grafia) => {
    const r = await ddb.send(new QueryCommand({
      TableName: TABELAS.CLUBES,
      IndexName: 'cidade-index',
      KeyConditionExpression: 'cidade = :c',
      ExpressionAttributeValues: { ':c': grafia },
      Limit: limite,
    }));
    return r.Items ?? [];
  });
  return json(200, itens.slice(0, limite).map((c) => clubeParaResposta(c)));
}

async function criarClube(ator, corpo) {
  const nome = String(corpo?.nome ?? '').trim();
  if (!nome) return json(400, { message: 'nome obrigatorio' });

  const id = String(corpo?.id ?? '').trim() || randomUUID().replace(/-/g, '');
  const clube = {
    id,
    nome,
    uid_dono: ator,
    privacidade: String(corpo?.privacidade ?? 'ABERTO').toUpperCase(),
    criado_em: agora(),
    expires_at: proximaExpiracao(),
    ...camposEditaveis(corpo),
  };

  try {
    await ddb.send(new PutCommand({
      TableName: TABELAS.CLUBES, Item: clube,
      ConditionExpression: 'attribute_not_exists(id)',
    }));
  } catch (e) {
    if (e?.name === 'ConditionalCheckFailedException') {
      return json(409, { message: 'ja existe clube com esse id' });
    }
    throw e;
  }

  await ddb.send(new PutCommand({
    TableName: TABELAS.MEMBROS,
    Item: {
      contexto_id: contextoClube(id), uid: ator,
      papel: 'dono', entrou_em: agora(), expires_at: proximaExpiracao(),
    },
  }));
  return json(201, clubeParaResposta(clube, { membros: 1, papel: 'dono' }));
}

async function atualizarClube(ator, id, corpo) {
  if (!ehAdmin(await papelNoClube(id, ator))) return SEM_PERMISSAO;
  const campos = camposEditaveis(corpo);
  if (!Object.keys(campos).length) return json(400, { message: 'nada para atualizar' });

  const nomes = { '#chave': 'id' }; const valores = {}; const sets = [];
  for (const [k, v] of Object.entries(campos)) {
    nomes[`#${k}`] = k; valores[`:${k}`] = v; sets.push(`#${k} = :${k}`);
  }
  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: TABELAS.CLUBES, Key: { id },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: nomes,
    ExpressionAttributeValues: valores,
    ConditionExpression: 'attribute_exists(#chave)',
    ReturnValues: 'ALL_NEW',
  }));
  return json(200, clubeParaResposta(Attributes));
}

async function apagarClube(ator, id) {
  if (await papelNoClube(id, ator) !== 'dono') return SEM_PERMISSAO;
  const { itens } = await membrosDoClube(id);
  for (const m of itens) {
    await ddb.send(new DeleteCommand({
      TableName: TABELAS.MEMBROS, Key: { contexto_id: m.contexto_id, uid: m.uid },
    }));
  }
  await ddb.send(new DeleteCommand({ TableName: TABELAS.CLUBES, Key: { id } }));
  return json(204);
}

/**
 * Entrar: clube ABERTO entra na hora, FECHADO vira pedido pendente.
 *
 * A decisao fica aqui, no servidor. Deixar o app escolher permitiria entrar
 * direto num clube fechado so mandando a requisicao certa.
 */
async function participacao(ator, id, corpo) {
  const clube = await obterClube(id);
  if (!clube) return NAO_ENCONTRADO;

  const acao = String(corpo?.acao ?? 'entrar').toLowerCase();
  const alvo = String(corpo?.uid ?? corpo?.user_id ?? ator).trim();
  const papelAtor = await papelNoClube(id, ator);

  if (acao === 'entrar') {
    if (papelAtor) return json(409, { message: 'ja tem vinculo com o clube' });
    const aberto = String(clube.privacidade ?? 'ABERTO').toUpperCase() === 'ABERTO';
    await ddb.send(new PutCommand({
      TableName: TABELAS.MEMBROS,
      Item: {
        contexto_id: contextoClube(id), uid: ator,
        papel: aberto ? 'atleta' : 'pendente',
        entrou_em: agora(), expires_at: proximaExpiracao(),
      },
    }));
    return aberto ? json(204) : json(202, { message: 'pedido registrado' });
  }

  if (acao === 'sair') {
    if (papelAtor === 'dono') return json(409, { message: 'dono nao sai; transfira ou apague' });
    await ddb.send(new DeleteCommand({
      TableName: TABELAS.MEMBROS, Key: { contexto_id: contextoClube(id), uid: ator },
    }));
    return json(204);
  }

  if (['aceitar', 'recusar', 'remover', 'promover', 'rebaixar'].includes(acao)) {
    if (!ehAdmin(papelAtor)) return SEM_PERMISSAO;
    if (acao === 'recusar' || acao === 'remover') {
      if (await papelNoClube(id, alvo) === 'dono') {
        return json(409, { message: 'nao da para remover o dono' });
      }
      await ddb.send(new DeleteCommand({
        TableName: TABELAS.MEMBROS, Key: { contexto_id: contextoClube(id), uid: alvo },
      }));
      return json(204);
    }
    await ddb.send(new UpdateCommand({
      TableName: TABELAS.MEMBROS,
      Key: { contexto_id: contextoClube(id), uid: alvo },
      UpdateExpression: 'SET papel = :p, expires_at = :e',
      ExpressionAttributeValues: {
        ':p': acao === 'promover' ? 'admin' : 'atleta',
        ':e': proximaExpiracao(),
      },
      ConditionExpression: 'attribute_exists(#u)',
      ExpressionAttributeNames: { '#u': 'uid' },
    }));
    return json(204);
  }

  return json(400, { message: 'acao invalida' });
}

/** GET /clubes/{id}/membros -> List<ClubeMembro>. */
async function listarMembros(id) {
  if (!await obterClube(id)) return NAO_ENCONTRADO;
  const { itens } = await membrosDoClube(id);
  // Pendente nao e membro: ele aparece na aba de pedidos, nao na de atletas.
  return json(200, itens
    .filter((m) => m.papel !== 'pendente')
    .map((m) => clubeMembroParaResposta(m, id)));
}

/** GET /clubes/{id}/pedidos -> List<PedidoEntradaClube>, com o perfil junto. */
async function listarPedidos(ator, id) {
  if (!await obterClube(id)) return NAO_ENCONTRADO;
  // A lista de pedidos pendentes so interessa a quem pode decidir sobre eles.
  if (!ehAdmin(await papelNoClube(id, ator))) return SEM_PERMISSAO;

  const { itens } = await membrosDoClube(id, 'pendente');
  const perfis = await carregarPerfis(itens.map((m) => m.uid));
  return json(200, itens.map((m) => pedidoClubeParaResposta(m, perfis.get(m.uid), id)));
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

  const [raiz, id, sub, extra] = caminho.split('/').filter(Boolean);
  if (raiz !== 'clubes') return NAO_ENCONTRADO;

  try {
    if (!id) {
      if (metodo === 'GET' && q.cidade) return await porCidade(q.cidade, limite);
      if (metodo === 'GET') return await meusClubes(ator, q.user_id);
      if (metodo === 'POST') return await criarClube(ator, corpo);
      return json(405, { message: 'metodo nao suportado' });
    }

    if (!sub) {
      if (metodo === 'GET') return await verClube(ator, id);
      if (metodo === 'PUT' || metodo === 'PATCH') return await atualizarClube(ator, id, corpo);
      if (metodo === 'DELETE') return await apagarClube(ator, id);
      return json(405, { message: 'metodo nao suportado' });
    }

    if (sub === 'participacao' && metodo === 'POST') return await participacao(ator, id, corpo);
    if (sub === 'membros') {
      if (metodo === 'GET') return await listarMembros(id);
      if (metodo === 'POST') return await participacao(ator, id, { ...corpo, acao: corpo.acao ?? 'entrar' });
      // PUT/DELETE /clubes/{id}/membros/{userId}: promover ou remover alguem.
      if (extra && (metodo === 'PUT' || metodo === 'DELETE')) {
        return await participacao(ator, id, {
          uid: extra,
          acao: metodo === 'DELETE' ? 'remover' : (corpo.acao ?? 'promover'),
        });
      }
    }
    if (sub === 'pedidos' && metodo === 'GET') return await listarPedidos(ator, id);

    return NAO_ENCONTRADO;
  } catch (erro) {
    if (erro?.name === 'ConditionalCheckFailedException') return NAO_ENCONTRADO;
    console.error('clubes_falhou', metodo, caminho, erro);
    return json(500, { message: 'falha interna' });
  }
};
