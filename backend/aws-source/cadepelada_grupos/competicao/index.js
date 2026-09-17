'use strict';
/**
 * cadepelada_competicoes - campeonatos, amistosos, jogos e eventos.
 *
 * Substitui lambda_campeonatos (1.572 linhas) e lambda_amistosos (1.034). As
 * duas viviam separadas repetindo as mesmas operacoes sobre coisas que so
 * diferem no formato: um amistoso e uma competicao de um jogo so.
 *
 * Campeonato e amistoso dividem CadePelada-Competicoes e se distinguem pelo
 * campo `tipo`, que tambem entra no GSI junto com o status - status sozinho
 * misturaria "ativo" de campeonato com "ativo" de amistoso no mesmo indice.
 *
 * Jogos e seus eventos moram na mesma particao de CadePelada-Jogos: carregar
 * uma partida inteira e UMA Query, contra um GetItem mais um Query no indice de
 * eventos no modelo antigo.
 *
 * Toda rota de lista devolve ARRAY NU, sem envelope. Nao e preferencia: as
 * interfaces Retrofit do app declaram Response<List<X>>, e um objeto
 * {items:[...]} faz o Gson estourar com "Expected BEGIN_ARRAY but was
 * BEGIN_OBJECT" - a tela fica vazia sem nenhum erro de HTTP para investigar.
 */

const {
  GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand,
  BatchGetCommand, BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');

const {
  TABELAS, contextoCompeticao, contextoClubesCompeticao, lerContexto,
  ITEM_JOGO, itemEvento, tipoStatus, TIPOS_COMPETICAO,
} = require('../lib/chaves');
const { ddb, proximaExpiracao } = require('../lib/jogadores');
const {
  competicaoParaResposta, participanteParaResposta, jogoParaResposta,
  eventoParaResposta, camposEditaveisCompeticao,
} = require('../lib/mapeadores');
const { grafiasDeCidade } = require('../lib/cidades');

const json = (statusCode, corpo) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: corpo === undefined ? '' : JSON.stringify(corpo),
});

const NAO_ENCONTRADO = json(404, { message: 'competicao nao encontrada' });
const SEM_PERMISSAO = json(403, { message: 'sem permissao' });

function identidade(event) {
  const ctx = event?.requestContext?.authorizer?.lambda
    ?? event?.requestContext?.authorizer ?? {};
  return String(ctx.uid || ctx.actorId || '').trim() || null;
}

const agora = () => new Date().toISOString();
const texto = (v, padrao = '') => (v == null || v === '' ? padrao : String(v));

/* ---------------------------- leitura de apoio ---------------------------- */

const obter = async (id) =>
  (await ddb.send(new GetCommand({ TableName: TABELAS.COMPETICOES, Key: { id } }))).Item ?? null;

const papel = async (compId, uid) =>
  (await ddb.send(new GetCommand({
    TableName: TABELAS.MEMBROS, Key: { contexto_id: contextoCompeticao(compId), uid },
  }))).Item?.papel ?? null;

const ehOrganizador = (p) => p === 'organizador' || p === 'dono' || p === 'admin';

/**
 * Da acesso ao chat da competicao sem mexer em quem ja esta dentro.
 *
 * A condicao nao e detalhe: sem ela, o organizador que inscrevesse um clube no
 * proprio campeonato seria regravado como 'participante' e perderia o direito
 * de editar o que acabou de criar.
 */
async function garantirMembro(compId, uid, papelNovo, extras = {}) {
  try {
    await ddb.send(new PutCommand({
      TableName: TABELAS.MEMBROS,
      Item: {
        contexto_id: contextoCompeticao(compId), uid, papel: papelNovo,
        entrou_em: agora(), expires_at: proximaExpiracao(), ...extras,
      },
      ConditionExpression: 'attribute_not_exists(contexto_id)',
    }));
  } catch (e) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;
  }
}

/** Percorre todas as paginas: as listas do app nao paginam. */
async function consultarTudo(params) {
  const itens = [];
  let cursor;
  do {
    const r = await ddb.send(new QueryCommand({ ...params, ExclusiveStartKey: cursor }));
    itens.push(...(r.Items ?? []));
    cursor = r.LastEvaluatedKey;
  } while (cursor && itens.length < 2000);
  return itens;
}

async function apagarEmLote(tabela, chaves) {
  for (let i = 0; i < chaves.length; i += 25) {
    let req = { [tabela]: chaves.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) };
    for (let t = 0; t < 5 && req[tabela]?.length; t++) {
      const r = await ddb.send(new BatchWriteCommand({ RequestItems: req }));
      req = r.UnprocessedItems ?? {};
      if (req[tabela]?.length) await new Promise((ok) => setTimeout(ok, 100 * 2 ** t));
    }
  }
}

async function gravarEmLote(tabela, itens) {
  for (let i = 0; i < itens.length; i += 25) {
    let req = { [tabela]: itens.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) };
    for (let t = 0; t < 5 && req[tabela]?.length; t++) {
      const r = await ddb.send(new BatchWriteCommand({ RequestItems: req }));
      req = r.UnprocessedItems ?? {};
      if (req[tabela]?.length) await new Promise((ok) => setTimeout(ok, 100 * 2 ** t));
    }
  }
}

