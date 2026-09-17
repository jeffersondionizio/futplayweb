'use strict';
/**
 * cadepelada_identidade - tudo de /jogador, menos chat e midia.
 *
 * Substitui a parte de perfil, busca e rede social do lambda_jogador antigo
 * (2.481 linhas cobrindo cinco assuntos). Chat foi para cadepelada_mensagens e
 * midia para cadepelada_midia, porque estavam duplicados dentro de quatro
 * Lambdas diferentes, cada um com sua versao de "enviar mensagem".
 *
 * Identidade vem sempre do authorizer, nunca do corpo ou da URL: quem diz quem
 * voce e e o Firebase ID Token validado antes de chegar aqui.
 */

const {
  GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchGetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');

const { TABELAS, itemSegue, itemHistorico, arestaSeguidores, lerContexto } = require('../lib/chaves');
const { ddb, obterPorUid, nomeBusca, bucketBusca, normalizarEmail, proximaExpiracao } = require('../lib/jogadores');
const {
  jogadorParaResposta, camposEditaveis, relacionamentoParaResposta,
} = require('../lib/mapeadores');

const json = (statusCode, corpo) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: corpo === undefined ? '' : JSON.stringify(corpo),
});

const NAO_ENCONTRADO = json(404, { message: 'nao encontrado' });
const SEM_PERMISSAO = json(403, { message: 'sem permissao' });

function identidade(event) {
  const ctx = event?.requestContext?.authorizer?.lambda
    ?? event?.requestContext?.authorizer
    ?? {};
  return String(ctx.uid || ctx.actorId || '').trim() || null;
}

/* ------------------------------ rede social ------------------------------- */

/**
 * Contadores de seguidores e seguindo.
 *
 * Select COUNT nao traz os itens, so o numero - o perfil so precisa do total, e
 * carregar a lista inteira para contar era o que deixava o perfil lento em quem
 * tem muitos seguidores.
 */
async function contarSocial(uid) {
  const [seguindo, seguidores] = await Promise.all([
    ddb.send(new QueryCommand({
      TableName: TABELAS.JOGADOR_DADOS,
      KeyConditionExpression: '#u = :u AND begins_with(#i, :p)',
      ExpressionAttributeNames: { '#u': 'uid', '#i': 'item' },
      ExpressionAttributeValues: { ':u': uid, ':p': 'segue#' },
      Select: 'COUNT',
    })),
    ddb.send(new QueryCommand({
      TableName: TABELAS.JOGADOR_DADOS,
      IndexName: 'aresta-index',
      KeyConditionExpression: 'aresta = :a',
      ExpressionAttributeValues: { ':a': arestaSeguidores(uid) },
      Select: 'COUNT',
    })),
  ]);
  return { seguindo: seguindo.Count ?? 0, seguidores: seguidores.Count ?? 0 };
}

async function existeAresta(de, para) {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABELAS.JOGADOR_DADOS,
    Key: { uid: de, item: itemSegue(para) },
  }));
  return Boolean(Item);
}

async function seguir(ator, alvo) {
  if (ator === alvo) return json(400, { message: 'nao da para seguir a si mesmo' });
  if (!(await obterPorUid(alvo))) return NAO_ENCONTRADO;

  await ddb.send(new PutCommand({
    TableName: TABELAS.JOGADOR_DADOS,
    Item: {
      uid: ator,
      item: itemSegue(alvo),
      // O GSI aresta-index responde "quem segue fulano" - sem ele so daria para
      // saber a direcao contraria, e a lista de seguidores exigiria varredura.
      aresta: arestaSeguidores(alvo),
      aresta_ordem: new Date().toISOString(),
      alvo_uid: alvo,
      criado_em: new Date().toISOString(),
      expires_at: proximaExpiracao(),
    },
  }));
  return json(204);
}

async function deixarDeSeguir(ator, alvo) {
  await ddb.send(new DeleteCommand({
    TableName: TABELAS.JOGADOR_DADOS,
    Key: { uid: ator, item: itemSegue(alvo) },
  }));
  return json(204);
}

/** Hidrata uma lista de uids com os perfis, numa chamada so. */
async function carregarPerfis(uids) {
  const unicos = [...new Set(uids)].filter(Boolean);
  if (!unicos.length) return new Map();

  const mapa = new Map();
  for (let i = 0; i < unicos.length; i += 100) {
    const lote = unicos.slice(i, i + 100);
    const r = await ddb.send(new BatchGetCommand({
      RequestItems: {
        [TABELAS.JOGADORES]: { Keys: lote.map((uid) => ({ uid })) },
      },
    }));
    for (const item of r.Responses?.[TABELAS.JOGADORES] ?? []) mapa.set(item.uid, item);
  }
  return mapa;
}

