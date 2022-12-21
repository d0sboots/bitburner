export default function (ns, input) {
  let covered = 0;
  let i;
  for (i = 0; i <= covered && i < input.length; ++i) {
    covered = Math.max(covered, i + input[i]);
  }
  return i === input.length ? 1 : 0;
}