/* ------------------------------ competicoes ------------------------------- */

/**
 * Mantem `tipo_status` em dia sempre que o status muda.
 *
 * Esquecer disso deixaria a competicao fora do indice de listagem - ela
 * continuaria existindo, mas sumiria das telas que filtram por status, que e o
 * tipo de bug que so aparece quando alguem reclama que "o campeonato sumiu".
 */
function comIndice(campos, item) {
  const saida = { ...campos, atualizado_em: agora() };
  if (campos.status !== undefined) {
    saida.status = String(campos.status).toUpperCase();
    saida.tipo_status = tipoStatus(item?.tipo ?? 'campeonato', visibilidade(saida.status));
  }
  return saida;
}

async function ver(id, tipo) {
  const item = await obter(id);
  if (!item || item.tipo !== tipo) return NAO_ENCONTRADO;
  return json(200, competicaoParaResposta(item));
}

/** Ids das competicoes de que o usuario participa, pelo uid-index de Membros. */
async function idsDoUsuario(ator) {
  const itens = await consultarTudo({
    TableName: TABELAS.MEMBROS,
    IndexName: 'uid-index',
    KeyConditionExpression: '#u = :u',
    ExpressionAttributeNames: { '#u': 'uid' },
    ExpressionAttributeValues: { ':u': ator },
  });
  return itens
    .map((m) => lerContexto(m.contexto_id))
    .filter((c) => c?.tipo === 'competicao')
    .map((c) => c.id);
}

async function carregarVarias(ids) {
  const unicos = [...new Set(ids)].filter(Boolean);
  const itens = [];
  // BatchGet aceita 100 chaves por chamada.
  for (let i = 0; i < unicos.length; i += 100) {
    const lote = unicos.slice(i, i + 100);
    const r = await ddb.send(new BatchGetCommand({
      RequestItems: { [TABELAS.COMPETICOES]: { Keys: lote.map((id) => ({ id })) } },
    }));
    itens.push(...(r.Responses?.[TABELAS.COMPETICOES] ?? []));
  }
  return itens;
}

const porTipoStatus = (tipo, status) => consultarTudo({
  TableName: TABELAS.COMPETICOES,
  IndexName: 'tipo-status-index',
  KeyConditionExpression: 'tipo_status = :ts',
  ExpressionAttributeValues: { ':ts': tipoStatus(tipo, status) },
  ScanIndexForward: false,
});

/**
 * Status que escondem a competicao de quem nao participa dela.
 *
 * O GSI guarda essa visibilidade, e nao o status exato: o app ja filtra status
 * em memoria (FragmentoMenuCampeonatos faz isso sobre a lista inteira), e um
 * valor de indice por status obrigaria uma Query por status - dezessete delas -
 * so para remontar a mesma lista aqui.
 */
const OCULTOS = new Set(['RASCUNHO', 'CANCELADO']);
const visibilidade = (status) =>
  (OCULTOS.has(String(status ?? '').toUpperCase()) ? 'oculto' : 'publico');

/**
 * Vocabulario que o app sabe formatar (CampeonatoUiFormatters.formatarStatus e
 * FragmentoMenuAmistosos). Status fora dessas listas passaria pela API e
 * chegaria cru na tela, sem cor nem traducao.
 */
const STATUS_CAMPEONATO = new Set([
  'RASCUNHO', 'INSCRICOES_ABERTAS', 'GERACAO_TABELA', 'EM_ANDAMENTO',
  'FASE_GRUPOS', 'OITAVAS', 'OITAVAS_DE_FINAL', 'QUARTAS', 'QUARTAS_DE_FINAL',
  'SEMIFINAL', 'SEMI_FINAL', 'FINAL', 'MATA_MATA', 'CONCLUIDO', 'FINALIZADO',
  'CANCELADO', 'ATIVO',
]);

const STATUS_AMISTOSO = new Set([
  'PROPOSTO', 'EM_NEGOCIACAO', 'ACEITO', 'PLACAR_PENDENTE', 'FINALIZADO',
  'CANCELADO', 'RECUSADO',
]);

const statusValido = (tipo, status) =>
  (tipo === 'amistoso' ? STATUS_AMISTOSO : STATUS_CAMPEONATO).has(String(status).toUpperCase());

/** Status de clube inscrito, como FragmentoInscritosCampeonato os le. */
const CONFIRMADO = 'CONFIRMADO';

/**
 * GET /campeonatos[?scope=all]
 *
 * Sem scope: os meus. Com scope=all: os que dao para descobrir, que sao os que
 * ja sairam do rascunho - listar rascunho alheio expoe campeonato que ninguem
 * publicou ainda.
 */
async function listarCampeonatos(ator, scope) {
  const itens = scope === 'all'
    ? await porTipoStatus('campeonato', 'publico')
    : await carregarVarias(await idsDoUsuario(ator));

  return json(200, itens
    .filter((i) => i.tipo === 'campeonato')
    .map((i) => competicaoParaResposta(i)));
}

