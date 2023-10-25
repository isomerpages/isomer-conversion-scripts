import { AmplifyAppInfo } from "./amplifyUtils";
import fs from "fs";
import simpleGit from "simple-git";
import { BRANCH_NAME, ORGANIZATION_NAME } from "./constants";
import { Octokit } from "@octokit/core";
import path from "path";

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
    console.info("Branch already exists. Checking out branch.");
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

export async function isRepoMigrated(repoName: string): Promise<boolean> {
  // read the config.yml file directly from github
  // if the file contains .amplifyapp.com, then it is migrated
  // else, it is not migrated
  const octokit = new Octokit({
    auth: process.env.GITHUB_ACCESS_TOKEN,
  });
  const result = await octokit.request(
    `GET /repos/${ORGANIZATION_NAME}/${repoName}/contents/_config.yml`,
    {
      owner: ORGANIZATION_NAME,
      repo: repoName,
      path: `_config.yml`,
    }
  );
  const content = Buffer.from(result.data.content, "base64").toString("ascii");
  return content.includes(".amplifyapp.com");
}

export async function createStagingLiteBranch(repoName: string): Promise<void> {
  const remoteRepoUrl = `https://github.com/${ORGANIZATION_NAME}/${repoName}.git`;
  const stgLiteDir = `${process.cwd()}/../${repoName}-staging-lite`;
  // Make sure the local path is empty, just in case dir was used on a previous attempt.
  fs.rmSync(`${stgLiteDir}`, { recursive: true, force: true });
  // create a empty folder stgLiteDir
  fs.mkdirSync(stgLiteDir);

  // Create staging lite branch in other repo path
  await simpleGit(stgLiteDir)
    .clone(remoteRepoUrl, stgLiteDir)
    .checkout("staging")
    .rm(["-r", "images"])
    .rm(["-r", "files"]);

  // Clear git
  fs.rmSync(`${stgLiteDir}/.git`, { recursive: true, force: true });

  // Prepare git repo

  await simpleGit(stgLiteDir)
    .init()
    .checkoutLocalBranch("staging-lite")
    .add(".")
    .commit("Initial commit")
    .addRemote("origin", remoteRepoUrl)
    .push(["origin", "staging-lite", "-f"]);
}

export async function isRepoPrivate(repoName: string): Promise<boolean> {
  const octokit = new Octokit({
    auth: process.env.GITHUB_ACCESS_TOKEN,
  });
  const result = await octokit.request(
    `GET /repos/${ORGANIZATION_NAME}/${repoName}`,
    {
      owner: ORGANIZATION_NAME,
      repo: repoName,
    }
  );
  return result.data.private;
}
