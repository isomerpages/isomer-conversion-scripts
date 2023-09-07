import { AmplifyAppInfo } from "./amplifyUtils";
import fs from "fs";
import simpleGit from "simple-git";
import { BRANCH_NAME, ORGANIZATION_NAME } from "./constants";
import { Octokit } from "@octokit/core";

export async function pushChangesToRemote({ repoPath }: AmplifyAppInfo) {
  await simpleGit(repoPath).checkout("staging");
  await simpleGit(repoPath).merge([BRANCH_NAME]);

  await simpleGit(repoPath).push("origin", "staging");
  await simpleGit(repoPath).deleteLocalBranch(BRANCH_NAME);
  console.info("Merge and delete of add-trailing-slash branch successful");
}
export async function checkoutBranch(repoPath: string, repoName: string) {
  if (fs.existsSync(repoPath)) {
    console.info(
      `Repository ${repoName} already exists. Pulling changes from origin.`
    );
    await simpleGit(repoPath).pull("origin", "staging");
  } else {
    console.info(`Cloning ${repoName} repository from ${ORGANIZATION_NAME}...`);
    await simpleGit().clone(
      `https://github.com/${ORGANIZATION_NAME}/${repoName}.git`,
      repoPath
    );
  }

  /**
   * get the list of branches, guaranteed to be in
   * local since we don't intend to push BRANCH_NAME to remote
   */
  const branches = await simpleGit(repoPath).branchLocal();
  if (branches.all.includes(BRANCH_NAME)) {
    console.log("Branch already exists. Checking out branch.");
    await simpleGit(repoPath).checkout(BRANCH_NAME);
  } else {
    await simpleGit(repoPath).checkoutLocalBranch(BRANCH_NAME);
  }
}
export async function isRepoEmpty(repoName: string): Promise<boolean> {
  const octokit = new Octokit({
    auth: process.env.GITHUB_ACCESS_TOKEN,
  });
  try {
    const result = await octokit.request(
      `GET /repos/${ORGANIZATION_NAME}/${repoName}/contents/README.md`,
      {
        owner: ORGANIZATION_NAME,
        repo: repoName,
        path: `README.md`,
      }
    );
    const fileExists = result.status === 200;
    if (fileExists) return false;
    throw new Error(`Unexpected status code ${result.status}`);
  } catch (e: any) {
    if (e.status === 404) {
      return true;
    }
    throw e;
  }
}

export function isRepoMigrated(repoPath: string): boolean {
  // read the config.yml file
  const configFile = fs.readFileSync(`${repoPath}/_config.yml`, "utf-8");
  return configFile.includes(".amplifyapp.com");
}