/**
 * GET /amistosos?scope=meus|recebidos|abertos|historico|all
 *
 * `meus` e `recebidos` sao os dois lados do mesmo desafio: quem propos e quem
 * foi desafiado. Os dois saem do conjunto em que o usuario esta inscrito, e o
 * lado e decidido por quem criou.
 *
 * `all` e o escopo de quem so quer olhar: devolve os amistosos visiveis sem
 * pedir que o usuario faca parte de nenhum deles - e o mesmo que
 * `GET /campeonatos?scope=all` ja fazia do outro lado.
 */
async function listarAmistosos(ator, q) {
  const escopo = String(q.scope || 'meus');
  let itens;

  if (escopo === 'all') {
    itens = (await porTipoStatus('amistoso', 'publico')).filter((i) => i.tipo === 'amistoso');
  } else if (escopo === 'abertos') {
    // Desafio aberto e o unico que aparece para quem ainda nao esta nele.
    itens = (await porTipoStatus('amistoso', 'publico')).filter((i) => i.tipo_desafio === 'ABERTO'
      && i.status === 'PROPOSTO' && i.uid_criador !== ator);
  } else {
    itens = (await carregarVarias(await idsDoUsuario(ator)))
      .filter((i) => i.tipo === 'amistoso');
    const encerrado = (i) => i.status === 'FINALIZADO' || i.status === 'CANCELADO';
    if (escopo === 'historico') itens = itens.filter(encerrado);
    else {
      itens = itens.filter((i) => !encerrado(i));
      if (escopo === 'meus') itens = itens.filter((i) => i.uid_criador === ator);
      if (escopo === 'recebidos') itens = itens.filter((i) => i.uid_criador !== ator);
    }
  }

  // Comparacao tolerante a grafia: o app grava a cidade do amistoso em
  // minusculas e o filtro recebia a forma de exibicao. Ver lib/cidades.js.
  if (q.cidade) {
    const grafias = new Set(grafiasDeCidade(q.cidade).map((c) => c.toLowerCase()));
    itens = itens.filter((i) => grafias.has(String(i.cidade ?? '').trim().toLowerCase()));
  }
  if (q.status) itens = itens.filter((i) => i.status === q.status);
  if (q.tipo) itens = itens.filter((i) => i.tipo_desafio === q.tipo);
  if (q.clubeId) {
    itens = itens.filter((i) => i.clube_mandante_id === q.clubeId
      || i.clube_visitante_id === q.clubeId);
  }

  return json(200, itens.map((i) => competicaoParaResposta(i)));
}

async function criar(ator, tipo, corpo) {
  const id = texto(corpo?.id).trim() || randomUUID().replace(/-/g, '');
  if (tipo === 'campeonato' && !texto(corpo?.nome).trim()) {
    return json(400, { message: 'nome obrigatorio' });
  }

  // O status inicial e do servidor: quem cria nao escolhe em que fase entra.
  const status = tipo === 'campeonato' ? 'RASCUNHO' : 'PROPOSTO';

  const item = {
    ...camposEditaveisCompeticao(corpo, tipo),
    id,
    tipo,
    status,
    tipo_status: tipoStatus(tipo, visibilidade(status)),
    atualizado_em: agora(),
    uid_criador: ator,
    criado_em: agora(),
    expires_at: proximaExpiracao(),
  };
  if (tipo === 'amistoso') {
    // O amistoso nao tem nome proprio no app - a lista monta o titulo com os
    // dois clubes. Guardamos um assim mesmo porque o indice ordena por ele.
    item.nome = texto(corpo?.nome, `Amistoso ${id.slice(0, 6)}`);
    item.tipo_desafio = texto(corpo?.tipo, 'DIRETO');
    // clube-index aponta para clube_id; no amistoso o dono e o mandante.
    item.clube_id = texto(corpo?.clube_mandante_id);
  }

  try {
    await ddb.send(new PutCommand({
      TableName: TABELAS.COMPETICOES, Item: item,
      ConditionExpression: 'attribute_not_exists(id)',
    }));
  } catch (e) {
    if (e?.name === 'ConditionalCheckFailedException') {
      return json(409, { message: 'ja existe competicao com esse id' });
    }
    throw e;
  }

  await ddb.send(new PutCommand({
    TableName: TABELAS.MEMBROS,
    Item: {
      contexto_id: contextoCompeticao(id), uid: ator,
      papel: 'organizador', entrou_em: agora(), expires_at: proximaExpiracao(),
    },
  }));
  return json(201, competicaoParaResposta(item));
}

/** Monta o UpdateExpression de um mapa de campos ja validados. */
function expressaoSet(campos, campoChave) {
  const nomes = { '#chave': campoChave }; const valores = {}; const sets = [];
  for (const [k, v] of Object.entries(campos)) {
    nomes[`#${k}`] = k; valores[`:${k}`] = v; sets.push(`#${k} = :${k}`);
  }
  return { nomes, valores, sets };
}

