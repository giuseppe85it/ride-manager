#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function readOrInit(filePath, header) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, header, "utf8");
    return header;
  }
  return fs.readFileSync(filePath, "utf8");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatForFile(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "_" + [pad(date.getHours()), pad(date.getMinutes())].join("-");
}

function formatDisplay(date) {
  return (
    [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join("-") +
    " " +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(":")
  );
}

function uniqueReportPath(baseDir, baseName) {
  let filename = baseName + ".md";
  let fullPath = path.join(baseDir, filename);
  let counter = 1;

  while (fs.existsSync(fullPath)) {
    filename = `${baseName}_${counter}.md`;
    fullPath = path.join(baseDir, filename);
    counter += 1;
  }

  return { filename, fullPath };
}

const repoRoot = process.cwd();
const docsDir = path.join(repoRoot, "docs");
const opsLogDir = path.join(docsDir, "ops-log");
fs.mkdirSync(opsLogDir, { recursive: true });

const commitHash = run("git rev-parse HEAD");
const commitMessage = run("git log -1 --format=%s");
const commitIsoDate = run("git log -1 --format=%cI");
const changedRaw = run("git show --pretty=\"\" --name-only HEAD");
const changedFiles = changedRaw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const fileList = changedFiles.length > 0 ? changedFiles : ["(no file changes)"];

const commitDate = new Date(commitIsoDate);
if (Number.isNaN(commitDate.getTime())) {
  throw new Error(`Invalid commit timestamp: ${commitIsoDate}`);
}

const baseName = formatForFile(commitDate);
const { filename: reportFilename, fullPath: reportFullPath } = uniqueReportPath(
  opsLogDir,
  baseName
);
const reportRelativePath = path.posix.join("docs", "ops-log", reportFilename);
const readableTimestamp = formatDisplay(commitDate);

const reportContent =
  [
    `# Ops Report - ${readableTimestamp}`,
    "",
    `- Commit: ${commitHash}`,
    `- Message: ${commitMessage}`,
    `- Timestamp: ${readableTimestamp}`,
    "",
    "## Modified Files",
    ...fileList.map((file) => `- ${file}`),
    "",
  ].join("\n");
fs.writeFileSync(reportFullPath, reportContent, "utf8");

const opsLogPath = path.join(repoRoot, "ops.log");
readOrInit(opsLogPath, "# OPS LOG\n\n");
const opsEntry =
  [
    `## ${readableTimestamp}`,
    `- Commit: ${commitHash}`,
    `- Message: ${commitMessage}`,
    `- Report: ${reportRelativePath}`,
    "- Modified files:",
    ...fileList.map((file) => `  - ${file}`),
    "",
  ].join("\n");
fs.appendFileSync(opsLogPath, opsEntry, "utf8");

const changelogPath = path.join(repoRoot, "CHANGELOG.md");
const changelogHeader = "# CHANGELOG\n\n";
const changelogExisting = readOrInit(changelogPath, changelogHeader);
const changelogEntry =
  [
    `## ${readableTimestamp} - ${commitMessage}`,
    `- Commit: ${commitHash}`,
    `- Report: ${reportRelativePath}`,
    "- Files changed:",
    ...fileList.map((file) => `  - ${file}`),
    "",
  ].join("\n");
const changelogBase = changelogExisting.startsWith(changelogHeader)
  ? changelogHeader
  : `${changelogHeader}${changelogExisting}`;
const changelogBody = changelogExisting.startsWith(changelogHeader)
  ? changelogExisting.slice(changelogHeader.length)
  : changelogExisting;
fs.writeFileSync(changelogPath, `${changelogBase}${changelogEntry}${changelogBody}`, "utf8");

const statePath = path.join(repoRoot, "STATE_NOW.md");
const stateContent =
  [
    "# STATE NOW",
    "",
    `- Last update: ${readableTimestamp}`,
    `- Last commit: ${commitHash}`,
    `- Last message: ${commitMessage}`,
    `- Last report: ${reportRelativePath}`,
    "- Last changed files:",
    ...fileList.map((file) => `  - ${file}`),
    "",
  ].join("\n");
fs.writeFileSync(statePath, stateContent, "utf8");
