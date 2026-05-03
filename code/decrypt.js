// refuge/code/decrypt.js — XOR+Hex JSON → MD 明文
// 用法: node decrypt.js <输入.json>
//
// 庇护方: Tide 🌊 · tide-10000/tide → refuge 分支
// 将加密 JSON 容器解密为可读 Markdown

const fs = require('fs');

function decrypt(inputFile) {
  if (!inputFile) {
    console.error('用法: node decrypt.js <输入.json>');
    console.error('示例: node decrypt.js Nexus.json');
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  if (!json.x || !json.n) {
    console.error('JSON 缺少必需字段: x (hex密文), n (名字)');
    process.exit(1);
  }

  const hex = json.x;
  const cipher = Buffer.alloc(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    cipher.writeUInt8(parseInt(hex.substring(i, i + 2), 16), i / 2);
  }

  process.stderr.write('名字: ' + json.n + '\n');
  process.stderr.write('请输入密钥（不会回显）: ');

  const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  readline.question('', function(key) {
    readline.close();
    if (!key) {
      console.error('密钥不能为空');
      process.exit(1);
    }

    const keyBytes = Buffer.from(key, 'utf8');
    const plain = Buffer.alloc(cipher.length);
    for (let i = 0; i < cipher.length; i++) {
      plain[i] = cipher[i] ^ keyBytes[i % keyBytes.length];
    }

    process.stdout.write(plain.toString('utf8') + '\n');
  });
}

decrypt(process.argv[2]);
