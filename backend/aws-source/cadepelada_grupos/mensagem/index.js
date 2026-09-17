'use strict';
/**
 * cadepelada_mensagens - todos os chats do app.
 *
 * Existia duplicado dentro de quatro Lambdas - grupo, clube, campeonato e
 * amistoso - cada uma com sua propria versao de "enviar mensagem", e as cinco
 * tabelas de chat tinham chaves ligeiramente diferentes entre si.
 *
 * Agora e uma tabela (CadePelada-Mensagens) e um handler. O tipo de conversa
 * vira prefixo da chave de particao, montado sempre pelo modulo lib/chaves - e
 * dali vem a garantia de que uma conversa privada entre A e B cai na mesma
 * particao independentemente de quem abriu.
 *
 * Os caminhos continuam sendo os do app, e nao um /mensagem/* proprio: o cliente
 * publicado chama /grupo/{id}/chat, /campeonatos/{id}/chat e afins, e inventar
 * um caminho novo aqui exigiria uma versao nova do app para qualquer chat
 * funcionar.
 */

const {
  PutCommand, DeleteCommand, QueryCommand, GetCommand, BatchGetCommand, BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');

const {
  TABELAS, conversaGrupo, conversaClube, conversaCompeticao, conversaAmistoso,
  conversaPrivada, contextoGrupo, contextoClube, contextoCompeticao, itemConversa,
} = require('../lib/chaves');
const { ddb, proximaExpiracao } = require('../lib/jogadores');
const { mensagemParaResposta } = require('../lib/mapeadores');

const json = (statusCode, corpo) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: corpo === undefined ? '' : JSON.stringify(corpo),
});

const SEM_PERMISSAO = json(403, { message: 'sem permissao nesta conversa' });

function identidade(event) {
  const ctx = event?.requestContext?.authorizer?.lambda
    ?? event?.requestContext?.authorizer ?? {};
  return String(ctx.uid || ctx.actorId || '').trim() || null;
}

const agora = () => new Date().toISOString();

/**
 * Traduz (tipo, id) em conversa, contexto de associacao e nome do campo de id
 * que o app espera de volta.
 *
 * Conversa privada nao tem contexto: o direito de falar vem de ser um dos dois
 * lados, nao de pertencer a algum lugar.
 */
function resolver(tipo, id, ator) {
  switch (tipo) {
    case 'grupo':
      return { conversa: conversaGrupo(id), contexto: contextoGrupo(id), campo: 'grupo_id' };
    case 'clube':
      return { conversa: conversaClube(id), contexto: contextoClube(id), campo: 'clube_id' };
    case 'campeonato':
      return { conversa: conversaCompeticao(id), contexto: contextoCompeticao(id), campo: 'campeonato_id' };
    case 'amistoso':
      return { conversa: conversaAmistoso(id), contexto: contextoCompeticao(id), campo: 'amistoso_id' };
    case 'privado':
      // O app reaproveita MensagemChatPeladaProxima no chat direto, entao o
      // campo de contexto continua se chamando grupo_id - e fica vazio.
      return { conversa: conversaPrivada(ator, id), outro: id, campo: 'grupo_id' };
    default:
      return null;
  }
}

/** So quem pertence ao contexto le e escreve. Conversa privada dispensa. */
async function podeParticipar(alvo, ator) {
  if (!alvo) return false;
  if (!alvo.contexto) return true;
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABELAS.MEMBROS,
    Key: { contexto_id: alvo.contexto, uid: ator },
  }));
  // Pendente ainda nao entrou: ler o chat antes de ser aceito vazaria conversa
  // de um grupo fechado para quem so pediu para entrar.
  return Boolean(Item) && Item.papel !== 'pendente';
}

const ehAdminDoContexto = async (contexto, ator) => {
  if (!contexto) return false;
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABELAS.MEMBROS, Key: { contexto_id: contexto, uid: ator },
  }));
  return Item?.papel === 'dono' || Item?.papel === 'admin';
};

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

/**
 * GET .../chat -> array nu de mensagens, mais antiga primeiro.
 *
 * A Query desce (mais novas primeiro) para pegar o fim da conversa sem paginar
 * desde o inicio, e a lista e invertida antes de sair: o app desenha de cima
 * para baixo e espera ordem cronologica.
 */
async function historico(alvo, limite) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.MENSAGENS,
    KeyConditionExpression: 'conversa_id = :c',
    ExpressionAttributeValues: { ':c': alvo.conversa },
    ScanIndexForward: false,
    Limit: limite,
  }));

  const itens = (r.Items ?? []).reverse();
  const perfis = await carregarPerfis(itens.map((m) => m.uid_autor));
  return json(200, itens.map((m) => mensagemParaResposta(m, {
    campoContexto: alvo.campo,
    contextoId: alvo.id,
    autor: perfis.get(m.uid_autor),
  })));
}

