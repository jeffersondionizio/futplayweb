import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

test('home document describes FutPlay for football-organizing searches', () => {
  assert.match(index, /<link rel="canonical" href="https:\/\/futplay\.bibiprogramadortop\.win\/" \/>/)
  assert.match(index, /<meta property="og:title" content="FutPlay: organize peladas, times e campeonatos" \/>/)
  assert.match(index, /"@type":"SoftwareApplication"/)
  assert.match(index, /app para organizar pelada/)
})

test('crawl files expose the public FutPlay search routes', () => {
  const robots = fs.readFileSync(path.join(root, 'public', 'robots.txt'), 'utf8')
  const sitemap = fs.readFileSync(path.join(root, 'public', 'sitemap.xml'), 'utf8')
  assert.match(robots, /Sitemap: https:\/\/futplay\.bibiprogramadortop\.win\/sitemap\.xml/);
  ['/sorteio', '/peladas', '/campeonatos', '/amistosos'].forEach((route) => {
    assert.match(sitemap, new RegExp(`<loc>https://futplay\\.bibiprogramadortop\\.win${route}<\\/loc>`))
  })
})
