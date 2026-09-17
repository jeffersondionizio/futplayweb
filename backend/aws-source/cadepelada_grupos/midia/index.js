'use strict';
/**
 * cadepelada_midia - URLs assinadas para o bucket privado.
 *
 * O bucket `cadepelada` bloqueia todo acesso publico (BlockPublicPolicy,
 * RestrictPublicBuckets e ACLs desativadas), entao a URL direta do S3 que o app
 * monta hoje responde 403 - nunca funcionou por esse caminho. Aqui cada imagem
 * ganha uma URL assinada com validade curta.
 *
 * Assina em LOTE de proposito. Uma lista de 50 jogadores exigiria 50 chamadas
 * se cada foto fosse assinada sozinha; aqui vai tudo num request. Assinar e
 * puro calculo local, sem ida ao S3, entao o custo de assinar 50 e o mesmo de
 * assinar uma.
 *
 * Rotas:
 *   POST /imagem/urls          { chaves: [...] }  -> { urls: { chave: url } }
 *   POST /imagem/upload        { chave }          -> URL assinada para PUT
 *   DELETE /imagem/{...chave}
 */

const { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const {
  TABELAS, contextoGrupo, contextoClube, contextoCompeticao,
} = require('../lib/chaves');

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const BUCKET = process.env.IMAGE_BUCKET || 'cadepelada';

/**
 * Validade da URL de leitura.
 *
 * Uma hora equilibra duas coisas: curto o bastante para o link vazado nao valer
 * muito, e longo o bastante para o cache do Glide sobreviver a uma sessao - com
 * 5 minutos o app rebaixaria a mesma foto varias vezes por tela.
 */
const VALIDADE_LEITURA = Number(process.env.VALIDADE_LEITURA_S || 3600);
const VALIDADE_ESCRITA = Number(process.env.VALIDADE_ESCRITA_S || 300);

/** Quantas chaves um request pode pedir. Evita virar amplificador. */
const MAX_POR_LOTE = 100;

const json = (statusCode, corpo) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: corpo === undefined ? '' : JSON.stringify(corpo),
});

function identidade(event) {
  const ctx = event?.requestContext?.authorizer?.lambda
    ?? event?.requestContext?.authorizer
    ?? {};
  return String(ctx.uid || ctx.actorId || '').trim() || null;
}

/**
 * Prefixos que o app pode ler ou escrever.
 *
 * Sem esta lista, quem descobrisse a rota poderia pedir assinatura de qualquer
 * objeto do bucket - inclusive o que nao for imagem.
 */
const PREFIXOS = ['images/profile/', 'images/clubs/', 'images/groups/', 'images/competitions/', 'images/media/'];

function chaveValida(chave) {
  const k = String(chave ?? '').replace(/^\/+/, '');
  if (!k || k.includes('..') || k.length > 512) return null;
  return PREFIXOS.some((p) => k.startsWith(p)) ? k : null;
}

/**
 * Autoriza a imagem pelo mesmo vinculo que protege a entidade principal.
 * A tabela Membros e a fonte unica de papeis para grupo, clube e competicao.
 */
async function podeEscrever(uid, chave) {
  if (chave.startsWith('images/profile/')) {
    return chave === `images/profile/${uid}.jpg`;
  }

  const correspondencias = [
    ['images/groups/', contextoGrupo],
    ['images/clubs/', contextoClube],
    ['images/competitions/', contextoCompeticao],
  ];
  const entrada = correspondencias.find(([prefixo]) => chave.startsWith(prefixo));
  if (!entrada) return false;

  const [prefixo, montarContexto] = entrada;
  const id = chave.slice(prefixo.length, -'.jpg'.length);
  if (!id) return false;

  const { Item } = await ddb.send(new GetCommand({
    TableName: TABELAS.MEMBROS,
    Key: { contexto_id: montarContexto(id), uid },
    ProjectionExpression: 'papel',
  }));
  return ['dono', 'admin', 'organizador'].includes(String(Item?.papel ?? '').toLowerCase());
}

async function assinarLeitura(chaves) {
  const urls = {};
  await Promise.all(chaves.map(async (chave) => {
    urls[chave] = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: chave }),
      { expiresIn: VALIDADE_LEITURA },
    );
  }));
  return urls;
}

