export default function (ns, input) {
  const [rows, cols] = input;
  const sum = [];
  for (let i = 0; i < cols; ++i) sum[i] = 1;
  for (let i = 1; i < rows; ++i) {
    for (let j = 1; j < cols; ++j) {
      sum[j] += sum[j - 1];
    }
  }
  return sum[cols - 1];
}
