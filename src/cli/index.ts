import * as program from 'commander'
import * as inquirer from 'inquirer'

/**
 * Runs a set of different clients. Useful to split functionalities and lower boilerplate code
 * @param {array} clients - An array of objects that implement the `addCommand method`
 */
export function runProgram(clients: { addCommands: (program: any) => void }[]) {
  for (const client of clients) {
    if (typeof client.addCommands !== 'function') {
      throw new Error(
        'Each client supplied to `runProgram` must implement the `addCommands` function'
      )
    }

    client.addCommands(program)
  }

  if (!process.argv.slice(2).length) {
    program.outputHelp()
    process.exit()
  }

  program.parse(process.argv)
}

/**
 * Query the user for a boolean result
 * @param {string} [text=Are you sure?]  - The text to show to the user
 * @param {boolean} [defaultAnswer=true] - The value for the default answer
 */
export async function confirm(
  text?: string,
  defaultAnswer?: boolean
): Promise<boolean> {
  const res = await inquirer.prompt<{ confirm: boolean }>({
    type: 'confirm',
    name: 'confirm',
    message: text,
    default: defaultAnswer
  })

  return res.confirm
}

/**
 * Uses inquier {@link https://github.com/SBoudrias/Inquirer.js} to launch the prompt interface (inquiry session)
 * @param {Array} [questions = []] - questions containing Question Object {@link https://github.com/SBoudrias/Inquirer.js#objects}
 * @param {Promise} answers - A key/value hash containing the client answers in each prompt.
 */
export function prompt(questions: any[]): Promise<any> {
  return inquirer.prompt(questions)
}
