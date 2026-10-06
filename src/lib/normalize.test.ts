import { normalizeCompanyName, normalizeDomain } from "./normalize";

console.log(normalizeCompanyName("Terry-Arnold"));
console.log(normalizeCompanyName("Terry-Arnold Inc."));
console.log(normalizeCompanyName("Terry-Arnold BV"));

console.log(normalizeDomain("https://shepard.biz/"));
console.log(normalizeDomain("http://www.shepard.biz"));
console.log(normalizeDomain("shepard.biz"));