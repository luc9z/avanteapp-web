/**
 * Firestore e login do Firebase pelo Cloudflare Worker.
 *
 * Sem o firebase-admin (não roda em Workers): o Firestore é acessado pela
 * API REST, com um token da conta de serviço do Google (permissão mínima:
 * Cloud Datastore User). Esse acesso é de servidor e NÃO passa pelas regras
 * do firestore.rules, igual ao firebase-admin. Por isso só este código grava
 * plano pago.
 *
 * Localmente (FIRESTORE_EMULATOR_HOST definido), fala com o emulador.
 */
import { createRemoteJWKSet, jwtVerify, decodeJwt, SignJWT, importPKCS8 } from 'jose'

/* ── Login: o token do Firebase que o app manda ── */
const CHAVES_FIREBASE = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))

export async function usuarioDaRequisicao(req, env) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  // O emulador de login emite token SEM assinatura. Só aceito isso quando o
  // Worker também está apontado para o emulador do banco: em produção as
  // duas variáveis não existem.
  if (env.FIRESTORE_EMULATOR_HOST && env.AUTH_EMULATOR === '1') {
    try {
      const c = decodeJwt(token)
      return c.user_id ? { uid: c.user_id, email: c.email || null } : null
    } catch {
      return null   // token malformado: é "sem login" (401), não erro do servidor
    }
  }
  try {
    const { payload } = await jwtVerify(token, CHAVES_FIREBASE, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    })
    return { uid: payload.sub, email: payload.email || null }
  } catch {
    return null
  }
}

/* ── Token de servidor do Google (conta de serviço) ── */
let tokenCache = null
async function tokenGoogle(env) {
  if (tokenCache && tokenCache.expira > Date.now() + 60_000) return tokenCache.token
  const conta = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT)
  const chave = await importPKCS8(conta.private_key, 'RS256')
  const agora = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(conta.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(agora)
    .setExpirationTime(agora + 3600)
    .sign(chave)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('token do Google recusado: ' + JSON.stringify(j).slice(0, 200))
  tokenCache = { token: j.access_token, expira: Date.now() + j.expires_in * 1000 }
  return tokenCache.token
}

/* ── Conversão entre objetos JS e o formato de campos da API REST ── */
function paraValor(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(paraValor) } }
  return { mapValue: { fields: paraCampos(v) } }
}
export const paraCampos = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, paraValor(v)]))

function deValor(x) {
  if (!x || 'nullValue' in x) return null
  if ('stringValue' in x) return x.stringValue
  if ('booleanValue' in x) return x.booleanValue
  if ('integerValue' in x) return Number(x.integerValue)
  if ('doubleValue' in x) return x.doubleValue
  if ('timestampValue' in x) return new Date(x.timestampValue)
  if ('arrayValue' in x) return (x.arrayValue.values || []).map(deValor)
  if ('mapValue' in x) return deCampos(x.mapValue.fields || {})
  return null
}
const deCampos = f => Object.fromEntries(Object.entries(f).map(([k, x]) => [k, deValor(x)]))

export class ErroBanco extends Error {
  constructor(status, corpo) { super(`firestore ${status}: ${String(corpo).slice(0, 300)}`); this.status = status }
}

export function banco(env) {
  const emulador = env.FIRESTORE_EMULATOR_HOST
  const base = emulador ? `http://${emulador}/v1` : 'https://firestore.googleapis.com/v1'
  const raiz = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`

  async function req(metodo, caminho, corpo) {
    const token = emulador ? 'owner' : await tokenGoogle(env)
    const r = await fetch(`${base}/${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    if (r.status === 404 && metodo === 'GET') return null
    const texto = await r.text()
    if (!r.ok) throw new ErroBanco(r.status, texto)
    return texto ? JSON.parse(texto) : {}
  }

  return {
    /** { dados, atualizadoEm } ou null se o documento não existe. */
    async ler(caminho) {
      const d = await req('GET', `${raiz}/${caminho}`)
      return d ? { dados: deCampos(d.fields || {}), atualizadoEm: d.updateTime } : null
    },

    /**
     * Escrita "merge": só os campos informados mudam.
     * precondicao: { updateTime } (ninguém mexeu desde a leitura) ou { exists: false }.
     */
    escrita(caminho, dados, precondicao) {
      return {
        update: { name: `${raiz}/${caminho}`, fields: paraCampos(dados) },
        updateMask: { fieldPaths: Object.keys(dados).map(k => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `\`${k}\``)) },
        ...(precondicao && { currentDocument: precondicao }),
      }
    },

    /** Grava tudo junto: ou todas as escritas entram, ou nenhuma. */
    async commit(escritas) {
      return req('POST', `${raiz}:commit`, { writes: escritas })
    },

    async gravar(caminho, dados) {
      return this.commit([this.escrita(caminho, dados)])
    },

    /** Documentos de uma coleção com campo == valor (todos os filtros juntos). */
    async onde(colecao, iguais) {
      const filtros = Object.entries(iguais).map(([campo, valor]) => ({
        fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: paraValor(valor) },
      }))
      const where = filtros.length === 1 ? filtros[0] : { compositeFilter: { op: 'AND', filters: filtros } }
      const r = await req('POST', `${raiz}:runQuery`, { structuredQuery: { from: [{ collectionId: colecao }], where } })
      return (r || []).filter(x => x.document).map(x => ({
        caminho: x.document.name.split('/documents/')[1],
        dados: deCampos(x.document.fields || {}),
      }))
    },

    /** Documentos de uma coleção com campo <= valor (só o que a tarefa diária precisa). */
    async ateData(colecao, campo, data) {
      const r = await req('POST', `${raiz}:runQuery`, {
        structuredQuery: {
          from: [{ collectionId: colecao }],
          where: { fieldFilter: { field: { fieldPath: campo }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: data.toISOString() } } },
        },
      })
      return (r || []).filter(x => x.document).map(x => ({
        caminho: x.document.name.split('/documents/')[1],
        dados: deCampos(x.document.fields || {}),
      }))
    },
  }
}
