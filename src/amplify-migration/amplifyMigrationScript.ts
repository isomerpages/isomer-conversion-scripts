const simpleGit = require("simple-git");
const fs = require("fs");
const glob = require("glob");
const path = require("path");

const { JSDOM } = require("jsdom");
const {
  createAmplifyBranches,
  startReleaseJob,
  createAmplifyApp,
  readBuildSpec,
} = require("./amplifyUtils");
const BRANCH_NAME = "chore-amplify-migration-change-permalinks";
const ORGANIZATION_NAME = "isomerpages";

interface AmplifyAppInfo {
  appId: string;
  repoName: string;
  name: string;
  repoPath: string;
}

const listOfRepos: [string, string][] = [
  ["repo-name", "Human Friendly Name"], // Modify this line when running the script
];

async function main() {
  for (const [repoName, name] of listOfRepos) {
    try {
      await migrateRepo(repoName, name);
    } catch (e) {
      console.error(e);
    }
  }
}

async function migrateRepo(repoName: string, name: string) {
  const homeDir = process.env.HOME;
  const repoPath = `${homeDir}/isomer-migrations/${repoName}`;

  try {
    const build_spec = await readBuildSpec();
    const appId = await createAmplifyApp(repoName, build_spec);
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
    await generateSqlCommands(amplifyAppInfo);
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

  // get list of branches
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
  const mdFiles = await new Promise((resolve, reject) => {
    glob("**/*.md", { cwd: repoPath }, (err: any, files: any) => {
      if (err) {
        reject(err);
        throw err;
      } else {
        resolve(files);
      }
    });
  });

  //dictionary  of changed permalinks
  const changedPermalinks: { [key: string]: string } = {};

  // eslint-disable-next-line no-restricted-syntax
  for (const file of Object.values(mdFiles as {})) {
    const filePath = path.join(repoPath, file);
    const fileContent = (await fs.promises.readFile(filePath)).toString();
    const permalinkRegex = /^permalink: /m;
    const permalinkIndex = fileContent.search(permalinkRegex);

    if (permalinkIndex !== -1) {
      const permalinkLine = fileContent.slice(
        permalinkIndex,
        fileContent.indexOf("\n", permalinkIndex)
      );
      let permalinkLineTrimmed = permalinkLine.trim();

      let hasTrailingQuotation = false;
      if (permalinkLineTrimmed.endsWith(`"`)) {
        hasTrailingQuotation = true;
        permalinkLineTrimmed = permalinkLineTrimmed.slice(0, -1);
      }
      const permalinkWithSlash = permalinkLineTrimmed.endsWith("/")
        ? permalinkLineTrimmed
        : `${permalinkLineTrimmed}/`;
      let newPermalink = permalinkWithSlash.toLocaleLowerCase();
      if (hasTrailingQuotation) {
        newPermalink = `${newPermalink}"`;
      }
      const newFileContent = fileContent.replace(
        permalinkLine.trim(),
        newPermalink
      );

      await fs.promises.writeFile(filePath, newFileContent, "utf-8");
      //remove trailing slash
      newPermalink = getRawPermalink(newPermalink);
      const originalPermalink = getRawPermalink(permalinkLine);
      if (newPermalink !== originalPermalink) {
        changedPermalinks[originalPermalink] = newPermalink;
      }
      await simpleGit(repoPath).add(filePath);
    }
  }

  await changePermalinksInFiles(mdFiles, repoPath, changedPermalinks);

  const commitMessage = "chore(Amplify-Migration): Update permalinks in files";
  await simpleGit(repoPath).commit(commitMessage);
}

async function changePermalinksInFiles(
  mdFiles: unknown,
  repoPath: string,
  changedPermalinks: { [key: string]: string }
) {
  for (const file of Object.values(mdFiles as {})) {
    const filePath = path.join(repoPath, file);
    await changePermalinksInMdFile(filePath, repoPath, changedPermalinks);
  }

  // special file in navigation.yml
  const navigationYmlPath = path.join(repoPath, "_data/navigation.yml");
  // find all instances of `url: /some/CAPS/PATH/` and replace with `url: some/path`
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
  // read file content
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
  changedPermalinks: { [key: string]: string }
) {
  let fileChanged = false;
  // three different regex patterns to take care of
  // 1. href="original_permalink"
  // 2. [click here](original_permalink)

  const markdownRegex = /\[(.*?)\]\((.*?)\)/g;
  const dom = new JSDOM(fileContent);
  dom.window.document.querySelectorAll("a").forEach((a: any) => {
    //replace permalinks with lowercase and in changedPermalinks
    let rawPermalink = getRawPermalink(a.href);

    if (changedPermalinks[rawPermalink]) {
      a.href = a.href.replace(rawPermalink, changedPermalinks[rawPermalink]);
      fileChanged = true;
    }
  });

  fileContent = fileChanged ? dom.window.document.body.innerHTML : fileContent;
  const markdownMatches = fileContent.match(markdownRegex);

  if (markdownMatches) {
    for (const match of markdownMatches) {
      let originalPermalink = match.slice(match.indexOf("(") + 1, -1);
      originalPermalink = getRawPermalink(originalPermalink);
      if (!changedPermalinks[originalPermalink]) {
        continue;
      }
      const newPermalink = originalPermalink.toLocaleLowerCase();
      const newMatch = match.replace(originalPermalink, newPermalink);
      fileContent = fileContent.replace(match, newMatch);

      fileChanged = true;
    }
  }
  return { fileContent, fileChanged };
}

async function updateConfigYml(appId: string, repoPath: string) {
  const configFile = path.join(repoPath, `_config.yml`);

  // Read the file into a variable
  let configYml = await fs.promises.readFile(configFile, { encoding: "utf-8" });
  configYml = configYml.replace(
    /^staging:\s*https:\/\/.*$/gm,
    `staging: https://staging.${appId}.amplifyapp.com/`
  );

  configYml = configYml.replace(
    /^prod:\s*https:\/\/.*$/gm,
    `prod: https://master.${appId}.amplifyapp.com/`
  );
  // Write the modified yaml file back to disk
  await fs.promises.writeFile(configFile, configYml);

  await simpleGit(repoPath).add(configFile);
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

async function generateSqlCommands({ name, repoName, appId }: AmplifyAppInfo) {
  const userId = 457; // todo figure out how to change this hardcoded value to the actual user id
  const sqlCommands = `INSERT INTO sites (name, api_token_name, site_status, job_status, creator_id)
VALUES ('${name}', '', 'INITIALIZED', 'READY', '${userId}');
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