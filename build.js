'use strict';
// Builds dist/judgement-demo.html: the online UI running in one page, with a bar to switch between players' phones.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const eng = fs.readFileSync(path.join(__dirname, 'public/engine.js'), 'utf8');
const out = html.replace('<script src="engine.js"></script>', '<script>window.__DEMO=true</script>\n<script>\n' + eng + '\n</script>');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/judgement-demo.html'), out);
console.log('wrote dist/judgement-demo.html (' + out.length + ' bytes)');
