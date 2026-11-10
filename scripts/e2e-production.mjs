import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
const cli=join(dirname(require.resolve('@playwright/test/package.json')),'cli.js');
const child=spawn(process.execPath,[cli,'test',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true,env:{...process.env,INVICTUS_E2E_PRODUCTION:'1'}});
child.once('error',()=>{console.error('Não foi possível iniciar a verificação no navegador.');process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
