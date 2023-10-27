import { errorMessage } from "./errorMessage";

import fs from "fs";
import path from "path";
import csv from "csv-parser";
import os from "os";
require("dotenv").config();

import { createStagingLiteBranch, isRepoPrivate } from "./githubUtils";
import { LOGS_FILE, SQL_COMMANDS_QUICKIE_FILE } from "./constants";
import { isRepoEmpty } from "./githubUtils";
import {
  createAmplifyApp,
  createAmplifyBranches,
  getRedirectRules,
  protectBranch,
  readBuildSpec,
  startReleaseJob,
} from "./amplifyUtils";

interface AmplifyAppInfo {
  appId: string;
  repoName: string;

  repoPath: string;
  isStagingLite?: boolean;
}

// delay for 1 hour
async function delayFor1Hr() {
  return new Promise((resolve) => setTimeout(resolve, 1000)); //3600000
}

async function quickifyRepo(repoName: string, stagingAppId: string) {
  const pwd = process.cwd();

  const repoPath = path.join(`${pwd}/../${repoName}`);

  const buildSpec = await readBuildSpec();
  const redirectRules = await getRedirectRules(stagingAppId);
  // Integration with reduction in build times
  await createStagingLiteBranch(repoName);
  const isRepoPrivatised = await isRepoPrivate(repoName);
  const stagingLiteAppId = await createAmplifyApp(
    repoName,
    buildSpec,
    true,
    redirectRules
  );
  const stagingLiteAppInfo: AmplifyAppInfo = {
    appId: stagingLiteAppId,
    repoName,

    repoPath,
    isStagingLite: true,
  };
  await createAmplifyBranches(stagingLiteAppInfo);
  if (isRepoPrivatised) {
    await protectBranch(stagingLiteAppId);
  }
  await startReleaseJob(stagingLiteAppInfo);

  await updateDBForQuickie(stagingAppId, stagingLiteAppInfo);
}

/**
 * Reading CSV file
 * @param filePath if undefined, list-of-repos.csv
 *                 in the current directory will be used
 * @returns list of repos and their human friendly names
 */
function readCsvFile(
  // populate csv by running following command:
  // select repos.name, deployments.hosting_id from repos inner join deployments on deployments.site_id = repos.site_id
  filePath = path.join(__dirname, "list-of-repos-quickie.csv")
): Promise<[string, string][]> {
  return new Promise((resolve, reject) => {
    const results: [string, string][] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data: { repo_name: string; appId: string }) => {
        results.push([data.repo_name, data.appId]);
      })
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

  const filePath = args
    .find((arg) => arg.startsWith("-repo-path="))
    ?.split("=")[1];
  const listOfRepos: [string, string][] = await readCsvFile(filePath);

  // delineate logs for easier separation of runs
  const delineateString = `------------------${new Date().toLocaleString()}------------------`;
  fs.appendFileSync(path.join(__dirname, LOGS_FILE), delineateString + os.EOL);
  let counter = 25; // App limit per hour
  for (const [repoName, appId] of listOfRepos) {
    try {
      if (await isRepoEmpty(repoName)) {
        console.info(`Skipping ${repoName} as it has no code`);
        // write repos that have no code to a file
        fs.appendFileSync(
          path.join(__dirname, LOGS_FILE),
          `${repoName} ` + os.EOL
        );
        continue;
      }

      await quickifyRepo(repoName, appId);
      counter--;
      if (counter === 0) {
        await delayFor1Hr();
        counter = 25;
      }
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
  }
}

async function updateDBForQuickie(
  stagingAppId: string,
  stagingLiteAppInfo: AmplifyAppInfo
) {
  const sqlCommands = `update deployments set staging_lite_hosting_id = '${stagingLiteAppInfo.appId}',staging_url = 'https://staging-lite.${stagingLiteAppInfo.appId}.amplifyapp.com' where deployments.hosting_id='${stagingAppId}'`;
  const sqlFile = path.join(__dirname, SQL_COMMANDS_QUICKIE_FILE);
  // append sql commands to file
  await fs.promises.appendFile(sqlFile, sqlCommands);
  await fs.promises.appendFile(
    path.join(__dirname, LOGS_FILE),
    `${stagingLiteAppInfo.repoName}: SQL commands appended to ${sqlFile} \n`
  );
}

main();
