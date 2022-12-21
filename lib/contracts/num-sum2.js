function calculate(memo, target, nums, limit) {
  if (limit === 0) {
    const v = target % nums[0] === 0 ? 1 : 0;
    memo[0][target] = v;
    return v;
  }
  let v = 0;
  const tOrig = target;
  for (; target >= 0; target -= nums[limit]) {
    v += memo[limit - 1][target] ?? calculate(memo, target, nums, limit - 1);
  }
  memo[limit][tOrig] = v;
  return v;
}

export default function (ns, input) {
  const [target, nums] = input;
  nums.sort();
  const memo = [];
  for (let i = 0; i < nums.length; ++i) {
    memo[i] = [];
  }
  return calculate(memo, target, nums, nums.length - 1);
}
