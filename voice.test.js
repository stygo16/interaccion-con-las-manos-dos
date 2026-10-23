// Plain Node.js test for the spoken-note parser (no framework needed).
// Run with: node voice.test.js
const assert = require('assert');
const { parseSpokenNote } = require('./voice.js');

const valid = [
  // English letter names
  ['g4', 67],
  ['G4', 67],
  ['c3', 48],
  ['b4', 71],
  ['a4', 69],
  ['e4', 64],
  ['d3', 50],
  ['f3', 53],
  // Spanish letter names
  ['ge4', 67],
  ['ce4', 60],
  ['de4', 62],
  ['efe3', 53],
  ['be3', 59],
  // Solfege
  ['do3', 48],
  ['re4', 62],
  ['mi4', 64],
  ['fa4', 65],
  ['sol4', 67],
  ['la4', 69],
  ['si3', 59],
  // Spacing and number words
  ['sol 4', 67],
  ['ge cuatro', 67],
  ['sol tres', 55],
  ['la 4', 69],
  // Accents
  ['mí4', 64],
  // Third octave (new range: C3..B5)
  ['c5', 72],
  ['b5', 83],
  ['a5', 81],
  ['do5', 72],
  ['sol5', 79],
  ['ge5', 79],
  ['la cinco', 81],
  ['efe5', 77],
];

for (const [input, expected] of valid) {
  assert.strictEqual(parseSpokenNote(input), expected, `input: "${input}"`);
}

const invalid = [
  'c2', 'c6', 'b6', 'a6', 'g7', 'b2', 'a1',
  'hola', 'sí', 'x4', '5', '', 'do', 'cuatro', 'gg4', 'sol44',
];

for (const input of invalid) {
  assert.strictEqual(parseSpokenNote(input), null, `input "${input}" should be null`);
}

console.log(`voice.test.js: ${valid.length + invalid.length} assertions passed`);
