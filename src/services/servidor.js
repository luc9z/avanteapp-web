/**
 * Chamadas ao servidor do AVANTE (Cloudflare Worker, pasta worker/).
 *
 * Pagamento, cupom, consulta de CPF e a IA precisam de servidor: as chaves
 * da Cakto, da apicpf e da Groq não podem ir para o navegador. O endereço vem de
 * VITE_SERVIDOR_URL (.env.development.local no dev, .env.production.local
 * no build de produção).
 */
import { auth } from '../firebase'

const BASE = (import.meta.env.VITE_SERVIDOR_URL || '').replace(/\/$/, '')

/**
 * codigo: 'indisponivel' (servidor fora do ar ou não configurado),
 * 'nao-encontrado', 'invalido', 'limite', 'login' ou 'erro'.
 */
export class ErroServidor extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo }
}

export function servidorConfigurado() {
  return !!BASE
}

export async function chamarServidor(rota, dados) {
  if (!BASE) throw new ErroServidor('indisponivel', 'Servidor não configurado.')
  const token = await auth.currentUser?.getIdToken().catch(() => null)
  let r
  try {
    r = await fetch(BASE + rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(dados || {}),
    })
  } catch {
    throw new ErroServidor('indisponivel', 'Servidor fora do ar.')
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErroServidor(j.erro || 'erro', j.mensagem || 'Erro no servidor.')
  return j
}
