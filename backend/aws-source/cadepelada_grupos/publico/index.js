'use strict';
/**
 * cadepelada_publico - leitura aberta de peladas, clubes e competicoes.
 *
 * Esta e a unica Lambda que responde sem token, e por isso ela e deliberadamente
 * limitada:
 *
 *   - so aceita GET; nao existe caminho de escrita aqui, nem por engano;
 *   - devolve apenas campos de vitrine, montados por lista branca. O que nao
 *     esta na lista nao sai, entao um campo novo no banco nunca vaza por
 *     esquecimento - e o contrario de remover campos, onde esquecer vaza;
 *   - nao expoe membros, chat, telefone, e-mail nem nada de jogador.
 *
 * As rotas autenticadas continuam exatamente como estavam, em outra Lambda e
 * sob o autorizador. Esta aqui e um acrescimo, nao uma troca: o aplicativo que
 * ja esta publicado nao percebe diferenca.
 */

const { GetCommand, QueryCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const {
  TABELAS, contextoClubesCompeticao, ITEM_JOGO, tipoStatus,
} = require('../lib/chaves');
const { ddb } = require('../lib/jogadores');

const s3 = new S3Client({});
const BUCKET = process.env.IMAGE_BUCKET || 'cadepelada';

const json = (statusCode, corpo) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    // Conteudo publico e o mesmo para todo mundo: vale cache de borda.
    'cache-control': 'public, max-age=60',
  },
  body: corpo === undefined ? '' : JSON.stringify(corpo),
});

const NAO_ENCONTRADO = json(404, { message: 'nao encontrado' });

const texto = (v, padrao = '') => (v == null || v === '' ? padrao : String(v));
const numero = (v, padrao = 0) => (Number.isFinite(Number(v)) ? Number(v) : padrao);

/* ------------------------------ vitrine ----------------------------------- */

/** Campeonato visto de fora: nada de organizador, regulamento interno ou datas de controle. */
const campeonatoPublico = (c) => ({
  id: texto(c.id),
  nome: texto(c.nome),
  cidade: texto(c.cidade),
  formato: texto(c.formato, 'PONTOS_CORRIDOS'),
  status: texto(c.status, 'RASCUNHO'),
  fase_atual: texto(c.fase_atual),
  regulamento: texto(c.regulamento),
  qtd_grupos: numero(c.qtd_grupos),
  classificados_por_grupo: numero(c.classificados_por_grupo, 2),
  data_inicio: texto(c.data_inicio),
  data_fim: texto(c.data_fim),
  data_inscricao_inicio: texto(c.data_inscricao_inicio),
  data_inscricao_fim: texto(c.data_inscricao_fim),
});

const amistosoPublico = (a) => ({
  id: texto(a.id),
  clube_mandante_id: texto(a.clube_mandante_id),
  clube_visitante_id: texto(a.clube_visitante_id),
  status: texto(a.status, 'PROPOSTO'),
  tipo: texto(a.tipo_desafio, 'DIRETO'),
  data_hora: texto(a.data_hora),
  local_nome: texto(a.local_nome),
  cidade: texto(a.cidade),
  estado: texto(a.estado),
  placar_mandante: texto(a.placar_mandante, '0'),
  placar_visitante: texto(a.placar_visitante, '0'),
});

const clubePublico = (c) => ({
  id: texto(c.id),
  nome: texto(c.nome),
  cidade: texto(c.cidade),
  estado: texto(c.estado),
  descricao: texto(c.descricao),
  privacidade: texto(c.privacidade, 'ABERTO'),
});

/**
 * Pelada vista de fora.
 *
 * Sai de proposito tudo que identifica quem joga: `participantes` e uma lista de
 * uids, e os campos de ranking carregam o scout de cada atleta. Quem so esta
 * olhando ve onde e quando, nao quem.
 */
