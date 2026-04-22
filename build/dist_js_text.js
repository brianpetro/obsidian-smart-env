// esbuild-plugin-dist-text.mjs
import * as esbuild from 'esbuild';
import path from 'node:path';

export function dist_text_plugin() {
  return {
    name: 'dist-text',
    setup(build) {
      build.onResolve({ filter: /\.iframe\.js$/ }, (args) => {
        const abs_src_path = path.resolve(args.resolveDir, args.path);

        return {
          path: abs_src_path,
          namespace: 'dist-text',
          pluginData: {
            abs_src_path,
          },
        };
      });

      build.onLoad({ filter: /.*/, namespace: 'dist-text' }, async (args) => {
        const { abs_src_path } = args.pluginData;

        const result = await esbuild.build({
          entryPoints: [abs_src_path],
          bundle: true,
          format: 'esm',
          platform: build.initialOptions.platform ?? 'neutral',
          target: build.initialOptions.target,
          define: build.initialOptions.define,
          minify: false,
          keepNames: true,
          sourcemap: false,
          write: false,
          logLevel: 'silent',
        });

        const js_output =
          result.outputFiles.find((file) => file.path.endsWith('.js')) ??
          result.outputFiles[0];

          console.log(js_output.text);
        return {
          contents: js_output.text,
          loader: 'text',
          resolveDir: path.dirname(abs_src_path),
          watchFiles: [abs_src_path],
        };
      });
    },
  };
}