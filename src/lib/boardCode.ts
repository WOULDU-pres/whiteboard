const ADJECTIVES = ['happy', 'brave', 'sunny', 'calm', 'lucky', 'swift', 'bright', 'kind'];
const NOUNS = ['tiger', 'panda', 'otter', 'koala', 'whale', 'eagle', 'fox', 'bear'];

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)];
}

export function generateBoardCode(rand: () => number = Math.random): string {
  const adj = pick(ADJECTIVES, rand);
  const noun = pick(NOUNS, rand);
  const nn = String(Math.floor(rand() * 100)).padStart(2, '0');
  return `${adj}-${noun}-${nn}`;
}
