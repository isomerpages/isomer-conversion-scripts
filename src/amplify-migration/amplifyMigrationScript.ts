const simpleGit = require("simple-git");
const fs = require("fs");
const glob = require("glob");
const path = require("path");
const csv = require("csv-parser");
const os = require("os");
const axios = require("axios");
const { Octokit } = require("@octokit/core");
require("dotenv").config();

const { JSDOM } = require("jsdom");
const {
  createAmplifyBranches,
  startReleaseJob,
  createAmplifyApp,
  readBuildSpec,
} = require("./amplifyUtils");
const BRANCH_NAME = "chore-amplify-migration-change-permalinks";
const ORGANIZATION_NAME = "isomerpages";
const PERMALINK_REGEX = /^permalink: /m;

interface AmplifyAppInfo {
  appId: string;
  repoName: string;
  name: string;
  repoPath: string;
}

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
  console.log(args);
  const userIdString = args
    .find((arg) => arg.startsWith("-user-id="))
    ?.split("=")[1];
  if (!userIdString) {
    console.error("Please provide a user id with the -user-id= flag");
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
          path.join(__dirname, "repos-with-no-code.txt"),
          `${repoName} ` + os.EOL
        );
        return;
      }
      await migrateRepo(repoName, name, userId);
    } catch (e) {
      const message = (`Error occurred for ${repoName}: ${e}`)
      console.error(message);
      // append this to a file 
      fs.appendFileSync(
        path.join(__dirname, "repos-with-errors.txt"),
        `${message} ` + os.EOL
      );
    }
  });
}

async function isRepoEmpty(repoName: string): Promise<boolean> {
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

async function migrateRepo(repoName: string, name: string, userId: number) {
  const repoPath = `${os.homedir()}/isomer-migrations/${repoName}`;
  try {
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
    await modifyRepo(amplifyAppInfo);
    await pushChangesToRemote(amplifyAppInfo);
    await generateSqlCommands(amplifyAppInfo, userId);
  } catch (e) {
    console.error(e);
  }
}

async function modifyRepo({ repoName, appId, repoPath }: AmplifyAppInfo) {
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

  await modifyPermalinks(repoPath);

  await updateConfigYml(appId, repoPath);
}

async function modifyPermalinks(repoPath: string) {
  const mdFiles: string[] = await glob("**/*.md", { cwd: repoPath });
  // dictionary  of changed permalinks
  const changedPermalinks: { [key: string]: string } = {};
  mdFiles.map(async (file) => {
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

      // check if permalink has quotation marks, if so, remove them
      permalinkLineTrimmed = permalinkLineTrimmed.replace(/"/g, "");

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
  });

  await changePermalinksReference(mdFiles, repoPath, changedPermalinks);

  const commitMessage = "chore(Amplify-Migration): Update permalinks in files";
  await simpleGit(repoPath).commit(commitMessage);
}

async function changePermalinksReference(
  mdFiles: string[],
  repoPath: string,
  changedPermalinks: { [key: string]: string }
) {
  mdFiles.map(async (file) => {
    const filePath = path.join(repoPath, file);
    await changePermalinksInMdFile(filePath, repoPath, changedPermalinks);
  });

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

/**
 * Requirements:
 * convert `/some/path` to `some/path`
 * convert `some/path/` to `some/path`
 * above two variants with `permalink: ` prefix
 * above two variants with `url: ` prefix
 * @param permalink original permalink
 * @returns raw permalinks without leading/trailing slash
 */
function getRawPermalink(permalink: string) {
  let trimmedPermalink = permalink.trim();
  if (trimmedPermalink.startsWith(`permalink: `)) {
    trimmedPermalink = permalink.trim().slice(11);
  }
  if (trimmedPermalink.startsWith(`url: `)) {
    trimmedPermalink = permalink.trim().slice(5);
  }
  if (trimmedPermalink.startsWith(`/`)) {
    trimmedPermalink = trimmedPermalink.slice(1);
  }
  if (trimmedPermalink.endsWith("/")) {
    trimmedPermalink = trimmedPermalink.slice(0, -1);
  }

  return trimmedPermalink;
}

async function changePermalinksInMdFile(
  filePath: string,
  repoPath: string,
  changedPermalinks: { [key: string]: string }
) {
  let fileContent = await fs.promises.readFile(filePath, "utf-8");
  let fileChanged = false;

  ({ fileContent, fileChanged } = changeFileContent(
    fileContent,
    changedPermalinks
  ));

  if (fileChanged) {
    await fs.promises.writeFile(filePath, fileContent, "utf-8");
    await simpleGit(repoPath).add(filePath);
  }
}

function changeFileContent(
  fileContent: string,
  changedPermalinks: { [oldPermalink: string]: string }
) {
  let hasFileChanged = false;
  // two different permalink patterns to take care of
  // 1. href="original_permalink"
  // 2. [click here](original_permalink)
  // 1 is solved using JSDOM, 2 is solved using regex

  const markdownRegex = /\[(.*?)\]\((.*?)\)/g;
  const dom = new JSDOM(fileContent);
  dom.window.document.querySelectorAll("a").forEach((a: any) => {
    // replace permalinks with lowercase and in changedPermalinks
    let rawPermalink = getRawPermalink(a.href);

    if (changedPermalinks[rawPermalink]) {
      a.href = a.href.replace(rawPermalink, changedPermalinks[rawPermalink]);
      hasFileChanged = true;
    }
  });

  fileContent = hasFileChanged
    ? dom.window.document.body.innerHTML
    : fileContent;
  const markdownRelativeUrlMatches = fileContent.match(markdownRegex);

  if (markdownRelativeUrlMatches) {
    markdownRelativeUrlMatches.map((match) => {
      let originalPermalink = match.slice(match.indexOf("(") + 1, -1);
      originalPermalink = getRawPermalink(originalPermalink);
      if (!changedPermalinks[originalPermalink]) {
        return;
      }
      const newPermalink = originalPermalink.toLocaleLowerCase();
      const newMatch = match.replace(originalPermalink, newPermalink);
      fileContent = fileContent.replace(match, newMatch);

      hasFileChanged = true;
    });
  }
  return { fileContent, fileChanged: hasFileChanged };
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

async function pushChangesToRemote({ repoPath }: AmplifyAppInfo) {
  await simpleGit(repoPath).checkout("staging");
  await simpleGit(repoPath).merge([BRANCH_NAME]);

  await simpleGit(repoPath).push("origin", "staging");
  await simpleGit(repoPath).deleteLocalBranch(BRANCH_NAME);
  console.info("Merge and delete of add-trailing-slash branch successful");
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