async function atualizar(ator, id, tipo, corpo) {
  const item = await obter(id);
  if (!item || item.tipo !== tipo) return NAO_ENCONTRADO;
  if (!ehOrganizador(await papel(id, ator))) return SEM_PERMISSAO;

  const campos = camposEditaveisCompeticao(corpo, tipo);
  if (campos.status !== undefined && !statusValido(tipo, campos.status)) {
    return json(400, { message: 'status invalido' });
  }
  if (!Object.keys(campos).length) return json(400, { message: 'nada para atualizar' });

  const { nomes, valores, sets } = expressaoSet(comIndice(campos, item), 'id');

  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: TABELAS.COMPETICOES, Key: { id },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: nomes,
    ExpressionAttributeValues: valores,
    ConditionExpression: 'attribute_exists(#chave)',
    ReturnValues: 'ALL_NEW',
  }));
  return json(200, competicaoParaResposta(Attributes));
}

/**
 * PUT /amistosos/{id}/candidatura
 *
 * Um desafio ABERTO nao tem visitante ate alguem se candidatar. As quatro acoes
 * sao do ponto de vista de quem chama: CANDIDATAR e DESISTIR partem do clube
 * visitante, ACEITAR e RECUSAR de quem propos.
 */
async function candidatura(ator, id, corpo) {
  const item = await obter(id);
  if (!item || item.tipo !== 'amistoso') return NAO_ENCONTRADO;

  const acao = texto(corpo?.acao).toUpperCase();
  const clube = texto(corpo?.clube_visitante_id);
  const dono = item.uid_criador === ator;
  const campos = { atualizado_em: agora() };

  switch (acao) {
    case 'CANDIDATAR':
      if (!clube) return json(400, { message: 'clube_visitante_id obrigatorio' });
      campos.clube_visitante_id = clube;
      campos.status = 'EM_NEGOCIACAO';
      break;
    case 'DESISTIR':
      campos.clube_visitante_id = '';
      campos.status = 'PROPOSTO';
      break;
    case 'ACEITAR':
      if (!dono) return SEM_PERMISSAO;
      if (clube) campos.clube_visitante_id = clube;
      campos.status = 'ACEITO';
      break;
    case 'RECUSAR':
      if (!dono) return SEM_PERMISSAO;
      campos.clube_visitante_id = '';
      campos.status = 'PROPOSTO';
      break;
    default:
      return json(400, { message: 'acao invalida' });
  }
  campos.tipo_status = tipoStatus('amistoso', visibilidade(campos.status));

  const { nomes, valores, sets } = expressaoSet(campos, 'id');
  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: TABELAS.COMPETICOES, Key: { id },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: nomes,
    ExpressionAttributeValues: valores,
    ConditionExpression: 'attribute_exists(#chave)',
    ReturnValues: 'ALL_NEW',
  }));

  // Quem se candidata passa a enxergar o chat do amistoso.
  if (acao === 'CANDIDATAR') await garantirMembro(id, ator, 'participante');
  return json(200, competicaoParaResposta(Attributes));
}

async function apagar(ator, id, tipo) {
  const item = await obter(id);
  if (!item || item.tipo !== tipo) return NAO_ENCONTRADO;
  if (!ehOrganizador(await papel(id, ator))) return SEM_PERMISSAO;

  // Jogos, eventos e inscricoes saem junto. Sem isso ficam apontando para uma
  // competicao que nao existe mais e aparecem como linhas orfas nas telas.
  const jogos = await consultarTudo({
    TableName: TABELAS.JOGOS,
    IndexName: 'competicao-index',
    KeyConditionExpression: 'competicao_id = :c',
    ExpressionAttributeValues: { ':c': id },
    ProjectionExpression: 'jogo_id, #i',
    ExpressionAttributeNames: { '#i': 'item' },
  });
  await apagarEmLote(TABELAS.JOGOS, jogos.map((j) => ({ jogo_id: j.jogo_id, item: j.item })));

  for (const contexto of [contextoCompeticao(id), contextoClubesCompeticao(id)]) {
    const linhas = await consultarTudo({
      TableName: TABELAS.MEMBROS,
      KeyConditionExpression: 'contexto_id = :c',
      ExpressionAttributeValues: { ':c': contexto },
      ProjectionExpression: 'contexto_id, #u',
      ExpressionAttributeNames: { '#u': 'uid' },
    });
    await apagarEmLote(TABELAS.MEMBROS,
      linhas.map((m) => ({ contexto_id: m.contexto_id, uid: m.uid })));
  }

  await ddb.send(new DeleteCommand({ TableName: TABELAS.COMPETICOES, Key: { id } }));
  return json(204);
}

/* ------------------------- participantes (clubes) ------------------------- */

const lerParticipantes = (id) => consultarTudo({
  TableName: TABELAS.MEMBROS,
  KeyConditionExpression: 'contexto_id = :c',
  ExpressionAttributeValues: { ':c': contextoClubesCompeticao(id) },
});

async function participantes(id) {
  const itens = await lerParticipantes(id);
  return json(200, itens.map((m) => participanteParaResposta(m, id)));
}

