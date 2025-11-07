import { build_smart_env_config } from './build_env_config.js';
import path from 'path';

const roots = [
  path.resolve(process.cwd(), 'src'),
  // path.resolve(process.cwd(), '..', 'smart-context-obsidian', 'src'),
];
build_smart_env_config(process.cwd(), roots);