// Force Transformers.js to select ONNX Runtime Web in Electron workers.
globalThis.process = undefined;

self.addEventListener('message', async (event) => {
  const response = await process_message(event.data);
  self.postMessage(response);
});
