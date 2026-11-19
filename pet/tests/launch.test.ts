import { expect, test } from 'claude-code/testing'

import { actionOf, answerTo, startFailure } from '../hooks/launch'

test('/pet asks to open the pet, and «salir» to close it, whatever the spaces around', () => {
  expect(['', 'abrir', 'quit'].map(actionOf)).toEqual(['open', 'open', 'open'])
  expect(['salir', ' salir ', '\tsalir\n'].map(actionOf)).toEqual(['quit', 'quit', 'quit'])
})

test('a start that failed is logged with the launcher complaint trimmed, one that did not is not', () => {
  expect(startFailure({ exitCode: 0, stderr: 'warning\n' })).toBeUndefined()
  expect(startFailure({ exitCode: 1, stderr: ' swiftc: command not found\n' })).toBe(
    'pet: no pudo abrirse: swiftc: command not found',
  )
})

test('the command answers that the pet opened or closed', () => {
  expect(answerTo('open', { exitCode: 0, stderr: '' })).toBe('Mascota en el escritorio.')
  expect(answerTo('quit', { exitCode: 0, stderr: '' })).toBe('Mascota cerrada.')
})

test('the command says why the pet could not open or close, the complaint trimmed', () => {
  expect(answerTo('open', { exitCode: 2, stderr: ' no shell\n' })).toBe('La mascota no pudo abrirse: no shell')
  expect(answerTo('quit', { exitCode: 1, stderr: 'no shell\n' })).toBe('La mascota no pudo cerrarse: no shell')
})
