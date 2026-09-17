'use strict';

/**
 * Grafias de cidade a tentar numa Query por `cidade-index`.
 *
 * O indice casa a chave exata, e as duas pontas escrevem diferente: o banco
 * guarda a forma de exibicao ("Manaus"), e o app manda o que o Geocoder devolve
 * ja em minusculas (AtividadeListarPeladasPublicas, ServicoApiGrupo,
 * ServicoApiClube). "manaus" nunca casou com "Manaus", entao a busca por perto
 * respondia vazia em toda cidade.
 *
 * A Lambda publica ja resolvia assim; isto so leva a mesma tolerancia para as
 * rotas autenticadas, para nao depender de atualizacao do aplicativo.
 */
const capitalizar = (cidade) =>
  cidade
    .split(/\s+/)
    .map((parte) => (parte ? parte[0].toUpperCase() + parte.slice(1).toLowerCase() : parte))
    .join(' ');

function grafiasDeCidade(cidade) {
  const alvo = String(cidade ?? '').trim();
  if (!alvo) return [];
  return [...new Set([alvo, alvo.toLowerCase(), capitalizar(alvo)])];
}

/**
 * Roda a Query uma vez por grafia e junta o resultado sem repetir item.
 * `consultar` recebe a grafia e devolve a lista de itens daquela Query.
 */
async function buscarPorCidade(cidade, consultar) {
  const vistos = new Set();
  const achados = [];
  for (const grafia of grafiasDeCidade(cidade)) {
    for (const item of await consultar(grafia)) {
      const chave = item?.id ?? JSON.stringify(item);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      achados.push(item);
    }
  }
  return achados;
}

module.exports = { capitalizar, grafiasDeCidade, buscarPorCidade };