async function inscrever(ator, id, corpo) {
  const comp = await obter(id);
  if (!comp) return NAO_ENCONTRADO;

  const clube = texto(corpo?.clube_id).trim();
  if (!clube) return json(400, { message: 'clube_id obrigatorio' });

  const item = {
    contexto_id: contextoClubesCompeticao(id),
    uid: clube,
    clube_id: clube,
    status: texto(corpo?.status, 'PENDENTE'),
    grupo_fase: texto(corpo?.grupo_fase),
    pontos: '0', vitorias: '0', empates: '0', derrotas: '0',
    gols_pro: '0', gols_contra: '0', saldo_gols: '0',
    cartoes_amarelos: '0', cartoes_vermelhos: '0',
    entrou_em: agora(),
    expires_at: proximaExpiracao(),
  };

  try {
    // Reinscrever nao pode zerar a campanha de um clube que ja jogou: se a
    // linha existe, ela fica como esta e devolvemos a atual.
    await ddb.send(new PutCommand({
      TableName: TABELAS.MEMBROS, Item: item,
      ConditionExpression: 'attribute_not_exists(contexto_id)',
    }));
  } catch (e) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;
    const { Item } = await ddb.send(new GetCommand({
      TableName: TABELAS.MEMBROS,
      Key: { contexto_id: contextoClubesCompeticao(id), uid: clube },
    }));
    return json(200, participanteParaResposta(Item, id));
  }

  // Quem inscreve o clube passa a enxergar o chat do campeonato.
  await garantirMembro(id, ator, 'participante', { clube_id: clube });
  return json(201, participanteParaResposta(item, id));
}

const EDITAVEIS_PARTICIPANTE = ['status', 'grupo_fase', 'pontos', 'vitorias', 'empates',
  'derrotas', 'gols_pro', 'gols_contra', 'saldo_gols', 'cartoes_amarelos', 'cartoes_vermelhos'];

async function atualizarParticipante(ator, id, clubeId, corpo) {
  if (!ehOrganizador(await papel(id, ator))) return SEM_PERMISSAO;

  const campos = {};
  for (const k of EDITAVEIS_PARTICIPANTE) {
    if (corpo?.[k] !== undefined) campos[k] = String(corpo[k]);
  }
  if (!Object.keys(campos).length) return json(400, { message: 'nada para atualizar' });

  const { nomes, valores, sets } = expressaoSet(campos, 'contexto_id');
  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: TABELAS.MEMBROS,
    Key: { contexto_id: contextoClubesCompeticao(id), uid: clubeId },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: nomes,
    ExpressionAttributeValues: valores,
    ConditionExpression: 'attribute_exists(#chave)',
    ReturnValues: 'ALL_NEW',
  }));
  return json(200, participanteParaResposta(Attributes, id));
}

const LETRAS = 'ABCDEFGH';

/**
 * POST /campeonatos/{id}/participantes/sortear-grupos
 *
 * Distribui os clubes aceitos em grupos ciclicamente, e nao em blocos: com 10
 * times em 4 grupos, ciclico da 3/3/2/2 enquanto em blocos daria 3/3/3/1.
 */
async function sortearGrupos(ator, id, corpo) {
  const comp = await obter(id);
  if (!comp) return NAO_ENCONTRADO;
  if (!ehOrganizador(await papel(id, ator))) return SEM_PERMISSAO;

  // Sortear e o ato de confirmar quem entrou: quem estava pendente passa a
  // confirmado aqui, e so quem foi recusado fica de fora.
  const inscritos = (await lerParticipantes(id)).filter((p) => p.status !== 'RECUSADO');
  if (!inscritos.length) return json(400, { message: 'nenhum clube inscrito' });

  const qtd = Math.min(Math.max(
    Number(corpo?.qtd_grupos) || Number(comp.qtd_grupos) || 1, 1), LETRAS.length);

  const ordem = [...inscritos];
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }

  const atualizados = ordem.map((p, i) => ({
    ...p, grupo_fase: LETRAS[i % qtd], status: CONFIRMADO, expires_at: proximaExpiracao(),
  }));
  await gravarEmLote(TABELAS.MEMBROS, atualizados);

  await ddb.send(new UpdateCommand({
    TableName: TABELAS.COMPETICOES, Key: { id },
    UpdateExpression: 'SET qtd_grupos = :q, fase_atual = :f, atualizado_em = :a',
    ExpressionAttributeValues: { ':q': qtd, ':f': 'GRUPOS', ':a': agora() },
    ConditionExpression: 'attribute_exists(id)',
  }));

  return json(200, atualizados.map((p) => participanteParaResposta(p, id)));
}

/* --------------------------------- jogos ---------------------------------- */

const lerItensDaCompeticao = (id) => consultarTudo({
  TableName: TABELAS.JOGOS,
  IndexName: 'competicao-index',
  KeyConditionExpression: 'competicao_id = :c',
  ExpressionAttributeValues: { ':c': id },
});

