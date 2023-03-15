const {
  AmplifyClient,
  CreateAppCommand,
  CreateBranchCommand,
  StartJobCommand,
} = require("@aws-sdk/client-amplify");
const path = require("path");
const fs = require("fs");
const awsClient = new AmplifyClient({
  region: "ap-southeast-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

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

export async function createAmplifyApp(repo_name: string, build_spec: string) {
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
        condition: null,
      },
    ],
  };

  const command = await new CreateAppCommand(params);
  const { app } = await awsClient.send(command);
  return app.appId;
}
