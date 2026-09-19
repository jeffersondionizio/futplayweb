/**
 * Gera `public/og-futplay.png`, a imagem que aparece quando o site é
 * compartilhado.
 *
 * Roda à mão (`node scripts/gerar-og.mjs`), não no build: o PNG é versionado
 * como qualquer outro asset. O `sharp` usado aqui chega como dependência
 * transitiva do toolchain, e um build que dependesse dele quebraria no dia em
 * que essa árvore mudasse — enquanto o arquivo gerado continua servindo.
 *
 * 1200x630 é a proporção que Facebook, LinkedIn, X e WhatsApp recortam sem
 * cortar o texto. Sem imagem nenhuma, como era antes, o link compartilhado
 * aparecia como uma linha de texto sem prévia.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#078951"/>
      <stop offset=".55" stop-color="#006b3b"/>
      <stop offset="1" stop-color="#004b30"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#fundo)"/>

  <!-- Marcações de campo: leem como futebol antes de qualquer palavra ser lida. -->
  <g stroke="#ffffff" stroke-opacity=".16" stroke-width="3" fill="none">
    <rect x="40" y="40" width="1120" height="550" rx="14"/>
    <line x1="600" y1="40" x2="600" y2="590"/>
    <circle cx="600" cy="315" r="96"/>
    <rect x="40" y="180" width="118" height="270"/>
    <rect x="1042" y="180" width="118" height="270"/>
  </g>

  <text x="92" y="250" font-family="Inter, Segoe UI, Arial, Helvetica, sans-serif" font-size="94" font-weight="800" fill="#ffffff" letter-spacing="-3">FutPlay</text>
  <text x="92" y="330" font-family="Inter, Segoe UI, Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="#c7f77d">Peladas · Times · Campeonatos</text>
  <text x="92" y="398" font-family="Inter, Segoe UI, Arial, Helvetica, sans-serif" font-size="31" fill="#d8ece0">Sorteie times equilibrados, organize sua pelada</text>
  <text x="92" y="442" font-family="Inter, Segoe UI, Arial, Helvetica, sans-serif" font-size="31" fill="#d8ece0">e acompanhe o campeonato inteiro.</text>

  <rect x="92" y="492" width="316" height="62" rx="31" fill="#c7f77d"/>
  <text x="128" y="533" font-family="Inter, Segoe UI, Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="#14391f">Grátis · Free · Android</text>
</svg>`

const destino = path.join(raiz, 'public', 'og-futplay.png')
const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
fs.writeFileSync(destino, buffer)

const { width, height } = await sharp(buffer).metadata()
console.log(`og-futplay.png: ${width}x${height}, ${(buffer.length / 1024).toFixed(1)} kB`)
