const N = 10, RUNS = 200000;
const sortShuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const fisherYates = (a) => {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
function measure(fn) {
  const base = [...Array(N).keys()];
  // how often element 0 lands in each position
  const at = new Array(N).fill(0);
  let stayed = 0;
  for (let r = 0; r < RUNS; r++) {
    const s = fn(base);
    at[s.indexOf(0)]++;
    for (let i = 0; i < N; i++) if (s[i] === i) stayed++;
  }
  return { at: at.map((c) => (100 * c / RUNS).toFixed(1)), fixed: (stayed / RUNS).toFixed(2) };
}
const uniform = (100 / N).toFixed(1);
for (const [name, fn] of [["sort(() => Math.random() - 0.5)", sortShuffle], ["Fisher-Yates", fisherYates]]) {
  const { at, fixed } = measure(fn);
  console.log(`${name}`);
  console.log(`  where the first card lands (%): ${at.join("  ")}    uniform would be ${uniform} each`);
  console.log(`  cards left in their original position, out of ${N}: ${fixed}   uniform would be 1.00`);
}
