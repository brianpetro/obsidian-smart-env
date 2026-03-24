import base from 'smart-contexts';
import { SmartContext } from '../items/smart_context.js';
import { SmartContexts } from 'smart-contexts/smart_contexts.js';

base.class = SmartContexts;
base.version = SmartContexts.version;
base.item_type = SmartContext;

export { SmartContexts };
export default base;