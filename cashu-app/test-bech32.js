import { bech32 } from 'bech32';
const lnurl = 'LNURL1DP68GURN8GHJ7MRW9E6XJURN9UH8WETVDSKKKMN0WAHZ7MRWW4EXCUP0V9M8XER9D3MKZMN8D9HKUAR3WD5KVMNWV4KX7UM9DE6XYERPD46K2MNFV3E8ZCQZTDE0';
try {
  const decoded = bech32.decode(lnurl.toLowerCase(), 2000);
  const bytes = bech32.fromWords(decoded.words);
  const url = Buffer.from(bytes).toString('utf8');
  console.log(url);
} catch(e) {
  console.error(e);
}
