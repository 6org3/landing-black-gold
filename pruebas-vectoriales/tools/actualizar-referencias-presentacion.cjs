const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const [modelsRoot, patternPath, outputDir] = process.argv.slice(2);

if (!modelsRoot || !patternPath || !outputDir) {
  console.error('Uso: node actualizar-referencias-presentacion.cjs <modelos> <patron.svg> <salida>');
  process.exit(2);
}

const references = [
  ['03-mujer-cuello-v-sin-mangas.png', 'Adulto_Mujer/BG-PRES-AD-F-V-SM.svg'],
  ['04-mujer-cuello-v-manga-corta.png', 'Adulto_Mujer/BG-PRES-AD-F-V-MC.svg'],
  ['05-mujer-cuello-v-manga-larga.png', 'Adulto_Mujer/BG-PRES-AD-F-V-ML.svg'],
  ['06-mujer-polo-sin-mangas.png', 'Adulto_Mujer/BG-PRES-AD-F-POLO-SM.svg'],
  ['07-mujer-polo-manga-corta.png', 'Adulto_Mujer/BG-PRES-AD-F-POLO-MC.svg'],
  ['08-mujer-polo-manga-larga.png', 'Adulto_Mujer/BG-PRES-AD-F-POLO-ML.svg'],
  ['09-hombre-cuello-v-manga-corta.png', 'Adulto_Hombre/BG-PRES-AD-M-V-MC.svg'],
  ['10-hombre-cuello-v-manga-larga.png', 'Adulto_Hombre/BG-PRES-AD-M-V-ML.svg'],
  ['11-hombre-polo-manga-corta.png', 'Adulto_Hombre/BG-PRES-AD-M-POLO-MC.svg'],
  ['12-hombre-polo-manga-larga.png', 'Adulto_Hombre/BG-PRES-AD-M-POLO-ML.svg'],
];

function findGroupRange(svg, id) {
  const idAt = svg.indexOf(`id="${id}"`);
  if (idAt < 0) throw new Error(`No se encontro ${id}`);

  const start = svg.lastIndexOf('<g', idAt);
  const token = /<g\b[^>]*>|<\/g>/g;
  token.lastIndex = start;

  let depth = 0;
  let match;
  while ((match = token.exec(svg))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return { start, end: token.lastIndex };
  }

  throw new Error(`No se encontro el cierre de ${id}`);
}

function replaceFrontPattern(model, patternDataUri) {
  const range = findGroupRange(model, 'FRENTE_PATRON_VECTOR');
  const originalGroup = model.slice(range.start, range.end);
  const openingTag = originalGroup.match(/^<g\b[^>]*>/)?.[0];
  const transform = originalGroup.match(
    /transform="translate\(([-0-9.]+)\s+([-0-9.]+)\)\s+scale\(([-0-9.]+)\s+([-0-9.]+)\)"/,
  );

  if (!openingTag || !transform) throw new Error('No se pudo leer la colocacion del patron');

  const x = Number(transform[1]);
  const y = Number(transform[2]);
  const width = 600 * Number(transform[3]);
  const height = 760 * Number(transform[4]);
  const replacement = `${openingTag}
      <svg x="${x}" y="${y}" width="${width.toFixed(3)}" height="${height.toFixed(3)}"
           viewBox="0 0 600 760" preserveAspectRatio="xMidYMid slice" overflow="hidden">
        <image href="${patternDataUri}" x="0" y="0" width="600" height="760" preserveAspectRatio="none"/>
      </svg>
    </g>`;

  return model.slice(0, range.start) + replacement + model.slice(range.end);
}

function removeTechnicalLabels(svg) {
  return svg.replace(
    /<text\b[^>]*\by="([0-9.]+)"[^>]*>[\s\S]*?<\/text>/g,
    (tag, y) => (Number(y) >= 600 ? '' : tag),
  );
}

async function renderReference(sourcePath, destinationPath, patternDataUri) {
  let svg = fs.readFileSync(sourcePath, 'utf8');
  svg = replaceFrontPattern(svg, patternDataUri);
  svg = removeTechnicalLabels(svg);

  const full = await sharp(Buffer.from(svg), { density: 288 })
    .resize({ width: 3840 })
    .flatten({ background: '#F4F4F2' })
    .png({ compressionLevel: 9, palette: true, colours: 256, effort: 10 })
    .toBuffer();

  const metadata = await sharp(full).metadata();
  const cropHeight = Math.round((metadata.height * 700) / 900);
  await sharp(full)
    .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
    .png({ compressionLevel: 9, palette: true, colours: 256, effort: 10 })
    .toFile(destinationPath);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const approvedPattern = await sharp(patternPath, { density: 288 })
    .resize({ width: 2400, height: 3040, fit: 'fill' })
    .png({ compressionLevel: 9, palette: true, colours: 256, effort: 10 })
    .toBuffer();
  const patternDataUri = `data:image/png;base64,${approvedPattern.toString('base64')}`;

  for (const [outputName, relativeModel] of references) {
    const sourcePath = path.join(modelsRoot, ...relativeModel.split('/'));
    const destinationPath = path.join(outputDir, outputName);
    await renderReference(sourcePath, destinationPath, patternDataUri);
    console.log(outputName);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