async function listarSeguidores(alvo, limite, cursor) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.JOGADOR_DADOS,
    IndexName: 'aresta-index',
    KeyConditionExpression: 'aresta = :a',
    ExpressionAttributeValues: { ':a': arestaSeguidores(alvo) },
    Limit: limite,
    ScanIndexForward: false,
    ExclusiveStartKey: cursor,
  }));
  const perfis = await carregarPerfis((r.Items ?? []).map((x) => x.uid));
  return {
    items: (r.Items ?? [])
      .map((x) => relacionamentoParaResposta(perfis.get(x.uid), x, { seguindoJogador: true }))
      .filter(Boolean),
    next_cursor: r.LastEvaluatedKey ?? null,
  };
}

async function listarSeguindo(uid, limite, cursor) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.JOGADOR_DADOS,
    KeyConditionExpression: '#u = :u AND begins_with(#i, :p)',
    ExpressionAttributeNames: { '#u': 'uid', '#i': 'item' },
    ExpressionAttributeValues: { ':u': uid, ':p': 'segue#' },
    Limit: limite,
    ExclusiveStartKey: cursor,
  }));
  const perfis = await carregarPerfis((r.Items ?? []).map((x) => x.alvo_uid));
  return {
    items: (r.Items ?? [])
      .map((x) => relacionamentoParaResposta(perfis.get(x.alvo_uid), x, { seguidoPorJogador: true }))
      .filter(Boolean),
    next_cursor: r.LastEvaluatedKey ?? null,
  };
}

/* --------------------------------- perfil --------------------------------- */

async function verPerfil(ator, alvo) {
  const item = await obterPorUid(alvo);
  if (!item) return NAO_ENCONTRADO;

  const [contagem, seguindoJogador, seguidoPorJogador] = await Promise.all([
    contarSocial(alvo),
    ator && ator !== alvo ? existeAresta(ator, alvo) : Promise.resolve(false),
    ator && ator !== alvo ? existeAresta(alvo, ator) : Promise.resolve(false),
  ]);

  return json(200, jogadorParaResposta(item, { ...contagem, seguindoJogador, seguidoPorJogador }));
}

async function atualizarPerfil(ator, alvo, corpo) {
  if (ator !== alvo) return SEM_PERMISSAO;

  const campos = camposEditaveis(corpo);
  if (!Object.keys(campos).length) return json(400, { message: 'nada para atualizar' });

  // O nome alimenta o indice de busca: se mudar, os dois campos derivados tem
  // que mudar junto, senao o jogador some da busca sem ninguem perceber.
  if (campos.nome !== undefined) {
    campos.nome_busca = nomeBusca(campos.nome);
    campos.search_bucket = bucketBusca(campos.nome);
  }

  const nomes = {};
  const valores = {};
  const sets = [];
  for (const [k, v] of Object.entries(campos)) {
    nomes[`#${k}`] = k;
    valores[`:${k}`] = v;
    sets.push(`#${k} = :${k}`);
  }

  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: TABELAS.JOGADORES,
    Key: { uid: alvo },
    UpdateExpression: `SET ${sets.join(', ')}`,
    // #uidChave separado dos campos editaveis: sem a condicao, um UpdateItem
    // num uid inexistente CRIARIA a linha, e o jogador apagado voltaria do nada
    // com metade dos campos preenchidos.
    ExpressionAttributeNames: { ...nomes, '#uidChave': 'uid' },
    ExpressionAttributeValues: valores,
    ConditionExpression: 'attribute_exists(#uidChave)',
    ReturnValues: 'ALL_NEW',
  }));

  return json(200, jogadorParaResposta(Attributes));
}

/**
 * Exclusao explicita de conta. Nao apaga nada em cascata aqui: remover a linha
 * dispara o stream, e a cadepelada_cascata faz a limpeza - o mesmo caminho da
 * expiracao por 90 dias. Duplicar a logica daria duas versoes para manter.
 */
async function apagarConta(ator, alvo) {
  if (ator !== alvo) return SEM_PERMISSAO;
  await ddb.send(new DeleteCommand({ TableName: TABELAS.JOGADORES, Key: { uid: alvo } }));
  return json(204);
}

/**
 * Jogador avulso: alguem da pelada que nao tem o app.
 *
 * O organizador cadastra o time inteiro ao criar o grupo, e a maioria nunca vai
 * instalar nada. Esses nao tem conta no Firebase, entao nao tem UID - recebem um
 * id proprio com prefixo "avulso#", que nunca colide com UID do Firebase e deixa
 * obvio na tabela quem e conta de verdade e quem e so um nome numa lista.
 *
 * Nao e caminho para forjar conta: o id gerado aqui nunca sera devolvido por um
 * ID Token, entao ninguem consegue autenticar como ele.
 */
