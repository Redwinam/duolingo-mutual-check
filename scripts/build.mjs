import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
const {version}=JSON.parse(await read('package.json'));
const header=`// ==UserScript==
// @name         多邻国 · 互关核对
// @namespace    local.duolingo-mutual-check
// @version      ${version}
// @author       Redwinam
// @copyright    2026 Redwinam
// @license      CC-BY-NC-SA-4.0
// @homepageURL  https://github.com/Redwinam/duolingo-mutual-check
// @supportURL   https://github.com/Redwinam/duolingo-mutual-check/issues
// @downloadURL  https://raw.githubusercontent.com/Redwinam/duolingo-mutual-check/main/dist/duolingo-mutual-check.user.js
// @updateURL    https://raw.githubusercontent.com/Redwinam/duolingo-mutual-check/main/dist/duolingo-mutual-check.meta.js
// @description  一键核对互关、需要回关及疑似取关，保存本地历史；只读取，不自动关注或取关。
// @match        https://www.duolingo.com/*
// @match        https://preview.duolingo.com/*
// @match        https://duolingo.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==`;
const [core,collector,panel,baseCSS]=await Promise.all(['src/core.js','src/collector.js','src/panel.js','src/panel.css'].map(read));
const css=baseCSS.replace(':root',':host').replace(/body\{/g,'#shell{').replace('width:760px;height:590px;','width:min(760px,calc(100vw - 32px));height:min(630px,calc(100vh - 48px));')+`
:host{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#24332c}#launcher{pointer-events:auto;position:fixed;right:24px;bottom:84px;background:#497f37;color:#fff;border:1px solid #ffffff80;border-radius:999px;box-shadow:0 4px 18px #1d3c2526;padding:11px 18px;font-size:14px;font-weight:650}#launcher:hover{background:#3b6e2b}#backdrop{position:fixed;inset:0;background:#172b2359;display:grid;place-items:center;pointer-events:auto}#shell{border:1px solid #e0e6dc;border-radius:18px;box-shadow:0 22px 90px #0a1d2a38;overflow:hidden}.actions{display:flex;gap:8px;align-items:center}#close{border:0;background:transparent;font-size:24px;line-height:1;padding:7px 8px;color:#73806b}.logo{font-size:31px;color:#497f37;line-height:1}.summary .time{padding-right:8px}.time b{font-size:12px}select{max-width:330px}#export{white-space:nowrap}@media(max-width:600px){header{padding:16px}main{padding:0 16px}.status{margin-left:16px;margin-right:16px}.summary>div{padding:0 10px}.summary{grid-template-columns:1fr 1fr 1fr}.summary>.time{display:none}nav{grid-template-columns:repeat(2,1fr)}.comparison{flex-wrap:wrap;gap:6px}select{max-width:205px}.list-heading{align-items:start;flex-direction:column;gap:7px}input{width:100%}.note{font-size:10px}footer{padding:10px 16px;font-size:10px}h1{font-size:18px}.primary{font-size:12px;padding:7px 10px}}
`;
const code=[header,'\n(function(){\n\'use strict\';',core.replace(/^export /gm,''),collector.replace(/^export /gm,''),`const PANEL_CSS=${JSON.stringify(css)};`,panel,'})();\n'].join('\n');
await mkdir(new URL('dist/',root),{recursive:true});
await writeFile(new URL('dist/duolingo-mutual-check.user.js',root),code);
await writeFile(new URL('dist/duolingo-mutual-check.meta.js',root),header+'\n');
console.log('已生成 '+fileURLToPath(new URL('dist/duolingo-mutual-check.user.js',root)));
