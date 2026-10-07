import { evaluateContactSelection } from "./evaluate-contact-selection";

const result = evaluateContactSelection();
console.log("Accuracy:", result.accuracy);
console.log(result.results);