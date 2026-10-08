// Quick exploration from the terminal:
//   npm run query -- Customer/{skip}/{take}
//   npm run query -- Customer/{skip}/{take} "StrCompanyName Contains Lumber" 10
//   npm run query -- Quote "" 5
//   npm run query -- --list            (show the endpoint catalog)
import { ParadigmClient, ParadigmError } from './paradigm/client.js';
import endpoints from './paradigm/endpoints.json' with { type: 'json' };

const [template, filter, count = '10'] = process.argv.slice(2);
if (!template || template === '--list') {
  if (!template) console.error('Usage: npm run query -- <path> ["filter"] [count]\n');
  for (const e of endpoints) console.log(`${e.paging.padEnd(9)} ${e.path}`);
  process.exit(template ? 0 : 1);
}

const n = Number(count);
const paging = endpoints.find((e) => e.path === template)?.paging;
try {
  const pd = ParadigmClient.fromEnv();
  const result = await pd.list(template, { paging, take: n, size: n, filter: filter || undefined });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message);
  if (err instanceof ParadigmError && err.body) console.error(err.body);
  process.exit(1);
}
