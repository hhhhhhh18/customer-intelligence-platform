declare module 'pg-copy-streams' {
  import { Transform } from 'stream';
  export function from(queryText: string): Transform;
  export function to(queryText: string): Transform;
}