async function listarJogos(id) {
  const itens = await lerItensDaCompeticao(id);
  // O indice traz jogo e eventos juntos; a lista de jogos quer so os jogos.
  return json(200, itens.filter((x) => x.item === ITEM_JOGO).map((j) => jogoParaResposta(j)));
}

async function eventosDaCompeticao(id) {
  const itens = await lerItensDaCompeticao(id);
  return json(200, itens.filter((x) => x.item !== ITEM_JOGO).map((e) => eventoParaResposta(e)));
}

/** Jogo e eventos numa Query so, porque dividem a particao. */
const lerJogo = (jogoId) => consultarTudo({
  TableName: TABELAS.JOGOS,
  KeyConditionExpression: 'jogo_id = :j',
  ExpressionAttributeValues: { ':j': jogoId },
});

async function eventosDoJogo(jogoId) {
  const itens = await lerJogo(jogoId);
  return json(200, itens.filter((x) => x.item !== ITEM_JOGO).map((e) => eventoParaResposta(e)));
}

function montarJogo(compId, corpo) {
  const jogoId = texto(corpo?.id).trim() || randomUUID().replace(/-/g, '');
  const dataHora = texto(corpo?.data_hora);
  return {
    jogo_id: jogoId,
    item: ITEM_JOGO,
    competicao_id: compId,
    // inicio_em e a sort key do competicao-index: sem ela o jogo nao entra no
    // indice e some da listagem.
    inicio_em: dataHora || agora(),
    data_hora: dataHora,
    rodada: texto(corpo?.rodada, '1'),
    fase: texto(corpo?.fase, 'GRUPOS'),
    grupo_id: texto(corpo?.grupo_id) || null,
    clube_a_id: texto(corpo?.clube_a_id),
    clube_b_id: texto(corpo?.clube_b_id),
    status: texto(corpo?.status, 'AGENDADO'),
    placar_a: texto(corpo?.placar_a, '0'),
    placar_b: texto(corpo?.placar_b, '0'),
    wo: Boolean(corpo?.wo),
    id_jogo_proximo: texto(corpo?.id_jogo_proximo) || null,
    local: texto(corpo?.local),
    motm_jogador_id: '',
    motm_jogador_nome: '',
    criado_em: agora(),
    atualizado_em: agora(),
    expires_at: proximaExpiracao(),
  };
}

async function criarJogo(ator, compId, corpo) {
  if (!ehOrganizador(await papel(compId, ator))) return SEM_PERMISSAO;
  const item = montarJogo(compId, corpo);
  await ddb.send(new PutCommand({ TableName: TABELAS.JOGOS, Item: item }));
  return json(201, jogoParaResposta(item));
}

const EDITAVEIS_JOGO = ['status', 'placar_a', 'placar_b', 'rodada', 'fase', 'grupo_id',
  'clube_a_id', 'clube_b_id', 'local', 'wo', 'vencedor_penaltis_id',
  'motm_jogador_id', 'motm_jogador_nome', 'id_jogo_proximo'];

async function atualizarJogo(ator, compId, jogoId, corpo) {
  if (!ehOrganizador(await papel(compId, ator))) return SEM_PERMISSAO;

  const campos = { atualizado_em: agora() };
  for (const k of EDITAVEIS_JOGO) {
    if (corpo?.[k] !== undefined) campos[k] = corpo[k];
  }
  if (corpo?.data_hora !== undefined) {
    campos.data_hora = String(corpo.data_hora);
    // inicio_em acompanha data_hora: e a sort key do indice, e deixa-la para
    // tras faria o jogo aparecer na ordem errada da tabela.
    campos.inicio_em = campos.data_hora || agora();
  }

  const { nomes, valores, sets } = expressaoSet(campos, 'jogo_id');
  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: TABELAS.JOGOS,
    Key: { jogo_id: jogoId, item: ITEM_JOGO },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: nomes,
    ExpressionAttributeValues: valores,
    ConditionExpression: 'attribute_exists(#chave)',
    ReturnValues: 'ALL_NEW',
  }));
  return json(200, jogoParaResposta(Attributes));
}

const UMA_HORA = 3600_000;

/**
 * POST /campeonatos/{id}/jogos/gerar-grupos
 *
 * Turno unico dentro de cada grupo, pelo metodo do circulo: um time fica fixo e
 * os outros giram, o que garante que cada rodada use cada time uma vez so. Com
 * numero impar de times entra um "bye", e quem cair com ele folga na rodada.
 */
