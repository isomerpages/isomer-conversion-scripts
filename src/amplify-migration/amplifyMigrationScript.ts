import {
  AmplifyAppInfo,
  createAmplifyApp,
  createAmplifyBranches,
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
import { pushChangesToRemote } from "./githubUtils";
import {
  PERMALINK_REGEX,
  REPOS_WITH_ERRORS,
  REPOS_WITH_NO_CODE,
} from "./constants";
import { changePermalinksInMdFile } from "./mdFileUtils";
import { checkoutBranch } from "./githubUtils";
import { isRepoEmpty } from "./githubUtils";

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
  const userId = parseInt(userIdString);

  const filePath = args
    .find((arg) => arg.startsWith("-repo-path="))
    ?.split("=")[1];
  const listOfRepos: [string, string][] = await readCsvFile(filePath);
  listOfRepos.map(async ([repoName, name]) => {
    try {
      if (await isRepoEmpty(repoName)) {
        console.info(`Skipping ${repoName} as it has no code`);
        // write repos that have no code to a file
        fs.appendFileSync(
          path.join(__dirname, REPOS_WITH_NO_CODE),
          `${repoName} ` + os.EOL
        );
        return;
      }
      await migrateRepo(repoName, name, userId);
    } catch (e) {
      const error: errorMessage = {
        message: `${e}`,
        repoName,
      };
      const message = `Error occurred for ${error.repoName}: ${error.message}`;
      console.error(message);
      // append this to a file
      fs.appendFileSync(
        path.join(__dirname, REPOS_WITH_ERRORS),
        `${message} ` + os.EOL
      );
    }
  });
}

async function migrateRepo(repoName: string, name: string, userId: number) {
  const repoPath = `${os.homedir()}/isomer-migrations/${repoName}`;

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
  await generateSqlCommands(amplifyAppInfo, userId);
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

async function modifyRepo({ repoName, appId, repoPath }: AmplifyAppInfo) {
  await modifyPermalinks({ repoPath, repoName });
  await updateConfigYml(appId, repoPath);
}

async function modifyPermalinks({
  repoPath,
  repoName,
}: {
  repoPath: string;
  repoName: string;
}) {
  const mdFiles: string[] = await glob("**/*.md", { cwd: repoPath });
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
        .trim();
      permalinkValue = permalinkValue.replace(/^"/g, "").replace(/"$/, "");
      permalinkValue = permalinkValue.replace(/^'/g, "").replace(/'$/, "");
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
    mdFiles,
    repoPath,
    changedPermalinks,
    repoName
  );

  const commitMessage = "chore(Amplify-Migration): Update permalinks in files";
  await simpleGit(repoPath).commit(commitMessage);
}

