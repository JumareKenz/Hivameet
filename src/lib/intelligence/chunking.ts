// Splits a formatted transcript into character-bounded chunks along segment
// boundaries (never mid-line), so each chunk is a clean, independently
// readable slice of the conversation for the map step of the map-reduce
// pipeline in index.ts.

const CHUNK_CHAR_LIMIT = 7000;

/** Below this, skip chunking entirely and run one direct extraction pass — cheaper and just as accurate for short meetings. */
export const SINGLE_PASS_CHAR_LIMIT = 9000;

export function chunkTranscript(formattedLines: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const line of formattedLines) {
    if (currentLength + line.length > CHUNK_CHAR_LIMIT && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  }
  if (current.length > 0) chunks.push(current.join("\n"));

  return chunks;
}
