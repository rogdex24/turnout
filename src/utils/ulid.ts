const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const ULID = /^[0-9a-hjkmnp-tv-z]{26}$/;

let lastTime = -1;
let lastRandom: number[] = [];

/**
 * A lowercase ULID (the data model's id convention): 48 bits of time then 80 bits of randomness, Crockford base32, so ids sort by creation.
 * Two ids in the same millisecond still sort in call order (the random part is incremented).
 * `time` is a parameter so tests can fix it.
 */
export function ulid(time: Date = new Date()): string {
  let ms = time.getTime();
  if (ms === lastTime) {
    // Same millisecond: increment the previous random part so the order holds.
    let i = lastRandom.length - 1;
    while (i >= 0 && lastRandom[i] === 31) {
      lastRandom[i] = 0;
      i -= 1;
    }
    if (i >= 0) lastRandom[i] = (lastRandom[i] ?? 0) + 1;
  } else {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    lastRandom = Array.from(bytes, (b) => b & 31);
    lastTime = ms;
  }
  let timePart = "";
  for (let i = 0; i < 10; i += 1) {
    timePart = ALPHABET[ms % 32] + timePart;
    ms = Math.floor(ms / 32);
  }
  return timePart + lastRandom.map((n) => ALPHABET[n]).join("");
}

export const isUlid = (value: string): boolean => ULID.test(value);
