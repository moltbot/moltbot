const ANSI_SGR_PATTERN = "\\x1b\\[[0-9;]*m";
// OSC-8 hyperlinks: ESC ] 8 ; ; url ST ... ESC ] 8 ; ; ST
const OSC8_PATTERN = "\\x1b\\]8;;.*?\\x1b\\\\|\\x1b\\]8;;\\x1b\\\\";

const ANSI_REGEX = new RegExp(ANSI_SGR_PATTERN, "g");
const OSC8_REGEX = new RegExp(OSC8_PATTERN, "g");

export function stripAnsi(input: string): string {
  return input.replace(OSC8_REGEX, "").replace(ANSI_REGEX, "");
}

export function visibleWidth(input: string): number {
  const stripped = stripAnsi(input);
  let width = 0;
  for (const char of stripped) {
    const code = char.codePointAt(0);
    if (code) {
      // 检查是否为双宽字符
      if (
        (code >= 0x1100 && code <= 0x11ff) ||
        (code >= 0x2e80 && code <= 0x2fff) ||
        (code >= 0x3000 && code <= 0x303f) ||
        (code >= 0x3040 && code <= 0x309f) ||
        (code >= 0x30a0 && code <= 0x30ff) ||
        (code >= 0x3100 && code <= 0x312f) ||
        (code >= 0x3130 && code <= 0x318f) ||
        (code >= 0x3190 && code <= 0x31bf) ||
        (code >= 0x31c0 && code <= 0x31ef) ||
        (code >= 0x3200 && code <= 0x32ff) ||
        (code >= 0x3300 && code <= 0x33ff) ||
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe10 && code <= 0xfe1f) ||
        (code >= 0xfe30 && code <= 0xfe4f) ||
        (code >= 0xff00 && code <= 0xffef)
      ) {
        width += 2;
      } else {
        width += 1;
      }
    }
  }
  return width;
}