async function changePermalinksReference(
  mdFiles: string[],
  repoPath: string,
  changedPermalinks: { [key: string]: string },
  currentRepoName: string
) {
  const setOfAllDocumentsPath = await getAllDocumentsPath(repoPath);

  // NOTE: do not use map here, as we want to wait for each file to be processed
  // due to the existence of .git/index.lock files that prevent multiple git commands from running concurrently
  for await (const file of mdFiles) {
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
  fileContent,
  changedPermalinks,
  setOfAllDocumentsPath,
  currentRepoName,
}: {
  fileContent: string;
  changedPermalinks: { [oldPermalink: string]: string };
  setOfAllDocumentsPath: Set<string>;
  currentRepoName: string;
}) {
  // two different permalink patterns to take care of
  // 1. href="original_permalink"
  // 2. [click here](original_permalink)
  // 1 is solved using JSDOM, 2 is solved using regex

  const markdownRegex = /\[(.*?)\]\((.*?)\)/g;
  let dom: JSDOM = new JSDOM(fileContent);
  let normalisedUrls = new Set<string>();

  ({ changedPermalinks, dom, fileContent } =
    await modifyTagAttribute({
      dom,
      changedPermalinks,
      tagAttribute: { tagName: "a", attribute: "href" },
      fileContent,
      setOfAllDocumentsPath,
      normalisedUrls,
      currentRepoName,
    }));

  ({ changedPermalinks, dom, fileContent } =
    await modifyTagAttribute({
      dom,
      changedPermalinks,
      tagAttribute: { tagName: "img", attribute: "src" },
      fileContent,
      setOfAllDocumentsPath,
      normalisedUrls,
      currentRepoName,
    }));

  const markdownRelativeUrlMatches = fileContent.match(markdownRegex) || [];

  for (const match of markdownRelativeUrlMatches) {
    let originalPermalink = match.slice(match.indexOf("(") + 1, -1);
    originalPermalink = getRawPermalink(originalPermalink);
    if (changedPermalinks[originalPermalink]) {
      const newPermalink = originalPermalink.toLocaleLowerCase();
      const newMatch = match.replace(originalPermalink, newPermalink);
      fileContent = fileContent.replace(match, newMatch);
    }

    const { fileContent: filepathContent } =
      await updateFilesUploadsPath(
        match,
        setOfAllDocumentsPath,
        currentRepoName
      );
    fileContent = fileContent.replace(match, filepathContent);
  }

  return { fileContent, };
}

async function getAllDocumentsPath(filePath: string): Promise<Set<string>> {
  const filePaths = new Set<string>();
  
  async function traverseDirectory(dir: string) {
    const files = await fs.promises.readdir(dir);
    for (const file of files) {
      const innerFilePath = path.join(dir, file);
      const stat = await fs.promises.stat(innerFilePath);
      if (stat.isDirectory()) {
        await traverseDirectory(innerFilePath);
      } else {
        filePaths.add(innerFilePath.slice(filePath.length));
      }
    }
  }
  const filesRootDir = path.join(filePath, "files");
  await traverseDirectory(filesRootDir);
  const imagesRootDir = path.join(filePath, "images");
  await traverseDirectory(imagesRootDir);
  
  return filePaths;
}

async function updateConfigYml(appId: string, repoPath: string) {
  const configFilePath = path.join(repoPath, `_config.yml`);

  // Read the file into a variable
  let configYmlContent = await fs.promises.readFile(configFilePath, {
    encoding: "utf-8",
  });
  configYmlContent = configYmlContent.replace(
    /^staging:\s*https:\/\/.*$/gm,
    `staging: https://staging.${appId}.amplifyapp.com/`
  );

  configYmlContent = configYmlContent.replace(
    /^prod:\s*https:\/\/.*$/gm,
    `prod: https://master.${appId}.amplifyapp.com/`
  );
  // Write the modified yaml file back to disk
  await fs.promises.writeFile(configFilePath, configYmlContent);

  await simpleGit(repoPath).add(configFilePath);
  await simpleGit(repoPath).commit(
    "chore(Amplify-Migration): update config.yml file"
  );
}

async function generateSqlCommands(
  { name, repoName, appId }: AmplifyAppInfo,
  userId: number
) {
  const sqlCommands = `INSERT INTO sites (name, site_status, job_status, creator_id)
VALUES ('${name}', 'INITIALIZED', 'READY', '${userId}');
INSERT INTO repos (name, url, created_at, updated_at, site_id)
SELECT '${repoName}', 'https://github.com/isomerpages/${repoName}', NOW(), NOW(), id FROM sites WHERE name = '${name}';
INSERT INTO deployments (production_url, staging_url, hosting_id, created_at, updated_at, site_id) 
SELECT 'https://master.${appId}.amplifyapp.com','https://staging.${appId}.amplifyapp.com', '${appId}', NOW(), NOW(),id 
FROM sites WHERE name = '${name}'; \n`;
  const sqlFile = path.join(__dirname, "sqlcommands.txt");
  // append sql commands to file
  await fs.promises.appendFile(sqlFile, sqlCommands);
}

main();
