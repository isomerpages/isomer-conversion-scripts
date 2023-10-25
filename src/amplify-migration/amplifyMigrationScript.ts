import {
  AmplifyAppInfo,
  createAmplifyApp,
  createAmplifyBranches,
  protectBranch,
  readBuildSpec,
  startReleaseJob,
} from "./amplifyUtils";
import { errorMessage } from "./errorMessage";

import simpleGit from "simple-git";
import fs from "fs";
import glob from "glob";
import path from "path";
import csv from "csv-parser";
import os from "os";
import assert from "assert";
import { execSync } from "child_process";
require("dotenv").config();

import { JSDOM } from "jsdom";

import { modifyTagAttribute } from "./jsDomUtils";
import { getRawPermalink } from "./jsDomUtils";
import { updateFilesUploadsPath } from "./jsDomUtils";
import {
  createStagingLiteBranch,
  isRepoMigrated,
  isRepoPrivate,
  pushChangesToRemote,
} from "./githubUtils";
import {
  PERMALINK_REGEX,
  LOGS_FILE,
  SQL_COMMANDS_FILE,
  fileExtensionsRegex,
} from "./constants";
import { changePermalinksInMdFile } from "./mdFileUtils";
import { checkoutBranch } from "./githubUtils";
import { isRepoEmpty } from "./githubUtils";
import { changeLinksInYml, parseYml } from "./yamlUtils";

/**
 * Reading CSV file
 * @param filePath if undefined, list-of-repos.csv
 *                 in the current directory will be used
 * @returns list of repos and their human friendly names
 */
function readCsvFile(
  filePath = path.join(__dirname, "list-of-repos.csv")
): Promise<[string, string][]> {
  return new Promise((resolve, reject) => {
    const results: [string, string][] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on(
        "data",
        (data: { repo_name: string; human_friendly_name: string }) => {
          results.push([data.repo_name, data.human_friendly_name]);
        }
      )
      .on("end", () => {
        resolve(results);
      })
      .on("error", (err: any) => {
        reject(err);
      });
  });
}

