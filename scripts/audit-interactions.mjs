import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root=path.resolve('src');
const files=[];
function visit(directory){for(const name of readdirSync(directory)){const file=path.join(directory,name);if(statSync(file).isDirectory())visit(file);else if(file.endsWith('.tsx')&&!file.endsWith('UI.tsx'))files.push(file);}}
visit(root);

const findings=[];
for(const file of files){
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function inspect(node){
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
      const tag=node.tagName.getText(source);
      if(tag==='button'||tag==='Button'){
        const names=node.attributes.properties.filter(ts.isJsxAttribute).map((item)=>item.name.getText(source));
        const hasSpread=node.attributes.properties.some(ts.isJsxSpreadAttribute);
        if(!names.includes('onClick')&&!names.includes('type')&&!hasSpread){
          const position=source.getLineAndCharacterOfPosition(node.getStart(source));
          findings.push(`${path.relative(process.cwd(),file)}:${position.line+1} ${tag} has no interaction handler`);
        }
      }
    }
    ts.forEachChild(node,inspect);
  }
  inspect(source);
}

if(findings.length){console.error(findings.join('\n'));process.exitCode=1;}
else console.log(`Interaction audit passed: ${files.length} TSX files contain no inert buttons.`);
