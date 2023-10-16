import {
  AmplifyClient,
  CreateAppCommand,
  CreateBranchCommand,
  StartJobCommand,
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
}

export async function readBuildSpec() {
  const buildSpecPath = path.join(__dirname, "amplify.yml");
  return fs.promises.readFile(buildSpecPath, { encoding: "utf-8" });
}

function generateCreateBranchInput(
  appId: string,
  branchName: "master" | "staging"
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

export async function createAmplifyBranches({ appId }: AmplifyAppInfo) {
  await awsClient.send(generateCreateBranchInput(appId, "staging"));
  await awsClient.send(generateCreateBranchInput(appId, "master"));
}

export async function startReleaseJob({ appId }: AmplifyAppInfo) {
  const params = {
    appId,
    branchName: "master",
    jobType: "RELEASE",
  };
  await awsClient.send(new StartJobCommand(params));

  params.branchName = "staging";
  await awsClient.send(new StartJobCommand(params));
}

export async function createAmplifyApp(
  repo_name: string,
  build_spec: string
): Promise<string> {
  const params = {
    accessToken: process.env.GITHUB_ACCESS_TOKEN,
    name: repo_name,
    repository: `https://github.com/isomerpages/${repo_name}`,
    buildSpec: build_spec,
    environmentVariables: {
      JEKYLL_ENV: "development",
    },
    customRules: [
      {
        source: "/<*>",
        target: "/404.html",
        status: "404",
      },
    ],
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
