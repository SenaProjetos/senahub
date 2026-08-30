/* eslint-disable @typescript-eslint/no-require-imports -- loaders do Turbopack usam CommonJS. */
const path = require("node:path");
const ts = require("typescript");

const ATTRIBUTE_NAME = "data-visual-source";

function isNativeElement(tagName) {
  return ts.isIdentifier(tagName) && tagName.text === tagName.text.toLowerCase();
}

function hasVisualSourceAttribute(attributes) {
  return attributes.properties.some(
    (property) => ts.isJsxAttribute(property) && property.name.text === ATTRIBUTE_NAME,
  );
}

function sourceAttribute(factory, sourceFile, node, relativePath) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const value = `${relativePath}:${start.line + 1}:${start.character + 1}`;

  return factory.createJsxAttribute(factory.createIdentifier(ATTRIBUTE_NAME), factory.createStringLiteral(value));
}

function attributesWithSource(factory, sourceFile, node, relativePath) {
  if (hasVisualSourceAttribute(node.attributes)) return node.attributes;

  return factory.updateJsxAttributes(node.attributes, [
    ...node.attributes.properties,
    sourceAttribute(factory, sourceFile, node, relativePath),
  ]);
}

function normalizeProjectPath(projectRoot, resourcePath) {
  return path.relative(projectRoot, resourcePath).split(path.sep).join("/");
}

function transformVisualInspectorSource(source, resourcePath, projectRoot) {
  const sourceFile = ts.createSourceFile(resourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const relativePath = normalizeProjectPath(projectRoot, resourcePath);

  const transformer = (context) => {
    const { factory } = context;

    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) && isNativeElement(node.tagName)) {
        return factory.updateJsxOpeningElement(
          node,
          node.tagName,
          node.typeArguments,
          attributesWithSource(factory, sourceFile, node, relativePath),
        );
      }

      if (ts.isJsxSelfClosingElement(node) && isNativeElement(node.tagName)) {
        return factory.updateJsxSelfClosingElement(
          node,
          node.tagName,
          node.typeArguments,
          attributesWithSource(factory, sourceFile, node, relativePath),
        );
      }

      return ts.visitEachChild(node, visit, context);
    };

    return (node) => ts.visitNode(node, visit);
  };

  const result = ts.transform(sourceFile, [transformer]);
  const transformed = result.transformed[0];
  const output = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(transformed);
  result.dispose();
  return output;
}

module.exports = { transformVisualInspectorSource };
