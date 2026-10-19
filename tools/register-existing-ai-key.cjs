// Move the exact existing AI credential from Git history to Firebase Secret Manager.
// The credential is never logged, written to a file, or passed as a command argument.
const {execFileSync, spawn} = require('node:child_process');
const path = require('node:path');

function extractExistingKey(source) {
  const block = source.match(/\(function initDefaultApiKey\(\)\s*\{[\s\S]*?\}\)\(\);/)?.[0];
  const first = block?.match(/const p1\s*=\s*'([^']+)'/)?.[1];
  const second = block?.match(/const p2\s*=\s*'([^']+)'/)?.[1];
  if (!first || !second) throw new Error('선택한 Git 버전에서 기존 공용 AI 키를 찾지 못했습니다.');
  const key = first + second;
  if (!/^(AQ\.|AIza|sk-)[A-Za-z0-9._-]+$/.test(key)) throw new Error('기존 AI 키 형식을 확인하지 못했습니다.');
  return key;
}

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log('등록: node tools/register-existing-ai-key.cjs --apply (기존 키 값 유지, 새 키 발급 없음)');
    return;
  }
  const root = path.resolve(__dirname, '..');
  let cli;
  try { cli = require.resolve('firebase-tools/lib/bin/firebase.js'); }
  catch { throw new Error('먼저 프로젝트 폴더에서 npm install을 실행해 Firebase CLI를 설치해 주세요.'); }
  const source = execFileSync('git', ['show', '6ba47db:app.js'], {cwd: root, encoding: 'utf8', maxBuffer: 1000000});
  const key = extractExistingKey(source);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'functions:secrets:set', 'AI_API_KEY',
      '--project', 'goodnotesword-454fa', '--data-file', '-', '--non-interactive'],
    {cwd: root, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true});
    child.stdin.on('error', () => {});
    // Do not echo any downstream diagnostics: even chunked output could expose a key.
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error('Firebase 키 등록 실패: 로그인·프로젝트 권한을 확인해 주세요.')));
    child.stdin.end(key);
  });
  console.log('기존 키를 AI_API_KEY에 등록했습니다. 값은 변경하지 않았습니다.');
}
if (require.main === module) main().catch(error => {console.error(error.message); process.exitCode = 1;});
module.exports = {extractExistingKey};
