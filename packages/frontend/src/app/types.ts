
export interface Card {
  type: string;
  message: string;
}

export interface Player {
  name: string;
  cards: Card[];
}

export function timeout(seconds) {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, 1000 * seconds);
  });
}
