// Preguntas por consola para los comandos de instalación (instalar, crear-admin).
// Las contraseñas no se muestran mientras se escriben. Si la entrada no es una terminal
// (p. ej. viene de un archivo o de otro programa), se leen las líneas tal cual.
import { createInterface } from 'node:readline'

export function createPrompt({ input = process.stdin, output = process.stdout } = {}) {
  const interactive = Boolean(input.isTTY)
  const rl = createInterface({ input, output, terminal: interactive })
  const lines = rl[Symbol.asyncIterator]()

  // Mientras "muted" está activo, lo que se teclea no aparece en pantalla.
  let muted = false
  const writeToOutput = rl._writeToOutput?.bind(rl)
  rl._writeToOutput = (chunk) => {
    if (!muted && writeToOutput) writeToOutput(chunk)
  }

  async function ask(question, { hidden = false, defaultValue = '' } = {}) {
    output.write(defaultValue ? `${question}[${defaultValue}] ` : question)
    muted = hidden && interactive
    const { value, done } = await lines.next()
    if (muted) output.write('\n')
    muted = false
    if (done) throw new Error('Entrada cancelada.')
    return value.trim() || defaultValue
  }

  // Sí/No; Enter acepta el valor por defecto.
  async function confirm(question, defaultYes = true) {
    const answer = (await ask(`${question} ${defaultYes ? '(S/n)' : '(s/N)'} `)).toLowerCase()
    if (!answer) return defaultYes
    return ['s', 'si', 'sí', 'y', 'yes'].includes(answer)
  }

  return { ask, confirm, close: () => rl.close() }
}
