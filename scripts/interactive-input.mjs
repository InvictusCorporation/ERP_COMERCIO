import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
export function requireInteractive() {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new Error("Execute este comando em um terminal interativo local.");
}
export async function prompt(label) {
  const reader = createInterface({ input: stdin, output: stdout });
  try {
    return (await reader.question(label)).trim();
  } finally {
    reader.close();
  }
}
export function secret(label) {
  requireInteractive();
  stdout.write(label);
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw || false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          finish();
          reject(new Error("Operação cancelada."));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = Array.from(value).slice(0, -1).join("");
          continue;
        }
        if (char >= " " && Array.from(value).length < 128) value += char;
      }
    };
    stdin.on("data", onData);
  });
}
