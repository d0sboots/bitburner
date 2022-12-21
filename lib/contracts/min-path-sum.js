export default function (ns, input) {
  let lastsum = [];
  for (const row of input) {
    const sums = [];
    if (row.length === 1) {
      sums[0] = row[0];
      lastsum = sums;
      continue;
    }
    for (let i = 0; i < row.length; ++i) {
      let v;
      if (i === 0) {
        v = lastsum[0];
      } else if (i === row.length - 1) {
        v = lastsum[i - 1];
      } else {
        v = Math.min(lastsum[i], lastsum[i - 1]);
      }
      sums[i] = v + row[i];
      //ns.tprintf("%d %s", i, sums[i]);
    }
    lastsum = sums;
  }
  return Math.min(...lastsum);
}
