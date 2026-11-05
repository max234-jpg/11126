// Découverte des "skills" installés (fichiers SKILL.md) — ils sont injectés dans le prompt de design
// envoyé à Claude, pour que les sites générés suivent TES règles de design.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const expand = (p) => path.resolve(p.replace(/^~(?=$|\/|\\)/, os.homedir()));

function walk(dir, depth, out) {
  if (depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.toUpperCase() === 'SKILL.MD') out.push(full);
    else if (e.isDirectory() || e.isSymbolicLink()) walk(full, depth - 1, out);
  }
}

function frontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return meta;
}

export function discoverSkills(dirs = []) {
  const files = [];
  for (const d of dirs) walk(expand(d), 4, files);
  return [...new Set(files)].map((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const meta = frontmatter(text);
    return {
      path: file,
      name: meta.name || path.basename(path.dirname(file)),
      description: (meta.description || '').slice(0, 300),
      size: text.length,
    };
  });
}

export function loadSkillTexts(paths = []) {
  return paths
    .filter((p) => fs.existsSync(p))
    .map((p) => {
      const text = fs.readFileSync(p, 'utf8');
      return `<skill name="${path.basename(path.dirname(p))}">\n${text}\n</skill>`;
    })
    .join('\n\n');
}
