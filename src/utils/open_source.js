import { Keymap } from 'obsidian';
/**
 * Opens the source (or block) represented by the given item.
 */
export async function open_source(item, event = null) {
  try{
    const env = item.env;
    const obsidian_app = env.obsidian_app;
    let target_path = item.key;
  
    // handle top-level blocks (should return file path)
    if (target_path.endsWith('#')) target_path = target_path.slice(0, -1);
  
    let target_file;
    if (target_path.includes('#')) {
      const [file_path] = target_path.split('#');
      target_file = obsidian_app.metadataCache.getFirstLinkpathDest(file_path, '');
    } else {
      target_file = obsidian_app.metadataCache.getFirstLinkpathDest(target_path, '');
    }
  
    if (!target_file) {
      console.warn(`[open_note] Unable to resolve file for ${target_path}`);
      return;
    }
    let leaf;
  
    if (event) {
      const is_mod = Keymap.isModEvent(event);
      const is_alt = Keymap.isModifier(event, 'Alt');
  
      if (is_mod && is_alt) {
        // Split to the right of the active leaf.
        leaf = obsidian_app.workspace.splitActiveLeaf('vertical');
      } else if (is_mod) {
        // Open in a *new* leaf (tab) but do not split.
        leaf = obsidian_app.workspace.getLeaf(true);
      } else {
        // No modifiers → reuse current leaf.
        leaf = obsidian_app.workspace.getMostRecentLeaf();
      }
    } else {
      // Fallback when no event supplied.
      leaf = obsidian_app.workspace.getMostRecentLeaf();
    }
  
    // Open file & position cursor if a block was specified
    await leaf.openFile(target_file);
  
    if (typeof item?.line_start === 'number') {
      const { editor } = leaf.view;
      const pos = { line: item.line_start, ch: 0 };
      editor.setCursor(pos);
      editor.scrollIntoView({ to: pos, from: pos }, true);
    }
    item.emit_event('sources:opened', { event_source: 'open_source method' });
  }catch(e){
    console.error("Error in open_source:", e);
    item.emit_event('notification:error', { message: e.message, event_source: 'open_source method' });
  }
}