const grupoPublico = (g) => ({
  id: texto(g.id),
  nome: texto(g.nome),
  cidade: texto(g.cidade),
  local: texto(g.local),
  dia_semana: texto(g.dia_semana),
  hora_inicio: texto(g.hora_inicio),
  hora_fim: texto(g.hora_fim),
  tipo_pelada: texto(g.tipo_pelada),
  valor: texto(g.valor),
  jogadores_por_time: texto(g.jogadores_por_time),
  pelada_proxima: texto(g.pelada_proxima, 'false'),
  data_peladaproxima: texto(g.data_peladaproxima),
  inscritos: texto(g.inscritos, '0'),
  latitude: texto(g.latitude, '0.0'),
  longitude: texto(g.longitude, '0.0'),
});

const participantePublico = (p, compId) => ({
  campeonato_id: texto(compId),
  clube_id: texto(p.clube_id ?? p.uid),
  status: texto(p.status, 'PENDENTE'),
  grupo_fase: texto(p.grupo_fase),
  pontos: texto(p.pontos, '0'),
  vitorias: texto(p.vitorias, '0'),
  empates: texto(p.empates, '0'),
  derrotas: texto(p.derrotas, '0'),
  gols_pro: texto(p.gols_pro, '0'),
  gols_contra: texto(p.gols_contra, '0'),
  saldo_gols: texto(p.saldo_gols, '0'),
  cartoes_amarelos: texto(p.cartoes_amarelos, '0'),
  cartoes_vermelhos: texto(p.cartoes_vermelhos, '0'),
});

const jogoPublico = (j) => ({
  id: texto(j.jogo_id),
  campeonato_id: texto(j.competicao_id),
  rodada: texto(j.rodada, '1'),
  fase: texto(j.fase, 'GRUPOS'),
  grupo_id: j.grupo_id ? String(j.grupo_id) : null,
  clube_a_id: texto(j.clube_a_id),
  clube_b_id: texto(j.clube_b_id),
  status: texto(j.status, 'AGENDADO'),
  placar_a: texto(j.placar_a, '0'),
  placar_b: texto(j.placar_b, '0'),
  // Sem isto o chaveamento nao consegue dizer quem passou num 1 a 1.
  vencedor_penaltis_id: texto(j.vencedor_penaltis_id),
  data_hora: texto(j.data_hora ?? j.inicio_em),
  local: texto(j.local),
});

/**
 * Sumula vista de fora.
 *
 * Sai o nome de quem marcou, porque artilharia e a tabela mais publica que o
 * futebol tem. Nao sai o `uid_autor`: o nome identifica o jogador na sumula, o
 * uid identificaria a conta dele em todo o resto do sistema.
 */
const eventoPublico = (e) => ({
  id: texto(e.evento_id),
  jogo_id: texto(e.jogo_id),
  jogador_id: '',
  jogador_nome: texto(e.jogador_nome),
  clube_id: texto(e.clube_id),
  tipo: texto(e.tipo_evento),
  minuto: texto(e.minuto),
});

/* ------------------------------- consultas -------------------------------- */

const LIMITE = 60;

async function consultarTudo(params, teto = 400) {
  const itens = [];
  let cursor;
  do {
    const r = await ddb.send(new QueryCommand({ ...params, ExclusiveStartKey: cursor }));
    itens.push(...(r.Items ?? []));
    cursor = r.LastEvaluatedKey;
  } while (cursor && itens.length < teto);
  return itens;
}

const porTipoStatus = (tipo) => consultarTudo({
  TableName: TABELAS.COMPETICOES,
  IndexName: 'tipo-status-index',
  KeyConditionExpression: 'tipo_status = :ts',
  ExpressionAttributeValues: { ':ts': tipoStatus(tipo, 'publico') },
  ScanIndexForward: false,
  Limit: LIMITE,
});

const porCidade = (tabela, cidade) => consultarTudo({
  TableName: tabela,
  IndexName: 'cidade-index',
  KeyConditionExpression: 'cidade = :c',
  ExpressionAttributeValues: { ':c': cidade },
  Limit: LIMITE,
});

