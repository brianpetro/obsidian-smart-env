v3.1.3 release notes available at https://smartconnections.app/smart-environment/releases/3-0/


- Reorganized source embed-input actions around adapter-first paths and keys, including `source_base_get_embed_input`, `source_canvas_get_embed_input`, and `source_rendered_get_embed_input`.
- Canvas and rendered sources now delegate shared embedding behavior through the action registry.
- Updated generated environment configuration and regression coverage for the new action hierarchy.
