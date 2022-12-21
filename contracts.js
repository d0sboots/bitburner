import { ServerEntry, scanOnly } from "lib/scan.js";
import { stubCall } from "lib/stubcall.js";
import minPathSum from "lib/contracts/min-path-sum.js";
import arrayJumping from "lib/contracts/array-jumping.js";
import paths1 from "lib/contracts/paths-in-grid1.js";

const solvers = {
  ["Minimum Path Sum in a Triangle"]: minPathSum,
  ["Array Jumping Game"]: arrayJumping,
  ["Unique Paths in a Grid I"]: paths1,
};

async function list(ns) {
  const tree = await stubCall(ns, (ns) => scanOnly(ns));
  const filelist = [];
  await stubCall(ns, (ns) => {
    for (const entry of Object.values(tree)) {
      const host = entry.server.hostname;
      const files = ns["ls"](host, ".cct");
      if (!files || !files.length) continue;
      filelist.push([host, files]);
    }
  });
  const output = [];
  await stubCall({ ns, stub: "lib/contract-stub.js" }, (ns) => {
    for (const [host, files] of filelist) {
      output.push(host + ":");
      for (const file of files) {
        const ctype = ns.codingcontract["getContractType"](file, host);
        const tries = ns.codingcontract["getNumTriesRemaining"](file, host);
        output.push(`  \x1b[37m${file}\x1b[0m (${tries}, ${ctype})`);
      }
    }
  });
  ns.tprintf("%s", output.join("\n"));
}

async function getData(ns, host, file) {
  let output = [`\x1b[37m${file}\x1b[0m`];
  let ctype, desc, data, numTries;
  await stubCall({ ns, stub: "lib/contract-stub.js" }, (ns) => {
    ctype = ns.codingcontract["getContractType"](file, host);
    const htmldesc = ns.codingcontract["getDescription"](file, host);
    // Decode as html to deal with HTML entity conversion
    desc = new DOMParser().parseFromString(htmldesc, "text/html")
      .documentElement.textContent;
  });
  await stubCall({ ns, stub: "lib/contract-stub.js" }, (ns) => {
    data = ns.codingcontract["getData"](file, host);
    numTries = ns.codingcontract["getNumTriesRemaining"](file, host);
  });
  return { ctype, desc, data, numTries };
}

async function show(ns, host, file) {
  const { ctype, desc, data, numTries } = await getData(ns, host, file);
  ns.tprintf(
    "\x1b[37m%s\x1b[0m\n%s\n%s\n%s\n%d tries remaining",
    file,
    ctype,
    desc,
    data,
    numTries
  );
}

async function solve(ns, host, file) {
  const { ctype, desc, data, numTries } = await getData(ns, host, file);
  if (!Object.hasOwn(solvers, ctype)) {
    ns.tprintf("ERROR: No solver for '%s' yet!", ctype);
    return show(ns, host, file);
  }
  ns.tprintf("%s\nSolution: %s", desc, solvers[ctype](ns, data));
}

async function attempt(ns, host, file) {
  const { ctype, desc, data, numTries } = await getData(ns, host, file);
  if (!Object.hasOwn(solvers, ctype)) {
    ns.tprintf("ERROR: No solver for '%s' yet!", ctype);
    return show(ns, host, file);
  }
  const soln = solvers[ctype](ns, data);
  const result = await stubCall({ ns, stub: "lib/contract-stub.js" }, (ns) =>
    ns.codingcontract["attempt"](soln, file, host)
  );
  ns.tprintf("Answer %s\nResult: %s", soln, result);
}

/** @param {NS} ns */
export async function main(ns) {
  if (ns.args.length === 0 || ns.args[0] === "list") {
    return list(ns);
  }
  if (ns.args[0] === "show") {
    return show(ns, ns.args[1], ns.args[2]);
  }
  if (ns.args[0] === "solve") {
    return solve(ns, ns.args[1], ns.args[2]);
  }
  if (ns.args[0] === "try") {
    return attempt(ns, ns.args[1], ns.args[2]);
  }
  ns.tprintf(`ERROR: Unknown command "${ns.args[0]}"`);
}
