// Conteúdo inicial: exercícios de progressão e de solo (originais/genéricos).
// Para músicas reais, cole a cifra no editor do app — só as linhas de acordes são usadas.

export const DEFAULT_SONGS = [
  {
    id: 'ex-gcd',
    title: 'Primeiros passos: G – C – D',
    artist: 'Exercício',
    bpm: 70,
    beatsPerBar: 4,
    chords: '[Parte A]\n| G | G | C | C |\n| D | D | G | G |\n[Parte B]\n| C | D | G | Em |\n| C | D | G | G |',
  },
  {
    id: 'ex-pop',
    title: 'Progressão pop (C – G – Am – F)',
    artist: 'Exercício',
    bpm: 84,
    beatsPerBar: 4,
    chords: 'C G Am F (2x)\n| C . G . | Am . F . |\n| C . G . | F . C . |',
  },
  {
    id: 'ex-blues',
    title: 'Blues em Lá (12 compassos)',
    artist: 'Exercício',
    bpm: 90,
    beatsPerBar: 4,
    chords: '| A7 | D7 | A7 | A7 |\n| D7 | D7 | A7 | A7 |\n| E7 | D7 | A7 | E7 |',
  },
  {
    id: 'ex-menores',
    title: 'Trocando menores (Am – Dm – Em)',
    artist: 'Exercício',
    bpm: 66,
    beatsPerBar: 4,
    chords: 'Intro: Am Em\n| Am | Dm | Em | Am |\n| Dm | Am | E7 | Am |',
  },
  {
    id: 'ex-cifra',
    title: 'Exemplo: colando uma cifra',
    artist: 'Exercício',
    bpm: 76,
    beatsPerBar: 4,
    chords:
      '[Intro] Em D C D\n\n[Primeira parte]\nEm          D\nAqui vai a letra da música\nC                D\nAs linhas com texto são ignoradas\n\n[Refrão]\nG        D/F#      Em\nSó os acordes contam\nC         D          G\nE cada acorde vale um compasso',
  },
];

export const DEFAULT_TABS = [
  {
    id: 'tab-penta',
    title: 'Pentatônica de Lá menor (5ª casa)',
    artist: 'Exercício',
    bpm: 70,
    perBeat: 2,
    tab:
      'Subindo\n' +
      'e|---------------------------5-8-|\n' +
      'B|-----------------------5-8-----|\n' +
      'G|-------------------5-7---------|\n' +
      'D|-------------5-7---------------|\n' +
      'A|-------5-7---------------------|\n' +
      'E|-5-8---------------------------|\n' +
      '\nDescendo\n' +
      'e|-8-5---------------------------|\n' +
      'B|-----8-5-----------------------|\n' +
      'G|---------7-5-------------------|\n' +
      'D|-------------7-5---------------|\n' +
      'A|-----------------7-5-----------|\n' +
      'E|---------------------8-5-------|',
  },
  {
    id: 'tab-crom',
    title: 'Cromático 1-2-3-4',
    artist: 'Exercício',
    bpm: 60,
    perBeat: 2,
    tab:
      'e|---------------------------------------------1-2-3-4-|\n' +
      'B|-------------------------------------1-2-3-4---------|\n' +
      'G|-----------------------------1-2-3-4-----------------|\n' +
      'D|---------------------1-2-3-4-------------------------|\n' +
      'A|-------------1-2-3-4---------------------------------|\n' +
      'E|-----1-2-3-4-----------------------------------------|',
  },
  {
    id: 'tab-maior',
    title: 'Escala de Dó maior (1ª posição)',
    artist: 'Exercício',
    bpm: 66,
    perBeat: 2,
    tab:
      'e|-------------------------0-1-3-|\n' +
      'B|-----------------0-1-3---------|\n' +
      'G|-------------0-2---------------|\n' +
      'D|-------0-2-3-------------------|\n' +
      'A|-----3-------------------------|\n' +
      'E|-------------------------------|',
  },
  {
    id: 'tab-lick',
    title: 'Frase de blues em Lá',
    artist: 'Exercício',
    bpm: 72,
    perBeat: 2,
    tab:
      'e|-----------5---------5-8-5-------------|\n' +
      'B|-------5-8---8-5-----------8-5---------|\n' +
      'G|-5-7-----------------------------7-5---|\n' +
      'D|---------------------------------------|\n' +
      'A|---------------------------------------|\n' +
      'E|---------------------------------------|',
  },
];
