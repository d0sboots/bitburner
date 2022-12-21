export default function (ns, input) {
  const sum = [1];
  for (let i = 1; i < input[0].length; ++i) {
    sum[i] = 0;
  }
  for (let i = 0; i < input.length; ++i) {
    for (let j = 0; j < input[i].length; ++j) {
      if (input[i][j] === 1) {
        sum[j] = 0;
      } else if (j !== 0) {
        sum[j] += sum[j - 1];
      }
    }
  }
  return sum[input[0].length - 1];
}
