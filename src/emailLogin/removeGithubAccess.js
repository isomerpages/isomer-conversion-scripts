const axios = require('axios');
const fs = require('fs');

const { Octokit } = require('octokit');

// name of repo
const REPO = process.argv[2];

const { PERSONAL_ACCESS_TOKEN, GITHUB_ORG_NAME } = process.env;

const octokit = new Octokit({
  auth: PERSONAL_ACCESS_TOKEN,
});

const removeGithubAccess = async (site) => {
  try {
    const { data: respData } = await axios.get(
      `https://api.github.com/orgs/${GITHUB_ORG_NAME}/teams/${site}/members`,
      {
        headers: {
          Authorization: `token ${PERSONAL_ACCESS_TOKEN}`,
        },
      },
    );
    if (!respData) {
      console.error(`${site} has no members in the team - please check that the repo name and team name are the same`);
      return;
    }
    const contributorNames = respData
      .map(({ login }) => login);

    if (!fs.existsSync('./emailMigrationData')) {
      fs.mkdirSync('./emailMigrationData');
    }
    const dirPath = `./emailMigrationData/${site}`;
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }
    fs.writeFileSync(`${dirPath}/githubTeam.txt`, contributorNames.join('\n'));

    await octokit.request(`DELETE /orgs/${GITHUB_ORG_NAME}/teams/${site}/repos/${GITHUB_ORG_NAME}/${site}`);
    console.log(`Removing team access for ${site}`);
  } catch (e) {
    console.log(e);
  }
};

const main = async () => {
  await removeGithubAccess(REPO);
};

main();
