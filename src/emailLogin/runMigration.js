const axios = require('axios');
const fs = require('fs');

const { getDb } = require('../../db/index');

const { PERSONAL_ACCESS_TOKEN, GITHUB_ORG_NAME: ISOMER_GITHUB_ORG_NAME } = process.env;

const ISOMER_USERS = ['isomeradmin', 'rc-davis', 'lamkeewei', 'pallani', 'LoneRifle', 'prestonlimlianjie', 'alexanderleegs', 'lisatjide', 'kwajiehao', 'gweiying', 'seaerchin', 'isomer-demo', 'NatMaeTan', ' jacksonOGP', 'chienlinggg', 'kathleenkhy', 'joshuajunmingt', 'audreytcy', 'yanjunquek', 'chloe-opengovsg', 'shazlithebestie', 'lennardl', 'oliverli', 'taufiq'];

// name of repo
const REPO = process.argv[2];

const getSiteAndContributors = async (site, dbClient) => {
  try {
    const { data: respData } = await axios.get(
      `https://api.github.com/orgs/${ISOMER_GITHUB_ORG_NAME}/teams/${site}/members`,
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
      .map(({ login }) => login)
      .filter((name) => !ISOMER_USERS.includes(name));
    // get user information
    const contributorQuery = `SELECT * FROM "users" WHERE ${contributorNames.map((githubId) => `github_id='${githubId}'`).join(' OR ')};`;
    const userData = (await dbClient.query(contributorQuery)).rows;
    console.log(userData);

    // get repo information
    const repoQuery = `SELECT sites.id, sites.job_status, sites.site_status, repos.name FROM "sites" JOIN "repos" ON sites.id = repos.site_id WHERE repos.name='${site}';`;
    const repoData = (await dbClient.query(repoQuery)).rows;
    const repoId = repoData[0].id;
    console.log(repoData);

    // get list of whitelisted domains
    const whitelistQuery = 'SELECT * FROM "whitelist" WHERE expiry IS NULL;';
    const whitelistedDomains = (await dbClient.query(whitelistQuery)).rows.map((whitelistData) => whitelistData.email);

    const siteMemberValues = [];
    userData.forEach((user) => {
      const userId = user.id;
      if (!user.email) {
        // User not registered to an email
        return;
      }
      const userType = whitelistedDomains.filter((domain) => user.email.endsWith(domain)).length > 0 ? 'ADMIN' : 'CONTRIBUTOR';
      siteMemberValues.push(`(${userId}, ${repoId}, '${userType}')`);
    });
    const insertQuery = `INSERT INTO "site_members" (user_id, site_id, role) VALUES\n${siteMemberValues.join(',\n')};`;
    await dbClient.query(insertQuery);
    console.log(insertQuery);
    try {
      // write repo information and queries run to file
      if (!fs.existsSync('./emailMigrationData')) {
        fs.mkdirSync('./emailMigrationData');
      }
      const dirPath = `./emailMigrationData/${site}`;
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
      }
      fs.writeFileSync(`${dirPath}/contributors.txt`, userData.map((userInfo) => JSON.stringify(userInfo)).join('\n'));
      fs.writeFileSync(`${dirPath}/repos.txt`, JSON.stringify(repoData[0]));
      fs.writeFileSync(`${dirPath}/insertQueries.txt`, insertQuery);
    } catch (err) {
      console.error(err);
    }
  } catch (err) {
    console.error(`The following error occured while migrating ${site}: ${err}`);
    throw err;
  }
};

const main = async () => {
  const dbClient = await getDb();

  await getSiteAndContributors(REPO, dbClient);

  dbClient.end();
};

main();
