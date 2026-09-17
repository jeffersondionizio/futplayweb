'use strict';
/**
 * Fronteira entre o esquema do banco e o contrato da API.
 *
 * No banco a chave do jogador e `uid`, o UID do Firebase - explicito, e igual em
 * todas as tabelas que referenciam jogador. No contrato da rede ela continua
 * sendo `id`, porque e assim que o app ja conhece (241 usos em 59 arquivos) e
 * porque o cliente nao precisa saber de onde a chave vem.
 *
 * A conversao mora AQUI e em nenhum outro lugar. Espalhar o mapeamento pelos
 * handlers e o que produz o tipo de inconsistencia que esta migracao veio
 * desfazer - antes o mesmo conceito se chamava id, jogador_id, user_id,
 * owner_user_id e criado_por, dependendo da tabela.
 */

/** Campos internos que nunca devem vazar para o cliente. */
const INTERNOS = new Set([
  'uid',
  'expires_at',
  'search_bucket',
  'nome_busca',
  'fcm_token',
  'criado_em',
  'ultimo_login_em',
]);

/**
 * Item do DynamoDB -> objeto que o app espera.
 *
 * @param {object} item linha de CadePelada-Jogadores
 * @param {object} [extras] contadores e relacao com quem esta pedindo
 */
function jogadorParaResposta(item, extras = {}) {
  if (!item) return null;

  const saida = { id: item.uid ?? '' };
  for (const [k, v] of Object.entries(item)) {
    if (INTERNOS.has(k)) continue;
    saida[k] = v;
  }

  // O app declara esses campos como nao-nulos com default: mandar null faria o
  // Gson gravar null por cima do default e estourar no primeiro acesso.
  saida.seguidores_count = extras.seguidores ?? item.seguidores_count ?? 0;
  saida.seguindo_count = extras.seguindo ?? item.seguindo_count ?? 0;
  saida.seguindo_jogador = extras.seguindoJogador ?? false;
  saida.seguido_por_jogador = extras.seguidoPorJogador ?? false;

  // Apelido de leitura: o app le `posicao_jogador` e o site le `posicao`.
  // Mandar as duas evita release em qualquer um dos lados.
  if (saida.posicao_jogador != null) saida.posicao = saida.posicao_jogador;

  // expires_at e interno, mas o app usa para saber quando a conta expira.
  if (item.expires_at != null) saida.expires_at = Number(item.expires_at);

  return saida;
}

/**
 * Objeto vindo do app -> campos gravaveis.
 *
 * Lista branca de proposito: sem isso um cliente poderia mandar expires_at e
 * adiar a propria expiracao para sempre, ou reescrever uid e assumir outra conta.
 */
const EDITAVEIS = new Set([
  'nome', 'username', 'imagem', 'escudo_url',
  'finalizacao', 'defesa', 'forca', 'velocidade', 'drible', 'passe', 'overal',
  'peso', 'idade', 'pe_dominante', 'avaliacoes',
  'gols', 'assistencias', 'roubadas', 'faltas', 'faltas_sofridas',
  'chutes_a_gol', 'defesas', 'interceptacoes', 'defesas_penaltis',
  'pontos_carreira', 'premium_expiracao', 'grupo_id',
  // A posicao nao era gravavel: o PUT do perfil descartava em silencio nos dois
  // clientes. `posicao` entra como apelido porque e o nome que o site manda.
  'posicao_jogador', 'posicao',
]);

function camposEditaveis(corpo) {
  const saida = {};
  for (const [k, v] of Object.entries(corpo ?? {})) {
    if (!EDITAVEIS.has(k) || v === undefined) continue;
    // Uma coluna so no banco: `posicao` do site vira `posicao_jogador`, que e o
    // que o app le e o que ja esta gravado nos 112 jogadores.
    saida[k === 'posicao' ? 'posicao_jogador' : k] = v;
  }
  return saida;
}

