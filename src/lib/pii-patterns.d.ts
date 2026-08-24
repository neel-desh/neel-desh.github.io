/** Types for pii-patterns.mjs, which is plain .mjs so Node and the Worker
 *  bundle can both import it without a build step. */

export interface PiiPattern {
  name: string;
  re: RegExp;
}

export interface PiiHit {
  rule: string;
  hit: string;
}

export declare const ALLOW: string[];
export declare const PATTERNS: PiiPattern[];
export declare function isAllowed(hit: string): boolean;
export declare function findPii(text: string): PiiHit[];