async function gerarJogosPorGrupo(ator, id, corpo) {
  if (!ehOrganizador(await papel(id, ator))) return SEM_PERMISSAO;

  const inscritos = (await lerParticipantes(id)).filter((p) => p.status === CONFIRMADO);
  if (inscritos.length < 2) return json(400, { message: 'poucos clubes confirmados' });

  const porGrupo = new Map();
  for (const p of inscritos) {
    const g = p.grupo_fase || 'A';
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(p.clube_id ?? p.uid);
  }

  const base = Date.parse(texto(corpo?.data_hora_base)) || Date.now();
  const jogos = [];

  for (const [grupo, times] of porGrupo) {
    const fila = [...times];
    if (fila.length % 2 === 1) fila.push(null); // bye: quem cair com ele folga
    const rodadas = fila.length - 1;
    const metade = fila.length / 2;

    for (let r = 0; r < rodadas; r++) {
      for (let i = 0; i < metade; i++) {
        const a = fila[i]; const b = fila[fila.length - 1 - i];
        if (!a || !b) continue;
        jogos.push(montarJogo(id, {
          rodada: String(r + 1),
          fase: 'GRUPOS',
          grupo_id: grupo,
          clube_a_id: a,
          clube_b_id: b,
          data_hora: new Date(base + (r * 24 + i) * UMA_HORA).toISOString(),
        }));
      }
      // Gira todos menos o primeiro.
      fila.splice(1, 0, fila.pop());
    }
  }

  await gravarEmLote(TABELAS.JOGOS, jogos);
  await ddb.send(new UpdateCommand({
    TableName: TABELAS.COMPETICOES, Key: { id },
    UpdateExpression: 'SET fase_atual = :f, atualizado_em = :a',
    ExpressionAttributeValues: { ':f': 'GRUPOS', ':a': agora() },
    ConditionExpression: 'attribute_exists(id)',
  }));
  return json(201, jogos.map((j) => jogoParaResposta(j)));
}

const NOME_FASE = { 2: 'FINAL', 4: 'SEMIFINAL', 8: 'QUARTAS', 16: 'OITAVAS', 32: 'TRINTA_E_DOIS' };

/**
 * POST /campeonatos/{id}/jogos/gerar-mata-mata
 *
 * Monta o chaveamento inteiro de uma vez, da primeira fase ate a final, ligando
 * cada jogo ao seguinte por id_jogo_proximo. Criar so a primeira fase obrigaria
 * a gerar a proxima a mao depois de cada rodada, e e exatamente ai que o codigo
 * antigo deixava chaves pela metade.
 *
 * O cruzamento e o classico - melhor contra pior - a partir do ranqueamento por
 * pontos, saldo e gols, o mesmo criterio da tabela de classificacao.
 */
async function gerarJogosMataMata(ator, id, corpo) {
  const comp = await obter(id);
  if (!comp) return NAO_ENCONTRADO;
  if (!ehOrganizador(await papel(id, ator))) return SEM_PERMISSAO;

  const porGrupo = new Map();
  for (const p of (await lerParticipantes(id)).filter((x) => x.status === CONFIRMADO)) {
    const g = p.grupo_fase || 'A';
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(p);
  }
  if (!porGrupo.size) return json(400, { message: 'nenhum clube confirmado' });

  const grupos = [...porGrupo.entries()].sort(([a], [b]) => a.localeCompare(b));
  const vagas = Math.max(Number(comp.classificados_por_grupo) || 2, 1);

  const ordenar = (a, b) => Number(b.pontos || 0) - Number(a.pontos || 0)
    || Number(b.saldo_gols || 0) - Number(a.saldo_gols || 0)
    || Number(b.gols_pro || 0) - Number(a.gols_pro || 0);

  // Classificados por colocacao: todos os primeiros, depois todos os segundos.
  const classificaveis = [];
  for (let pos = 0; pos < vagas; pos++) {
    for (const [, times] of grupos) {
      const t = [...times].sort(ordenar)[pos];
      if (t) classificaveis.push(t.clube_id ?? t.uid);
    }
  }

  // A chave precisa de uma potencia de 2. Sobrando time, os piores ficam fora.
  let tamanho = 1;
  while (tamanho * 2 <= classificaveis.length) tamanho *= 2;
  if (tamanho < 2) return json(400, { message: 'classificados insuficientes' });
  const classificados = classificaveis.slice(0, tamanho);

  const base = Date.parse(texto(corpo?.data_hora_base)) || Date.now();
  const jogos = [];
  let faseAnterior = [];

  for (let n = tamanho; n >= 2; n /= 2) {
    const rodada = Math.log2(tamanho / n) + 1;
    const desta = [];
    for (let i = 0; i < n / 2; i++) {
      // Fases seguintes nascem sem clube: os times entram conforme os jogos
      // anteriores forem decididos.
      const primeira = n === tamanho;
      desta.push(montarJogo(id, {
        rodada: String(rodada),
        fase: NOME_FASE[n] ?? `FASE_${n}`,
        clube_a_id: primeira ? classificados[i] : '',
        clube_b_id: primeira ? classificados[n - 1 - i] : '',
        data_hora: new Date(base + ((rodada - 1) * 7 * 24 + i) * UMA_HORA).toISOString(),
      }));
    }
    // Liga a fase anterior a esta: dois jogos alimentam um.
    faseAnterior.forEach((jogo, i) => { jogo.id_jogo_proximo = desta[Math.floor(i / 2)].jogo_id; });
    jogos.push(...desta);
    faseAnterior = desta;
  }

  await gravarEmLote(TABELAS.JOGOS, jogos);
  await ddb.send(new UpdateCommand({
    TableName: TABELAS.COMPETICOES, Key: { id },
    UpdateExpression: 'SET fase_atual = :f, atualizado_em = :a',
    ExpressionAttributeValues: { ':f': NOME_FASE[tamanho] ?? 'MATA_MATA', ':a': agora() },
    ConditionExpression: 'attribute_exists(id)',
  }));
  return json(201, jogos.map((j) => jogoParaResposta(j)));
}

