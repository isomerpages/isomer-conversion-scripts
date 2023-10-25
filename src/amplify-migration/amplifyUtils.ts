import {
  AmplifyClient,
  CreateAppCommand,
  CreateAppCommandInput,
  CreateBranchCommand,
  StartJobCommand,
  UpdateAppCommand,
} from "@aws-sdk/client-amplify";
import path from "path";
import fs from "fs";
import { LOGS_FILE } from "./constants";

const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!accessKey || !secretKey) {
  throw new Error("Credentials are not defined");
}

const awsClient = new AmplifyClient({
  region: "ap-southeast-1",
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
  },
});

export interface AmplifyAppInfo {
  appId: string;
  repoName: string;
  name: string;
  repoPath: string;
  isStagingLite?: boolean;
}

export async function readBuildSpec() {
  const buildSpecPath = path.join(__dirname, "amplify.yml");
  return fs.promises.readFile(buildSpecPath, { encoding: "utf-8" });
}

function generateCreateBranchInput(
  appId: string,
  branchName: "master" | "staging" | "staging-lite"
) {
  return new CreateBranchCommand({
    appId,
    framework: "Jekyll",
    branchName,
    stage: branchName === "master" ? `PRODUCTION` : `DEVELOPMENT`,
    enableAutoBuild: true,
    environmentVariables: {
      JEKYLL_ENV: branchName === "master" ? "production" : "staging",
    },
  });
}

export async function createAmplifyBranches({
  appId,
  isStagingLite,
}: AmplifyAppInfo) {
  if (isStagingLite) {
    await awsClient.send(generateCreateBranchInput(appId, "staging-lite"));
    return;
  }

  await awsClient.send(generateCreateBranchInput(appId, "staging"));
  await awsClient.send(generateCreateBranchInput(appId, "master"));
}

export async function startReleaseJob({
  appId,
  isStagingLite,
}: AmplifyAppInfo) {
  const params = {
    appId,
    branchName: "staging-lite",
    jobType: "RELEASE",
  };

  if (isStagingLite) {
    return awsClient.send(new StartJobCommand(params));
  }

  params.branchName = "master";
  await awsClient.send(new StartJobCommand(params));

  params.branchName = "staging";
  await awsClient.send(new StartJobCommand(params));
}

export async function createAmplifyApp(
  repo_name: string,
  build_spec: string,
  isStagingLite: boolean = false
): Promise<string> {
  let redirectRules = [
    {
      source: "/<*>",
      target: "/404.html",
      status: "404",
    },
  ];

  if (isStagingLite) {
    redirectRules = [
      {
        source: "/files/<*>",
        target: `https://raw.githubusercontent.com/isomerpages/${repo_name}/staging/files/<*>`,
        status: "200",
      },
      {
        source: "/images/<*>",
        target: `https://raw.githubusercontent.com/isomerpages/${repo_name}/staging/images/<*>`,
        status: "200",
      },
      ...redirectRules,
    ];
  }

  let params: CreateAppCommandInput = {
    accessToken: process.env.GITHUB_ACCESS_TOKEN,
    name: isStagingLite ? `${repo_name}-staging-lite` : repo_name,
    repository: `https://github.com/isomerpages/${repo_name}`,
    buildSpec: build_spec,
    environmentVariables: {
      JEKYLL_ENV: "development",
    },
    customRules: redirectRules,
  };

  const command = new CreateAppCommand(params);
  const { app } = await awsClient.send(command);
  if (!app || !app.appId) {
    throw new Error("Amplify App was not created");
  }

  // log in logs file
  await fs.promises.appendFile(
    path.join(__dirname, LOGS_FILE),
    `${repo_name}: Amplify with ${app.appId} created\n`
  );

  return app.appId;
}

export function normaliseUrlsForAmplify(filePath: string) {
  console.log(filePath);
  if (filePath.startsWith("images/") || filePath.startsWith("files/")) {
    return `/${filePath.toLocaleLowerCase()}`;
  }
  return filePath.toLocaleLowerCase();
}

export async function createStagingLiteBranch(
  repoName: string,
  buildSpec: string
) {
  const appId = await createAmplifyApp(repoName, buildSpec, true);
}

export async function protectBranch(repoPath: string) {
  const command = new UpdateAppCommand({
    enableBasicAuth: true,
    appId: repoPath,
    basicAuthCredentials: Buffer.from(
      `user:${process.env.AMPLIFY_DEFAULT_PASSWORD}`
    ).toString("base64"),
  });
  await awsClient.send(command);
}