exports.handler = async (event) => {
  const uid = identidade(event);
  if (!uid) return json(401, { message: 'nao autenticado' });

  const metodo = event.requestContext?.http?.method ?? '';
  const caminho = (event.rawPath ?? '').replace(/\/+$/, '');

  let corpo = {};
  if (event.body) {
    try {
      corpo = JSON.parse(event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body);
    } catch {
      return json(400, { message: 'corpo invalido' });
    }
  }

  try {
    if (metodo === 'POST' && caminho === '/imagem/urls') {
      const pedidas = Array.isArray(corpo.chaves) ? corpo.chaves : [];
      if (!pedidas.length) return json(400, { message: 'chaves obrigatorio' });
      if (pedidas.length > MAX_POR_LOTE) {
        return json(400, { message: `maximo ${MAX_POR_LOTE} chaves por vez` });
      }

      const validas = pedidas.map(chaveValida).filter(Boolean);
      const urls = await assinarLeitura(validas);

      // Chave recusada volta como null em vez de sumir: o app precisa saber a
      // diferenca entre "sem foto" e "pedi e nao veio".
      const saida = {};
      for (const k of pedidas) saida[k] = urls[chaveValida(k) ?? ''] ?? null;

      return json(200, { urls: saida, expira_em: VALIDADE_LEITURA });
    }

    if (metodo === 'POST' && caminho === '/imagem/upload') {
      const chave = chaveValida(corpo.chave);
      if (!chave) return json(400, { message: 'chave invalida' });
      if (!await podeEscrever(uid, chave)) return json(403, { message: 'sem permissao nessa chave' });

      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: chave,
          ContentType: String(corpo.content_type || 'image/jpeg'),
        }),
        { expiresIn: VALIDADE_ESCRITA },
      );
      // PUT assinado em vez do upload em base64 que existia antes: base64 cresce
      // o corpo em 33% e passa a imagem inteira pela Lambda, contando tempo de
      // execucao para transferir bytes.
      return json(200, { url, metodo: 'PUT', expira_em: VALIDADE_ESCRITA });
    }

    /**
     * GET /imagem/<pasta>/<id> -> 302 para a URL assinada.
     *
     * O app ja tinha um fallback assim (construirFallbackApiImagem), que era o
     * que realmente fazia as fotos carregarem - a URL direta do S3 sempre deu
     * 403. Mantendo o mesmo formato, a mudanca no app e so a URL base.
     *
     * Responde 302 em vez de devolver os bytes: assim a imagem vai do S3 direto
     * para o aparelho, sem passar pela Lambda. Proxyar os bytes cobraria tempo
     * de execucao so para transferir arquivo, e o OkHttp segue o redirect
     * sozinho - descartando o header Authorization por ser outro host, que e
     * exatamente o que a URL assinada precisa.
     */
    if (metodo === 'GET' && caminho.startsWith('/imagem/')) {
      const resto = caminho.slice('/imagem/'.length);
      const partes = resto.split('/').filter(Boolean);
      if (partes.length !== 2) return json(400, { message: 'use /imagem/<pasta>/<id>' });

      const pastas = { perfil: 'profile', clube: 'clubs', grupo: 'groups', competicao: 'competitions', post: 'media' };
      const pasta = pastas[partes[0]];
      if (!pasta) return json(404, { message: 'pasta desconhecida' });

      const chave = chaveValida(`images/${pasta}/${partes[1]}.jpg`);
      if (!chave) return json(400, { message: 'chave invalida' });

      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET, Key: chave }),
        { expiresIn: VALIDADE_LEITURA },
      );
      return {
        statusCode: 302,
        headers: {
          location: url,
          // Sem cache no redirect: a URL assinada expira, e um 302 guardado
          // mandaria o app para um link vencido. Quem cacheia a imagem em si e
          // o disco do proprio app.
          'cache-control': 'no-store',
        },
      };
    }

    if (metodo === 'DELETE' && caminho.startsWith('/imagem/')) {
      const chave = chaveValida(caminho.slice('/imagem/'.length));
      if (!chave) return json(400, { message: 'chave invalida' });
      if (!await podeEscrever(uid, chave)) return json(403, { message: 'sem permissao nessa chave' });
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: chave }));
      return json(204);
    }

    return json(404, { message: 'nao encontrado' });
  } catch (erro) {
    console.error('midia_falhou', metodo, caminho, erro);
    return json(500, { message: 'falha interna' });
  }
};