/**
 * Perfil -> data class ResumoRelacionamentoJogador (seguidores e seguindo).
 *
 * Nao e o mesmo objeto de jogadorParaResposta: a lista de seguidores declara a
 * chave como `jogador_id` e renomeia `overal` para `overall` e `posicao` para
 * `posicao_jogador`. Mandar o perfil inteiro faria o Gson preencher tudo com os
 * defaults - nome em branco e overall zero em cada linha da lista.
 */
function relacionamentoParaResposta(item, aresta = {}, extras = {}) {
  if (!item) return null;
  const quando = Date.parse(aresta.criado_em ?? '');
  return {
    jogador_id: String(item.uid ?? ''),
    nome: String(item.nome ?? ''),
    imagem: String(item.imagem ?? ''),
    overall: String(item.overal ?? item.overall ?? ''),
    posicao_jogador: String(item.posicao_jogador ?? item.posicao ?? ''),
    seguindo_jogador: Boolean(extras.seguindoJogador),
    seguido_por_jogador: Boolean(extras.seguidoPorJogador),
    created_at: Number.isFinite(quando) ? quando : 0,
  };
}

/* ---------------------------------- grupo --------------------------------- */

/**
 * Mesma fronteira do jogador, um nivel acima: no banco a coluna e uid_criador,
 * no contrato e criado_por. O app ja conhece criado_por, e renomear no cliente
 * custaria mais do que converter aqui.
 */
function grupoParaResposta(item, extras = {}) {
  if (!item) return null;

  const { uid_criador: criador, semeado, ...resto } = item;
  return {
    ...resto,
    criado_por: criador ?? '',
    // O app espera string para tudo, ate para contagem - mandar numero faz o
    // Gson falhar ao desserializar num campo declarado String.
    inscritos: String(extras.inscritos ?? item.inscritos ?? 0),
    participantes: extras.participantes ?? item.participantes ?? '',
    admin: extras.admins ?? item.admin ?? '',
    pedido_pendente: Boolean(extras.pedidoPendente),
  };
}

const EDITAVEIS_GRUPO = new Set([
  'nome', 'dia_semana', 'hora_inicio', 'hora_fim', 'tipo_pelada',
  'imagem_url', 'escudo_url', 'cidade', 'latitude', 'longitude',
  'qtde_jogadores', 'valor', 'avaliacao_liberada', 'pelada_proxima',
  'data_peladaproxima', 'local', 'jogadores_por_time',
  // Campos de estado da pelada, gravados como JSON em string pelo proprio app.
  'sorteio', 'pelada_atual', 'rank_pelada', 'rank_temporada', 'rank_vitalicio',
  'podio_temporada', 'man_of_the_match', 'tabela_times', 'temp_atual',
  'reset_votacao',
]);

function camposEditaveisGrupo(corpo) {
  const saida = {};
  for (const [k, v] of Object.entries(corpo ?? {})) {
    if (EDITAVEIS_GRUPO.has(k) && v !== undefined) saida[k] = v;
  }
  return saida;
}

/* ---------------------------------- clube --------------------------------- */

/**
 * Linha de Membros -> data class ClubeMembro.
 *
 * O papel interno e minusculo e em portugues (dono/admin/atleta), porque e o
 * mesmo vocabulario das outras tres tabelas de associacao. O app le OWNER,
 * ADMIN e MEMBER, e decide com isso quem ve o botao de administrar - mandar
 * 'dono' faria o proprio dono perder o botao.
 */
const PAPEL_PARA_ROLE = { dono: 'OWNER', admin: 'ADMIN' };

function clubeMembroParaResposta(item, clubeId) {
  if (!item) return null;
  return {
    clube_id: String(clubeId ?? ''),
    user_id: String(item.uid ?? ''),
    role: PAPEL_PARA_ROLE[item.papel] ?? 'MEMBER',
    status: item.papel === 'pendente' ? 'PENDENTE' : 'ATIVO',
    joined_at: String(item.entrou_em ?? '0'),
    invited_by: String(item.convidado_por ?? ''),
  };
}