/** 'sao paulo' -> 'Sao Paulo'; a grafia com que os dados semeados foram gravados. */
const capitalizar = (cidade) => cidade
  .split(/\s+/)
  .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
  .join(' ');

/**
 * Busca por cidade aceitando as grafias que convivem no banco.
 *
 * O indice compara literalmente, e o aplicativo envia a cidade em minusculas.
 * Quem digita "Manaus" no site e quem digita "manaus" no app tem que achar a
 * mesma coisa, entao a consulta cobre as duas formas.
 */
async function porCidadeTolerante(tabela, cidade) {
  const alvo = String(cidade).trim();
  if (!alvo) return [];
  const vistos = new Set();
  const achados = [];
  for (const grafia of new Set([alvo, alvo.toLowerCase(), capitalizar(alvo)])) {
    for (const item of await porCidade(tabela, grafia)) {
      if (!vistos.has(item.id)) { vistos.add(item.id); achados.push(item); }
    }
  }
  return achados;
}

/**
 * Cidades da vitrine.
 *
 * Nao existe indice de "todas as peladas" nem de "todos os clubes" - e nem faria
 * sentido criar um, porque seria um Scan disfarcado. Quando o visitante chega
 * sem informar cidade, a vitrine consulta estas por nome. Quem busca uma cidade
 * especifica continua caindo no indice direto, sem passar por aqui.
 */
const CIDADES_VITRINE = ['Manaus', 'Sao Paulo', 'Rio de Janeiro', 'Belo Horizonte'];

/**
 * Une o resultado das cidades da vitrine, sem repetir o mesmo id.
 *
 * Cada cidade e consultada em duas grafias porque o indice guarda o valor
 * literal e o aplicativo grava em minusculas ao criar grupo e clube. Sem as
 * duas, metade do acervo ficaria invisivel dependendo de quem cadastrou.
 */
async function vitrinePorCidades(tabela) {
  const vistos = new Set();
  const achados = [];
  for (const cidade of CIDADES_VITRINE) {
    for (const item of await porCidadeTolerante(tabela, cidade)) {
      if (!vistos.has(item.id)) { vistos.add(item.id); achados.push(item); }
    }
  }
  return achados;
}

const obter = async (tabela, id) =>
  (await ddb.send(new GetCommand({ TableName: tabela, Key: { id } }))).Item ?? null;

/** Escudos e fotos de capa; nunca foto de jogador. */
const PASTAS = { clube: 'images/clubs/', grupo: 'images/groups/', competicao: 'images/competitions/' };

async function imagem(pasta, id) {
  const prefixo = PASTAS[pasta];
  if (!prefixo || !id || id.includes('/') || id.includes('..')) return NAO_ENCONTRADO;
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: `${prefixo}${id}.jpg` }),
    { expiresIn: 3600 },
  );
  return { statusCode: 302, headers: { location: url, 'cache-control': 'public, max-age=1800' } };
}

/* -------------------------------- roteador -------------------------------- */

