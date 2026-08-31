const RUNS = 200000;
const sortShuffle = (a) => [...a].sort(() => Math.random() - 0.5);
for (const N of [20, 40]) {
  const base = [...Array(N).keys()];
  const at = new Array(N).fill(0);
  for (let r = 0; r < RUNS; r++) at[sortShuffle(base).indexOf(0)]++;
  const pct = at.map((c) => 100 * c / RUNS);
  const firstTen = pct.slice(0, 10).reduce((a, b) => a + b, 0);
  console.log(`n=${N} (the ${N === 40 ? "sprint" : "listening"} pool): the first card leads ${pct[0].toFixed(1)}% of rounds `
    + `(uniform ${(100 / N).toFixed(1)}%), and is in the first ten ${firstTen.toFixed(1)}% `
    + `(uniform ${(1000 / N).toFixed(1)}%)`);
}