/**
 * Pedido de entrada -> data class PedidoEntradaClube.
 *
 * Unico lugar do contrato em camelCase, e com o perfil ja embutido: a tela de
 * pedidos mostra nome e foto de quem pediu, e buscar cada jogador depois daria
 * uma chamada por pedido.
 */
function pedidoClubeParaResposta(item, perfil, clubeId) {
  if (!item) return null;
  const quando = Date.parse(item.entrou_em ?? '');
  return {
    clubeId: String(clubeId ?? ''),
    jogadorId: String(item.uid ?? ''),
    nome: String(perfil?.nome ?? ''),
    username: String(perfil?.username ?? ''),
    imagem: String(perfil?.imagem ?? ''),
    idade: String(perfil?.idade ?? ''),
    peso: String(perfil?.peso ?? ''),
    posicao: String(perfil?.posicao_jogador ?? perfil?.posicao ?? ''),
    criadoEmMillis: Number.isFinite(quando) ? quando : 0,
  };
}

/* ------------------------------ competicoes ------------------------------- */

/**
 * O app declara created_at/updated_at como String de epoch em milissegundos,
 * enquanto o banco guarda ISO-8601 (que ordena, e por isso serve de sort key).
 * A conversao mora aqui em vez de mudar um dos dois lados.
 */
const epocaTexto = (valor) => {
  if (valor == null || valor === '') return '0';
  const n = typeof valor === 'number' ? valor : Date.parse(valor);
  return Number.isFinite(n) ? String(n) : '0';
};

const epocaNumero = (valor) => {
  if (valor == null || valor === '') return 0;
  const n = typeof valor === 'number' ? valor : Date.parse(valor);
  return Number.isFinite(n) ? n : 0;
};

const texto = (valor, padrao = '') => (valor == null || valor === '' ? padrao : String(valor));
const inteiro = (valor, padrao = 0) => {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.trunc(n) : padrao;
};
const decimal = (valor, padrao = 0) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
};

/**
 * Campeonato do banco -> data class Campeonato.
 *
 * Lista explicita, e nao spread do item: os campos do app sao todos nao-nulos
 * com default, e qualquer null que escape faz o Gson gravar null por cima do
 * default e estourar no primeiro acesso. De quebra, nao vaza tipo_status,
 * expires_at nem uid_criador.
 */
function campeonatoParaResposta(item) {
  if (!item) return null;
  return {
    id: texto(item.id),
    nome: texto(item.nome),
    imagem_url: texto(item.imagem_url),
    formato: texto(item.formato, 'PONTOS_CORRIDOS'),
    // No banco a coluna e clube_id, comum as duas formas de competicao; so o
    // campeonato a chama de "clube organizador".
    clube_organizador_id: texto(item.clube_id),
    criado_por: texto(item.uid_criador),
    status: texto(item.status, 'RASCUNHO'),
    fase_atual: texto(item.fase_atual, 'RASCUNHO'),
    qtd_grupos: inteiro(item.qtd_grupos, 0),
    classificados_por_grupo: inteiro(item.classificados_por_grupo, 2),
    regulamento: texto(item.regulamento),
    cidade: texto(item.cidade),
    latitude: texto(item.latitude, '0.0'),
    longitude: texto(item.longitude, '0.0'),
    data_inscricao_inicio: texto(item.data_inscricao_inicio),
    data_inscricao_fim: texto(item.data_inscricao_fim),
    data_inicio: texto(item.data_inicio),
    data_fim: texto(item.data_fim),
    created_at: epocaTexto(item.criado_em),
    updated_at: epocaTexto(item.atualizado_em),
  };
}

/**
 * Amistoso do banco -> data class Amistoso.
 *
 * Atencao ao `tipo`: no banco ele discrimina campeonato de amistoso dentro da
 * mesma tabela, enquanto no contrato do app `tipo` e DIRETO ou ABERTO. Sao dois
 * conceitos com o mesmo nome, e por isso o desafio e gravado como tipo_desafio.
 */
