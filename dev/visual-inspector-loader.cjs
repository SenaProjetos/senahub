/* eslint-disable @typescript-eslint/no-require-imports -- loaders do Turbopack usam CommonJS. */
const ts = require("typescript");
const { transformVisualInspectorSource } = require("./visual-inspector-transform.cjs");

module.exports = function visualInspectorLoader(source) {
  const instrumented = transformVisualInspectorSource(source.toString(), this.resourcePath, this.rootContext);

  return ts.transpileModule(instrumented, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSXDev,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
};
