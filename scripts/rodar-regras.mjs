/**
 * npm run test:rules        (scripts/testar-regras.mjs)
 * npm run test:servidor     (scripts/testar-servidor.mjs, mesmo emulador)
 *
 * Com o sistema local rodando (npm run dev + emuladores), o
 * `emulators:exec` tentava subir OUTRO emulador na mesma porta e morria
 * com "port taken". Agora:
 *   - emulador já de pé na 8099: roda os testes nele. O teste usa o
 *     projectId 'avante-regras-teste', então não encosta nos dados do app.
 *   - emulador desligado: sobe um só para o teste e derruba no fim.
 */
import net from 'net'
import fs from 'fs'
import { spawn } from 'child_process'

const PORTA = 8099
const TESTE = `node ${process.argv[2] || 'scripts/testar-regras.mjs'}`

function portaAberta(porta) {
  return new Promise(ok => {
    const s = net.connect(porta, '127.0.0.1')
    s.once('connect', () => { s.destroy(); ok(true) })
    s.once('error', () => ok(false))
  })
}

/** O emulador pede Java 21. Nesta máquina ele vem com o Android Studio. */
function ambiente() {
  const env = { ...process.env }
  const jbr = 'C:/Program Files/Android/Android Studio/jbr'
  // Usa o do Android Studio mesmo com JAVA_HOME definido: nesta máquina
  // o JAVA_HOME aponta para o Java 1.8, e o emulador morre com ele.
  if (fs.existsSync(jbr)) {
    env.JAVA_HOME = jbr
    env.PATH = `${jbr}/bin${process.platform === 'win32' ? ';' : ':'}${env.PATH}`
  }
  return env
}

const deP = await portaAberta(PORTA)
const comando = deP ? TESTE : `npx firebase emulators:exec --only firestore "${TESTE}"`
console.log(deP
  ? `[regras] emulador já está na ${PORTA}: testando nele (projeto isolado)`
  : '[regras] subindo um emulador só para o teste')

const p = spawn(comando, { shell: true, stdio: 'inherit', env: ambiente() })
p.on('exit', code => process.exit(code ?? 1))