function amistosoParaResposta(item) {
  if (!item) return null;
  return {
    id: texto(item.id),
    clube_mandante_id: texto(item.clube_mandante_id),
    clube_visitante_id: texto(item.clube_visitante_id),
    status: texto(item.status, 'PROPOSTO'),
    tipo: texto(item.tipo_desafio, 'DIRETO'),
    data_hora: texto(item.data_hora),
    local_nome: texto(item.local_nome),
    local_endereco: texto(item.local_endereco),
    cidade: texto(item.cidade),
    estado: texto(item.estado),
    observacoes: texto(item.observacoes),
    latitude: decimal(item.latitude, 0),
    longitude: decimal(item.longitude, 0),
    placar_mandante: texto(item.placar_mandante, '0'),
    placar_visitante: texto(item.placar_visitante, '0'),
    placar_proposto_clube_id: texto(item.placar_proposto_clube_id),
  };
}

const competicaoParaResposta = (item) =>
  (item?.tipo === 'amistoso' ? amistosoParaResposta(item) : campeonatoParaResposta(item));

/** Linha de participacao de clube -> data class CampeonatoParticipante. */
function participanteParaResposta(item, competicaoId) {
  if (!item) return null;
  return {
    campeonato_id: texto(competicaoId ?? item.competicao_id),
    clube_id: texto(item.clube_id ?? item.uid),
    status: texto(item.status, 'PENDENTE'),
    grupo_fase: texto(item.grupo_fase),
    pontos: texto(item.pontos, '0'),
    vitorias: texto(item.vitorias, '0'),
    empates: texto(item.empates, '0'),
    derrotas: texto(item.derrotas, '0'),
    gols_pro: texto(item.gols_pro, '0'),
    gols_contra: texto(item.gols_contra, '0'),
    saldo_gols: texto(item.saldo_gols, '0'),
    cartoes_amarelos: texto(item.cartoes_amarelos, '0'),
    cartoes_vermelhos: texto(item.cartoes_vermelhos, '0'),
  };
}

/** Item `meta` de CadePelada-Jogos -> data class CampeonatoJogo. */
function jogoParaResposta(item) {
  if (!item) return null;
  return {
    id: texto(item.jogo_id),
    campeonato_id: texto(item.competicao_id),
    rodada: texto(item.rodada, '1'),
    fase: texto(item.fase, 'GRUPOS'),
    // Nulavel no app: null significa "fora da fase de grupos", diferente de "".
    grupo_id: item.grupo_id ? String(item.grupo_id) : null,
    clube_a_id: texto(item.clube_a_id),
    clube_b_id: texto(item.clube_b_id),
    status: texto(item.status, 'AGENDADO'),
    placar_a: texto(item.placar_a, '0'),
    placar_b: texto(item.placar_b, '0'),
    vencedor_penaltis_id: item.vencedor_penaltis_id ? String(item.vencedor_penaltis_id) : null,
    wo: Boolean(item.wo),
    id_jogo_proximo: item.id_jogo_proximo ? String(item.id_jogo_proximo) : null,
    data_hora: texto(item.data_hora ?? item.inicio_em),
    local: texto(item.local),
    motm_jogador_id: texto(item.motm_jogador_id),
    motm_jogador_nome: texto(item.motm_jogador_nome),
    created_at: epocaTexto(item.criado_em),
    updated_at: epocaTexto(item.atualizado_em ?? item.criado_em),
  };
}

/** Item `evento#...` de CadePelada-Jogos -> data class EventoJogo. */
function eventoParaResposta(item) {
  if (!item) return null;
  return {
    id: texto(item.evento_id ?? item.id),
    jogo_id: texto(item.jogo_id),
    campeonato_id: texto(item.competicao_id),
    jogador_id: texto(item.uid_autor),
    jogador_nome: texto(item.jogador_nome),
    clube_id: texto(item.clube_id),
    tipo: texto(item.tipo_evento, 'GOL'),
    minuto: texto(item.minuto, '0'),
    created_at: epocaTexto(item.criado_em),
  };
}

