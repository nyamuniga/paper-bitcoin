// Reuse the printable note template with non-redeemable demonstration data only.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../cashu-app/package.json', import.meta.url));
const QRCode = require('qrcode');
const root = new URL('../', import.meta.url);
const encoder = fs.readFileSync(new URL('crates/ecash-encoder/src/lib.rs', root),'utf8');
const template = encoder.slice(encoder.indexOf('fn build_svg(')).match(/r##"([\s\S]*?)"##,/)[1];
const qr = Buffer.from(await QRCode.toString('BITNOTES SPECIMEN - NO REDEEMABLE VALUE',{type:'svg',width:442,margin:4})).toString('base64');
const data = {bg_b64:fs.readFileSync(new URL('crates/ecash-encoder/assets/blank-note.jpg',root)).toString('base64'),amount_num:'10,000',amount_unit:'SATS',mint_url:'https://mint.example (demonstration)',serial:'SPECIMEN-0001',keyset_id:'DEMONSTRATION',issued:'EXAMPLE',full_hash:'SPECIMEN - NOT REDEEMABLE',pub_qr:qr,priv_qr:qr,amt_color:'#793D1B'};
let svg = template.replace(/\{\{/g,'{').replace(/\}\}/g,'}').replace(/\{(\w+)\}/g,(match,key)=>data[key] ?? match);
// Illustrate where a physical scratch seal covers the private code. No real proofs or keys exist.
svg = svg.replace('</svg>',`<g aria-label="Illustrative redemption seal"><rect x="1400" y="40" width="442" height="442" rx="16" fill="#c7c6b8" stroke="#5a6258" stroke-width="4"/><text x="1621" y="228" text-anchor="middle" font-family="sans-serif" font-size="32" font-weight="bold" fill="#253b2d">REDEMPTION CODE</text><text x="1621" y="274" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#253b2d">Keep covered until redeeming</text></g><text x="990" y="468" text-anchor="middle" font-family="sans-serif" font-size="38" font-weight="bold" fill="#9a3529">SPECIMEN · NO REDEEMABLE VALUE</text></svg>`);
fs.writeFileSync(new URL('website/note-specimen.svg',root),svg);
