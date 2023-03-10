const { Octokit } = require('octokit');

// name of repo
const REPO = process.argv[2];

const { PERSONAL_ACCESS_TOKEN, GITHUB_ORG_NAME } = process.env;

const octokit = new Octokit({
  auth: PERSONAL_ACCESS_TOKEN,
});

const removeGithubAccess = async (site) => {
  try {
    await octokit.request(`PUT /orgs/${GITHUB_ORG_NAME}/teams/${site}/repos/${GITHUB_ORG_NAME}/${site}`, {
      org: GITHUB_ORG_NAME,
      team_slug: site,
      owner: GITHUB_ORG_NAME,
      repo: site,
      permission: 'pull',
    });
    console.log(`Set team permission for ${site} to read only`);
  } catch (e) {
    console.log(e);
  }
};

const main = async () => {
  await removeGithubAccess(REPO);
};

main();
