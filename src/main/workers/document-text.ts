function decodeCodePoint(value: string, radix: number): string {
  const point = Number.parseInt(value, radix);
  const validXml = point === 0x09 || point === 0x0a || point === 0x0d
    || (point >= 0x20 && point <= 0xd7ff)
    || (point >= 0xe000 && point <= 0xfffd)
    || (point >= 0x10000 && point <= 0x10ffff);
  return validXml ? String.fromCodePoint(point) : '\ufffd';
}

export function decodeXml(value: string): string {
  return value.replace(/&#x([\da-f]+);/gi, (_, hex: string) => decodeCodePoint(hex, 16))
    .replace(/&#(\d+);/g, (_, decimal: string) => decodeCodePoint(decimal, 10))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

export function xmlText(xml: string): string {
  return decodeXml(xml.replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n').replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/ {2,}/g, ' ').replace(/ *\n */g, '\n').replace(/ *\t */g, '\t').trim();
}

export function columnIndex(reference: string): number {
  const letters = /^([A-Z]+)\d+$/i.exec(reference)?.[1]?.toUpperCase() ?? 'A';
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}