async function criarAvulso(ator, corpo) {
  const nome = String(corpo?.nome ?? '').trim();
  if (!nome) return json(400, { message: 'nome obrigatorio' });

  const grupoId = String(corpo?.grupo_id ?? '').trim();
  const uid = `avulso#${randomUUID().replace(/-/g, '')}`;
  const agora = new Date().toISOString();

  const item = {
    uid,
    nome,
    nome_busca: nomeBusca(nome),
    search_bucket: bucketBusca(nome),
    // email fica AUSENTE, nao vazio: o DynamoDB recusa string vazia como chave
    // de GSI, e o email-index existe. Ausente so significa que este jogador nao
    // aparece na busca por e-mail, que e o comportamento certo para quem nao
    // tem conta.
    imagem: '',
    avulso: true,
    criado_por: ator,
    criado_em: agora,
    expires_at: proximaExpiracao(),
    ...camposEditaveis(corpo),
  };

  await ddb.send(new PutCommand({ TableName: TABELAS.JOGADORES, Item: item }));

  // Ja entra no grupo: sem isso o organizador cadastraria o time e nao veria
  // ninguem na lista, porque quem responde "quem esta no grupo" e a tabela
  // Membros, nao o campo grupo_id do jogador.
  if (grupoId) {
    const { contextoGrupo } = require('../lib/chaves');
    await ddb.send(new PutCommand({
      TableName: TABELAS.MEMBROS,
      Item: {
        contexto_id: contextoGrupo(grupoId),
        uid,
        entrou_em: agora,
        expires_at: proximaExpiracao(),
      },
    }));
  }

  return json(201, jogadorParaResposta(item));
}

/* --------------------------------- busca ---------------------------------- */

async function buscarPorEmail(email) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.JOGADORES,
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :e',
    ExpressionAttributeValues: { ':e': normalizarEmail(email) },
    Limit: 1,
  }));
  const item = (r.Items ?? [])[0];
  return item ? json(200, jogadorParaResposta(item)) : NAO_ENCONTRADO;
}

/**
 * Busca por nome. Query no busca-index, nunca Scan: o bucket e a primeira letra
 * do nome normalizado, entao "Ácaro" e "Acaro" caem na mesma particao.
 */
async function buscarPorNome(termo, limite) {
  const alvo = nomeBusca(termo);
  if (!alvo) return json(200, []);

  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.JOGADORES,
    IndexName: 'busca-index',
    KeyConditionExpression: 'search_bucket = :b AND begins_with(nome_busca, :n)',
    ExpressionAttributeValues: { ':b': bucketBusca(termo), ':n': alvo },
    Limit: limite,
  }));
  return json(200, (r.Items ?? []).map((i) => jogadorParaResposta(i)));
}

/** Jogadores de um grupo: Query em Membros, depois um BatchGet nos perfis. */
async function listarPorGrupo(grupoId) {
  const { contextoGrupo } = require('../lib/chaves');
  // Todas as paginas: o app monta a convocacao com esta lista, e parar na
  // primeira pagina deixaria membros de fora sem nenhum sinal de erro.
  const membros = [];
  let cursor;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABELAS.MEMBROS,
      KeyConditionExpression: 'contexto_id = :c',
      ExpressionAttributeValues: { ':c': contextoGrupo(grupoId) },
      ExclusiveStartKey: cursor,
    }));
    membros.push(...(r.Items ?? []));
    cursor = r.LastEvaluatedKey;
  } while (cursor);

  const membrosAtivos = membros.filter((m) => m.papel !== 'pendente');
  const perfis = await carregarPerfis(membrosAtivos.map((m) => m.uid));
  return json(200, membrosAtivos.map((m) => jogadorParaResposta(perfis.get(m.uid))).filter(Boolean));
}

/** Grupos de que o jogador participa: Query no uid-index de Membros. */
async function listarGruposDoJogador(uid) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.MEMBROS,
    IndexName: 'uid-index',
    KeyConditionExpression: '#u = :u',
    ExpressionAttributeNames: { '#u': 'uid' },
    ExpressionAttributeValues: { ':u': uid },
  }));
  const ids = (r.Items ?? [])
    .filter((m) => m.papel !== 'pendente')
    .map((m) => lerContexto(m.contexto_id))
    .filter((c) => c?.tipo === 'grupo')
    .map((c) => c.id);
  return json(200, { jogador_id: uid, grupo_ids: ids });
}

