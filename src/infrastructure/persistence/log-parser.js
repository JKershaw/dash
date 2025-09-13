import fs from 'fs/promises';

export async function parseLogFile(filePath) {
  const entries = [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        try {
          const entry = JSON.parse(line);
          entries.push(entry);
        } catch {
          // Skip malformed entries silently
        }
      }
    }
  } catch (error) {
    console.error(`Error reading or parsing file ${filePath}:`, error);
    // Return empty array or re-throw, depending on desired error handling.
    // For now, we'll return what we have.
  }
  return entries;
}
