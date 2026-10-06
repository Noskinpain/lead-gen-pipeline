import { runAcquisition } from "./acquisition";
import { githubAdapter } from "./sources/github-adapter";

runAcquisition(githubAdapter, 3); // just 3 pages for a quick, safe test