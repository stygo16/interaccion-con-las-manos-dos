// voice.js — pure parsing helpers for voice-controlled notes.
//
// No p5/ml5/DOM dependencies, so it can be unit-tested with plain Node.
// In the browser it runs as a classic script and exposes globals;
// under Node it also exports CommonJS for the test file.

// Spoken word -> note letter. Covers Spanish letter names ("ge", "ce"...) and
// solfege ("do", "re", "mi", "fa", "sol", "la", "si"), plus English letters.
const WORD_TO_LETTER = {
  do: 'c', re: 'd', mi: 'e', fa: 'f', sol: 'g', la: 'a', si: 'b',
  ge: 'g', ce: 'c', de: 'd', efe: 'f', be: 'b',
  c: 'c', d: 'd', e: 'e', f: 'f', g: 'g', a: 'a', b: 'b',
};

const LETTER_TO_SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

const NUMBER_WORDS = {
  cero: '0', uno: '1', dos: '2', tres: '3', cuatro: '4',
  cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9',
};

const FIRST_MIDI = 48; // C3
const LAST_MIDI = 83; // B5

/**
 * Parse a spoken note like "g4", "sol cuatro" or "efe3" into a MIDI number
 * within the keyboard range (C3..B5). Returns null when it does not match
 * or falls outside the range.
 */
function parseSpokenNote(raw) {
  if (typeof raw !== 'string') return null;

  let text = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip accents

  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    text = text.split(word).join(digit);
  }
  text = text.replace(/[^a-z0-9]/g, '');

  // Longest alternatives first so "efe" beats "e" and "sol" beats "s".
  const match = text.match(
    /^(do|re|mi|fa|sol|la|si|efe|ge|ce|de|be|c|d|e|f|g|a|b)([0-9])$/
  );
  if (!match) return null;

  const letter = WORD_TO_LETTER[match[1]];
  const octave = parseInt(match[2], 10);
  const midi = (octave + 1) * 12 + LETTER_TO_SEMITONE[letter];

  if (midi < FIRST_MIDI || midi > LAST_MIDI) return null;
  return midi;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseSpokenNote, WORD_TO_LETTER, LETTER_TO_SEMITONE };
}