/**
 * Mensagem de chat -> MensagemChatCampeonato / MensagemChatAmistosoAberto /
 * MensagemChatPeladaProxima. Sao tres data classes com os mesmos campos; o que
 * muda e o nome do id de contexto (campeonato_id, amistoso_id, grupo_id).
 *
 * O autor vem achatado, e nao aninhado: e assim que as tres declaram.
 */
function mensagemParaResposta(item, { campoContexto, contextoId, autor } = {}) {
  if (!item) return null;
  const saida = {
    mensagem_id: texto(item.mensagem_id),
    autor_id: texto(item.uid_autor),
    autor_nome: texto(autor?.nome),
    autor_imagem: texto(autor?.imagem),
    texto: texto(item.texto),
    // Long no app: milissegundos. A sort key traz o sufixo aleatorio que separa
    // mensagens do mesmo milissegundo, e ele nao faz parte da data.
    created_at: epocaNumero(String(item.criado_em ?? '').split('#')[0]),
    expires_at: Number(item.expires_at ?? 0),
  };
  if (campoContexto) saida[campoContexto] = texto(contextoId);
  return saida;
}

/**
 * Campos que o cliente pode gravar numa competicao.
 *
 * Como nas outras listas brancas, o que importa e o que fica de fora: id, tipo,
 * tipo_status, uid_criador e expires_at sao do servidor. Deixar `tipo` passar
 * transformaria um campeonato em amistoso e o tiraria do proprio indice.
 */
const EDITAVEIS_CAMPEONATO = new Set([
  'nome', 'imagem_url', 'formato', 'status', 'fase_atual',
  'qtd_grupos', 'classificados_por_grupo', 'regulamento', 'cidade',
  'latitude', 'longitude', 'data_inscricao_inicio', 'data_inscricao_fim',
  'data_inicio', 'data_fim',
]);

const EDITAVEIS_AMISTOSO = new Set([
  'clube_mandante_id', 'clube_visitante_id', 'status', 'data_hora',
  'local_nome', 'local_endereco', 'cidade', 'estado', 'observacoes',
  'latitude', 'longitude', 'placar_mandante', 'placar_visitante',
  'placar_proposto_clube_id',
]);

function camposEditaveisCompeticao(corpo, tipo) {
  const permitidos = tipo === 'amistoso' ? EDITAVEIS_AMISTOSO : EDITAVEIS_CAMPEONATO;
  const saida = {};
  for (const [k, v] of Object.entries(corpo ?? {})) {
    if (permitidos.has(k) && v !== undefined) saida[k] = v;
  }
  // Os dois campos cujo nome muda na fronteira precisam ser traduzidos na
  // entrada tambem, senao a edicao vinda do app seria silenciosamente ignorada.
  if (tipo !== 'amistoso' && corpo?.clube_organizador_id !== undefined) {
    saida.clube_id = String(corpo.clube_organizador_id ?? '');
  }
  if (tipo === 'amistoso' && corpo?.tipo !== undefined) {
    saida.tipo_desafio = String(corpo.tipo ?? '');
  }
  return saida;
}

module.exports = {
  jogadorParaResposta, camposEditaveis, EDITAVEIS, INTERNOS,
  relacionamentoParaResposta,
  grupoParaResposta, camposEditaveisGrupo, EDITAVEIS_GRUPO,
  clubeMembroParaResposta, pedidoClubeParaResposta,
  campeonatoParaResposta, amistosoParaResposta, competicaoParaResposta,
  participanteParaResposta, jogoParaResposta, eventoParaResposta,
  mensagemParaResposta, camposEditaveisCompeticao,
  EDITAVEIS_CAMPEONATO, EDITAVEIS_AMISTOSO,
};
