declare module 'cbor-sync' {
  const cbor: { decode(data: Uint8Array): unknown };
  export default cbor;
}