exports.handler = async (event) => {
  const metodo = event.requestContext?.http?.method ?? '';
  // Cinto e suspensorio: mesmo que uma rota de escrita seja apontada para ca
  // por engano na configuracao do gateway, ela nao passa daqui.
  if (metodo !== 'GET') return json(405, { message: 'somente leitura' });

  const caminho = (event.rawPath ?? '').replace(/\/+$/, '');
  const q = event.queryStringParameters ?? {};
  const [raiz, recurso, id, sub, extra] = caminho.split('/').filter(Boolean);
  if (raiz !== 'publico') return NAO_ENCONTRADO;

  try {
    if (recurso === 'imagem') return await imagem(id, sub);

    if (recurso === 'campeonatos') {
      if (!id) {
        const itens = (await porTipoStatus('campeonato')).filter((c) => c.tipo === 'campeonato');
        const filtrados = q.cidade ? itens.filter((c) => c.cidade === q.cidade) : itens;
        return json(200, filtrados.map(campeonatoPublico));
      }
      const c = await obter(TABELAS.COMPETICOES, id);
      if (!c || c.tipo !== 'campeonato') return NAO_ENCONTRADO;

      if (!sub) return json(200, campeonatoPublico(c));

      if (sub === 'participantes') {
        const itens = await consultarTudo({
          TableName: TABELAS.MEMBROS,
          KeyConditionExpression: 'contexto_id = :c',
          ExpressionAttributeValues: { ':c': contextoClubesCompeticao(id) },
        });
        return json(200, itens.map((p) => participantePublico(p, id)));
      }

      if (sub === 'jogos') {
        const itens = await consultarTudo({
          TableName: TABELAS.JOGOS,
          IndexName: 'competicao-index',
          KeyConditionExpression: 'competicao_id = :c',
          ExpressionAttributeValues: { ':c': id },
        }, 800);
        return json(200, itens.filter((x) => x.item === ITEM_JOGO).map(jogoPublico));
      }

      if (sub === 'eventos') {
        const itens = await consultarTudo({
          TableName: TABELAS.JOGOS,
          IndexName: 'competicao-index',
          KeyConditionExpression: 'competicao_id = :c',
          ExpressionAttributeValues: { ':c': id },
        }, 2000);
        return json(200, itens.filter((x) => x.item !== ITEM_JOGO && x.evento_id).map(eventoPublico));
      }
      return NAO_ENCONTRADO;
    }

    if (recurso === 'amistosos') {
      if (!id) {
        const itens = (await porTipoStatus('amistoso')).filter((a) => a.tipo === 'amistoso');
        const abertos = q.abertos === 'true'
          ? itens.filter((a) => a.tipo_desafio === 'ABERTO' && a.status === 'PROPOSTO')
          : itens;
        const porCid = q.cidade ? abertos.filter((a) => a.cidade === q.cidade) : abertos;
        return json(200, porCid.map(amistosoPublico));
      }
      const a = await obter(TABELAS.COMPETICOES, id);
      if (!a || a.tipo !== 'amistoso') return NAO_ENCONTRADO;
      return json(200, amistosoPublico(a));
    }

    if (recurso === 'clubes') {
      if (!id) {
        const itens = q.cidade
          ? await porCidadeTolerante(TABELAS.CLUBES, q.cidade)
          : await vitrinePorCidades(TABELAS.CLUBES);
        return json(200, itens.map(clubePublico));
      }
      const c = await obter(TABELAS.CLUBES, id);
      return c ? json(200, clubePublico(c)) : NAO_ENCONTRADO;
    }

    if (recurso === 'peladas') {
      if (!id) {
        const itens = q.cidade
          ? await porCidadeTolerante(TABELAS.GRUPOS, q.cidade)
          : await vitrinePorCidades(TABELAS.GRUPOS);
        return json(200, itens.map(grupoPublico));
      }
      const g = await obter(TABELAS.GRUPOS, id);
      return g ? json(200, grupoPublico(g)) : NAO_ENCONTRADO;
    }

    // Vitrine da home: as proximas peladas e os campeonatos ativos, sem cidade.
    if (recurso === 'destaques') {
      const [camps, grupos] = await Promise.all([
        porTipoStatus('campeonato'),
        vitrinePorCidades(TABELAS.GRUPOS),
      ]);
      return json(200, {
        campeonatos: camps.filter((c) => c.tipo === 'campeonato').slice(0, 12).map(campeonatoPublico),
        peladas: grupos
          .filter((g) => g.pelada_proxima === 'true')
          .slice(0, 12)
          .map(grupoPublico),
      });
    }

    return NAO_ENCONTRADO;
  } catch (erro) {
    console.error('publico_falhou', metodo, caminho, erro);
    return json(500, { message: 'falha interna' });
  }
};

/** Exportado para teste; permite conferir a lista branca sem subir a Lambda. */
exports.vitrines = { campeonatoPublico, amistosoPublico, clubePublico, grupoPublico, jogoPublico, participantePublico, eventoPublico };
