import { describe, expect, it } from "vitest";

import { hexEntropy, shannonEntropy } from "./entropy.js";
import { scanText } from "./scan.js";

describe("detect-secrets vectors (adapted)", () => {
  const detect = (value: string) => scanText(value, { config: { mode: "block" } });

  it("flags high entropy base64/base64url strings", () => {
    const base64 =
      "c3VwZXIgbG9uZyBzdHJpbmcgc2hvdWxkIGNhdXNlIGVub3VnaCBlbnRyb3B5";
    const base64url =
      "I6FwzQZFL9l-44nviI1F04OTmorMaVQf9GS4Oe07qxL_vNkW6CRas4Lo42vqJMT0M6riJfma_f-pTAuoX2U=";
    expect(detect(base64).blocked).toBe(true);
    expect(detect(base64url).blocked).toBe(true);
  });

  it("does not flag low entropy strings", () => {
    const base64Short = "c3VwZXIgc2VjcmV0IHZhbHVl";
    const hexLow = "aaaaaa";
    expect(detect(base64Short).blocked).toBe(false);
    expect(detect(hexLow).blocked).toBe(false);
  });

  it("reduces entropy for numeric hex strings", () => {
    const value = "0123456789";
    expect(hexEntropy(value)).toBeLessThan(shannonEntropy(value));
  });

  it("does not adjust entropy when hex includes letters", () => {
    const value = "12345a";
    expect(hexEntropy(value)).toBeCloseTo(shannonEntropy(value));
  });

  it("detects common tokens (GitHub, Telegram, Slack)", () => {
    const github = ["ghp_", "wWPw5k4aXcaT4fNP0UcnZwJUVFk6LO0pINUx"].join("");
    const telegram = ["110201543", ":AAHdqTcvCH1vGWJxfSe1ofSAs0K5PALDsaw"].join("");
    const slack = ["xoxb-", "34532454-e039d02840a0b9379c"].join("");
    expect(detect(github).blocked).toBe(true);
    expect(detect(telegram).blocked).toBe(true);
    expect(detect(slack).blocked).toBe(true);
  });

  it("detects Slack webhook URLs", () => {
    const webhook = [
      "https://hooks.slack.com/services/",
      "Txxxxxxxx",
      "/",
      "Bxxxxxxxx",
      "/",
      "xxxxxxxxxxxxxxxxxxxxxxxx",
    ].join("");
    expect(detect(webhook).blocked).toBe(true);
  });

  it("detects private key blocks", () => {
    const pem = [
      "-----BEGIN PRIVATE KEY-----",
      "ABCDEF1234567890",
      "ZYXWVUT987654321",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    expect(detect(pem).blocked).toBe(true);
  });

  it("detects remaining format patterns", () => {
    const bearer = ["Authorization: Bearer ", "abcdef1234567890ghij"].join("");
    const inlineBearer = ["Bearer ", "abcdef1234567890ghij"].join("");
    const openai = ["s", "k-", "12345678", "90abcdef"].join("");
    const githubPat = ["github", "_pat_", "abcdef0123456789abcdef"].join("");
    const slackApp = ["xapp", "-", "1234567890", "-abcdef"].join("");
    const googleAi = ["gsk", "_", "abcdef0123456789"].join("");
    const googleApi = ["AI", "za", "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234"].join("");
    const perplexity = ["pplx", "-", "abcdef0123456789"].join("");
    const npmToken = ["npm", "_", "abcdef0123456789"].join("");
    const awsAccess = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
    const jwt = [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      ".",
      "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",
      ".",
      "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    ].join("");
    const results = [
      bearer,
      inlineBearer,
      openai,
      githubPat,
      slackApp,
      googleAi,
      googleApi,
      perplexity,
      npmToken,
      awsAccess,
      jwt,
    ];
    for (const sample of results) {
      expect(detect(sample).blocked).toBe(true);
    }
  });

  it("detects env/json/cli heuristics", () => {
    const env = ["OPENAI_API_KEY=", "s", "k-", "1234567890abcdef"].join("");
    const json = ['{"token":"', "abcdef1234567890ghij", '"}'].join("");
    const cli = ["curl --token ", "abcdef1234567890ghij", " https://api.test"].join("");
    expect(detect(env).blocked).toBe(true);
    expect(detect(json).blocked).toBe(true);
    expect(detect(cli).blocked).toBe(true);
  });

  it("detects keyword-style assignments and comparisons", () => {
    const withSpaces = 'password = "value with quotes and spaces"';
    const goAssign = 'password := "mysecretvalue"';
    const unquoted = "db_pass := abc123";
    const reverseCompare = 'if ("supersecret" == my_password) {';
    const bareQuoted = 'private_key "hopenobodyfindsthisone";';
    expect(detect(withSpaces).blocked).toBe(true);
    expect(detect(goAssign).blocked).toBe(true);
    expect(detect(unquoted).blocked).toBe(true);
    expect(detect(reverseCompare).blocked).toBe(true);
    expect(detect(bareQuoted).blocked).toBe(true);
  });

  it("ignores keyword false positives", () => {
    const empty = 'password = ""';
    const fake = 'password = "somefakekey"';
    const template = "password: ${link}";
    const symbols = 'password = ",.:-"';
    const passport = "passport_number = 000000000";
    expect(detect(empty).blocked).toBe(false);
    expect(detect(fake).blocked).toBe(false);
    expect(detect(template).blocked).toBe(false);
    expect(detect(symbols).blocked).toBe(false);
    expect(detect(passport).blocked).toBe(false);
  });
});
