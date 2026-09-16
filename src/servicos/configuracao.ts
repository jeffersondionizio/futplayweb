/**
 * Endereços e chaves do FutPlay web.
 *
 * A API é a mesma do aplicativo Android — o gateway unificado na AWS. Não há
 * backend próprio do site: o navegador fala direto com ela, o que só é possível
 * porque o CORS do gateway já libera `authorization` para qualquer origem.
 *
 * A configuração do Firebase é pública por natureza: a `apiKey` identifica o
 * projeto, não autoriza nada. Quem autoriza é a lista de domínios permitidos no
 * console do Firebase, e é lá que `futplay.bibiprogramadortop.win` precisa estar.
 */

export const API_BASE = 'https://zamxi44hx6.execute-api.us-east-1.amazonaws.com'

export const firebaseConfig = {
  apiKey: 'AIzaSyCAlbWeYv2NiTXBC93s8ft5w9k7iaV3v_g',
  authDomain: 'cadepelada.firebaseapp.com',
  projectId: 'cadepelada',
  storageBucket: 'cadepelada.firebasestorage.app',
  messagingSenderId: '1021049523854',
  appId: '1:1021049523854:web:e0e3e21cbed511f6db43df',
}

/** Play Store do app, usado nas chamadas para instalar. */
export const URL_APP_ANDROID =
  'https://play.google.com/store/apps/details?id=com.futebol.cadepelada'