async function listarHistorico(uid, limite, cursor) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.JOGADOR_DADOS,
    KeyConditionExpression: '#u = :u AND begins_with(#i, :p)',
    ExpressionAttributeNames: { '#u': 'uid', '#i': 'item' },
    ExpressionAttributeValues: { ':u': uid, ':p': 'historico#' },
    Limit: limite,
    ScanIndexForward: false,
    ExclusiveStartKey: cursor,
  }));
  return json(200, {
    items: (r.Items ?? []).map(({ uid: _u, item: _i, ...resto }) => resto),
    next_cursor: r.LastEvaluatedKey ?? null,
  });
}

/* -------------------------------- roteador -------------------------------- */

const cursorDe = (v) => {
  if (!v) return undefined;
  try { return JSON.parse(Buffer.from(String(v), 'base64url').toString('utf8')); } catch { return undefined; }
};
const cursorPara = (k) => (k ? Buffer.from(JSON.stringify(k)).toString('base64url') : null);

/** Converte LastEvaluatedKey em cursor opaco antes de sair. */
function comCursor(resposta) {
  if (resposta.statusCode !== 200 || !resposta.body) return resposta;
  const corpo = JSON.parse(resposta.body);
  if (corpo.next_cursor && typeof corpo.next_cursor === 'object') {
    corpo.next_cursor = cursorPara(corpo.next_cursor);
    corpo.has_more = Boolean(corpo.next_cursor);
    return json(200, corpo);
  }
  return resposta;
}

exports.handler = async (event) => {
  const ator = identidade(event);
  if (!ator) return json(401, { message: 'nao autenticado' });

  const metodo = event.requestContext?.http?.method ?? '';
  const caminho = (event.rawPath ?? '').replace(/\/+$/, '');
  const q = event.queryStringParameters ?? {};
  const limite = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
  const cursor = cursorDe(q.cursor);

  let corpo = {};
  if (event.body) {
    try {
      corpo = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
    } catch {
      return json(400, { message: 'corpo invalido' });
    }
  }

  const partes = caminho.split('/').filter(Boolean); // ['jogador', id, sub, extra]
  const [raiz, id, sub, extra] = partes;
  if (raiz !== 'jogador') return NAO_ENCONTRADO;

  try {
    // /jogador/chat/inbox pertence a cadepelada_mensagens; aqui so nao se confunde
    // com /jogador/{id}, porque "chat" ocuparia a posicao do id.
    if (id === 'chat') return NAO_ENCONTRADO;

    if (!id) {
      if (metodo === 'GET' && q.email) return await buscarPorEmail(q.email);
      if (metodo === 'GET' && q.grupo_id) return await listarPorGrupo(q.grupo_id);
      const termo = q.search ?? q.q ?? q.username;
      if (metodo === 'GET' && termo) return await buscarPorNome(termo, limite);
      if (metodo === 'POST') return await criarAvulso(ator, corpo);
      return NAO_ENCONTRADO;
    }

    if (!sub) {
      if (metodo === 'GET') return await verPerfil(ator, id);
      if (metodo === 'PUT' || metodo === 'PATCH') return await atualizarPerfil(ator, id, corpo);
      if (metodo === 'DELETE') return await apagarConta(ator, id);
      return json(405, { message: 'metodo nao suportado' });
    }

    if (sub === 'grupos' && metodo === 'GET') return await listarGruposDoJogador(id);
    if (sub === 'historico' && metodo === 'GET') return comCursor(await listarHistorico(id, limite, cursor));

    if (sub === 'follow') {
      if (metodo === 'POST') return await seguir(ator, id);
      if (metodo === 'DELETE') return await deixarDeSeguir(ator, id);
    }

    if (sub === 'followers') {
      // DELETE /jogador/{id}/followers/{followerId}: remover alguem que te segue.
      // So o dono do perfil pode; sem esta checagem qualquer um desfaria o
      // vinculo alheio.
      if (metodo === 'DELETE' && extra) {
        if (ator !== id) return SEM_PERMISSAO;
        return await deixarDeSeguir(extra, id);
      }
      if (metodo === 'GET') return comCursor(json(200, await listarSeguidores(id, limite, cursor)));
    }

    if (sub === 'following' && metodo === 'GET') {
      return comCursor(json(200, await listarSeguindo(id, limite, cursor)));
    }

    return NAO_ENCONTRADO;
  } catch (erro) {
    if (erro?.name === 'ConditionalCheckFailedException') return NAO_ENCONTRADO;
    console.error('identidade_falhou', metodo, caminho, erro);
    return json(500, { message: 'falha interna' });
  }
};
