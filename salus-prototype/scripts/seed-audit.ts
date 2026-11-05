import { portfolio } from "../src/data/portfolio";
const p = portfolio as any;
for (const k of ["entities","sites","assets","policies","coverages","premiums","requirements","exclusions","carriers","brokers","fxRates"]) {
  console.log(k, Array.isArray(p[k]) ? p[k].length : "MISSING");
}
console.log("files", Object.keys(p).join(","));
