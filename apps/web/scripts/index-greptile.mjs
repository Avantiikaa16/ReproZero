import process from 'node:process';

process.loadEnvFile('.env.local');

const apiKey = process.env.GREPTILE_API_KEY;
const githubToken = process.env.GITHUB_TOKEN;

if (!apiKey || !githubToken) {
  throw new Error('GREPTILE_API_KEY and GITHUB_TOKEN are required.');
}

const response = await fetch('https://api.greptile.com/v2/repositories', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'X-GitHub-Token': githubToken,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    remote: 'github',
    repository: 'Avantiikaa16/ReproZero_AWS_Demo',
    branch: 'main',
  }),
});

const body = await response.text();
console.log(JSON.stringify({ status: response.status, ok: response.ok, body: body.slice(0, 1000) }, null, 2));
if (!response.ok && response.status !== 409) process.exitCode = 1;