async function main() {
  // check for all env vars first
  if (
    !process.env.GITHUB_ACCESS_TOKEN ||
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY
  ) {
    console.error(
      "Please provide all env vars: GITHUB_ACCESS_TOKEN, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    );
    return;
  }

  const args = process.argv.slice(2);
  const userIdString = args
    .find((arg) => arg.startsWith("-user-id="))
    ?.split("=")[1];

  if (!userIdString) {
    console.error(
      "Please provide a user id with the -user-id= flag. Eg `npm run amplify-migrate -- -user-id=1`"
    );
    return;
  }
  const repairMode =
    args.find((arg) => arg.startsWith("-repair-mode="))?.split("=")[1] ===
    "true";

  const userId = parseInt(userIdString);

  const filePath = args
    .find((arg) => arg.startsWith("-repo-path="))
    ?.split("=")[1];
  const listOfRepos: [string, string][] = await readCsvFile(filePath);

  // delineate logs for easier separation of runs
  const delineateString = `------------------${new Date().toLocaleString()}------------------`;
  fs.appendFileSync(path.join(__dirname, LOGS_FILE), delineateString + os.EOL);
  fs.appendFileSync(
    path.join(__dirname, SQL_COMMANDS_FILE),
    delineateString + os.EOL
  );

  listOfRepos.map(async ([repoName, name]) => {
    try {
      if (await isRepoEmpty(repoName)) {
        console.info(`Skipping ${repoName} as it has no code`);
        // write repos that have no code to a file
        fs.appendFileSync(
          path.join(__dirname, LOGS_FILE),
          `${repoName} ` + os.EOL
        );
        return;
      }

      if (!repairMode && (await isRepoMigrated(repoName))) {
        console.info(`Skipping ${repoName} as it has already been migrated`);
        // write repos that have no code to a file
        fs.appendFileSync(
          path.join(__dirname, LOGS_FILE),
          `${repoName} was already migrated` + os.EOL
        );
        return;
      }
      await migrateRepo(repoName, name, userId, repairMode);
    } catch (e) {
      const error: errorMessage = {
        message: `${e}`,
        repoName,
      };
      const message = `Error occurred for ${error.repoName}: ${error.message}`;
      console.error(message);
      // append this to a file
      fs.appendFileSync(
        path.join(__dirname, LOGS_FILE),
        `${message} ` + os.EOL
      );
    }
  });
}

async function migrateRepo(
  repoName: string,
  name: string,
  userId: number,
  repairMode: boolean
) {
  const pwd = process.cwd();

  const repoPath = path.join(`${pwd}/../${repoName}`);

  if (!repairMode) {
    const buildSpec = await readBuildSpec();
    const appId = await createAmplifyApp(repoName, buildSpec);
    const amplifyAppInfo: AmplifyAppInfo = {
      appId,
      repoName,
      name,
      repoPath,
    };
    await createAmplifyBranches(amplifyAppInfo);
    await startReleaseJob(amplifyAppInfo);

    await checkoutBranch(repoPath, repoName);
    await modifyRepo({ repoName, appId, repoPath, name });
    await buildLocally(repoPath);

    await pushChangesToRemote(amplifyAppInfo);
    await generateRedirectsRules(amplifyAppInfo);

    // Integration with reduction in build times
    await createStagingLiteBranch(repoName);
    const isRepoPrivatised = await isRepoPrivate(repoName);
    const stagingLiteAppId = await createAmplifyApp(repoName, buildSpec, true);
    const stagingLiteAppInfo: AmplifyAppInfo = {
      appId: stagingLiteAppId,
      repoName,
      name,
      repoPath,
      isStagingLite: true,
    };
    await createAmplifyBranches(stagingLiteAppInfo);
    if (isRepoPrivatised) {
      await protectBranch(stagingLiteAppId);
    }
    await startReleaseJob(stagingLiteAppInfo);

    await generateSqlCommands(amplifyAppInfo, stagingLiteAppInfo, userId);
  } else {
    // Only used for debugging purposes, changes will not be pushed to remote
    const appId = "test";
    await checkoutBranch(repoPath, repoName);
    await modifyRepo({ repoName, appId, repoPath, name, repairMode });
    await buildLocally(repoPath);
  }
}

async function generateRedirectsRules({ repoName, repoPath }: AmplifyAppInfo) {
  const redirectsPath = path.join(repoPath, "_redirects");
  if (fs.existsSync(redirectsPath)) {
    const redirects = fs.readFileSync(redirectsPath, "utf-8");
    const lines = redirects.split("\n").filter((line) => line.trim() !== "");
    const json = lines.map((line) => {
      const [source, target] = line.split(" ");
      return {
        source,
        target,
        status: "301",
        condition: null,
      };
    });
    json.push({
      source: "/<*>",
      target: "/404.html",
      status: "404",
      condition: null,
    });
    fs.writeFileSync(
      path.join(__dirname, `redirects_${repoName}.json`),
      JSON.stringify(json, null, 2)
    );
    await fs.promises.appendFile(
      path.join(__dirname, LOGS_FILE),
      `${repoName}: Redirects file converted to JSON ` + os.EOL
    );
  } else {
    await fs.promises.appendFile(
      path.join(__dirname, LOGS_FILE),
      `${repoName}: _redirects file does not exist ` + os.EOL
    );
  }
}

/**
 * This function serves as a quick sanity check to make such there are no build errors
 * Note, existence of build errors might not have occurred due to the migration,
 * but could have been there before the migration
 * @param repoPath absolute path to the repo
 */
async function buildLocally(repoPath: string) {
  const bashScriptPath = path.join(__dirname, "jekyllBuildScript.sh");
  const buildCommand = `bash ${bashScriptPath}`;
  execSync(buildCommand, { cwd: repoPath });
}

export async function modifyRepo({
  repoName,
  appId,
  repoPath,
  repairMode,
}: AmplifyAppInfo & { repairMode?: boolean }) {
  await modifyPermalinks({ repoPath, repoName });
  if (!repairMode) {
    await updateConfigYml(appId, repoPath);
  }
}

async function modifyPermalinks({
  repoPath,
  repoName,
}: {
  repoPath: string;
  repoName: string;
}) {
  const mdFiles: string[] = await glob("**/*.md", {
    cwd: repoPath,
    ignore: "_site/**",
  });
  const ymlFiles: string[] = await glob("**/*.yml", {
    cwd: repoPath,
    ignore: "_site/**",
  });
  const mdAndYmlFiles = [...mdFiles, ...ymlFiles];
  // dictionary  of changed permalinks
  const changedPermalinks: { [key: string]: string } = {};
  // NOTE: do not use map here, as we want to wait for each file to be processed
  // due to the existence of .git/index.lock files that prevent multiple git commands from running concurrently
  for await (const file of mdFiles) {
    const filePath = path.join(repoPath, file);
    const fileContent = (await fs.promises.readFile(filePath)).toString();
    const permalinkIndex = fileContent.search(PERMALINK_REGEX);
    const hasPermalink = permalinkIndex !== -1;
    if (hasPermalink) {
      const permalinkLine = fileContent.slice(
        permalinkIndex,
        fileContent.indexOf("\n", permalinkIndex)
      );
      let permalinkLineTrimmed = permalinkLine.trim();

      // check if permalink has quotation marks at the start and at the end, and if so, remove them
      assert(permalinkLineTrimmed.startsWith(`permalink:`));
      let permalinkValue = permalinkLineTrimmed
        .replace(`permalink:`, "")
        .trim()
        .replace(/^"+/, "")
        .replace(/"+$/, "")
        .replace(/^'+/, "")
        .replace(/'+$/, "");
      permalinkLineTrimmed = `permalink: ${permalinkValue}`;

      // NOTE: this is to allow backward compatibility with existing netlify sites
      // To read more: https://www.notion.so/opengov/Netlify-to-Amplify-Migration-01b9baff55ef4aebbe9f472fadf5a096?pvs=4
      const permalinkWithSlash = permalinkLineTrimmed.endsWith("/")
        ? permalinkLineTrimmed
        : `${permalinkLineTrimmed}/`;
      let newPermalink = permalinkWithSlash.toLocaleLowerCase();
      const newFileContent = fileContent.replace(
        permalinkLine.trim(),
        newPermalink
      );

      await fs.promises.writeFile(filePath, newFileContent, "utf-8");
      newPermalink = getRawPermalink(newPermalink);
      const originalPermalink = getRawPermalink(permalinkLine);
      if (newPermalink !== originalPermalink) {
        changedPermalinks[originalPermalink] = newPermalink;
      }
      await simpleGit(repoPath).add(filePath);
    }
  }

  await changePermalinksReference(
    mdAndYmlFiles,
    repoPath,
    changedPermalinks,
    repoName
  );

  const commitMessage = "chore(Amplify-Migration): Update permalinks in files";
  await simpleGit(repoPath).commit(commitMessage);
  await fs.promises.appendFile(
    path.join(__dirname, LOGS_FILE),
    `${repoName}: Commit ${commitMessage} has been made ` + os.EOL
  );
}

async function changePermalinksReference(
  mdAndYmlFiles: string[],
  repoPath: string,
  changedPermalinks: { [key: string]: string },
  currentRepoName: string
) {
  const setOfAllDocumentsPath = await getAllDocumentsPath(repoPath);

  const commitMessage = "chore(Amplify-Migration): Update permalinks in files";
  await simpleGit(repoPath).commit(commitMessage);
  await fs.promises.appendFile(
    path.join(__dirname, LOGS_FILE),
    `${currentRepoName}: Commit ${commitMessage} has been made ` + os.EOL
  );

  // NOTE: do not use map here, as we want to wait for each file to be processed
  // due to the existence of .git/index.lock files that prevent multiple git commands from running concurrently
  for await (const file of mdAndYmlFiles) {
    const filePath = path.join(repoPath, file);
    await changePermalinksInMdFile({
      filePath,
      repoPath,
      changedPermalinks,
      setOfAllDocumentsPath,
      currentRepoName,
    });
  }

  // special file in navigation.yml
  const navigationYmlPath = path.join(repoPath, "_data/navigation.yml");
  // find all instances of `url: /some/CAPS/PATH/` and replace with `url: some/caps/path`
  let navigationYmlContent = (
    await fs.promises.readFile(navigationYmlPath)
  ).toString();
  const urlRegex = /^(.*url:.*)$/gim;

  const matches = navigationYmlContent.match(urlRegex);
  let navigationFileChanged = false;
  if (matches) {
    matches.forEach((match: string) => {
      match = getRawPermalink(match);
      if (changedPermalinks[match]) {
        navigationFileChanged = true;
        navigationYmlContent = navigationYmlContent.replace(
          match,
          changedPermalinks[match]
        );
      }
    });
  }
  if (navigationFileChanged) {
    await fs.promises.writeFile(
      navigationYmlPath,
      navigationYmlContent,
      "utf-8"
    );
    await simpleGit(repoPath).add(navigationYmlPath);
  }
}

export async function changeFileContent({
  filePath,
  fileContent,
  changedPermalinks,
  setOfAllDocumentsPath,
  currentRepoName,
}: {
  filePath: string;
  fileContent: string;
  changedPermalinks: { [oldPermalink: string]: string };
  setOfAllDocumentsPath: Set<Lowercase<string>>;
  currentRepoName: string;
}) {
  // 3 different permalink patterns to take care of
  // 1. href="original_permalink" -> HTML syntax
  // 2. [click here](original_permalink) -> Markdown syntax
  // 3. <some_key>: original_permalink -> Yml syntax
  // 1 is solved using JSDOM,  2 is solved using regex, 3 is solved using yaml parser

  let dom: JSDOM = new JSDOM(fileContent);
  let normalisedUrls = new Set<string>();

  ({ changedPermalinks, dom, fileContent } = await modifyTagAttribute({
    dom,
    changedPermalinks,
    tagAttribute: { tagName: "a", attribute: "href" },
    fileContent,
    setOfAllDocumentsPath,
    normalisedUrls,
    currentRepoName,
  }));

  ({ changedPermalinks, dom, fileContent } = await modifyTagAttribute({
    dom,
    changedPermalinks,
    tagAttribute: { tagName: "img", attribute: "src" },
    fileContent,
    setOfAllDocumentsPath,
    normalisedUrls,
    currentRepoName,
  }));

  // we want to be able to modify nested markdown links
  // eg. [![inline text](/images/someimage.jpg)](/images/somedoc.pdf)
  // TODO: take care of edge case: [![blah](/images/blah.jpg){:style="width: 300px"}](https://blah.com)
  const outerLink = `(!?\\[([^\\]]*)\\])`;
  const innerLink = `\\(([^\\s]*)\\s*(".${fileExtensionsRegex}")?\\)`;
  const markdownRegex = new RegExp(`${outerLink}${innerLink}`, "g");
  const markdownRelativeUrlMatches = fileContent.match(markdownRegex) || [];

  for (const match of markdownRelativeUrlMatches) {
    const url = match.slice(match.indexOf("](") + 2, -1);
    let originalPermalink = getRawPermalink(url);
    if (changedPermalinks[originalPermalink]) {
      const newPermalink = originalPermalink.toLocaleLowerCase();

      const newMatch = match.replace(originalPermalink, newPermalink);
      fileContent = fileContent.replace(match, newMatch);
    }

    const { fileContent: filepathContent } = await updateFilesUploadsPath(
      url,
      setOfAllDocumentsPath,
      currentRepoName
    );
    fileContent = fileContent.replace(`(${url})`, `(${filepathContent})`);
  }

  fileContent = await parseYml({
    filePath,
    fileContent,
    changedPermalinks,
    currentRepoName,
    setOfAllDocumentsPath,
  });

  return { fileContent };
}

async function getAllDocumentsPath(
  dirPath: string
): Promise<Set<Lowercase<string>>> {
  const filePaths = new Set<string>();

  async function traverseDirectory(dir: string) {
    const files = await fs.promises.readdir(dir);
    for (const file of files) {
      const innerFilePath = path.join(dir, file);
      const stat = await fs.promises.stat(innerFilePath);
      if (stat.isDirectory()) {
        await traverseDirectory(path.join(dir, file));
        // Convert the directory name to lowercase
        const lowercaseDirName = file.toLowerCase();
        const lowercaseDirPath = path.join(dir, lowercaseDirName);
        if (innerFilePath !== lowercaseDirPath) {
          await fs.promises.rename(innerFilePath, lowercaseDirPath);
        }
      } else {
        // This converts /files/PATH/blah.pdf -> files/path/blah.pdf
        // and files/path/BLAH.pdf -> files/path/blah.pdf
        const lowercaseInnerFilePath =
          dirPath + innerFilePath.replace(dirPath, "").toLowerCase();
        if (lowercaseInnerFilePath !== innerFilePath) {
          /**
           * We need to force mv -f at the file level to commit case changes for files
           * in github.
           * See https://stackoverflow.com/questions/17683458/how-do-i-commit-case-sensitive-only-filename-changes-in-git
           *
           * NOTE: We are making a raw call here since simple git
           * mv func is not flexible enough to have the '-f' option
           */
          await simpleGit(dirPath).raw([
            "mv",
            "-f",
            innerFilePath,
            lowercaseInnerFilePath,
          ]);
          const isFileLowercase = file === file.toLowerCase();
          if (!isFileLowercase)
            await fs.promises.rename(
              innerFilePath,
              path.join(dir, file.toLowerCase())
            );
        }
        filePaths.add(lowercaseInnerFilePath.slice(dirPath.length));
      }
    }
  }
  const filesRootDir = path.join(dirPath, "files");
  await traverseDirectory(filesRootDir);
  const imagesRootDir = path.join(dirPath, "images");
  await traverseDirectory(imagesRootDir);

  /**
   * This portion of code is added for verbosity
   * + guarantee for type safety during assertion
   */
  const setOfAllDocumentsPath = new Set<Lowercase<string>>();
  filePaths.forEach((filePath) => {
    setOfAllDocumentsPath.add(filePath.toLowerCase() as Lowercase<string>);
  });
  return setOfAllDocumentsPath;
}

async function updateConfigYml(appId: string, repoPath: string) {
  const configFilePath = path.join(repoPath, `_config.yml`);

  // Read the file into a variable
  let configYmlContent = await fs.promises.readFile(configFilePath, {
    encoding: "utf-8",
  });
  const stagingKeyExist = configYmlContent.includes("staging:");
  const stagingMap = `staging: https://staging.${appId}.amplifyapp.com/`;
  const prodMap = `prod: https://master.${appId}.amplifyapp.com/`;
  if (stagingKeyExist) {
    configYmlContent = configYmlContent.replace(
      /^staging:\s*https:\/\/.*$/gm,
      stagingMap
    );

    configYmlContent = configYmlContent.replace(
      /^prod:\s*https:\/\/.*$/gm,
      prodMap
    );
  } else {
    // Add staging + prod key for legacy sites
    configYmlContent = configYmlContent + stagingMap + "\n" + prodMap + "\n";
  }
  // Write the modified yaml file back to disk
  await fs.promises.writeFile(configFilePath, configYmlContent);

  await simpleGit(repoPath).add(configFilePath);
  const commitMessage = "chore(Amplify-Migration): update config.yml file";
  await simpleGit(repoPath).commit(commitMessage);
  // log in a file for manual checking after the migration
  await fs.promises.appendFile(
    path.join(__dirname, LOGS_FILE),
    `${repoPath.split("/").pop()}: Commit ${commitMessage} has been made \n`
  );
}

async function generateSqlCommands(
  { name, repoName, appId }: AmplifyAppInfo,
  { appId: stagingLiteAppId }: AmplifyAppInfo,
  userId: number
) {
  const sqlCommands = `INSERT INTO sites (name, site_status, job_status, creator_id)
VALUES ('${name}', 'INITIALIZED', 'READY', '${userId}');
INSERT INTO repos (name, url, created_at, updated_at, site_id)
SELECT '${repoName}', 'https://github.com/isomerpages/${repoName}', NOW(), NOW(), id FROM sites WHERE name = '${name}';
INSERT INTO deployments (production_url, staging_url, hosting_id, staging_lite_hosting_id,  created_at, updated_at, site_id) 
SELECT 'https://master.${appId}.amplifyapp.com','https://staging-lite.${stagingLiteAppId}.amplifyapp.com', '${appId}', '${stagingLiteAppId}', NOW(), NOW(),id 
FROM sites WHERE name = '${name}'; \n`;
  const sqlFile = path.join(__dirname, SQL_COMMANDS_FILE);
  // append sql commands to file
  await fs.promises.appendFile(sqlFile, sqlCommands);
  await fs.promises.appendFile(
    path.join(__dirname, LOGS_FILE),
    `${repoName}: SQL commands appended to ${sqlFile} \n`
  );
}

main();
