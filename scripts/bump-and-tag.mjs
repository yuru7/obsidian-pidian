/**
 * 指定バージョンへ上げて main へ取り込み、タグを打つ。
 *
 *   pnpm run bump-and-tag --version 0.11.0
 *   pnpm run bump-and-tag --version 0.12.0 --min-app-version 1.9.0
 */
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV_BRANCH = "dev";
const MAIN_BRANCH = "main";
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const VERSION_FILES = ["manifest.json", "package.json", "versions.json"];
const spawnOpts = {
  cwd: rootDir,
  shell: process.platform === "win32",
};

function run(command, args) {
  const result = spawnSync(command, args, {
    ...spawnOpts,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} が終了コード ${result.status} で失敗しました`);
  }
}

function gitCapture(args) {
  const result = spawnSync("git", args, {
    ...spawnOpts,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(detail || `git ${args.join(" ")} が失敗しました`);
  }
  return (result.stdout || "").trim();
}

function currentBranch() {
  return gitCapture(["branch", "--show-current"]);
}

const USAGE = `使い方:
  pnpm run bump-and-tag --version <version>
  pnpm run bump-and-tag --version <version> --min-app-version <minAppVersion>
例:
  pnpm run bump-and-tag --version 0.11.0
  pnpm run bump-and-tag --version 0.12.0 --min-app-version 1.9.0`;

function parseCli(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv.slice(2).filter((arg) => arg !== "--"),
      options: {
        version: { type: "string" },
        "min-app-version": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${detail}\n${USAGE}`);
  }

  const version = values.version;
  const minAppVersion = values["min-app-version"];
  if (!version) {
    throw new Error(`--version は必須です。\n${USAGE}`);
  }
  if (!VERSION_RE.test(version)) {
    throw new Error(`--version は 0.11.0 のような semver で指定してください: ${version}`);
  }
  if (minAppVersion !== undefined && !VERSION_RE.test(minAppVersion)) {
    throw new Error(`--min-app-version は 1.8.7 のような semver で指定してください: ${minAppVersion}`);
  }
  return { version, minAppVersion };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  const parsed = JSON.parse(text);
  if (!isRecord(parsed)) {
    throw new Error(`${path.relative(rootDir, filePath)} の JSON がオブジェクトではありません`);
  }
  return parsed;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function lastRecordedMinAppVersion(versions) {
  const keys = Object.keys(versions);
  if (keys.length === 0) {
    return undefined;
  }
  const value = versions[keys[keys.length - 1]];
  return typeof value === "string" ? value : undefined;
}

async function bumpVersionFiles(version, minAppVersion) {
  const manifestPath = path.join(rootDir, "manifest.json");
  const packagePath = path.join(rootDir, "package.json");
  const versionsPath = path.join(rootDir, "versions.json");

  const manifest = await readJson(manifestPath);
  const pkg = await readJson(packagePath);
  const versions = await readJson(versionsPath);

  if (typeof manifest.version !== "string") {
    throw new Error("manifest.json に version がありません");
  }
  if (typeof manifest.minAppVersion !== "string") {
    throw new Error("manifest.json に minAppVersion がありません");
  }
  if (typeof pkg.version !== "string") {
    throw new Error("package.json に version がありません");
  }

  const previousPluginVersion = manifest.version;
  manifest.version = version;
  pkg.version = version;
  if (minAppVersion !== undefined) {
    manifest.minAppVersion = minAppVersion;
  }

  // minAppVersion が変わったときだけ積む。公式も全リリースの列挙は不要としている。
  // 切替時は直前版を旧 minApp の最後の対応版として残す。
  const lastMinApp = lastRecordedMinAppVersion(versions);
  if (lastMinApp !== manifest.minAppVersion) {
    if (lastMinApp && previousPluginVersion !== version && !(previousPluginVersion in versions)) {
      versions[previousPluginVersion] = lastMinApp;
    }
    versions[version] = manifest.minAppVersion;
    await writeJson(versionsPath, versions);
  }

  await writeJson(manifestPath, manifest);
  await writeJson(packagePath, pkg);
}

function switchToDev() {
  if (currentBranch() === DEV_BRANCH) {
    return;
  }
  const result = spawnSync("git", ["switch", DEV_BRANCH], {
    ...spawnOpts,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`${DEV_BRANCH} ブランチへの復帰に失敗しました。手動で git switch ${DEV_BRANCH} してください。`);
  }
}

async function main() {
  const { version, minAppVersion } = parseCli(process.argv);

  if (currentBranch() !== DEV_BRANCH) {
    throw new Error(`${DEV_BRANCH} ブランチで実行してください（現在: ${currentBranch() || "(detached)"}）`);
  }

  const dirty = gitCapture(["status", "--porcelain"]);
  if (dirty) {
    throw new Error("作業ツリーが dirty です。コミットまたは退避してから実行してください。");
  }

  run("pnpm", ["build"]);

  await bumpVersionFiles(version, minAppVersion);
  run("git", ["add", ...VERSION_FILES]);
  if (!gitCapture(["diff", "--cached", "--name-only"])) {
    throw new Error(`バージョンファイルに変更がありません。すでに ${version} かもしれません。`);
  }
  run("git", ["commit", "-m", `Bump to ${version}`]);

  try {
    run("git", ["switch", MAIN_BRANCH]);
    run("git", ["pull"]);
    run("git", ["merge", "--ff-only", DEV_BRANCH]);
    run("git", ["push"]);
    run("git", ["tag", "-a", version, "-m", version]);
    run("git", ["push", "origin", version]);
  } finally {
    switchToDev();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
