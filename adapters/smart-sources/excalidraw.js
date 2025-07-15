import { ObsidianMarkdownSourceContentAdapter } from "./obsidian_markdown.js";

export class ExcalidrawSourceContentAdapter extends ObsidianMarkdownSourceContentAdapter {
  static extensions = ['excalidraw.md'];
  is_media = true; // Excalidraw files are treated as media for rendering
  async read(opts = {}) {
    const full_content = await super.read(opts);
    // only return content between ## Text Elements and ## Drawing lines
    const text_elements_start = full_content.indexOf('## Text Elements');
    const drawing_lines_start = full_content.indexOf('## Drawing');
    if (text_elements_start === -1 || drawing_lines_start === -1) {
      console.warn('Excalidraw file does not contain expected sections.');
      return ""; // Return empty string if sections are not found
    }

    // Extract and return the content between the two sections
    const text_content = full_content.slice(text_elements_start + '## Text Elements'.length, drawing_lines_start).trim();

    // strip "^abc123" from end of each line
    const stripped_refs = text_content
      .split('\n')
      .map(line => {
        if(line.trim() === '%%') return ''; // skip empty lines
        // Remove any trailing reference like ^abc123
        return line.replace(/\^[a-z0-9]+$/i, '').trim();
      })
      .filter(Boolean) // filter out empty lines
      .join('\n')
    ;
    console.log('Excalidraw text content:', stripped_refs);
    return stripped_refs;
  }
}