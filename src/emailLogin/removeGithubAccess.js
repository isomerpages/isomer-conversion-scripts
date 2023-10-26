const axios = require('axios');
const fs = require('fs');

const { Octokit } = require('octokit');

const { logError } = require('./logUtils');

const { GITHUB_ACCESS_TOKEN, GITHUB_ORG_NAME } = process.env;

const octokit = new Octokit({
  auth: GITHUB_ACCESS_TOKEN,
});

const closePrs = async (repo) => {
  const pullsResp = await octokit.rest.pulls.list({
    owner: GITHUB_ORG_NAME,
    repo,
    state: 'open',
  });
  const openPrs = pullsResp.data;
  for (const pullRequest of openPrs) {
    const prNumber = pullRequest.number;
    try {
      await octokit.rest.pulls.update({
        owner: GITHUB_ORG_NAME,
        repo,
        pull_number: prNumber,
        state: 'closed',
      });
      console.log(`Close PR #${prNumber} for ${repo}`);
    } catch (error) {
      // Non-blocking error - manually investigate
      logError(`Error closing pull request #${pullRequest.number} of ${repo}: ${error.message}`);
    }
  }
};

const removeGithubAccess = async (site) => {
  try {
    const { data: respData } = await axios.get(
      `https://api.github.com/orgs/${GITHUB_ORG_NAME}/teams/${site}/members`,
      {
        headers: {
          Authorization: `token ${GITHUB_ACCESS_TOKEN}`,
        },
      },
    );
    if (!respData) {
      logError(`${site} has no members in the team - please check that the repo name and team name are the same`);
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

    console.log(`Removing team access for ${site}`);
    await octokit.request(`DELETE /orgs/${GITHUB_ORG_NAME}/teams/${site}/repos/${GITHUB_ORG_NAME}/${site}`);

    console.log(`Adding core team access for ${site} if it doesn't already exist`);
    await octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
      org: GITHUB_ORG_NAME,
      team_slug: 'core',
      owner: GITHUB_ORG_NAME,
      repo: site,
      permission: 'admin',
    });
    await closePrs(site);
  } catch (err) {
    logError(`The following error was encountered while migrating site ${site}: ${err}`);
  }
};

module.exports = {
  removeGithubAccess,
};
