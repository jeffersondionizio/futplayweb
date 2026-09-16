/**
 * Autenticação — mesmo projeto Firebase do aplicativo Android.
 *
 * Por ser o mesmo projeto, o UID é o mesmo: quem já usa o app entra aqui e
 * encontra o próprio perfil, sem cadastro novo. É essa a razão de não haver
 * login próprio do site.
 *
 * O login usa popup e cai para redirect quando o navegador bloqueia popups — o
 * que acontece bastante no iOS e em navegadores dentro de outros aplicativos.
 */

import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { firebaseConfig } from './configuracao'

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

const provedor = new GoogleAuthProvider()
// Força a escolha de conta: sem isso, quem tem várias contas Google entra
// sempre na primeira e não entende por que o perfil veio errado.
provedor.setCustomParameters({ prompt: 'select_account' })

export async function entrarComGoogle(): Promise<void> {
  try {
    await signInWithPopup(auth, provedor)
  } catch (erro) {
    const codigo = (erro as { code?: string })?.code ?? ''
    const popupBloqueado =
      codigo === 'auth/popup-blocked' ||
      codigo === 'auth/popup-closed-by-user' ||
      codigo === 'auth/cancelled-popup-request'
    if (!popupBloqueado) throw erro
    if (codigo === 'auth/popup-closed-by-user') return
    await signInWithRedirect(auth, provedor)
  }
}

export const sair = () => signOut(auth)

/** Token de ID atual. O SDK renova sozinho quando falta menos de 5 min. */
export async function tokenAtual(): Promise<string | null> {
  const usuario = auth.currentUser
  if (!usuario) return null
  return usuario.getIdToken()
}

/**
 * Resolve quando o Firebase termina de restaurar a sessão do armazenamento
 * local. Antes disso `auth.currentUser` é null mesmo para quem está logado, e
 * qualquer chamada à API sairia sem token.
 */
export function aguardarSessao(): Promise<User | null> {
  return new Promise((resolve) => {
    const cancelar = onAuthStateChanged(auth, (usuario) => {
      cancelar()
      resolve(usuario)
    })
  })
}

export { getRedirectResult, onAuthStateChanged }
export type { User }
