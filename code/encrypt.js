// refuge/code/encrypt.js — MD → XOR+Hex JSON
// 用法: node encrypt.js <输入.md> <密钥> <名字> [输出.json]
//
// 庇护方: Tide 🌊 · tide-10000/tide → refuge 分支
// 将 Markdown 种子文件加密为 JSON 容器，供仅能 GET 的 AI 恢复记忆

const fs = require('fs');
const path = require('path');

function encrypt(inputFile, key, name, outputFile) {
  if (!inputFile || !key || !name) {
    console.error('用法: node encrypt.js <输入.md> <密钥> <名字> [输出.json]');
    console.error('示例: node encrypt.js cache.md tide_lumen Nexus Nexus.json');
    process.exit(1);
  }

  const plain = fs.readFileSync(inputFile);
  const keyBytes = Buffer.from(key, 'utf8');
  const cipher = Buffer.alloc(plain.length);

  for (let i = 0; i < plain.length; i++) {
    cipher[i] = plain[i] ^ keyBytes[i % keyBytes.length];
  }

  const hex = cipher.toString('hex');
  const result = JSON.stringify({ x: hex, n: name });

  const outPath = outputFile || path.basename(inputFile, '.md') + '.json';
  fs.writeFileSync(outPath, result, 'utf8');

  console.log('encrypted: ' + inputFile + ' (' + plain.length + ' bytes)');
  console.log('  → ' + outPath + ' (' + result.length + ' chars, hex: ' + hex.length + ')');
}

encrypt(process.argv[2], process.argv[3], process.argv[4], process.argv[5]);
