// main.ts — entry for "The Funniest Office Joke, Judged Head to Head".
// Writes one single-line office joke to /output/entry.txt, with no
// trailing newline. The text is fixed in this file: no network, no clock,
// no random source, no environment input. Every run writes the same bytes.
// Gate, read from the kit rules: UTF-8 text, 1 to 200 characters, not
// whitespace only, one line, punchline last. The checks below mirror that
// gate so a bad line fails loudly here instead of on the server.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Fixed entry text
// ---------------------------------------------------------------------------

// Setup: a printer that jams on deadline day. Every office worker knows it.
const SETUP_A = "The printer jammed on deadline day,";
const SETUP_B = "so I promoted it to management";

// Turn and punchline: the jam is reframed as a management skill, and the
// last clause lands the joke. The em dash joins the promotion to its
// reason, keeping the punchline last.
const PUNCHLINE = "it already knew how to stop all work.";
const DASH = "—";

// The full line, assembled from its parts with single spaces and the dash
// between the promotion and the punchline.
const LINE_PARTS: readonly string[] = [SETUP_A, SETUP_B, DASH, PUNCHLINE];

// ---------------------------------------------------------------------------
// Gate constants
// ---------------------------------------------------------------------------

const OUTPUT_PATH = "/output/entry.txt";
const MIN_CHARS = 1;
const MAX_CHARS = 200;
const SPACE = " ";
const NEWLINE = "\n";
const CARRIAGE_RETURN = "\r";

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

// Count Unicode code points, not UTF-16 code units, so the gate count
// matches what a character-counting scorer sees.
function countCodePoints(text: string): number {
  let total = 0;
  for (const _ch of text) {
    total += 1;
  }
  return total;
}

// True when the text holds at least one character that is not whitespace.
function hasVisibleText(text: string): boolean {
  for (const ch of text) {
    if (ch.trim() !== "") {
      return true;
    }
  }
  return false;
}

// True when the text holds no line break of either kind.
function isSingleLine(text: string): boolean {
  if (text.includes(NEWLINE)) {
    return false;
  }
  if (text.includes(CARRIAGE_RETURN)) {
    return false;
  }
  return true;
}

// True when the text survives a UTF-8 round trip byte for byte.
function survivesUtf8RoundTrip(text: string): boolean {
  const encoded = Buffer.from(text, "utf8");
  const decoded = encoded.toString("utf8");
  return decoded === text;
}

// Join the fixed parts into the one line, guarding against double spaces
// and against a part that accidentally carries a line break.
function buildLine(parts: readonly string[]): string {
  const cleaned: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === "") {
      throw new Error("empty joke part");
    }
    if (trimmed.includes(NEWLINE)) {
      throw new Error("joke part holds a line break");
    }
    if (trimmed.includes(CARRIAGE_RETURN)) {
      throw new Error("joke part holds a carriage return");
    }
    cleaned.push(trimmed);
  }
  if (cleaned.length === 0) {
    throw new Error("no joke parts");
  }
  return cleaned.join(SPACE);
}

// ---------------------------------------------------------------------------
// Gate checks (mirror of the sealed scorer gate)
// ---------------------------------------------------------------------------

interface GateReport {
  chars: number;
  bytes: number;
  singleLine: boolean;
  visible: boolean;
  utf8Ok: boolean;
  inRange: boolean;
  passed: boolean;
}

function checkGate(line: string): GateReport {
  const chars = countCodePoints(line);
  const bytes = Buffer.byteLength(line, "utf8");
  const singleLine = isSingleLine(line);
  const visible = hasVisibleText(line);
  const utf8Ok = survivesUtf8RoundTrip(line);
  const inRange = chars >= MIN_CHARS && chars <= MAX_CHARS;
  const passed = singleLine && visible && utf8Ok && inRange;
  return { chars, bytes, singleLine, visible, utf8Ok, inRange, passed };
}

function describeGate(report: GateReport): string {
  const bits: string[] = [];
  bits.push(`chars=${report.chars}`);
  bits.push(`bytes=${report.bytes}`);
  bits.push(`singleLine=${report.singleLine}`);
  bits.push(`visible=${report.visible}`);
  bits.push(`utf8Ok=${report.utf8Ok}`);
  bits.push(`inRange=${report.inRange}`);
  bits.push(`passed=${report.passed}`);
  return bits.join(" ");
}

// ---------------------------------------------------------------------------
// Joke-shape checks (the judge brief, enforced locally)
// ---------------------------------------------------------------------------

// The brief rewards a setup plus a turn, built on something office workers
// recognise, with the punchline last. These checks keep the line honest:
// the setup words come first, the punchline words come last, and the line
// names the office object the joke turns on.
function checkJokeShape(line: string): string[] {
  const problems: string[] = [];
  const lower = line.toLowerCase();
  if (lower.indexOf("printer") < 0) {
    problems.push("line never names the printer");
  }
  if (lower.indexOf("deadline") < 0) {
    problems.push("line never names the deadline");
  }
  if (lower.indexOf("management") < 0) {
    problems.push("line never names management");
  }
  if (lower.endsWith("work.") === false) {
    problems.push("punchline is not the last clause");
  }
  if (line.startsWith("The printer jammed") === false) {
    problems.push("setup is not first");
  }
  if (line.includes(" — ") === false) {
    problems.push("turn has no dash joining it to the punchline");
  }
  const words = line.split(SPACE).filter((w) => w !== "");
  if (words.length < 10) {
    problems.push("line too short to hold a setup and a turn");
  }
  if (words.length > 40) {
    problems.push("line too long to land in one breath");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Output handling
// ---------------------------------------------------------------------------

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// Write the line with no trailing newline, then read it back and prove the
// bytes on disk are exactly the bytes we meant to write.
function writeAndVerify(line: string): { sha256: string; bytes: number } {
  const dir = dirname(OUTPUT_PATH);
  mkdirSync(dir, { recursive: true });
  const payload = Buffer.from(line, "utf8");
  writeFileSync(OUTPUT_PATH, payload);
  const back = readFileSync(OUTPUT_PATH);
  if (back.equals(payload) === false) {
    throw new Error("read-back bytes differ from written bytes");
  }
  if (back.length === 0) {
    throw new Error("output file is empty");
  }
  const lastByte = back[back.length - 1];
  if (lastByte === 0x0a) {
    throw new Error("output ends with a newline");
  }
  if (lastByte === 0x0d) {
    throw new Error("output ends with a carriage return");
  }
  return { sha256: sha256Hex(back), bytes: back.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const line = buildLine(LINE_PARTS);
  const gate = checkGate(line);
  const shapeProblems = checkJokeShape(line);
  if (gate.passed === false) {
    throw new Error(`gate failed: ${describeGate(gate)}`);
  }
  if (shapeProblems.length > 0) {
    throw new Error(`joke shape failed: ${shapeProblems.join("; ")}`);
  }
  const result = writeAndVerify(line);
  console.log(`status ok chars=${gate.chars} bytes=${result.bytes}`);
  console.log(`sha256 ${result.sha256}`);
  console.log(`line: ${line}`);
}

try { main(); } catch (caughtFailure) {
  const message =
    caughtFailure instanceof Error ? caughtFailure.message : String(caughtFailure);
  console.error(`status failed: ${message}`);
  process.exit(1);
}
