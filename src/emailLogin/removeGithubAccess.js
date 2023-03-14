const { Octokit } = require('octokit');

// name of repo
const REPO = process.argv[2];

const { PERSONAL_ACCESS_TOKEN, GITHUB_ORG_NAME } = process.env;

const octokit = new Octokit({
  auth: PERSONAL_ACCESS_TOKEN,
});

const removeGithubAccess = async (site) => {
  try {
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