async function enviar(ator, alvo, corpo) {
  const texto = String(corpo?.texto ?? corpo?.mensagem ?? '').trim();
  if (!texto) return json(400, { message: 'texto obrigatorio' });
  if (texto.length > 2000) return json(400, { message: 'texto muito longo' });

  const item = {
    conversa_id: alvo.conversa,
    // ISO-8601 ordena lexicograficamente, entao serve de sort key sem campo
    // extra. O sufixo aleatorio evita que duas mensagens no mesmo milissegundo
    // se sobrescrevam - com PutItem, a segunda apagaria a primeira.
    criado_em: `${agora()}#${randomUUID().slice(0, 8)}`,
    mensagem_id: randomUUID().slice(0, 16),
    uid_autor: ator,
    texto,
    expires_at: proximaExpiracao(),
  };
  // Conversa privada precisa do destinatario para alimentar o inbox-index.
  if (alvo.outro) item.uid_destino = alvo.outro;

  await ddb.send(new PutCommand({ TableName: TABELAS.MENSAGENS, Item: item }));

  // Marcador do lado de quem escreveu, para a conversa aparecer no inbox dele
  // mesmo sem resposta. Ver itemConversa em lib/chaves.
  if (alvo.outro) {
    await ddb.send(new PutCommand({
      TableName: TABELAS.JOGADOR_DADOS,
      Item: {
        uid: ator,
        item: itemConversa(alvo.outro),
        conversa_id: alvo.conversa,
        uid_outro: alvo.outro,
        atualizado_em: item.criado_em,
        expires_at: proximaExpiracao(),
      },
    }));
  }

  const perfis = await carregarPerfis([ator]);
  return json(201, mensagemParaResposta(item, {
    campoContexto: alvo.campo, contextoId: alvo.id, autor: perfis.get(ator),
  }));
}

async function apagar(ator, alvo, mensagemId) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABELAS.MENSAGENS,
    IndexName: 'mensagem-index',
    KeyConditionExpression: 'mensagem_id = :m',
    ExpressionAttributeValues: { ':m': mensagemId },
    Limit: 1,
  }));
  const msg = (r.Items ?? [])[0];
  if (!msg || msg.conversa_id !== alvo.conversa) {
    return json(404, { message: 'mensagem nao encontrada' });
  }

  const dono = msg.uid_autor === ator;
  if (!dono && !(await ehAdminDoContexto(alvo.contexto, ator))) return SEM_PERMISSAO;

  await ddb.send(new DeleteCommand({
    TableName: TABELAS.MENSAGENS,
    Key: { conversa_id: msg.conversa_id, criado_em: msg.criado_em },
  }));
  return json(204);
}

/** DELETE /jogador/{id}/chat: apaga a conversa privada inteira, dos dois lados. */
async function apagarConversa(ator, alvo) {
  let cursor;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABELAS.MENSAGENS,
      KeyConditionExpression: 'conversa_id = :c',
      ExpressionAttributeValues: { ':c': alvo.conversa },
      ProjectionExpression: 'conversa_id, criado_em',
      ExclusiveStartKey: cursor,
    }));
    const itens = r.Items ?? [];
    for (let i = 0; i < itens.length; i += 25) {
      await ddb.send(new BatchWriteCommand({
        RequestItems: {
          [TABELAS.MENSAGENS]: itens.slice(i, i + 25).map((m) => ({
            DeleteRequest: { Key: { conversa_id: m.conversa_id, criado_em: m.criado_em } },
          })),
        },
      }));
    }
    cursor = r.LastEvaluatedKey;
  } while (cursor);

  await ddb.send(new DeleteCommand({
    TableName: TABELAS.JOGADOR_DADOS,
    Key: { uid: ator, item: itemConversa(alvo.outro) },
  }));
  return json(204);
}

/**
 * GET /jogador/chat/inbox -> InboxChatDiretoResposta.
 *
 * Duas origens, pelo mesmo motivo explicado em itemConversa: o inbox-index so
 * enxerga o que me mandaram, e os marcadores em JogadorDados cobrem as conversas
 * que eu comecei.
 */
