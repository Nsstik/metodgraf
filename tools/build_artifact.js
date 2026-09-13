/* Сборка одностраничной версии прототипа (всё в одном файле).
   Запуск: node tools/build_artifact.js
     build/artifact.html  — содержимое страницы без обёртки <html>/<head>/<body>
     build/single.html    — самостоятельный HTML-файл, открывается двойным кликом */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');
const css = read('css/style.css');
const js = ['js/config.js', 'js/data.js', 'js/engine.js', 'js/store.js', 'js/app.js']
  .map(f => `/* ==== ${f} ==== */\n` + read(f)).join('\n\n');

// вырезаем содержимое <body>
const body = html.split('<body>')[1].split('</body>')[0]
  .replace(/<script src="[^"]*"><\/script>\s*/g, '')
  .trim();
const title = 'МетодГраф';

// подключение шрифтов из <head> переносим в собранный файл
const fontLinks = (html.match(/<link[^>]*fonts\.(googleapis|gstatic)[^>]*>/g) || []).join('\n');

const inner = `<title>${title}</title>\n${fontLinks}\n<style>\n${css}\n</style>\n\n${body}\n\n<script>\n${js}\n</script>\n`;

fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build/artifact.html'), inner, 'utf8');
fs.writeFileSync(path.join(root, 'build/single.html'),
  `<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${inner.replace(/^<title>/, '<title>')}</head>\n<body>\n</body>\n</html>`
    .replace('</head>\n<body>\n</body>', '</head>\n<body>\n</body>'), 'utf8');

// корректная сборка single.html: стили в head, разметка и скрипты в body
const headPart = `<title>${title}</title>\n${fontLinks}\n<style>\n${css}\n</style>`;
fs.writeFileSync(path.join(root, 'build/single.html'),
  `<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">\n${headPart}\n</head>\n<body>\n` +
  `${body}\n<script>\n${js}\n</script>\n</body>\n</html>\n`, 'utf8');

console.log('build/artifact.html и build/single.html собраны');
