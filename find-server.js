/** @param {Array} list */
function rpush(host, list, parents) {
  if (parents[host]) {
    rpush(parents[host], list, parents);
  }
  list.push((host === "home" ? "" : "connect ") + host);
}

/** @param {NS} ns */
export async function main(ns) {
  const stack = ["home"];
  const parents = { home: null };
  let target = ns.args[0];

  outer: while (stack.length) {
    const host = stack.pop();
    for (const x of ns.scan(host)) {
      if (x === parents[host]) continue;
      stack.push(x);
      parents[x] = host;
      if (x.toUpperCase() === target.toUpperCase()) {
        target = x;
        break outer;
      }
    }
  }
  if (!stack.length) {
    ns.tprint("Couldn't find " + target);
    return;
  }
  const conn_list = [];
  rpush(target, conn_list, parents);
  ns.tprint("Copied to clipboard: " + conn_list.join("; "));
  // Copy to clipboard. This might not work in all browsers, but I only care
  // about Chromium.
  return navigator.clipboard.writeText(conn_list.join("; "));
}
