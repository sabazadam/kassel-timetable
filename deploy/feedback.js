// Lists feedback reports from the D1 database (wrangler login needed). Usage:
//   npm run feedback               open reports, grouped by course (most reported first)
//   npm run feedback -- --all      also the ones marked done
//   npm run feedback -- --done 3,7 mark reports done
//   npm run feedback -- --purge    delete reports older than 12 months (privacy page promise)
import { execFileSync } from 'node:child_process';

const DB = 'ders-feedback';
const args = process.argv.slice(2);

function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', sql], { encoding: 'utf8' });
  return JSON.parse(out)[0].results;
}

const doneAt = args.indexOf('--done');
if (doneAt !== -1) {
  const ids = (args[doneAt + 1] ?? '').split(',').map(Number).filter(Number.isInteger);
  if (!ids.length) throw new Error('--done needs ids, e.g. --done 3,7');
  d1(`UPDATE feedback SET status = 'done' WHERE id IN (${ids.join(',')})`);
  console.log(`Marked done: ${ids.join(', ')}`);
} else if (args.includes('--purge')) {
  d1(`DELETE FROM feedback WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-12 months')`);
  console.log('Deleted reports older than 12 months.');
} else {
  const where = args.includes('--all') ? '' : "WHERE status = 'open'";
  const rows = d1(`SELECT id, created_at, program, course_id, course_title, module_title, category, message, contact, context, status FROM feedback ${where} ORDER BY created_at`);
  if (!rows.length) {
    console.log('No reports.');
  } else {
    const groups = new Map();
    for (const r of rows) {
      const key = `${r.program} | ${r.course_id ? `${r.course_title} (${r.course_id})` : 'general'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (const [key, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n${key}  [${list.length}]`);
      if (list[0].context) console.log(`  shown: ${list[0].context}`);
      for (const r of list) {
        const who = r.contact ? `  ${r.contact}` : '';
        const done = r.status === 'done' ? '  (done)' : '';
        console.log(`  #${r.id} ${r.created_at.slice(0, 16)} ${r.category}${who}${done}\n     ${r.message.replace(/\n/g, '\n     ')}`);
      }
    }
  }
}
