import { groundTruthDataset } from "./ground-truth";
console.log(groundTruthDataset.length, "entries,", groundTruthDataset.filter(e => e.isReal).length, "real");