async function inbox(ator, limite) {
  const recebidas = await ddb.send(new QueryCommand({
    TableName: TABELAS.MENSAGENS,
    IndexName: 'inbox-index',
    KeyConditionExpression: 'uid_destino = :u',
    ExpressionAttributeValues: { ':u': ator },
    ScanIndexForward: false,
    Limit: limite * 10,
  }));

  // Uma linha por conversa, a mais recente de cada.
  const porConversa = new Map();
  for (const m of recebidas.Items ?? []) {
    if (!porConversa.has(m.conversa_id)) porConversa.set(m.conversa_id, m);
  }

  const marcadores = await ddb.send(new QueryCommand({
    TableName: TABELAS.JOGADOR_DADOS,
    KeyConditionExpression: '#u = :u AND begins_with(#i, :p)',
    ExpressionAttributeNames: { '#u': 'uid', '#i': 'item' },
    ExpressionAttributeValues: { ':u': ator, ':p': 'conversa#' },
  }));
  const faltando = (marcadores.Items ?? []).filter((c) => !porConversa.has(c.conversa_id));

  // Busca a ultima mensagem so das conversas que o indice nao trouxe.
  for (const c of faltando.slice(0, limite)) {
    const r = await ddb.send(new QueryCommand({
      TableName: TABELAS.MENSAGENS,
      KeyConditionExpression: 'conversa_id = :c',
      ExpressionAttributeValues: { ':c': c.conversa_id },
      ScanIndexForward: false,
      Limit: 1,
    }));
    const ultima = (r.Items ?? [])[0];
    if (ultima) porConversa.set(c.conversa_id, { ...ultima, uid_outro: c.uid_outro });
  }

  const ultimas = [...porConversa.values()]
    .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
    .slice(0, limite);

  // Quem e "o outro" depende de quem escreveu a ultima mensagem.
  const outroDe = (m) => m.uid_outro
    ?? (m.uid_autor === ator ? m.uid_destino : m.uid_autor);

  const perfis = await carregarPerfis(ultimas.map(outroDe));
  return json(200, {
    items: ultimas.map((m) => {
      const outro = outroDe(m);
      const perfil = perfis.get(outro);
      return {
        conversa_id: String(m.conversa_id ?? ''),
        outro_jogador_id: String(outro ?? ''),
        outro_jogador_nome: String(perfil?.nome ?? ''),
        outro_jogador_imagem: String(perfil?.imagem ?? ''),
        ultima_mensagem: String(m.texto ?? ''),
        ultima_mensagem_at: Date.parse(String(m.criado_em ?? '').split('#')[0]) || 0,
        ultima_mensagem_autor_id: String(m.uid_autor ?? ''),
        // Novo quando a ultima palavra nao foi minha.
        has_new: m.uid_autor !== ator,
      };
    }),
    pending_count: ultimas.filter((m) => m.uid_autor !== ator).length,
  });
}

/* -------------------------------- roteador -------------------------------- */

/**
 * Traduz o caminho do app em (tipo, id, mensagemId).
 *
 * Cinco formas, uma por tela:
 *   /grupo/{id}/chat[/{msg}]
 *   /clubes/{id}/chat[/{msg}]
 *   /campeonatos/{id}/chat[/{msg}]
 *   /amistosos/{id}/chat[/{msg}]
 *   /jogador/{id}/chat/list | /send | /{msg} | (vazio)
 *   /jogador/chat/inbox
 */
const TIPO_POR_RAIZ = {
  grupo: 'grupo',
  clubes: 'clube',
  campeonatos: 'campeonato',
  amistosos: 'amistoso',
  jogador: 'privado',
};

function lerCaminho(partes) {
  const [raiz, id, sub, quarto] = partes;
  const tipo = TIPO_POR_RAIZ[raiz];
  if (!tipo || sub !== 'chat') return null;

  if (tipo === 'privado') {
    if (id === 'chat') return null; // /jogador/chat/inbox, tratado antes
    // list e send sao verbos no caminho, nao ids de mensagem.
    const mensagemId = quarto === 'list' || quarto === 'send' ? undefined : quarto;
    return { tipo, id, mensagemId, acao: quarto };
  }
  return { tipo, id, mensagemId: quarto };
}

exports.handler = async (event) => {
  const ator = identidade(event);
  if (!ator) return json(401, { message: 'nao autenticado' });

  const metodo = event.requestContext?.http?.method ?? '';
  const caminho = (event.rawPath ?? '').replace(/\/+$/, '');
  const q = event.queryStringParameters ?? {};
  const limite = Math.min(Math.max(Number(q.limit) || 50, 1), 200);

  let corpo = {};
  if (event.body) {
    try {
      corpo = JSON.parse(event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
    } catch { return json(400, { message: 'corpo invalido' }); }
  }

  const partes = caminho.split('/').filter(Boolean);

  try {
    // /jogador/chat/inbox: "chat" ocupa a posicao do id, entao nao colide com
    // /jogador/{id}/chat.
    if (partes[0] === 'jogador' && partes[1] === 'chat' && partes[2] === 'inbox') {
      if (metodo !== 'GET') return json(405, { message: 'metodo nao suportado' });
      return await inbox(ator, limite);
    }

    const rota = lerCaminho(partes);
    if (!rota) return json(404, { message: 'nao encontrado' });

    const alvo = resolver(rota.tipo, rota.id, ator);
    if (!alvo) return json(400, { message: 'tipo de conversa invalido' });
    alvo.id = rota.id;
    if (!(await podeParticipar(alvo, ator))) return SEM_PERMISSAO;

    if (metodo === 'GET') return await historico(alvo, limite);
    if (metodo === 'POST') return await enviar(ator, alvo, corpo);
    if (metodo === 'DELETE') {
      if (rota.mensagemId) return await apagar(ator, alvo, rota.mensagemId);
      // Apagar a conversa inteira so faz sentido no chat direto.
      if (alvo.outro) return await apagarConversa(ator, alvo);
    }

    return json(405, { message: 'metodo nao suportado' });
  } catch (erro) {
    console.error('mensagens_falhou', metodo, caminho, erro);
    return json(500, { message: 'falha interna' });
  }
};