async function criarEvento(ator, compId, jogoId, corpo) {
  if (!ehOrganizador(await papel(compId, ator))) return SEM_PERMISSAO;

  const jogo = (await lerJogo(jogoId)).find((x) => x.item === ITEM_JOGO);
  if (!jogo) return json(404, { message: 'jogo nao encontrado' });

  const quando = agora();
  const eventoId = texto(corpo?.id).trim() || randomUUID().slice(0, 12);
  const item = {
    jogo_id: jogoId,
    item: itemEvento(quando, eventoId),
    competicao_id: compId,
    // inicio_em tambem no evento: e a sort key do competicao-index, e sem ela o
    // evento nao entra no indice e some da lista da competicao.
    inicio_em: jogo.inicio_em ?? quando,
    evento_id: eventoId,
    tipo_evento: texto(corpo?.tipo, 'GOL'),
    uid_autor: texto(corpo?.jogador_id),
    jogador_nome: texto(corpo?.jogador_nome),
    clube_id: texto(corpo?.clube_id),
    minuto: texto(corpo?.minuto, '0'),
    criado_em: quando,
    expires_at: proximaExpiracao(),
  };
  await ddb.send(new PutCommand({ TableName: TABELAS.JOGOS, Item: item }));
  return json(201, eventoParaResposta(item));
}

/* -------------------------------- roteador -------------------------------- */

/** /campeonatos e /amistosos entram no mesmo handler; o caminho diz o tipo. */
const TIPO_POR_RAIZ = { campeonatos: 'campeonato', amistosos: 'amistoso' };

exports.handler = async (event) => {
  const ator = identidade(event);
  if (!ator) return json(401, { message: 'nao autenticado' });

  const metodo = event.requestContext?.http?.method ?? '';
  const caminho = (event.rawPath ?? '').replace(/\/+$/, '');
  const q = event.queryStringParameters ?? {};

  let corpo = {};
  if (event.body) {
    try {
      corpo = JSON.parse(event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
    } catch { return json(400, { message: 'corpo invalido' }); }
  }

  const [raiz, id, sub, quarto, quinto] = caminho.split('/').filter(Boolean);
  const tipo = TIPO_POR_RAIZ[raiz];
  if (!tipo || !TIPOS_COMPETICAO.includes(tipo)) return NAO_ENCONTRADO;

  try {
    if (!id) {
      if (metodo === 'GET') {
        return tipo === 'campeonato'
          ? await listarCampeonatos(ator, q.scope)
          : await listarAmistosos(ator, q);
      }
      if (metodo === 'POST') return await criar(ator, tipo, corpo);
      return json(405, { message: 'metodo nao suportado' });
    }

    if (!sub) {
      if (metodo === 'GET') return await ver(id, tipo);
      if (metodo === 'PUT' || metodo === 'PATCH') return await atualizar(ator, id, tipo, corpo);
      if (metodo === 'DELETE') return await apagar(ator, id, tipo);
      return json(405, { message: 'metodo nao suportado' });
    }

    if (sub === 'candidatura' && metodo === 'PUT') return await candidatura(ator, id, corpo);
    if (sub === 'eventos' && metodo === 'GET') return await eventosDaCompeticao(id);

    if (sub === 'participantes') {
      if (!quarto) {
        if (metodo === 'GET') return await participantes(id);
        if (metodo === 'POST') return await inscrever(ator, id, corpo);
      } else if (quarto === 'sortear-grupos' && metodo === 'POST') {
        return await sortearGrupos(ator, id, corpo);
      } else if (metodo === 'PUT') {
        return await atualizarParticipante(ator, id, quarto, corpo);
      }
    }

    if (sub === 'jogos') {
      if (!quarto) {
        if (metodo === 'GET') return await listarJogos(id);
        if (metodo === 'POST') return await criarJogo(ator, id, corpo);
      } else if (quarto === 'gerar-grupos' && metodo === 'POST') {
        return await gerarJogosPorGrupo(ator, id, corpo);
      } else if (quarto === 'gerar-mata-mata' && metodo === 'POST') {
        return await gerarJogosMataMata(ator, id, corpo);
      } else if (quinto === 'eventos') {
        if (metodo === 'GET') return await eventosDoJogo(quarto);
        if (metodo === 'POST') return await criarEvento(ator, id, quarto, corpo);
      } else if (!quinto && (metodo === 'PUT' || metodo === 'PATCH')) {
        return await atualizarJogo(ator, id, quarto, corpo);
      }
    }

    return NAO_ENCONTRADO;
  } catch (erro) {
    if (erro?.name === 'ConditionalCheckFailedException') return NAO_ENCONTRADO;
    console.error('competicoes_falhou', metodo, caminho, erro);
    return json(500, { message: 'falha interna' });
  }
};
