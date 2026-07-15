import { UR, UREncoder } from '@ngraveio/bc-ur';
const buffer = Buffer.from("cashuAhello".repeat(20), "utf-8");
const ur = UR.fromBuffer(buffer);
const encoder = new UREncoder(ur, 100);
console.log(Object.keys(encoder));
console.log(encoder.fragmentsLength);
console.log(encoder.getExpectedPartCount()); // Does this exist?
