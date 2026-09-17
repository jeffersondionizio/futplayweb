'use strict';
/**
 * Montagem das chaves sobrecarregadas.
 *
 * O modelo novo junta 19 tabelas em 8, e tres delas usam chave composta por
 * prefixo de contexto. Isso so e seguro com um lugar unico que monta e le essas
 * chaves - string solta espalhada pelos Lambdas e como um bug de prefixo mistura
 * mensagem de grupo com mensagem privada.
 *
 * Nada aqui concatena a mao: quem precisar de uma chave chama uma funcao daqui.
 */

const TABELAS = Object.freeze({
  JOGADORES: process.env.TABELA_JOGADORES || 'CadePelada-Jogadores',
  GRUPOS: process.env.TABELA_GRUPOS || 'CadePelada-Grupos',
  CLUBES: process.env.TABELA_CLUBES || 'CadePelada-Clubes',
  COMPETICOES: process.env.TABELA_COMPETICOES || 'CadePelada-Competicoes',
  JOGOS: process.env.TABELA_JOGOS || 'CadePelada-Jogos',
  MEMBROS: process.env.TABELA_MEMBROS || 'CadePelada-Membros',
  MENSAGENS: process.env.TABELA_MENSAGENS || 'CadePelada-Mensagens',
  JOGADOR_DADOS: process.env.TABELA_JOGADOR_DADOS || 'CadePelada-JogadorDados',
});

const SEP = '#';

function exigir(valor, nome) {
  const v = String(valor ?? '').trim();
  if (!v) throw new Error(`${nome} obrigatorio`);
  if (v.includes(SEP)) throw new Error(`${nome} nao pode conter "${SEP}"`);
  return v;
}

/* ------------------------------ CadePelada-Membros ------------------------ */
// PK contexto_id, SK uid. Responde "quem esta em X" (Query na PK) e
// "de que eu faco parte" (Query no uid-index).

const contextoGrupo = (grupoId) => `grupo${SEP}${exigir(grupoId, 'grupoId')}`;
const contextoClube = (clubeId) => `clube${SEP}${exigir(clubeId, 'clubeId')}`;
const contextoCompeticao = (compId) => `competicao${SEP}${exigir(compId, 'competicaoId')}`;

/**
 * Contexto separado para os CLUBES inscritos num campeonato.
 *
 * Quem participa de um campeonato sao clubes, mas quem conversa no chat e tem
 * permissao de organizador sao pessoas. Os dois vivem na tabela de Membros, e
 * misturar os dois no mesmo contexto_id colocaria clube na lista de gente:
 * a classificacao apareceria como membro e o clube herdaria direito de chat.
 *
 * A chave de ordenacao continua sendo `uid`, e aqui ela guarda o id do clube.
 */
const contextoClubesCompeticao = (compId) => `compclubes${SEP}${exigir(compId, 'competicaoId')}`;

/** Le um contexto_id de volta para { tipo, id }. */
function lerContexto(contextoId) {
  const [tipo, ...resto] = String(contextoId || '').split(SEP);
  if (!tipo || !resto.length) return null;
  return { tipo, id: resto.join(SEP) };
}

/* ----------------------------- CadePelada-Mensagens ----------------------- */
// PK conversa_id, SK criado_em (ISO-8601, que ordena lexicograficamente).

const conversaGrupo = (grupoId) => `grupo${SEP}${exigir(grupoId, 'grupoId')}`;
const conversaAmistoso = (amistosoId) => `amistoso${SEP}${exigir(amistosoId, 'amistosoId')}`;
const conversaClube = (clubeId) => `clube${SEP}${exigir(clubeId, 'clubeId')}`;
const conversaCompeticao = (compId) => `competicao${SEP}${exigir(compId, 'competicaoId')}`;

/**
 * Conversa privada entre dois jogadores. Os UIDs vao ordenados para que o par
 * (a,b) e (b,a) caiam sempre na mesma particao - senao cada lado escreveria numa
 * conversa diferente e nenhum veria o outro.
 */
function conversaPrivada(uidA, uidB) {
  const a = exigir(uidA, 'uidA');
  const b = exigir(uidB, 'uidB');
  const [p, s] = a < b ? [a, b] : [b, a];
  return `privado${SEP}${p}_${s}`;
}

const lerConversa = lerContexto;

/* ------------------------------- CadePelada-Jogos ------------------------- */
// PK jogo_id, SK item. O jogo e seus eventos moram na mesma particao, entao
// carregar uma partida inteira e UMA Query - antes era um GetItem no jogo mais
// um Query no indice de eventos.

const ITEM_JOGO = 'meta';
const itemEvento = (criadoEm, eventoId) =>
  `evento${SEP}${exigir(criadoEm, 'criadoEm')}${SEP}${exigir(eventoId, 'eventoId')}`;

/* --------------------------- CadePelada-JogadorDados ---------------------- */
// PK uid, SK item. Absorve historico_atleta, jogador_midia e player_social_edges.

const itemHistorico = (chaveLinha) => `historico${SEP}${exigir(chaveLinha, 'chaveLinha')}`;
const itemMidia = (timestamp) => `midia${SEP}${exigir(timestamp, 'timestamp')}`;
const itemSegue = (uidDestino) => `segue${SEP}${exigir(uidDestino, 'uidDestino')}`;

/**
 * Marcador de conversa privada, gravado no lado de QUEM ESCREVE.
 *
 * O inbox-index responde "quem me escreveu", pela chave uid_destino. Sozinho
 * ele nao enxerga a conversa que eu comecei e que ainda nao teve resposta - ela
 * so existe com uid_destino do outro. Este item cobre esse lado sem exigir um
 * segundo GSI na tabela de mensagens.
 */
const itemConversa = (uidOutro) => `conversa${SEP}${exigir(uidOutro, 'uidOutro')}`;

/** Valor do GSI aresta-index: permite perguntar "quem segue fulano". */
const arestaSeguidores = (uidDestino) => `seguidores${SEP}${exigir(uidDestino, 'uidDestino')}`;

/* -------------------------- CadePelada-Competicoes ------------------------ */
// GSI tipo-status-index. Campeonato e amistoso dividem a tabela, entao o status
// sozinho misturaria os dois no mesmo indice.

const TIPOS_COMPETICAO = Object.freeze(['campeonato', 'amistoso']);

function tipoStatus(tipo, status) {
  const t = exigir(tipo, 'tipo');
  if (!TIPOS_COMPETICAO.includes(t)) throw new Error(`tipo de competicao invalido: ${t}`);
  return `${t}${SEP}${exigir(status, 'status')}`;
}

module.exports = {
  TABELAS,
  SEP,
  TIPOS_COMPETICAO,
  contextoGrupo,
  contextoClube,
  contextoCompeticao,
  contextoClubesCompeticao,
  lerContexto,
  conversaGrupo,
  conversaAmistoso,
  conversaClube,
  conversaCompeticao,
  conversaPrivada,
  lerConversa,
  ITEM_JOGO,
  itemEvento,
  itemHistorico,
  itemMidia,
  itemSegue,
  itemConversa,
  arestaSeguidores,
  tipoStatus,
};
