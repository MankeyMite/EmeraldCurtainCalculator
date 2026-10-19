import charset from "../data/gen3-characters.json";

const characters: Record<string, number> = charset.characters;
/** The visible, exact OT name, using English/international Gen 3 encoding.
 * A short name fixes its first EOS byte, but never fixes bytes after EOS.
 * A seven-character name fills the field with no stored terminator required.
 */
function encodeName(name: string, length: number, label: string): number[] {
  const symbols = Array.from(name.normalize("NFC"));
  if (symbols.length < 1 || symbols.length > length)
    throw Error(
      `${label} must contain 1 to ${length} characters; blank means unknown.`,
    );
  const bytes = symbols.map((symbol) => {
    if (!Object.hasOwn(characters, symbol))
      throw Error(
        `Unsupported ${label} character: ` +
          JSON.stringify(symbol) +
          ". Use the English/international Gen 3 character set.",
      );
    return characters[symbol];
  });
  if (bytes.length < length) bytes.push(0xff);
  return bytes;
}
export const encodeOtName = (name: string) => encodeName(name, 7, "OT name");
export const encodeNickname = (name: string) =>
  encodeName(name, 10, "Nickname");
export function matchesOtName(bytes: Uint8Array, name: string): boolean {
  return encodeOtName(name).every(
    (value, index) => bytes[20 + index] === value,
  );
}
